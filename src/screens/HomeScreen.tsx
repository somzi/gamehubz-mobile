import { useTranslation } from 'react-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefetchOnFocusIfStale } from '../hooks/useRefetchOnFocusIfStale';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { FeedCard } from '../components/cards/FeedCard';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { EmptyState } from '../components/ui/EmptyState';
import { COLORS } from '../lib/theme';
import { DashboardActivityDto } from '../types/dashboard';
import { HighlightsModal } from '../components/modals/HighlightsModal';
import { parseUtcDate, formatLocalDateTime } from '../lib/utils';
import i18n from '../i18n';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface MatchOverviewDto {
    id?: string;
    matchId?: string;
    tournamentId?: string;
    tournamentName: string;
    hubName: string;
    scheduledTime: string | null;
    roundDeadline?: string | null;
    opponentName: string;
    opponentAvatarUrl?: string;
    opponentNickname?: string;
    userNickname?: string;
    status: number;
    isRoundLocked?: boolean;
    unreadMessages?: number;
    /** Games this match is played over — 1 (or absent) is a plain single game. */
    bestOf?: number;
}

const SECTION_GAP = 22;

// Stable fallbacks used when a query is still loading. Reusing the same array
// reference keeps the useMemo below from re-computing on every render before
// the first response arrives.
const EMPTY_MATCHES: MatchOverviewDto[] = [];
const EMPTY_ACTIVITIES: DashboardActivityDto[] = [];

type SectionKey = 'attention' | 'active' | 'highlights';

// Rounds without a deadline sink to the bottom instead of pretending to be due at the
// epoch — Home only renders the top three, so this is what decides WHICH three a player
// is shown, and a deadline-less match must never push out one that is about to expire.
const deadlineMs = (m: MatchOverviewDto) => {
    if (!m.roundDeadline) return Number.POSITIVE_INFINITY;
    const time = parseUtcDate(m.roundDeadline).getTime();
    return isNaN(time) ? Number.POSITIVE_INFINITY : time;
};

const byDeadline = (a: MatchOverviewDto, b: MatchOverviewDto) => {
    const ta = deadlineMs(a);
    const tb = deadlineMs(b);
    // Guards Infinity - Infinity, which is NaN and would make the sort unstable.
    return ta === tb ? 0 : ta - tb;
};

