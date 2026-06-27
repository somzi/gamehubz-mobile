import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgesContext';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { MatchChatBubble } from '../chat/MatchChatBubble';
import { MatchComment } from '../../types/auth';
import { cn, parseUtcDate } from '../../lib/utils';

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
    const scrollRef = useRef<ScrollView>(null);
    const connectionRef = useRef<HubConnection | null>(null);

    const normalizedParticipantIds = participantIds
        .filter(Boolean)
        .map(id => (id as string).toLowerCase());

    const fetchComments = async (silent = false) => {
        if (!matchId) return;
        if (!silent) setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_COMMENTS(matchId));
            if (response.ok) {
                const data = await response.json();
                setComments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('[MatchChatPanel] Error fetching comments:', error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    // Mark the chat read for the current user and refresh the badge counts.
    const markRead = async () => {
        if (!matchId) return;
        try {
            await authenticatedFetch(ENDPOINTS.MARK_MATCH_CHAT_READ(matchId), { method: 'POST' });
            refreshBadges();
        } catch { /* best-effort */ }
    };

    useEffect(() => {
        if (!active || !matchId) return;
        setComments([]);
        fetchComments();
        markRead();
    }, [matchId, active]);

    // SignalR live updates — same scope-flag pattern as MatchScheduleCard.
    useEffect(() => {
        if (!matchId || !active) return;

        let isActive = true;

        const connection = new HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/chat`)
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();

        connection.on('ReceiveMessage', (newMessage: any) => {
            if (!isActive) return;
            const mapped: MatchComment = {
                id: newMessage.id || newMessage.Id,
                userId: newMessage.userId || newMessage.UserId,
                userNickname: newMessage.userNickname || newMessage.UserNickname || 'Unknown',
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
            fetchComments(true);
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
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ paddingVertical: 10 }}
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
                >
                    {comments.map((comment) => {
                        const senderId = (comment.userId || '').toLowerCase();
                        const isMyComment = senderId === user?.id?.toLowerCase();
                        const isAdminMessage =
                            normalizedParticipantIds.length > 0 && !normalizedParticipantIds.includes(senderId);
                        const avatarSrc = isMyComment ? user?.avatarUrl : avatarsByUserId[senderId];

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
                                            <View className="bg-[#F59E0B]/15 px-1.5 py-0.5 rounded-full border border-[#F59E0B]/25">
                                                <Text className="text-[8px] font-black text-[#F59E0B] uppercase tracking-widest">Admin</Text>
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
                        onPress={handleSend}
                        disabled={!newComment.trim() || isSending}
                        className="w-12 h-12 rounded-full items-center justify-center"
                        style={({ pressed }) => [{
                            backgroundColor: !newComment.trim() || isSending
                                ? '#1E293B'
                                : pressed ? '#059669' : '#10B981',
                            transform: [{ scale: pressed ? 0.95 : 1 }],
                        }]}
                    >
                        {isSending ? (
                            <ActivityIndicator size="small" color="#0F172A" />
                        ) : (
                            <Ionicons name="send" size={20} color="#0F172A" />
                        )}
                    </Pressable>
                </View>
            </View>
            )}
        </View>
    );
}
