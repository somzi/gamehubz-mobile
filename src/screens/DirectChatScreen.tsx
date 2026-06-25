import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    FlatList,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { RootStackParamList } from '../types/navigation';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { DirectChat, DirectMessage } from '../types/social';

type Route = RouteProp<RootStackParamList, 'DirectChat'>;
type Nav = StackNavigationProp<RootStackParamList>;

export default function DirectChatScreen() {
    const route = useRoute<Route>();
    const navigation = useNavigation<Nav>();
    const { user } = useAuth();
    const myUserId = user?.id;

    const { chatId: initialChatId, otherUserId } = route.params || {};

    const [chat, setChat] = useState<DirectChat | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);

    const listRef = useRef<FlatList<DirectMessage>>(null);
    const connectionRef = useRef<HubConnection | null>(null);

    // ─── Bootstrap: resolve chat (by id or by other user) + load messages ─
    useEffect(() => {
        let cancelled = false;
        // Clear per-chat state immediately on switch so the previous chat's
        // header, messages, and draft don't flash while the new chat loads.
        setChat(null);
        setMessages([]);
        setInput('');
        setSendError(null);
        setError(null);
        (async () => {
            try {
                setLoading(true);
                let resolved: DirectChat | null = null;

                if (initialChatId) {
                    // We have a chatId — load chats list and pick the one
                    // matching, or just fetch messages directly.
                    const chatsRes = await authenticatedFetch(ENDPOINTS.GET_DIRECT_CHATS());
                    if (chatsRes.ok) {
                        const all: DirectChat[] = await chatsRes.json();
                        resolved = all.find((c) => c.id === initialChatId) ?? null;
                    }
                } else if (otherUserId) {
                    const res = await authenticatedFetch(
                        ENDPOINTS.GET_OR_CREATE_DIRECT_CHAT(otherUserId),
                        { method: 'POST' }
                    );
                    if (res.ok) {
                        resolved = await res.json();
                    } else {
                        const txt = await res.text();
                        throw new Error(txt || 'Failed to open chat');
                    }
                } else {
                    throw new Error('Missing chat parameters');
                }

                if (cancelled) return;
                if (!resolved) throw new Error('Chat not found');

                setChat(resolved);

                // Load messages
                const msgsRes = await authenticatedFetch(
                    ENDPOINTS.GET_DIRECT_CHAT_MESSAGES(resolved.id, 100)
                );
                if (msgsRes.ok) {
                    const msgs: DirectMessage[] = await msgsRes.json();
                    if (!cancelled) setMessages(msgs);
                }

                // Mark as read
                authenticatedFetch(ENDPOINTS.MARK_DIRECT_CHAT_READ(resolved.id), { method: 'POST' })
                    .catch(() => { /* ignore */ });
            } catch (e: any) {
                if (!cancelled) setError(getErrorMessage(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [initialChatId, otherUserId]);

    // ─── SignalR connection ──────────────────────────────────────────────
    useEffect(() => {
        const currentChatId = chat?.id;
        if (!currentChatId) return;

        // Scope flag — flips false on cleanup. Used to discard late SignalR
        // events and to skip JoinChatGroup if the user already switched away
        // before connection.start() resolved.
        let isActive = true;

        const connection = new HubConnectionBuilder()
            .withUrl(ENDPOINTS.SIGNALR_DM_HUB)
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
                authenticatedFetch(ENDPOINTS.MARK_DIRECT_CHAT_READ(currentChatId), { method: 'POST' })
                    .catch(() => { });
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
            // Backfill anything sent during the disconnect gap (dedup by id below).
            authenticatedFetch(ENDPOINTS.GET_DIRECT_CHAT_MESSAGES(currentChatId, 100))
                .then((r) => (r.ok ? r.json() : null))
                .then((msgs: DirectMessage[] | null) => {
                    if (!isActive || !msgs) return;
                    setMessages((prev) => {
                        const known = new Set(prev.map((p) => p.id));
                        const added = msgs.filter((m) => !known.has(m.id));
                        return added.length ? [...prev, ...added] : prev;
                    });
                })
                .catch(() => { });
        });

        const startPromise = connection
            .start()
            .then(() => {
                if (!isActive) return;
                return connection.invoke('JoinChatGroup', currentChatId);
            })
            .catch((e) => console.warn('[DM] SignalR connect failed', e));

        connectionRef.current = connection;

        return () => {
            isActive = false;
            connection.off('ReceiveMessage');
            // Wait for start to settle before leaving/stopping so we don't
            // invoke on a connection still in the Connecting state.
            startPromise.finally(async () => {
                try {
                    if (connection.state === 'Connected') {
                        await connection.invoke('LeaveChatGroup', currentChatId);
                    }
                } catch { /* ignore */ }
                try { await connection.stop(); } catch { /* ignore */ }
            });
            connectionRef.current = null;
        };
    }, [chat?.id, myUserId]);

    // Auto-scroll to bottom on initial load
    useEffect(() => {
        if (!loading && messages.length > 0) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
        }
    }, [loading]);

    const showSendError = useCallback((msg: string) => {
        setSendError(msg);
        Alert.alert('Message not sent', msg);
    }, []);

    const send = useCallback(async () => {
        if (!chat?.id) return;
        const content = input.trim();
        if (!content || sending) return;
        try {
            setSending(true);
            setSendError(null);
            const res = await authenticatedFetch(ENDPOINTS.SEND_DIRECT_MESSAGE(chat.id), {
                method: 'POST',
                body: JSON.stringify({ content }),
            });
            if (res.ok) {
                setInput('');
                // We'll also receive via SignalR; the dedup in ReceiveMessage handler covers double-add.
                const echo: DirectMessage = await res.json();
                setMessages((prev) => {
                    if (prev.some((p) => p.id === echo.id)) return prev;
                    return [...prev, echo];
                });
                setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
            } else {
                const body = await res.text().catch(() => '');
                console.log('[DM] send failed:', res.status, body);
                showSendError(getErrorMessage(body) || 'Could not send message.');
            }
        } catch (e) {
            console.log('[DM] send threw:', e);
            showSendError(getErrorMessage(e));
        } finally {
            setSending(false);
        }
    }, [chat?.id, input, sending, showSendError]);

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top', 'bottom']}>
                <Header onBack={() => navigation.goBack()} chat={null} />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !chat) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top', 'bottom']}>
                <Header onBack={() => navigation.goBack()} chat={null} />
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-red-400 mt-4 text-center font-bold">
                        {error || 'Chat not available'}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top', 'bottom']}>
            <Header
                onBack={() => navigation.goBack()}
                chat={chat}
                onAvatarPress={() => navigation.navigate('PlayerProfile', { id: chat.otherUserId })}
            />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
            >
                <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(m) => m.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
                    renderItem={({ item, index }) => {
                        const isMine = item.senderId === myUserId;
                        const prev = messages[index - 1];
                        const showDateBreak =
                            !prev || !sameDay(prev.sentAt, item.sentAt);
                        return (
                            <>
                                {showDateBreak && <DateBreak date={item.sentAt} />}
                                <MessageBubble
                                    message={item}
                                    isMine={isMine}
                                    showAvatar={!isMine && (!prev || prev.senderId !== item.senderId)}
                                />
                            </>
                        );
                    }}
                    ListEmptyComponent={
                        <View className="items-center mt-32 px-6">
                            <View className="w-20 h-20 rounded-3xl bg-white/[0.03] items-center justify-center mb-4">
                                <Ionicons name="chatbubble-ellipses-outline" size={36} color="#1E293B" />
                            </View>
                            <Text className="text-white font-black text-base">Start the conversation</Text>
                            <Text className="text-slate-500 text-xs text-center font-medium mt-1">
                                Say hi to {chat.otherUsername}
                            </Text>
                        </View>
                    }
                />

                <View
                    className="border-t border-white/[0.04] bg-[#0B1120] px-3 pt-3 pb-2"
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
                    <View
                        className="flex-row items-end gap-2 bg-[#131B2E] border border-white/[0.06] rounded-3xl px-3 py-1.5"
                        style={{ minHeight: 52 }}
                    >
                        <TextInput
                            value={input}
                            onChangeText={setInput}
                            placeholder="Type a message..."
                            placeholderTextColor="#475569"
                            multiline
                            className="flex-1 text-white text-[15px] py-2 px-1"
                            style={{ maxHeight: 120 }}
                        />
                        <Pressable
                            onPress={send}
                            disabled={!input.trim() || sending}
                            className={`w-11 h-11 rounded-full items-center justify-center ${
                                input.trim() && !sending ? 'bg-emerald-500' : 'bg-white/5'
                            }`}
                            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons
                                    name="send"
                                    size={18}
                                    color={input.trim() ? '#fff' : '#475569'}
                                />
                            )}
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
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
    return (
        <View
            className="flex-row items-center px-3 py-3 border-b border-white/[0.04] bg-[#0B1120]"
        >
            <Pressable
                onPress={onBack}
                className="w-11 h-11 rounded-2xl items-center justify-center"
                hitSlop={8}
            >
                <Ionicons name="arrow-back" size={24} color="#FAFAFA" />
            </Pressable>

            {chat ? (
                <Pressable
                    className="flex-row items-center flex-1 ml-1"
                    onPress={onAvatarPress}
                >
                    <PlayerAvatar
                        src={chat.otherAvatarUrl ?? undefined}
                        name={chat.otherUsername}
                        size="md"
                    />
                    <View className="ml-3 flex-1">
                        <Text className="text-white font-black text-base" numberOfLines={1}>
                            {chat.otherUsername}
                        </Text>
                        {chat.otherNickname ? (
                            <Text className="text-slate-500 text-xs font-medium" numberOfLines={1}>
                                {chat.otherNickname}
                            </Text>
                        ) : null}
                    </View>
                </Pressable>
            ) : (
                <Text className="text-white font-black text-lg ml-1">Chat</Text>
            )}
        </View>
    );
}