export default function HomeScreen() {
    const { t } = useTranslation('home');
    const { t: tCommon } = useTranslation('common');
    const navigation = useNavigation<HomeScreenNavigationProp>();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [showHighlightsModal, setShowHighlightsModal] = useState(false);
    const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
        attention: false,
        active: false,
        highlights: false,
    });

    // Collapse animates via Reanimated layout transitions on the section wrappers —
    // LayoutAnimation ghosts text on the new architecture, so it's banned here.
    const toggleSection = (key: SectionKey) => {
        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const homeMatchesQuery = useQuery<MatchOverviewDto[]>({
        queryKey: ['home-matches', user?.id],
        queryFn: async () => {
            const response = await authenticatedFetch(ENDPOINTS.GET_USER_HOME_MATCHES(user!.id));
            if (!response.ok) throw new Error(`GET_USER_HOME_MATCHES failed: ${response.status}`);
            const data: any[] = await response.json();
            return data.map((m) => ({
                id: m.id || m.Id,
                matchId: m.matchId || m.MatchId,
                tournamentId: m.tournamentId || m.TournamentId,
                tournamentName: m.tournamentName || m.TournamentName,
                hubName: m.hubName || m.HubName,
                scheduledTime: m.scheduledTime || m.ScheduledTime || null,
                // Both of these are read by the cards below (deadline strip, Bo label) and were
                // being dropped here, so every card rendered "no round deadline" no matter what
                // the round actually had — the API has been sending it all along.
                roundDeadline: m.roundDeadline ?? m.RoundDeadline ?? null,
                bestOf: m.bestOf ?? m.BestOf ?? 1,
                opponentName: m.opponentName || m.OpponentName,
                opponentAvatarUrl: m.opponentAvatarUrl || m.OpponentAvatarUrl,
                opponentNickname: m.opponentNickname || m.OpponentNickname,
                userNickname: m.userNickname || m.UserNickname,
                status: m.status !== undefined ? m.status : m.Status,
                isRoundLocked: m.isRoundLocked !== undefined ? m.isRoundLocked : m.IsRoundLocked,
                unreadMessages: m.unreadMessages !== undefined ? m.unreadMessages : m.UnreadMessages,
            }));
        },
        enabled: !!user?.id,
        staleTime: 30_000,
        // Respect staleTime — 'always' would ignore it and re-hit the API on
        // every remount, defeating the tab-swap-is-instant win we just bought.
        refetchOnMount: true,
    });

    const hubActivitiesQuery = useQuery<DashboardActivityDto[]>({
        queryKey: ['hub-activities'],
        queryFn: async () => {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_ACTIVITY_HOME);
            if (!response.ok) throw new Error(`GET_HUB_ACTIVITY_HOME failed: ${response.status}`);
            const data: any[] = await response.json();
            return data.map((a) => ({
                hubName: a.hubName || a.HubName,
                message: a.message || a.Message,
                tournamentId: a.tournamentId || a.TournamentId,
                tournamentName: a.tournamentName || a.TournamentName,
                timeAgo: a.timeAgo || a.TimeAgo,
                createdOn: a.createdOn || a.CreatedOn,
                type: a.type || a.Type,
                hubAvatar: a.hubAvatar || a.HubAvatar,
                hubAvatarUrl: a.hubAvatarUrl || a.HubAvatarUrl,
            }));
        },
        staleTime: 30_000,
        refetchOnMount: true,
    });

    const allMatches = homeMatchesQuery.data ?? EMPTY_MATCHES;
    const hubActivities = hubActivitiesQuery.data ?? EMPTY_ACTIVITIES;

    const { actionRequiredMatches, myMatches } = useMemo(() => {
        const openMatches = allMatches.filter((m) => !m.isRoundLocked);
        return {
            // filter() already hands back a fresh array, so sorting it in place is safe.
            actionRequiredMatches: openMatches.filter((m) => !m.scheduledTime).sort(byDeadline),
            myMatches: openMatches.filter((m) => m.scheduledTime),
        };
    }, [allMatches]);

    // Bottom tabs keep this screen mounted, so useQuery's `refetchOnMount` never
    // fires on tab-swap. useRefetchOnFocusIfStale bridges the gap without hammering
    // the API on every focus — refetch only when the snapshot is >30s old.
    useRefetchOnFocusIfStale(
        homeMatchesQuery.refetch,
        homeMatchesQuery.dataUpdatedAt,
        { enabled: !!user?.id },
    );
    useRefetchOnFocusIfStale(
        hubActivitiesQuery.refetch,
        hubActivitiesQuery.dataUpdatedAt,
    );

    const onRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['home-matches'] });
        queryClient.invalidateQueries({ queryKey: ['hub-activities'] });
    }, [queryClient]);

    // Stable callback so MatchScheduleCard's React.memo actually skips
    // re-renders when unrelated Home state changes.
    const invalidateMatches = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['home-matches'] });
    }, [queryClient]);

    // Stable so the memoized FeedCard doesn't invalidate on every parent
    // re-render (badge tick, tab-focus refetch). The inline
    // `() => openTournament(id)` inside the map still creates a fresh lambda
    // per row — see other list screens for the same trade-off.
    const openTournament = useCallback(
        (id: string) => navigation.navigate('TournamentDetails', { id }),
        [navigation],
    );

    const greeting = useMemo(() => {
        const h = new Date().getHours();
        if (h < 5) return t('greetStillUp');
        if (h < 12) return t('greetMorning');
        if (h < 17) return t('greetAfternoon');
        return t('greetEvening');
    }, []);

    const dateLabel = useMemo(() => {
        const d = new Date();
        const day = d.toLocaleDateString(i18n.language, { weekday: 'short' });
        const monthDay = d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
        return `${day.toUpperCase()} · ${monthDay.toUpperCase()}`;
    }, []);

    const sortedActiveMatches = useMemo(() => {
        return [...myMatches].sort((a, b) => {
            const da = a.scheduledTime ? parseUtcDate(a.scheduledTime).getTime() : 0;
            const db = b.scheduledTime ? parseUtcDate(b.scheduledTime).getTime() : 0;
            // Kick-off is what these cards show, so it stays the primary key; the round
            // deadline breaks ties (and orders anything the API sent without a time).
            return da === db ? byDeadline(a, b) : da - db;
        });
    }, [myMatches]);

    const subtitle = useMemo(() => {
        if (actionRequiredMatches.length && myMatches.length) {
            return t('subtitleBoth', { count: actionRequiredMatches.length, scheduled: myMatches.length });
        }
        if (actionRequiredMatches.length) {
            return t('subtitleAttention', { count: actionRequiredMatches.length });
        }
        if (myMatches.length) {
            return t('subtitleScheduled', { count: myMatches.length });
        }
        return t('readyWhenYouAre');
    }, [actionRequiredMatches.length, myMatches.length]);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <ScrollView
                className="flex-1"
                // MatchScheduleCard renders its match Modal as a child of this list, and RN
                // negotiates touches over the REACT tree, not the native one — so this ScrollView
                // sees the taps inside that modal too. Left at the default ('never') it captured
                // the first tap whenever the keyboard was up, blurred the input and swallowed the
                // press: every chat message needed two taps on Send. 'handled' lets the tap reach
                // its target, exactly like the friends DM list.
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={homeMatchesQuery.isFetching}
                        onRefresh={onRefresh}
                        tintColor="#10B981"
                    />
                }
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Top date strip ── */}
                <View className="flex-row items-center px-5 pt-3 pb-1">
                    <View className="flex-row items-center gap-2">
                        <View className="w-1 h-1 rounded-full bg-emerald-400/60" />
                        <Text className="text-slate-500 text-[10px] font-black uppercase tracking-[3px]">
                            {dateLabel}
                        </Text>
                    </View>
                </View>

                {/* ── Greeting hero ── */}
                <View className="px-5 pt-3 pb-5 flex-row items-start">
                    <View className="flex-1 mr-4">
                        <Text className="text-slate-500 text-sm font-medium mb-1">
                            {greeting},
                        </Text>
                        <Text
                            className="text-white font-black tracking-tighter"
                            style={{ fontSize: 36, lineHeight: 40 }}
                            numberOfLines={1}
                        >
                            {user?.username || user?.nickName || tCommon('player')}
                        </Text>
                        <Text className="text-slate-400 text-[13px] font-medium mt-2 leading-5">
                            {subtitle}
                        </Text>
                    </View>
                    <PlayerAvatar
                        src={user?.avatarUrl || undefined}
                        name={user?.username || 'P'}
                        size="lg"
                        className="border-2 border-white/10"
                    />
                </View>

                <View className="px-5">
                    {/* ── Section: Needs Attention ── */}
                    {actionRequiredMatches.length > 0 && (
                        <Animated.View layout={LinearTransition.duration(200)}>
                            <SectionHeader
                                icon="alert-circle"
                                iconColor="#F59E0B"
                                iconBg="rgba(245, 158, 11, 0.01)"
                                iconBorder="rgba(245, 158, 11, 0.1)"
                                title={t('needsAttention')}
                                subtitle={t('needsAttentionSub')}
                                count={actionRequiredMatches.length}
                                onSeeAll={() => navigation.navigate('MyMatches')}
                                collapsed={collapsed.attention}
                                onToggle={() => toggleSection('attention')}
                            />
                            {!collapsed.attention && (
                            <Animated.View entering={FadeIn.duration(150)} style={{ gap: 10 }}>
                                {actionRequiredMatches.slice(0, 3).map((match) => (
                                    <MatchScheduleCard
                                        key={match.id || match.matchId}
                                        matchId={match.id || match.matchId || ''}
                                        tournamentId={match.tournamentId || ''}
                                        tournamentName={match.tournamentName}
                                        roundName={match.hubName}
                                        opponentName={match.opponentName}
                                        opponentAvatarUrl={match.opponentAvatarUrl}
                                        opponentNickname={match.opponentNickname}
                                        userNickname={match.userNickname}
                                        status="pending_availability"
                                        deadline={match.roundDeadline ?? undefined}
                                        onMatchUpdate={invalidateMatches}
                                        unreadMessages={match.unreadMessages}
                                        bestOf={match.bestOf}
                                    />
                                ))}
                            </Animated.View>
                            )}
                        </Animated.View>
                    )}

                    {/* ── Section: Active Matches ── */}
                    <Animated.View
                        layout={LinearTransition.duration(200)}
                        style={{ marginTop: actionRequiredMatches.length > 0 ? SECTION_GAP : 0 }}
                    >
                        <SectionHeader
                            icon="game-controller"
                            iconColor="#10B981"
                            iconBg="rgba(16, 185, 129, 0.01)"
                            iconBorder="rgba(16, 185, 129, 0.1)"
                            title={t('activeMatches')}
                            subtitle={t('activeMatchesSub')}
                            count={sortedActiveMatches.length}
                            onSeeAll={() => navigation.navigate('MyMatches')}
                            collapsed={collapsed.active}
                            onToggle={() => toggleSection('active')}
                        />

                        {!collapsed.active && (
                        <Animated.View entering={FadeIn.duration(150)}>
                        {sortedActiveMatches.length > 0 ? (
                            <View className="gap-2.5">
                                {sortedActiveMatches.slice(0, 3).map((match) => (
                                    <MatchScheduleCard
                                        key={match.id || match.matchId}
                                        matchId={match.id || match.matchId || ''}
                                        tournamentId={match.tournamentId || ''}
                                        tournamentName={match.tournamentName}
                                        roundName={match.hubName}
                                        opponentName={match.opponentName}
                                        opponentAvatarUrl={match.opponentAvatarUrl}
                                        opponentNickname={match.opponentNickname}
                                        userNickname={match.userNickname}
                                        status="scheduled"
                                        scheduledTime={
                                            match.scheduledTime
                                                ? parseUtcDate(match.scheduledTime).toLocaleString(i18n.language, {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })
                                                : t('common:app.tbd')
                                        }
                                        scheduledTimeIso={match.scheduledTime}
                                        deadline={match.roundDeadline ?? undefined}
                                        onMatchUpdate={invalidateMatches}
                                        unreadMessages={match.unreadMessages}
                                        bestOf={match.bestOf}
                                    />
                                ))}
                            </View>
                        ) : (
                            <EmptyState
                                icon="game-controller-outline"
                                color={COLORS.primary}
                                title={t('noActiveMatches')}
                                description={t('noActiveMatchesHint')}
                            />
                        )}
                        </Animated.View>
                        )}
                    </Animated.View>

                    {/* ── Section: Highlights ── */}
                    <Animated.View layout={LinearTransition.duration(200)} style={{ marginTop: SECTION_GAP }}>
                        <SectionHeader
                            icon="sparkles"
                            iconColor="#A78BFA"
                            iconBg="rgba(167, 139, 250, 0.01)"
                            iconBorder="rgba(167, 139, 250, 0.1)"
                            title={t('highlights')}
                            subtitle={t('highlightsSub')}
                            onSeeAll={() => setShowHighlightsModal(true)}
                            collapsed={collapsed.highlights}
                            onToggle={() => toggleSection('highlights')}
                        />

                        {!collapsed.highlights && (
                        <Animated.View entering={FadeIn.duration(150)}>
                        {hubActivities.length > 0 ? (
                            <View className="gap-2.5">
                                {hubActivities.slice(0, 3).map((item, index) => (
                                    <FeedCard
                                        // Composite key so a fresh highlight arriving at the top doesn't cause
                                        // React to remap cards by position — a pure index key leaks the previous
                                        // card's internal state (animation, collapsed) onto the next item.
                                        key={`${item.tournamentId ?? item.hubName ?? 'feed'}-${item.createdOn ?? index}`}
                                        hubName={item.hubName}
                                        hubAvatar={item.hubAvatarUrl || item.hubAvatar}
                                        message={item.message}
                                        tournamentName={item.tournamentName}
                                        timestamp={formatLocalDateTime(item.createdOn)}
                                        onClick={
                                            item.tournamentId
                                                ? () => openTournament(item.tournamentId!)
                                                : undefined
                                        }
                                    />
                                ))}
                            </View>
                        ) : (
                            <EmptyState
                                icon="planet-outline"
                                color={COLORS.highlight}
                                title={t('noHighlights')}
                                description={t('noHighlightsHint')}
                            />
                        )}
                        </Animated.View>
                        )}
                    </Animated.View>
                </View>
            </ScrollView>

            <HighlightsModal
                visible={showHighlightsModal}
                onClose={() => setShowHighlightsModal(false)}
            />
        </SafeAreaView>
    );
}

