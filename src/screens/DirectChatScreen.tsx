import { useChatConversation } from '../hooks/useChatConversation';
import { useChatScroll } from '../hooks/useChatScroll';
import { ChatConnectionStatus, ChatOutbox, ChatNewMessages } from '../components/chat/ChatFeedback';
import { LoadFailedState } from '../components/ui/EmptyState';
import { RefreshFailedBanner } from '../components/ui/RefreshFailedBanner';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    FlatList,
    ActivityIndicator,
    Platform,
    Alert,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { RootStackParamList } from '../types/navigation';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { parseUtcDate, cn } from '../lib/utils';
import { COLORS } from '../lib/theme';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgesContext';
import { SocialAvatar } from '../components/social/SocialAvatar';
import { CopiedOverlay } from '../components/chat/CopiedOverlay';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { DirectChat, DirectMessage } from '../types/social';

type Route = RouteProp<RootStackParamList, 'DirectChat'>;
type Nav = StackNavigationProp<RootStackParamList, 'DirectChat'>;

export default function DirectChatScreen() {
    const { t } = useTranslation('match');
    const route = useRoute<Route>();
    const navigation = useNavigation<Nav>();
    const { user } = useAuth();
    const { refresh: refreshBadges } = useBadges();
    const queryClient = useQueryClient();
    const myUserId = user?.id;

    const { chatId: initialChatId, otherUserId, header } = route.params || {};

    const [chat, setChat] = useState<DirectChat | null>(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

    const inputRef = useRef<TextInput>(null);
    // The real in-flight guard — see send(). The `sending` state is one render behind, which is
    // exactly the window a fast double-tap lands in.
    const sendingRef = useRef(false);
    // What this screen was opened for, pinned at the first render. The bootstrap writes what it
    // resolves (the chat id, the other player) back into the params, so the router can recognise
    // this conversation however the next navigate names it — and that write must not restart the
    // bootstrap. A different chat is a different screen (the router pushes it), so nothing else
    // changes these params.
    const [request] = useState(() => ({ chatId: initialChatId, otherUserId, header }));

    // The chat list lives underneath this stack screen and stays mounted. Keep every
    // cached search result in sync immediately so going back cannot reveal the old
    // unread badge while the server round-trip/refetch is still settling.
    const updateCachedChat = useCallback((chatId: string, update: (chat: DirectChat) => DirectChat) => {
        queryClient.setQueriesData<DirectChat[]>({ queryKey: ['direct-chats'] }, (current) => {
            if (!current) return current;
            let changed = false;
            const next = current.map((item) => {
                if (item.id.toLowerCase() !== chatId.toLowerCase()) return item;
                changed = true;
                return update(item);
            });
            return changed ? next : current;
        });
    }, [queryClient]);

    const markChatRead = useCallback(async (chatId: string) => {
        updateCachedChat(chatId, (item) => item.unreadCount === 0
            ? item
            : { ...item, unreadCount: 0 });

        try {
            const response = await authenticatedFetch(ENDPOINTS.MARK_DIRECT_CHAT_READ(chatId), { method: 'POST' });
            if (!response.ok) throw new Error(`MARK_DIRECT_CHAT_READ failed: ${response.status}`);

            // Reconcile both the per-chat list and the aggregate Social badge with
            // the committed server state. Prefix invalidation covers cached searches.
            queryClient.invalidateQueries({ queryKey: ['direct-chats'] });
            refreshBadges();
        } catch {
            // The optimistic clear must not become permanent if the write failed.
            queryClient.invalidateQueries({ queryKey: ['direct-chats'] });
        }
    }, [queryClient, refreshBadges, updateCachedChat]);

    // ─── Bootstrap: resolve chat + load messages ────────────────────────
    // Fast path (chat list tap): the header is seeded from navigation params, so
    // the screen renders instantly and we go straight to GET /messages — no list
    // fetch, and the SignalR effect (keyed on chat.id) connects in parallel.
    // Fallback (deep link / push notification): only a chatId is known, so we pull
    // just that one chat (GET /api/DirectChat/{id}) before starting the conversation.
    useEffect(() => {
        const { chatId: initialChatId, otherUserId, header } = request;
        let cancelled = false;

        // Clear per-chat state immediately on switch so the previous chat's
        // messages and draft don't flash while the new chat loads.
        setError(null);

        if (header && initialChatId) {
            // Render now from the seed; messages stream in underneath.
            setChat({
                id: initialChatId,
                otherUserId: header.otherUserId ?? '',
                otherUsername: header.otherUsername,
                otherNickname: header.otherNickname ?? null,
                otherAvatarUrl: header.otherAvatarUrl ?? null,
                lastMessage: null,
                lastMessageAt: null,
                lastMessageSenderId: null,
                unreadCount: 0,
            });
            setLoading(false);
        } else {
            setChat(null);
            setLoading(true);
        }

        (async () => {
            try {
                let chatId = initialChatId ?? null;

                // Opened from a profile/friend — resolve (or create) the chat to learn its id.
                if (!chatId && otherUserId) {
                    const res = await authenticatedFetch(
                        ENDPOINTS.GET_OR_CREATE_DIRECT_CHAT(otherUserId),
                        { method: 'POST' }
                    );
                    if (!res.ok) {
                        const txt = await res.text();
                        throw new Error(txt || t('chat.openChatFailed'));
                    }
                    const resolved: DirectChat = await res.json();
                    if (cancelled) return;
                    chatId = resolved.id;
                    setChat(resolved);
                    // At once, not after the messages: a push for this chat (it names it by chat id
                    // alone) arriving while they load would otherwise open it a second time.
                    navigation.setParams({ chatId: resolved.id });
                }

                if (!chatId) throw new Error(t('chat.missingParams'));

                // Deep link / notification with only a chatId and no header seed — fetch just
                // this one chat for the header before loading its conversation.
                const needsMeta = !header && !otherUserId;
                const metaPromise: Promise<DirectChat | null> = needsMeta
                    ? authenticatedFetch(ENDPOINTS.GET_DIRECT_CHAT_BY_ID(chatId))
                        .then((r) => (r.ok ? r.json() : null))
                        .then((meta: DirectChat | null) => {
                            // Opened from a push (chat id only): the other player goes into the
                            // params as soon as they are known, so a profile's Message finds this chat.
                            if (meta && !cancelled) {
                                navigation.setParams({
                                    header: {
                                        otherUserId: meta.otherUserId,
                                        otherUsername: meta.otherUsername,
                                        otherNickname: meta.otherNickname ?? null,
                                        otherAvatarUrl: meta.otherAvatarUrl ?? null,
                                    },
                                });
                            }
                            return meta;
                        })
                        .catch(() => null)
                    : Promise.resolve(null);

                const meta = await metaPromise;
                if (cancelled) return;
                if (meta) setChat(meta);
                else if (needsMeta) throw new Error(t('chat.notAvailable'));
            } catch (e: any) {
                if (!cancelled) setError(getErrorMessage(e));
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [request, loadAttempt]);

    const conversation = useChatConversation<DirectMessage>({
        id: chat?.id, kind: 'direct', active: true,
        map: raw => ({ id: raw.id ?? raw.Id, chatId: raw.chatId ?? raw.ChatId,
            senderId: raw.senderId ?? raw.SenderId, senderUsername: raw.senderUsername ?? raw.SenderUsername,
            senderAvatarUrl: raw.senderAvatarUrl ?? raw.SenderAvatarUrl, content: raw.content ?? raw.Content,
            sentAt: raw.sentAt ?? raw.SentAt, isRead: raw.isRead ?? raw.IsRead ?? false }),
        onRead: markChatRead,
        onSent: echo => {
            updateCachedChat(echo.chatId, item => ({ ...item, lastMessage: echo.content,
                lastMessageAt: echo.sentAt, lastMessageSenderId: echo.senderId, unreadCount: 0 }));
            queryClient.invalidateQueries({queryKey:['direct-chats']});
        },
    });
    const { messages, hasMore, loadingMore, loadEarlier, loaded: messagesLoaded } = conversation;
    const scroll = useChatScroll(messages, loadingMore);
    const { listRef } = scroll;
    const send = async () => {
        const content = input.trim();
        if (!content || sendingRef.current) return;
        sendingRef.current = true; setSending(true);
        inputRef.current?.focus(); setInput(''); scroll.jumpToLatest();
        try { await conversation.send(content); }
        finally { sendingRef.current = false; setSending(false); }
    };

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
                <Header onBack={() => navigation.goBack()} chat={null} />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !chat) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
                <Header onBack={() => navigation.goBack()} chat={null} />
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-red-400 mt-4 text-center font-bold">
                        {error || t('chat.notAvailable')}
                    </Text>
                    <Pressable onPress={() => setLoadAttempt((attempt) => attempt + 1)} accessibilityRole="button" className="mt-5 px-5 py-3 rounded-xl bg-primary/15">
                        <Text className="text-primary font-bold">{t('common:retry')}</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
            <Header
                onBack={() => navigation.goBack()}
                chat={chat}
                onAvatarPress={() => navigation.navigate('PlayerProfile', { id: chat.otherUserId })}
            />

            <KeyboardAvoider keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}>
                <ChatConnectionStatus status={conversation.connectionStatus} />
                {conversation.error && messages.length > 0 && <RefreshFailedBanner onRetry={conversation.refresh} retrying={conversation.loading} />}
                <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(m) => m.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
                    // Without this the list CAPTURES the first tap while the keyboard is up
                    // (default 'never'): the keyboard drops and the tap is swallowed, so
                    // sending took two taps. 'handled' keeps tap-on-list-to-dismiss but
                    // lets taps land on their targets.
                    keyboardShouldPersistTaps="handled"
                    // iOS: drag down onto the keyboard to dismiss (Discord-style).
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    initialNumToRender={15}
                    maxToRenderPerBatch={15}
                    windowSize={11}
                    // Keep the reading position stable when "Load earlier" prepends older
                    // messages (RN 0.81 supports this on both platforms).
                    maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
                    onScroll={scroll.onScroll}
                    scrollEventThrottle={100}
                    onContentSizeChange={scroll.onContentSizeChange}
                    ListFooterComponent={<ChatOutbox messages={conversation.pending} onRetry={conversation.retry} />}
                    ListHeaderComponent={
                        hasMore ? (
                            <View className="items-center pb-3">
                                {loadingMore ? (
                                    <View className="h-8 justify-center">
                                        <ActivityIndicator size="small" color={COLORS.primary} />
                                    </View>
                                ) : (
                                    <Pressable
                                        onPress={loadEarlier}
                                        hitSlop={8}
                                        className="flex-row items-center gap-1.5 h-8 px-3.5 rounded-full bg-white/5 border border-white/10 active:opacity-60"
                                    >
                                        <Ionicons name="arrow-up" size={13} color={COLORS.slate400} />
                                        <Text className="text-slate-300 text-xs font-bold" numberOfLines={1}>
                                            {conversation.pageError ? t('common:retry') : t('chat.loadEarlier')}
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        ) : null
                    }
                    renderItem={({ item, index }) => {
                        const isMine = item.senderId === myUserId;
                        const prev = messages[index - 1];
                        const next = messages[index + 1];
                        const showDateBreak =
                            !prev || !sameDay(prev.sentAt, item.sentAt);
                        return (
                            <>
                                {showDateBreak && <DateBreak date={item.sentAt} />}
                                <MessageBubble
                                    message={item}
                                    isMine={isMine}
                                    endsRun={!sameRun(item, next)}
                                />
                            </>
                        );
                    }}
                    ListEmptyComponent={
                        conversation.error ? <LoadFailedState onRetry={conversation.refresh} retrying={conversation.loading} /> : messagesLoaded ? (
                            <View className="items-center mt-24 px-6">
                                <View style={styles.emptyGlow}>
                                    <LinearGradient colors={RING_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyRing}>
                                        <View style={styles.emptyRingGap}>
                                            <SocialAvatar src={chat.otherAvatarUrl} name={chat.otherUsername} size={72} />
                                        </View>
                                    </LinearGradient>
                                </View>
                                <Text className="text-white font-black text-lg tracking-tight mt-4" numberOfLines={1}>
                                    {chat.otherUsername}
                                </Text>
                                {chat.otherNickname?.trim() ? (
                                    <View className="flex-row items-center mt-1" style={{ gap: 5 }}>
                                        <Ionicons name="game-controller" size={14} color={COLORS.primary} />
                                        <Text className="text-slate-400 text-[13px] font-medium" numberOfLines={1}>
                                            {chat.otherNickname}
                                        </Text>
                                    </View>
                                ) : null}
                                <Text className="text-slate-500 text-[13px] font-medium text-center mt-4">
                                    {t('chatPanel.sayHi')}
                                </Text>
                            </View>
                        ) : (
                            <View className="items-center mt-24">
                                <ActivityIndicator size="small" color={COLORS.primary} />
                            </View>
                        )
                    }
                />

                <ChatNewMessages visible={scroll.hasNewMessages} onPress={scroll.jumpToLatest} />
                <View
                    className="border-t border-white/[0.04] bg-background-deep px-3 pt-3 pb-2"
                >
                    <View
                        className="flex-row items-end gap-2 rounded-[28px] pl-3 pr-1.5 py-1.5"
                        style={styles.composerField}
                    >
                        <TextInput
                            ref={inputRef}
                            value={input}
                            onChangeText={setInput}
                            placeholder={t('chat.typeAMessage')}
                            placeholderTextColor={COLORS.slate500}
                            multiline
                            className="flex-1 text-white text-[15px] py-2 px-1"
                            style={{ maxHeight: 120 }}
                        />
                        <Pressable
                            onPress={send}
                            disabled={!input.trim() || sending}
                            // Taps that land a few px above the button hit the message list,
                            // which dismisses the keyboard and swallows the tap — extend the
                            // touch target so near-misses still send.
                            hitSlop={{ top: 14, bottom: 10, left: 6, right: 10 }}
                            className="w-11 h-11 rounded-full items-center justify-center active:opacity-80"
                            // Ready to send: the own-bubble gradient with a soft glow. The glow sits on
                            // the button itself (no wrapper), so the hitSlop above keeps its reach.
                            style={input.trim() && !sending ? styles.sendReady : styles.sendIdle}
                        >
                            {input.trim() && !sending && (
                                <View pointerEvents="none" style={styles.sendFill}>
                                    <LinearGradient colors={OWN_BUBBLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                                </View>
                            )}
                            {sending ? (
                                <ActivityIndicator size="small" color={COLORS.primaryBright} />
                            ) : (
                                <Ionicons
                                    name="send"
                                    size={18}
                                    color={input.trim() ? OWN_TEXT : COLORS.slate600}
                                    style={{ marginLeft: 2 }}
                                />
                            )}
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoider>
        </SafeAreaView>
    );
}

// ═════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════

function Header({
    onBack,
    chat,
    onAvatarPress,
}: {
    onBack: () => void;
    chat: DirectChat | null;
    onAvatarPress?: () => void;
}) {
    const { t } = useTranslation('match');
    const nickname = chat?.otherNickname?.trim();
    // The row stays h-11 (44) and the hairline 1px, so the header keeps its old height — the
    // composer's iOS keyboardVerticalOffset (70) was tuned against it.
    return (
        <View className="bg-background-deep">
            <View className="flex-row items-center px-3 py-3">
                <Pressable
                    onPress={onBack}
                    hitSlop={8}
                    accessibilityRole="button"
                    className="w-10 h-10 rounded-2xl items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                >
                    <Ionicons name="arrow-back" size={20} color={COLORS.foreground} />
                </Pressable>

                {chat ? (
                    <Pressable
                        className="flex-row items-center flex-1 h-11 ml-3 active:opacity-70"
                        onPress={onAvatarPress}
                        accessibilityRole="button"
                    >
                        {/* 38 + the ring's 3 on each side = the row's 44 */}
                        <View style={styles.headerRing}>
                            <SocialAvatar src={chat.otherAvatarUrl} name={chat.otherUsername} size={38} />
                        </View>
                        <View className="ml-3 flex-1">
                            <Text className="text-white font-black text-[16px] leading-[20px] tracking-tight" numberOfLines={1}>
                                {chat.otherUsername}
                            </Text>
                            {nickname ? (
                                <View className="flex-row items-center mt-0.5" style={{ gap: 4 }}>
                                    <Ionicons name="game-controller" size={13} color={COLORS.primary} />
                                    <Text className="flex-1 text-slate-400 text-xs font-semibold" numberOfLines={1}>
                                        {nickname}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} style={{ marginLeft: 8 }} />
                    </Pressable>
                ) : (
                    <View className="h-11 justify-center ml-3">
                        <Text className="text-white font-black text-lg">{t('chat.chat')}</Text>
                    </View>
                )}
            </View>
            {/* Emerald hairline under the header, fading out at both ends */}
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(16,185,129,0)', 'rgba(16,185,129,0.45)', 'rgba(16,185,129,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 1 }}
            />
        </View>
    );
}

// A run is consecutive messages from one sender on the same day. Its last bubble
// carries the sender's avatar and a wider gap before the other side speaks; every
// bubble keeps its own spacing, tail, time and receipt.
function sameRun(a?: DirectMessage, b?: DirectMessage): boolean {
    return !!a && !!b && a.senderId === b.senderId && sameDay(a.sentAt, b.sentAt);
}

// Own bubbles: emerald lit from the top-left, dark ink. The send button wears the same.
// A deeper emerald with only a slight lift at the top-left, so a screen of own bubbles stays calm.
const OWN_BUBBLE = ['#1FBF88', '#0E9F6E'] as const;
const OWN_TEXT = '#03140E';
// The time and the "sent" tick on an own bubble; "read" ticks go full strength.
const OWN_META_COLOR = 'rgba(3, 20, 14, 0.55)';
const OWN_READ_COLOR = '#03140E';
const RING_GRADIENT = ['#34D399', '#22D3EE'] as const;

const BUBBLE_RADIUS = 18;
const TAIL_RADIUS = 6;

// Memoized so a new incoming message re-renders only itself (plus the previous bubble
// when it stops ending the run), not every visible bubble. Props are primitives + a stable
// message ref (existing messages keep identity when we append), so shallow compare works.
const MessageBubble = React.memo(function MessageBubble({
    message,
    isMine,
    endsRun,
}: {
    message: DirectMessage;
    isMine: boolean;
    /** Last bubble of a sender's run: gets the avatar and the wider gap below. */
    endsRun: boolean;
}) {
    const { t } = useTranslation('match');
    const { copied, copy } = useCopyToClipboard();
    const shape = isMine ? styles.mineShape : styles.theirsShape;

    return (
        <View
            className={cn(
                'flex-row items-end',
                endsRun ? 'mb-3' : 'mb-1.5',
                isMine ? 'justify-end' : 'justify-start',
            )}
        >
            {!isMine && (
                // The column is reserved on every incoming bubble so a run stays aligned.
                <View className="w-7 mr-2">
                    {endsRun && (
                        <SocialAvatar src={message.senderAvatarUrl} name={message.senderUsername} size={28} />
                    )}
                </View>
            )}
            {/* The glow lives on this wrapper; the bubble itself can't clip, because the
                "Copied" pill spills past a short bubble's edges. */}
            <View style={[styles.bubbleBox, shape, isMine && styles.mineGlow]}>
                <Pressable
                    onLongPress={() => copy(message.content)}
                    delayLongPress={250}
                    accessibilityRole="text"
                    accessibilityHint={t('chat.longPressToCopy')}
                    style={[styles.bubble, shape, !isMine && styles.theirsSurface]}
                >
                    {isMine && (
                        <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, { overflow: 'hidden' }]}>
                            <LinearGradient colors={OWN_BUBBLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        </View>
                    )}
                    <Text style={isMine ? styles.mineText : styles.theirsText}>
                        {message.content}
                    </Text>
                    <View className="flex-row items-center self-end mt-0.5" style={{ gap: 3 }}>
                        <Text
                            className="text-[10px] font-semibold"
                            style={[TABULAR, { color: isMine ? OWN_META_COLOR : COLORS.slate500 }]}
                        >
                            {formatTime(message.sentAt)}
                        </Text>
                        {isMine && (
                            <Ionicons
                                name={message.isRead ? 'checkmark-done' : 'checkmark'}
                                size={14}
                                color={message.isRead ? OWN_READ_COLOR : OWN_META_COLOR}
                                accessibilityLabel={message.isRead ? t('chat.read') : t('chat.sent')}
                            />
                        )}
                    </View>
                    {copied && <CopiedOverlay />}
                </Pressable>
            </View>
        </View>
    );
});

/** The day, between two hairlines that fade out toward the edges. */
function DateBreak({ date }: { date: string }) {
    return (
        <View className="flex-row items-center my-4 px-2" style={{ gap: 10 }}>
            <LinearGradient
                colors={['rgba(148,163,184,0)', 'rgba(148,163,184,0.22)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.dateLine}
            />
            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-[1.6px]">
                {formatDay(date)}
            </Text>
            <LinearGradient
                colors={['rgba(148,163,184,0.22)', 'rgba(148,163,184,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.dateLine}
            />
        </View>
    );
}

const TABULAR = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
    headerRing: {
        borderRadius: 999,
        padding: 1.5,
        borderWidth: 1.5,
        borderColor: 'rgba(52,211,153,0.6)',
        shadowColor: COLORS.primary,
        shadowOpacity: 0.45,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },
    bubbleBox: {
        maxWidth: '78%',
    },
    mineShape: {
        borderRadius: BUBBLE_RADIUS,
        borderBottomRightRadius: TAIL_RADIUS,
    },
    theirsShape: {
        borderRadius: BUBBLE_RADIUS,
        borderBottomLeftRadius: TAIL_RADIUS,
    },
    // iOS draws the glow from the wrapper's own fill, so it carries the bubble's colour.
    mineGlow: {
        backgroundColor: OWN_BUBBLE[1],
        shadowColor: COLORS.primary,
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    },
    bubble: {
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    // The surface Home's cards use: a step above the page, a hairline edge, a brighter top edge.
    theirsSurface: {
        backgroundColor: COLORS.cardRaised,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderTopColor: 'rgba(255,255,255,0.11)',
    },
    mineText: {
        color: OWN_TEXT,
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '600',
    },
    theirsText: {
        color: '#F1F5F9',
        fontSize: 15,
        lineHeight: 20,
    },
    dateLine: {
        flex: 1,
        height: 1,
    },
    composerField: {
        minHeight: 52,
        backgroundColor: COLORS.cardRaised,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderTopColor: 'rgba(255,255,255,0.11)',
    },
    sendIdle: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    sendReady: {
        backgroundColor: OWN_BUBBLE[1],
        shadowColor: COLORS.primary,
        shadowOpacity: 0.15,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 0 },
    },
    sendFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 22,
        overflow: 'hidden',
    },
    emptyGlow: {
        borderRadius: 999,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.4,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
    },
    emptyRing: {
        borderRadius: 999,
        padding: 2.5,
    },
    emptyRingGap: {
        borderRadius: 999,
        padding: 3,
        backgroundColor: COLORS.background,
    },
});

function formatTime(iso: string): string {
    try {
        // parseUtcDate treats a tz-less backend timestamp as UTC, so toLocaleTimeString
        // renders it in the device timezone (e.g. 15:00 in RS shows as 18:30 in IN).
        const d = parseUtcDate(iso);
        return d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function formatDay(iso: string): string {
    try {
        const d = parseUtcDate(iso);
        const now = new Date();
        const diffDays = Math.floor(
            (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) /
                (1000 * 60 * 60 * 24)
        );
        if (diffDays === 0) return i18n.t('match:chat.today');
        if (diffDays === 1) return i18n.t('match:chat.yesterday');
        return d.toLocaleDateString(dateLocale());
    } catch {
        return '';
    }
}

function sameDay(a: string, b: string): boolean {
    try {
        return parseUtcDate(a).toDateString() === parseUtcDate(b).toDateString();
    } catch {
        return false;
    }
}