function MessageBubble({
    message,
    isMine,
    showAvatar,
}: {
    message: DirectMessage;
    isMine: boolean;
    showAvatar: boolean;
}) {
    const time = formatTime(message.sentAt);
    return (
        <View
            className={`flex-row items-end mb-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
        >
            {!isMine && (
                <View className="w-7 mr-2" style={{ opacity: showAvatar ? 1 : 0 }}>
                    {showAvatar && (
                        <PlayerAvatar
                            src={message.senderAvatarUrl ?? undefined}
                            name={message.senderUsername}
                            size="sm"
                            className="!w-7 !h-7"
                        />
                    )}
                </View>
            )}
            <View
                className={`max-w-[78%] rounded-[18px] px-3.5 py-2 ${
                    isMine
                        ? 'bg-emerald-500 rounded-br-md'
                        : 'bg-[#1A2438] border border-white/[0.04] rounded-bl-md'
                }`}
            >
                <Text
                    className={`text-[14px] leading-5 ${
                        isMine ? 'text-slate-900 font-medium' : 'text-white'
                    }`}
                >
                    {message.content}
                </Text>
                <Text
                    className={`text-[9px] mt-0.5 font-bold ${
                        isMine ? 'text-emerald-900/60 text-right' : 'text-slate-500'
                    }`}
                >
                    {time}
                    {isMine && message.isRead ? ' • Read' : ''}
                </Text>
            </View>
        </View>
    );
}

function DateBreak({ date }: { date: string }) {
    return (
        <View className="items-center my-3">
            <View className="bg-white/[0.04] px-3 py-1 rounded-full">
                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    {formatDay(date)}
                </Text>
            </View>
        </View>
    );
}

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function formatDay(iso: string): string {
    try {
        const d = new Date(iso);
        const now = new Date();
        const diffDays = Math.floor(
            (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) /
                (1000 * 60 * 60 * 24)
        );
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        return d.toLocaleDateString();
    } catch {
        return '';
    }
}

function sameDay(a: string, b: string): boolean {
    try {
        return new Date(a).toDateString() === new Date(b).toDateString();
    } catch {
        return false;
    }
}
