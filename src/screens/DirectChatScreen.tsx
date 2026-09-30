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
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { RootStackParamList } from '../types/navigation';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL, getErrorMessage } from '../lib/api';
import { parseUtcDate, cn } from '../lib/utils';
import { COLORS } from '../lib/theme';
import { mergeMessagesById } from '../lib/mergeMessages';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgesContext';
import { useTrailingDebounce } from '../hooks/useTrailingDebounce';
import { SocialAvatar } from '../components/social/SocialAvatar';
import { CopiedOverlay } from '../components/chat/CopiedOverlay';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { DirectChat, DirectMessage } from '../types/social';
import { startSignalRWithRetry } from '../lib/signalR';

type Route = RouteProp<RootStackParamList, 'DirectChat'>;
type Nav = StackNavigationProp<RootStackParamList>;

// Initial page size — a single screenful loads fast; older messages page in on demand
// via the "Load earlier" header (uses the `before` cursor on the messages endpoint).
const PAGE_SIZE = 30;

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
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    // The header renders from the nav seed before the first page lands; until then the list
    // is empty but the chat is not, so the "say hi" state must wait for this.
    const [messagesLoaded, setMessagesLoaded] = useState(false);

    const listRef = useRef<FlatList<DirectMessage>>(null);
    const connectionRef = useRef<HubConnection | null>(null);
    const inputRef = useRef<TextInput>(null);
    // The real in-flight guard — see send(). The `sending` state is one render behind, which is
    // exactly the window a fast double-tap lands in.
    const sendingRef = useRef(false);
    // Guards the one-time scroll-to-bottom on first load so paging in older
    // messages (which grows the list at the top) doesn't yank the view down.
    const didInitialScrollRef = useRef(false);

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

    // Trailing-debounced mark-read: coalesces bursts of incoming messages into a
    // single POST, and flushes on unmount so leaving the chat within the 600ms
    // window still fires the read (naive clearTimeout was silently dropping it).
    const { debounced: markReadDebounced } = useTrailingDebounce((chatId: string) => {
        void markChatRead(chatId);
    });

    // ─── Bootstrap: resolve chat + load messages ────────────────────────
    // Fast path (chat list tap): the header is seeded from navigation params, so
    // the screen renders instantly and we go straight to GET /messages — no list
    // fetch, and the SignalR effect (keyed on chat.id) connects in parallel.
    // Fallback (deep link / push notification): only a chatId is known, so we pull
    // just that one chat (GET /api/DirectChat/{id}) alongside the messages.
    useEffect(() => {
        let cancelled = false;
        didInitialScrollRef.current = false;

        // Clear per-chat state immediately on switch so the previous chat's
        // messages and draft don't flash while the new chat loads.
        setMessages([]);
        setInput('');
        setSendError(null);
        setError(null);
        setHasMore(false);
        setMessagesLoaded(false);

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
                }

                if (!chatId) throw new Error(t('chat.missingParams'));

                // Deep link / notification with only a chatId and no header seed — fetch just
                // this one chat for the header, in parallel with the messages below.
                const needsMeta = !header && !otherUserId;
                const metaPromise: Promise<DirectChat | null> = needsMeta
                    ? authenticatedFetch(ENDPOINTS.GET_DIRECT_CHAT_BY_ID(chatId))
                        .then((r) => (r.ok ? r.json() : null))
                        .catch(() => null)
                    : Promise.resolve(null);

                const [msgsRes, meta] = await Promise.all([
                    authenticatedFetch(ENDPOINTS.GET_DIRECT_CHAT_MESSAGES(chatId, PAGE_SIZE)),
                    metaPromise,
                ]);
                if (cancelled) return;

                if (meta) setChat(meta);
                else if (needsMeta) throw new Error(t('chat.notAvailable'));

                if (msgsRes.ok) {
                    const msgs: DirectMessage[] = await msgsRes.json();
                    if (!cancelled) {
                        setMessages(msgs);
                        setHasMore(msgs.length >= PAGE_SIZE);
                        // Let the initial batch lay out, then stop auto-scrolling so
                        // "Load earlier" prepends don't jump the view to the bottom.
                        setTimeout(() => { didInitialScrollRef.current = true; }, 400);
                    }
                }

                void markChatRead(chatId);
            } catch (e: any) {
                if (!cancelled) setError(getErrorMessage(e));
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setMessagesLoaded(true);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [initialChatId, otherUserId]);

    // ─── Pagination: pull the previous page of older messages ────────────
    const loadEarlier = useCallback(async () => {
        const chatId = chat?.id;
        if (!chatId || loadingMore || !hasMore || messages.length === 0) return;
        setLoadingMore(true);
        try {
            const oldest = messages[0];
            const res = await authenticatedFetch(
                ENDPOINTS.GET_DIRECT_CHAT_MESSAGES(chatId, PAGE_SIZE, oldest.sentAt)
            );
            if (res.ok) {
                const older: DirectMessage[] = await res.json();
                setMessages((prev) => mergeMessagesById(prev, older));
                setHasMore(older.length >= PAGE_SIZE);
            }
        } catch { /* best-effort */ }
        finally { setLoadingMore(false); }
    }, [chat?.id, loadingMore, hasMore, messages]);

    // ─── SignalR connection ──────────────────────────────────────────────
    useEffect(() => {
        const currentChatId = chat?.id;
        if (!currentChatId) return;

        // Scope flag — flips false on cleanup. Used to discard late SignalR
        // events and to skip JoinChatGroup if the user already switched away
        // before connection.start() resolved.
        let isActive = true;

        const connection = new HubConnectionBuilder()
            // DirectChatHub now requires authentication — pass the JWT as the access_token query param.
            .withUrl(ENDPOINTS.SIGNALR_DM_HUB, {
                accessTokenFactory: async () =>
                    (await SecureStore.getItemAsync('access_token').catch(() => null)) ?? '',
            })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connection.on('ReceiveMessage', (incoming: any) => {
            if (!isActive) return;
            const m: DirectMessage = {
                id: incoming.id || incoming.Id,
                chatId: incoming.chatId || incoming.ChatId,
                senderId: incoming.senderId || incoming.SenderId,
                senderUsername: incoming.senderUsername || incoming.SenderUsername,
                senderAvatarUrl: incoming.senderAvatarUrl || incoming.SenderAvatarUrl,
                content: incoming.content || incoming.Content,
                sentAt: incoming.sentAt || incoming.SentAt,
                isRead: incoming.isRead ?? incoming.IsRead ?? false,
            };
            // Defensive: ignore messages routed for a different chat
            if (m.chatId && m.chatId !== currentChatId) return;

            setMessages((prev) => {
                if (prev.some((p) => p.id === m.id)) return prev;
                return [...prev, m];
            });

            if (m.senderId !== myUserId) {
                // Coalesce a burst of incoming messages into one /read call (the endpoint
                // marks everything up to the read timestamp, so intermediate calls are wasted).
                markReadDebounced(currentChatId);
            }

            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        });

        // SignalR group membership is per-connection and is NOT restored when
        // withAutomaticReconnect() re-establishes a dropped socket (common on
        // mobile: network switch, brief backgrounding, idle timeout). Without
        // re-joining, the screen stays "connected" but silently stops receiving
        // messages until the user leaves and re-enters. Re-join on every reconnect.
        connection.onreconnected(() => {
            if (!isActive) return;
            connection.invoke('JoinChatGroup', currentChatId).catch(() => { });
            // Backfill anything sent during the disconnect gap. Reconnect windows can be
            // long on mobile (backgrounding, network switch, tunnel exit) so a small page
            // size would leave a permanent hole in the middle of the conversation — the
            // "Load earlier" cursor only pulls messages OLDER than the current oldest, so
            // it can never fill a gap between our existing tail and the freshly-arrived
            // newest 30. Using 100 covers the vast majority of real disconnect windows;
            // if the gap is even bigger the user still has to close/reopen the chat, but
            // that's an edge case the previous implementation already accepted.
            const RECONNECT_BACKFILL = 100;
            // mergeMessagesById dedupes by id and re-sorts by sentAt so newest-first
            // backend output doesn't leave the tail out of order after concat.
            authenticatedFetch(ENDPOINTS.GET_DIRECT_CHAT_MESSAGES(currentChatId, RECONNECT_BACKFILL))
                .then((r) => (r.ok ? r.json() : null))
                .then((msgs: DirectMessage[] | null) => {
                    if (!isActive || !msgs) return;
                    setMessages((prev) => mergeMessagesById(prev, msgs));
                })
                .catch(() => { });
        });

        const initialConnection = startSignalRWithRetry(connection, {
            onConnected: () => {
                if (!isActive) return;
                return connection.invoke('JoinChatGroup', currentChatId);
            },
            onError: (e) => console.warn('[DM] SignalR connect failed', e),
        });

        connectionRef.current = connection;

        return () => {
            isActive = false;
            connection.off('ReceiveMessage');
            void (async () => {
                try {
                    if (connection.state === 'Connected') {
                        await connection.invoke('LeaveChatGroup', currentChatId);
                    }
                } catch { /* ignore */ }
                await initialConnection.stop();
            })();
            connectionRef.current = null;
        };
    }, [chat?.id, myUserId]);

    const showSendError = useCallback((msg: string) => {
        setSendError(msg);
        Alert.alert(t('chat.messageNotSent'), msg);
    }, []);

    const send = useCallback(async () => {
        if (!chat?.id) return;
        const content = input.trim();
        // Ref, not the `sending` state: state is captured in this closure and only refreshes on
        // re-render, so two taps inside one frame both read false and the same message goes twice.
        if (!content || sendingRef.current) return;

        sendingRef.current = true;
        // Keep the keyboard up across sends (Discord-style): re-assert focus before the
        // async round-trip — a no-op when already focused, and it re-opens the keyboard
        // if a near-miss tap on the message list just dismissed it.
        inputRef.current?.focus();

        // Cleared NOW rather than on the server's answer: text left in the box for the length of
        // the round-trip reads as "send did nothing". Put back below when the send really fails.
        setInput('');

        try {
            setSending(true);
            setSendError(null);
            const res = await authenticatedFetch(ENDPOINTS.SEND_DIRECT_MESSAGE(chat.id), {
                method: 'POST',
                body: JSON.stringify({ content }),
            });
            if (res.ok) {
                // We'll also receive via SignalR; the dedup in ReceiveMessage handler covers double-add.
                const echo: DirectMessage = await res.json();
                setMessages((prev) => {
                    if (prev.some((p) => p.id === echo.id)) return prev;
                    return [...prev, echo];
                });
                updateCachedChat(chat.id, (item) => ({
                    ...item,
                    lastMessage: echo.content,
                    lastMessageAt: echo.sentAt,
                    lastMessageSenderId: echo.senderId,
                    unreadCount: 0,
                }));
                // The optimistic row above makes Back instantaneous; the refetch
                // also picks up any concurrent message that won the latest slot.
                queryClient.invalidateQueries({ queryKey: ['direct-chats'] });
                setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
            } else {
                const body = await res.text().catch(() => '');
                console.log('[DM] send failed:', res.status, body);
                // Only into an empty box — anything typed since outranks the failed message.
                setInput((current) => (current.length === 0 ? content : current));
                showSendError(getErrorMessage(body) || t('chat.couldNotSend'));
            }
        } catch (e) {
            console.log('[DM] send threw:', e);
            setInput((current) => (current.length === 0 ? content : current));
            showSendError(getErrorMessage(e));
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    }, [chat?.id, input, queryClient, showSendError, updateCachedChat]);

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
                    onContentSizeChange={() => {
                        if (!didInitialScrollRef.current) {
                            listRef.current?.scrollToEnd({ animated: false });
                        }
                    }}
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
                                            {t('chat.loadEarlier')}
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
                        messagesLoaded ? (
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

                <View
                    className="border-t border-white/[0.04] bg-background-deep px-3 pt-3 pb-2"
                >
                    {sendError && (
                        <View className="flex-row items-center bg-red-500/10 border border-red-500/25 rounded-2xl px-3 py-2 mb-2">
                            <Ionicons name="alert-circle" size={16} color="#F87171" />
                            <Text className="text-red-300 text-xs font-bold flex-1 ml-2" numberOfLines={2}>
                                {sendError}
                            </Text>
                            <Pressable onPress={() => setSendError(null)} hitSlop={8} className="ml-2">
                                <Ionicons name="close" size={14} color="#F87171" />
                            </Pressable>
                        </View>
                    )}
                    {/* One rounded field with the send button nested in its right end. */}
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