interface SectionHeaderProps {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBg: string;
    iconBorder: string;
    title: string;
    subtitle: string;
    /** How many items the section holds in total — the list itself only shows the top few. */
    count?: number;
    onSeeAll?: () => void;
    collapsed?: boolean;
    onToggle?: () => void;
}

function SectionHeader({
    icon,
    iconColor,
    iconBg,
    iconBorder,
    title,
    subtitle,
    count,
    onSeeAll,
    collapsed,
    onToggle,
}: SectionHeaderProps) {
    const { t } = useTranslation('home');
    return (
        <View className="flex-row items-center justify-between mb-3">
            {/* Tapping the title cluster collapses/expands the section. */}
            <Pressable
                onPress={onToggle}
                disabled={!onToggle}
                className="flex-row items-center gap-2.5 flex-1 active:opacity-70"
                hitSlop={8}
            >
                <View
                    className="w-9 h-9 rounded-[14px] items-center justify-center"
                    style={{
                        backgroundColor: iconBg,
                        borderWidth: 1,
                        borderColor: iconBorder,
                    }}
                >
                    <Ionicons name={icon} size={16} color={iconColor} />
                </View>
                <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                        <Text
                            className="text-white font-black text-base tracking-tight flex-shrink"
                            numberOfLines={1}
                        >
                            {title}
                        </Text>
                        {/* Only three cards ever render per section, so the tally says how much
                            is actually waiting behind "See All". */}
                        {!!count && count > 0 && (
                            <View
                                className="min-w-[20px] h-5 px-1.5 rounded-full items-center justify-center"
                                style={{
                                    backgroundColor: iconColor + '22',
                                    borderWidth: 1,
                                    borderColor: iconColor + '4D',
                                }}
                            >
                                <Text
                                    className="text-[10px] font-black"
                                    style={{ color: iconColor }}
                                >
                                    {count > 99 ? '99+' : count}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-[1.5px] mt-0.5">
                        {subtitle}
                    </Text>
                </View>
                {onToggle && (
                    <View className="w-7 h-7 rounded-full bg-white/[0.04] items-center justify-center border border-white/[0.06] mr-1.5">
                        <Ionicons
                            name={collapsed ? 'chevron-down' : 'chevron-up'}
                            size={14}
                            color="#94A3B8"
                        />
                    </View>
                )}
            </Pressable>
            {onSeeAll && (
                <Pressable
                    onPress={onSeeAll}
                    className="bg-white/[0.04] py-2 px-3.5 rounded-xl border border-white/[0.06] active:opacity-70 flex-row items-center gap-1"
                    hitSlop={6}
                >
                    <Text className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        {t('seeAll')}
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color="#CBD5E1" />
                </Pressable>
            )}
        </View>
    );
}

