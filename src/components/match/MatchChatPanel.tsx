import { useChatConversation } from '../../hooks/useChatConversation';
import { useChatScroll } from '../../hooks/useChatScroll';
import { ChatConnectionStatus, ChatOutbox, ChatNewMessages } from '../chat/ChatFeedback';
import { LoadFailedState } from '../ui/EmptyState';
import { RefreshFailedBanner } from '../ui/RefreshFailedBanner';
import { useQueryClient } from '@tanstack/react-query';
import type { MatchOverviewDto } from '../../lib/homeMatches';
import { useTranslation } from 'react-i18next';
import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgesContext';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { MatchChatBubble } from '../chat/MatchChatBubble';
import { MatchComment } from '../../types/auth';
import { ChatWorkspace } from '../../lib/chatWorkspace';
import { cn, parseUtcDate } from '../../lib/utils';
import { dateLocale } from '../../i18n';

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
    workspace?: ChatWorkspace;
}

/**
 * Self-contained match chat: history via REST, live updates via the /hubs/chat
 * SignalR group, and a send box. Shared by match cards and match details.
 */
export function MatchChatPanel({ matchId, active, participantIds = [], avatarsByUserId = {}, readOnly = false, workspace: suppliedWorkspace }: MatchChatPanelProps) {
    const { t } = useTranslation('match');
    const { user } = useAuth();
    const { refreshCounts, scheduleMatchesRefresh } = useBadges();
    const queryClient = useQueryClient();
    const localWorkspace = useMemo(() => new ChatWorkspace(), [matchId]);
    const workspace = suppliedWorkspace ?? localWorkspace;
    const work = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
    const newComment = work.draft, setNewComment = workspace.setDraft;
    const inputRef = useRef<TextInput>(null);
    const sendingRef = useRef(false);
    const [isSending, setIsSending] = useState(false);
    const normalizedParticipantIds = participantIds.filter(Boolean).map(id => id!.toLowerCase());
    const conversation = useChatConversation<MatchComment>({
        id: matchId, kind: 'match', active, workspace,
        map: raw => ({
            id: raw.id ?? raw.Id, userId: raw.userId ?? raw.UserId,
            userNickname: raw.userNickname ?? raw.UserNickname ?? t('common:unknown'),
            userAvatarUrl: raw.userAvatarUrl ?? raw.UserAvatarUrl,
            content: raw.content ?? raw.Content, sentAt: raw.sentAt ?? raw.SentAt,
        }),
        onRead: async id => {
            // Lists that change while the read is in flight (a push refetched them, a message came
            // in) already hold newer server state than this read's answer: those keep their count.
            // Only a list as old as the read takes the local zero. Compared by update count, not
            // by time: two writes inside one millisecond share a dataUpdatedAt.
            const lists = () => queryClient.getQueryCache().findAll({ queryKey: ['home-matches'] });
            const asOfRead = new Map(lists().map(query => [query.queryHash, query.state.dataUpdateCount]));
            const response = await authenticatedFetch(ENDPOINTS.MARK_MATCH_CHAT_READ(id), {method:'POST'});
            if (!response.ok) return;
            for (const query of lists()) {
                if (asOfRead.get(query.queryHash) !== query.state.dataUpdateCount) continue;
                queryClient.setQueryData<MatchOverviewDto[]>(query.queryKey, current => current?.map(match =>
                    (match.id ?? match.matchId)?.toLowerCase() === id.toLowerCase() ? {...match, unreadMessages:0} : match));
            }
            refreshCounts();
            // A message that reached the server after the read is unread there. One refetch per
            // window confirms that, shared with the badge pushes of the same second.
            scheduleMatchesRefresh();
        },
    });
    const { messages: comments, loading: isLoading, hasMore, loadingMore: loadingEarlier, loadEarlier } = conversation;
    const scroll = useChatScroll(comments, loadingEarlier);
    const { listRef } = scroll;
    const handleSend = async () => {
        const content = newComment.trim();
        if (!content || sendingRef.current) return;
        sendingRef.current = true; setIsSending(true);
        inputRef.current?.focus(); setNewComment(''); scroll.jumpToLatest();
        try { await conversation.send(content); }
        finally { sendingRef.current = false; setIsSending(false); }
    };

    // Exact local time (device timezone) instead of "x ago". Date is prefixed only for
    // messages not sent today, so same-day chat stays compact.
    const formatCommentTime = (dateString: string) => {
        const date = parseUtcDate(dateString);
        const time = date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
        const isToday = date.toDateString() === new Date().toDateString();
        return isToday ? time : `${date.toLocaleDateString(dateLocale())} ${time}`;
    };

    return (
        <View className="flex-1 px-5">
            <ChatConnectionStatus status={conversation.connectionStatus} />
            {conversation.error && comments.length > 0 && <RefreshFailedBanner onRetry={conversation.refresh} retrying={isLoading} />}
            {isLoading && comments.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="small" color="#10B981" />
                </View>
            ) : conversation.error && comments.length === 0 ? (
                <LoadFailedState onRetry={conversation.refresh} retrying={isLoading} />
            ) : (
                // Same list wiring as the friends DM (DirectChatScreen), which sends on the first
                // tap with the keyboard up: a FlatList with keyboardShouldPersistTaps="handled",
                // drag-to-dismiss, and the composer as a plain sibling underneath.
                <FlatList
                    ref={listRef}
                    data={comments}
                    keyExtractor={(c) => c.id}
                    contentContainerStyle={{ paddingVertical: 10, flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    // iOS: drag down onto the keyboard to dismiss (Discord-style).
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    initialNumToRender={15}
                    maxToRenderPerBatch={15}
                    windowSize={11}
                    showsVerticalScrollIndicator={false}
                    // Keep the reading position stable when "Load earlier" prepends older messages.
                    maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
                    onScroll={scroll.onScroll}
                    scrollEventThrottle={100}
                    onContentSizeChange={scroll.onContentSizeChange}
                    ListFooterComponent={<ChatOutbox messages={conversation.pending} onRetry={conversation.retry} onDiscard={conversation.discard} />}
                    ListHeaderComponent={
                        hasMore ? (
                            <Pressable
                                onPress={loadEarlier}
                                disabled={loadingEarlier}
                                className="items-center py-2"
                            >
                                {loadingEarlier ? (
                                    <ActivityIndicator size="small" color="#10B981" />
                                ) : (
                                    <Text className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                        {conversation.pageError ? t('common:retry') : t('chatPanel.loadEarlier')}
                                    </Text>
                                )}
                            </Pressable>
                        ) : null
                    }
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center">
                            <View className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/10 items-center justify-center mb-3">
                                <Ionicons name="chatbubble-outline" size={24} color="#475569" />
                            </View>
                            <Text className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('chatPanel.noMessagesYet')}</Text>
                            <Text className="text-[11px] text-slate-600 mt-1">{t('chatPanel.sayHi')}</Text>
                        </View>
                    }
                    renderItem={({ item: comment }) => {
                        const senderId = (comment.userId || '').toLowerCase();
                        const isMyComment = senderId === user?.id?.toLowerCase();
                        const isAdminMessage =
                            normalizedParticipantIds.length > 0 && !normalizedParticipantIds.includes(senderId);
                        const avatarSrc = isMyComment ? user?.avatarUrl : (comment.userAvatarUrl || avatarsByUserId[senderId]);

                        return (
                            <View
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
                                                <Text className="text-[8px] font-black text-warning uppercase tracking-widest">{t('chatPanel.admin')}</Text>
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
                                        name={user?.username || t('chatPanel.you')}
                                        size="sm"
                                        className="w-7 h-7 shrink-0"
                                    />
                                )}
                            </View>
                        );
                    }}
                />
            )}

            <ChatNewMessages visible={scroll.hasNewMessages} onPress={scroll.jumpToLatest} />
            {/* Composer — hidden for completed matches (chat stays visible, read-only) */}
            {readOnly ? (
                <View className="py-3 border-t border-white/5 items-center">
                    <View className="flex-row items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/10">
                        <Ionicons name="lock-closed-outline" size={13} color="#64748B" />
                        <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {t('chatPanel.readOnly')}
                        </Text>
                    </View>
                </View>
            ) : (
            <View className="py-3 border-t border-white/5">
                <View className="flex-row items-end gap-3 bg-white/5 p-2 rounded-[24px] border border-white/10">
                    <TextInput
                        ref={inputRef}
                        className="flex-1 px-4 py-3 text-white font-medium"
                        placeholder={t('chatPanel.typeAMessage')}
                        placeholderTextColor="#64748B"
                        value={newComment}
                        onChangeText={setNewComment}
                        multiline
                        maxLength={500}
                        style={{ minHeight: 48, maxHeight: 120 }}
                    />
                    <Pressable
                        onPress={handleSend}
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
