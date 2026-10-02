import { useTranslation } from 'react-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefetchOnFocusIfStale } from '../hooks/useRefetchOnFocusIfStale';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { FeedCard } from '../components/cards/FeedCard';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { EmptyState } from '../components/ui/EmptyState';
import { NotificationBell } from '../components/ui/NotificationBell';
import { RaisedCard } from '../components/ui/RaisedCard';
import { Skeleton } from '../components/ui/Skeleton';
import { MatchCardSkeleton } from '../components/match/MatchCardSkeleton';
import { COLORS } from '../lib/theme';
import { DashboardActivityDto } from '../types/dashboard';
import { useHomeMatches, type MatchOverviewDto } from '../lib/homeMatches';
import { HighlightsModal } from '../components/modals/HighlightsModal';
import { parseUtcDate, formatLocalDateTime } from '../lib/utils';
import { dateLocale } from '../i18n';

// A tab screen inside the root stack: the avatar switches to the Profile tab, everything else
// pushes onto the stack.
type HomeScreenNavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Home'>,
    StackNavigationProp<RootStackParamList>
>;

const SECTION_GAP = 28;

// An empty section reads as an unfilled slot: the dashed outline the match card uses for a
// kick-off nobody has agreed yet.
const EMPTY_SECTION_CLASS = 'py-9 bg-transparent border-dashed border-white/10 rounded-[20px]';

