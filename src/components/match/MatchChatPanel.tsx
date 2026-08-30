import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgesContext';
import { useTrailingDebounce } from '../../hooks/useTrailingDebounce';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { MatchChatBubble } from '../chat/MatchChatBubble';
import { MatchComment } from '../../types/auth';
import { mergeMessagesById } from '../../lib/mergeMessages';
import { cn, parseUtcDate } from '../../lib/utils';

// Initial page size — load a screenful fast; older messages page in on demand.
const PAGE_SIZE = 30;

interface MatchChatPanelProps {
    matchId: string;
    /** Fetch history + hold the SignalR connection only while the panel is actually visible. */
    active: boolean;
    /** Home/away user ids — senders outside this set get an ADMIN badge. */
    participantIds?: (string | null | undefined)[];
    /** Optional avatar lookup keyed by lower-cased user id. */
    avatarsByUserId?: Record<string, string | undefined>;
    /** Completed matches keep the history visible but hide the composer. */
    readOnly?: boolean;
}

/**
 * Self-contained match chat: history via REST, live updates via the /hubs/chat
 * SignalR group, and a send box. Mirrors the chat tab in MatchScheduleCard so
 * admins opening a match from the bracket get the same conversation.
 */
export function MatchChatPanel({ matchId, active, participantIds = [], avatarsByUserId = {}, readOnly = false }: MatchChatPanelProps) {
    const { user } = useAuth();
    const { refresh: refreshBadges } = useBadges();
    const [comments, setComments] = useState<MatchComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [loadingEarlier, setLoadingEarlier] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const connectionRef = useRef<HubConnection | null>(null);
    const inputRef = useRef<TextInput>(null);
    // Guards the one-time scroll-to-bottom so paging in older messages doesn't yank to the end.
    const didInitialScrollRef = useRef(false);

    const normalizedParticipantIds = participantIds
        .filter(Boolean)
        .map(id => (id as string).toLowerCase());

    // `size` lets the reconnect-backfill path pull more than the initial page size —
    // long disconnect gaps (>30 messages) would leave an unfillable hole in the
    // middle of the conversation with just PAGE_SIZE (the "Load earlier" cursor
    // only walks BACKWARD from the current oldest, never fills gaps).
    const fetchComments = async (silent = false, size: number = PAGE_SIZE) => {
        if (!matchId) return;
        if (!silent) setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_COMMENTS(matchId, size));
            if (response.ok) {
                const data = await response.json();
                const list: MatchComment[] = Array.isArray(data) ? data : [];
                if (silent) {
                    // Reconnect backfill: merge with what we already have (which may include
                    // older messages the user paged in) so we don't silently drop history.
                    // Replacing wholesale — as this used to do — wiped every "Load earlier"
                    // batch every time SignalR reconnected.
                    setComments((prev) => mergeMessagesById(prev, list));
                } else {
                    setComments(list);
                    setHasMore(list.length >= PAGE_SIZE);
                    // Let the initial batch lay out, then stop auto-scrolling so
                    // "Load earlier" prepends don't jump the view to the bottom.
                    setTimeout(() => { didInitialScrollRef.current = true; }, 400);
                }
            }
        } catch (error) {
            console.error('[MatchChatPanel] Error fetching comments:', error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    // Pull the previous page of older messages (oldest currently shown = the cursor).
    const loadEarlier = async () => {
        if (!matchId || loadingEarlier || !hasMore || comments.length === 0) return;
        setLoadingEarlier(true);
        try {
            const oldest = comments[0];
            const response = await authenticatedFetch(
                ENDPOINTS.GET_MATCH_COMMENTS(matchId, PAGE_SIZE, oldest.sentAt)
            );
            if (response.ok) {
                const data = await response.json();
                const older: MatchComment[] = Array.isArray(data) ? data : [];
                setComments(prev => {
                    const known = new Set(prev.map(c => c.id));
                    const fresh = older.filter(c => !known.has(c.id));
                    return fresh.length ? [...fresh, ...prev] : prev;
                });
                setHasMore(older.length >= PAGE_SIZE);
            }
        } catch (error) {
            console.error('[MatchChatPanel] Error loading earlier comments:', error);
        } finally {
            setLoadingEarlier(false);
        }
    };

    // Trailing-debounced mark-read: coalesces bursts of incoming opponent messages
    // into a single POST, and flushes on unmount so leaving the panel within the
    // 600ms window still fires the read (naive clearTimeout was silently dropping it).
    const { debounced: markReadInternal } = useTrailingDebounce(async (id: string) => {
        try {
            await authenticatedFetch(ENDPOINTS.MARK_MATCH_CHAT_READ(id), { method: 'POST' });
            refreshBadges();
        } catch { /* best-effort */ }
    });

    const markRead = () => {
        if (!matchId) return;
        markReadInternal(matchId);
    };

    useEffect(() => {
        if (!active || !matchId) return;
        didInitialScrollRef.current = false;
        setComments([]);
        setHasMore(false);
        fetchComments();
        markRead();
    }, [matchId, active]);

    // SignalR live updates — same scope-flag pattern as MatchScheduleCard.
    useEffect(() => {
        if (!matchId || !active) return;

        let isActive = true;

        const connection = new HubConnectionBuilder()
            // MatchChatHub now requires authentication — pass the JWT as the access_token query param
            // (WebSockets can't set Authorization headers).
            .withUrl(`${API_BASE_URL}/hubs/chat`, {
                accessTokenFactory: async () =>
                    (await SecureStore.getItemAsync('access_token').catch(() => null)) ?? '',
            })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();

        connection.on('ReceiveMessage', (newMessage: any) => {
            if (!isActive) return;
            const mapped: MatchComment = {
                id: newMessage.id || newMessage.Id,
                userId: newMessage.userId || newMessage.UserId,
                userNickname: newMessage.userNickname || newMessage.UserNickname || 'Unknown',
                userAvatarUrl: newMessage.userAvatarUrl || newMessage.UserAvatarUrl,
                content: newMessage.content || newMessage.Content,
                sentAt: newMessage.sentAt || newMessage.SentAt,
            };
            setComments(prev => {
                if (prev.some(c => c.id === mapped.id)) return prev;
                return [...prev, mapped];
            });
            // We're actively viewing the chat — keep it marked read so the badge
            // doesn't re-appear for a message the user is looking at right now.
            if ((mapped.userId || '').toLowerCase() !== user?.id?.toLowerCase()) {
                markRead();
            }
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        });

        // Group membership is per-connection and is lost when
        // withAutomaticReconnect() re-establishes a dropped socket (common on
        // mobile). Re-join on reconnect — otherwise the panel stays "connected"
        // but silently stops receiving messages. Also pull a fresh snapshot to
        // backfill anything sent during the disconnect gap (dedup handles overlap).
        connection.onreconnected(() => {
            if (!isActive) return;
            connection.invoke('JoinMatchGroup', matchId).catch(() => { });
            // Pull a larger batch to cover long disconnect windows — see fetchComments
            // note above; 100 mirrors the DirectChatScreen reconnect backfill.
            fetchComments(true, 100);
        });

        const startPromise = connection.start()
            .then(() => {
                if (!isActive) return;
                return connection.invoke('JoinMatchGroup', matchId);
            })
            .catch((err) => console.error('[MatchChatPanel] SignalR error:', err));

        connectionRef.current = connection;

        return () => {
            isActive = false;
            connection.off('ReceiveMessage');
            startPromise.finally(async () => {
                try { await connection.stop(); } catch { /* ignore */ }
            });
            connectionRef.current = null;
        };
    }, [matchId, active]);

    const handleSend = async () => {
        if (!newComment.trim() || !matchId || isSending) return;
        // Keep the keyboard up across sends (Discord-style): re-assert focus before the
        // async round-trip — a no-op when already focused, and it re-opens the keyboard
        // if a near-miss tap on the message list just dismissed it.
        inputRef.current?.focus();
        setIsSending(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.POST_MATCH_COMMENT(matchId), {
                method: 'POST',
                body: JSON.stringify({ content: newComment.trim() }),
            });
            if (response.ok) {
                setNewComment('');
                if (!connectionRef.current) {
                    await fetchComments(true);
                }
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            }
        } catch (error) {
            console.error('[MatchChatPanel] Error sending comment:', error);
        } finally {
            setIsSending(false);
        }
    };

    // The send button fires on touch-down (see the composer below); these two keep a single
    // gesture — touch-down followed by the tap it completes into — to exactly one send.
    const sentOnTouchDownRef = useRef(false);

    const sendFromTouchDown = useCallback((): void => {
        sentOnTouchDownRef.current = true;
        void handleSend();
    }, [handleSend]);

    const sendFromTap = useCallback((): void => {
        if (sentOnTouchDownRef.current) {
            sentOnTouchDownRef.current = false;
            return;
        }
        void handleSend();
    }, [handleSend]);

    // Exact local time (device timezone) instead of "x ago". Date is prefixed only for
    // messages not sent today, so same-day chat stays compact.
    const formatCommentTime = (dateString: string) => {
        const date = parseUtcDate(dateString);
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isToday = date.toDateString() === new Date().toDateString();
        return isToday ? time : `${date.toLocaleDateString()} ${time}`;
    };

    return (
        <View className="flex-1 px-5">
            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="small" color="#10B981" />
                </View>
            ) : comments.length > 0 ? (
                <ScrollView
                    ref={scrollRef}
                    className="flex-1"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    // 'always', not 'handled': with 'handled' the list still blurs the input when it
                    // ends up as the touch responder, which ate the first tap on Send and only
                    // dropped the keyboard — you had to tap twice for every message. Dismissing by
                    // dragging (below) stays, and that is the only dismissal this chat needs.
                    keyboardShouldPersistTaps="always"
                    // iOS: 'interactive' (drag down onto the keyboard to dismiss, Discord-style)
                    // so a small scroll while composing doesn't drop the keyboard.
                    // Android doesn't support 'interactive' — keep 'on-drag' there.
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    contentContainerStyle={{ paddingVertical: 10 }}
                    onContentSizeChange={() => {
                        if (!didInitialScrollRef.current) {
                            scrollRef.current?.scrollToEnd({ animated: false });
                        }
                    }}
                >
                    {hasMore && (
                        <Pressable
                            onPress={loadEarlier}
                            disabled={loadingEarlier}
                            className="items-center py-2"
                        >
                            {loadingEarlier ? (
                                <ActivityIndicator size="small" color="#10B981" />
                            ) : (
                                <Text className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                    Load earlier messages
                                </Text>
                            )}
                        </Pressable>
                    )}
                    {comments.map((comment) => {
                        const senderId = (comment.userId || '').toLowerCase();
                        const isMyComment = senderId === user?.id?.toLowerCase();
                        const isAdminMessage =
                            normalizedParticipantIds.length > 0 && !normalizedParticipantIds.includes(senderId);
                        const avatarSrc = isMyComment ? user?.avatarUrl : (comment.userAvatarUrl || avatarsByUserId[senderId]);

                        return (
                            <View
                                key={comment.id}
                                className={cn(
                                    'mb-4 flex-row items-end gap-2 max-w-[85%]',
                                    isMyComment ? 'self-end' : 'self-start'
                                )}
                            >
                                {!isMyComment && (
                                    <PlayerAvatar
                                        src={avatarSrc}
                                        name={comment.userNickname}
                                        size="sm"
                                        className="w-7 h-7 shrink-0"
                                    />
                                )}

                                <View className={cn(isMyComment ? 'items-end' : 'items-start', 'flex-1')}>
                                    <View className="flex-row items-center gap-2 mb-1 px-1">
                                        {!isMyComment && (
                                            <Text className="font-black text-[10px] uppercase tracking-tighter text-primary">
                                                {comment.userNickname}
                                            </Text>
                                        )}
                                        {isAdminMessage && !isMyComment && (
                                            <View className="bg-warning/15 px-1.5 py-0.5 rounded-full border border-warning/25">
                                                <Text className="text-[8px] font-black text-warning uppercase tracking-widest">Admin</Text>
                                            </View>
                                        )}
                                        <Text className="text-[9px] font-bold text-slate-500">
                                            {formatCommentTime(comment.sentAt)}
                                        </Text>
                                    </View>
                                    <MatchChatBubble
                                        content={comment.content}
                                        isMyComment={isMyComment}
                                    />
                                </View>

                                {isMyComment && (
                                    <PlayerAvatar
                                        src={user?.avatarUrl}
                                        name={user?.username || 'You'}
                                        size="sm"
                                        className="w-7 h-7 shrink-0"
                                    />
                                )}
                            </View>
                        );
                    })}
                </ScrollView>
            ) : (
                <View className="flex-1 items-center justify-center">
                    <View className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/10 items-center justify-center mb-3">
                        <Ionicons name="chatbubble-outline" size={24} color="#475569" />
                    </View>
                    <Text className="text-xs font-bold text-slate-500 uppercase tracking-widest">No messages yet</Text>
                    <Text className="text-[11px] text-slate-600 mt-1">Say hi to get the conversation going.</Text>
                </View>
            )}

            {/* Composer — hidden for completed matches (chat stays visible, read-only) */}
            {readOnly ? (
                <View className="py-3 border-t border-white/5 items-center">
                    <View className="flex-row items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/10">
                        <Ionicons name="lock-closed-outline" size={13} color="#64748B" />
                        <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Match completed — chat is read-only
                        </Text>
                    </View>
                </View>
            ) : (
            <View className="py-3 border-t border-white/5">
                <View className="flex-row items-end gap-3 bg-white/5 p-2 rounded-[24px] border border-white/10">
                    <TextInput
                        ref={inputRef}
                        className="flex-1 px-4 py-3 text-white font-medium"
                        placeholder="Type a message..."
                        placeholderTextColor="#64748B"
                        value={newComment}
                        onChangeText={setNewComment}
                        multiline
                        maxLength={500}
                        style={{ minHeight: 48, maxHeight: 120 }}
                        onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                    <Pressable
                        // Sends on touch-down: inside a Modal the completed tap was being cancelled
                        // while the keyboard was up, so the press never became a send and the first
                        // tap only dropped the keyboard. onPress stays for activations that produce
                        // no touch (VoiceOver), and the ref keeps one gesture to a single send.
                        onPressIn={sendFromTouchDown}
                        onPress={sendFromTap}
                        disabled={!newComment.trim() || isSending}
                        // Taps that land a few px above the button hit the message list,
                        // which dismisses the keyboard and swallows the tap — extend the
                        // touch target so near-misses still send.
                        hitSlop={{ top: 14, bottom: 10, left: 6, right: 10 }}
                        // Background MUST live in className — a function style on Pressable is not
                        // applied reliably here, so bg-emerald-500 (bright green) when there's text,
                        // bg-white/5 (dark) when empty. Mirrors the friends DM send button.
                        className={`w-12 h-12 rounded-full items-center justify-center ${
                            newComment.trim() && !isSending ? 'bg-emerald-500' : 'bg-white/5'
                        }`}
                        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                    >
                        {isSending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Ionicons
                                name="send"
                                size={20}
                                color={newComment.trim() ? '#fff' : '#475569'}
                            />
                        )}
                    </Pressable>
                </View>
            </View>
            )}
        </View>
    );
}