const TABULAR = { fontVariant: ['tabular-nums' as const] };

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
    const { t, i18n } = useTranslation('home');
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

    const homeMatchesQuery = useHomeMatches(user?.id);

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

    // The spinner follows the pull only. Bound to isFetching, it also flipped on the background
    // refetches (tab focus, a match update under an open sheet), and on iOS a flip while Home is
    // covered leaves the list pushed down by the control's height: a blank band above the greeting.
    const [isPulling, setIsPulling] = useState(false);
    const onRefresh = useCallback(async () => {
        setIsPulling(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['home-matches'] }),
                queryClient.invalidateQueries({ queryKey: ['hub-activities'] }),
            ]);
        } finally {
            setIsPulling(false);
        }
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
        // `t` alone does not change identity on a language switch; the language is the real input.
    }, [t, i18n.language]);

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
                        refreshing={isPulling}
                        onRefresh={onRefresh}
                        tintColor={COLORS.primary}
                    />
                }
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Greeting hero: the avatar sits with the name it belongs to, the inbox alone
                    in the top-right corner ── */}
                <View className="px-5 pt-2 pb-5 flex-row items-start">
                    <View className="flex-1 mr-3">
                        <Text className="text-slate-500 text-sm font-medium mb-1">
                            {greeting},
                        </Text>
                        <View className="flex-row items-center gap-2.5">
                            <Pressable
                                onPress={() => navigation.navigate('Profile')}
                                accessibilityRole="button"
                                accessibilityLabel={tCommon('nav.profile')}
                                hitSlop={6}
                                className="active:opacity-80"
                            >
                                {/* 40 = the name's line height, so the two read as one row. */}
                                <PlayerAvatar
                                    src={user?.avatarUrl || undefined}
                                    name={user?.username || 'P'}
                                    size="md"
                                    className="border-2 border-white/10"
                                />
                            </Pressable>
                            <Text
                                className="flex-1 text-white font-black tracking-tighter"
                                style={{ fontSize: 36, lineHeight: 40 }}
                                numberOfLines={1}
                            >
                                {user?.username || user?.nickName || tCommon('player')}
                            </Text>
                        </View>
                        <Text className="text-slate-400 text-[13px] font-medium mt-2 leading-5">
                            {subtitle}
                        </Text>
                    </View>
                    <NotificationBell onPress={() => navigation.navigate('Notifications')} />
                </View>

                <View className="px-5">
                    {/* ── Section: Needs Attention ── */}
                    {actionRequiredMatches.length > 0 && (
                        <Animated.View layout={LinearTransition.duration(200)}>
                            <SectionHeader
                                icon="alert"
                                color={COLORS.warning}
                                title={t('needsAttention')}
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
                                        checkIn={match.checkIn}
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
                            color={COLORS.primary}
                            title={t('activeMatches')}
                            count={sortedActiveMatches.length}
                            onSeeAll={() => navigation.navigate('MyMatches')}
                            collapsed={collapsed.active}
                            onToggle={() => toggleSection('active')}
                        />

                        {!collapsed.active && (
                        <Animated.View entering={FadeIn.duration(150)}>
                        {homeMatchesQuery.isLoading ? (
                            <View className="gap-2.5">
                                <MatchCardSkeleton />
                                <MatchCardSkeleton />
                            </View>
                        ) : sortedActiveMatches.length > 0 ? (
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
                                                ? parseUtcDate(match.scheduledTime).toLocaleString(dateLocale(), {
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
                                        checkIn={match.checkIn}
                                    />
                                ))}
                            </View>
                        ) : (
                            <EmptyState
                                icon="game-controller-outline"
                                color={COLORS.primary}
                                title={t('noActiveMatches')}
                                description={t('noActiveMatchesHint')}
                                className={EMPTY_SECTION_CLASS}
                            />
                        )}
                        </Animated.View>
                        )}
                    </Animated.View>

                    {/* ── Section: Highlights ── */}
                    <Animated.View layout={LinearTransition.duration(200)} style={{ marginTop: SECTION_GAP }}>
                        <SectionHeader
                            icon="sparkles"
                            color={COLORS.highlight}
                            title={t('highlights')}
                            onSeeAll={() => setShowHighlightsModal(true)}
                            collapsed={collapsed.highlights}
                            onToggle={() => toggleSection('highlights')}
                        />

                        {!collapsed.highlights && (
                        <Animated.View entering={FadeIn.duration(150)}>
                        {hubActivitiesQuery.isLoading ? (
                            <View className="gap-2.5">
                                <FeedCardSkeleton />
                                <FeedCardSkeleton />
                            </View>
                        ) : hubActivities.length > 0 ? (
                            <View className="gap-2.5">
                                {hubActivities.slice(0, 3).map((item, index) => (
                                    <FeedCard
                                        // Composite key so a fresh highlight arriving at the top doesn't cause
                                        // React to remap cards by position — a pure index key leaks the previous
                                        // card's internal state (animation, collapsed) onto the next item.
                                        key={`${item.tournamentId ?? item.hubName ?? 'feed'}-${item.createdOn ?? index}`}
                                        type={item.type}
                                        hubName={item.hubName}
                                        hubAvatar={item.hubAvatarUrl || item.hubAvatar}
                                        tournamentName={item.tournamentName}
                                        time={item.timeAgo || formatLocalDateTime(item.createdOn)}
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
                                className={EMPTY_SECTION_CLASS}
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
    /** The section's colour: it fills the tile and tints "See all", the same colour its cards carry. */
    color: string;
    title: string;
    /** How many items the section holds in total — the list itself only shows the top few. */
    count?: number;
    onSeeAll?: () => void;
    collapsed?: boolean;
    onToggle?: () => void;
}

function SectionHeader({
    icon,
    color,
    title,
    count,
    onSeeAll,
    collapsed,
    onToggle,
}: SectionHeaderProps) {
    const { t } = useTranslation('home');
    return (
        <View className="flex-row items-center gap-3 mb-3">
            {/* Tapping the title cluster collapses/expands the section. */}
            <Pressable
                onPress={onToggle}
                disabled={!onToggle}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                className="flex-1 flex-row items-center gap-2.5 active:opacity-70"
            >
                <View
                    className="w-7 h-7 rounded-[9px] items-center justify-center"
                    style={{ backgroundColor: color }}
                >
                    <Ionicons name={icon} size={15} color={COLORS.background} />
                </View>
                <Text
                    className="shrink text-[20px] leading-[26px] font-bold text-white tracking-tight"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {/* Only three cards ever render per section, so the tally says how much is
                    actually waiting behind "See all". */}
                {!!count && count > 0 && (
                    <Text style={TABULAR} className="text-[15px] font-semibold text-slate-400">
                        {count > 99 ? '99+' : count}
                    </Text>
                )}
                {onToggle && (
                    <Ionicons
                        name={collapsed ? 'chevron-down' : 'chevron-up'}
                        size={14}
                        color={COLORS.slate500}
                    />
                )}
            </Pressable>
            {onSeeAll && (
                <Pressable
                    onPress={onSeeAll}
                    hitSlop={10}
                    accessibilityRole="button"
                    className="active:opacity-60"
                >
                    <Text className="text-[14px] font-semibold" style={{ color }}>
                        {t('seeAll')}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

// Placeholders in the shape of the cards, so a cold start shows cards arriving instead of
// flashing "No active matches" / "No highlights yet" before the first response lands.
function FeedCardSkeleton() {
    return (
        <RaisedCard>
            <View style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}>
                <View className="flex-row items-center gap-3">
                    <Skeleton width="34%" height={10} radius={5} />
                    <View className="flex-1" />
                    <Skeleton width={40} height={10} radius={5} />
                </View>
                <View className="flex-row items-center gap-3" style={{ marginTop: 11 }}>
                    <Skeleton width={45} height={45} radius={13} />
                    <View className="flex-1" style={{ gap: 8 }}>
                        <Skeleton width="70%" height={14} radius={7} />
                        <Skeleton width="40%" height={10} radius={5} />
                    </View>
                </View>
            </View>
        </RaisedCard>
    );
}
