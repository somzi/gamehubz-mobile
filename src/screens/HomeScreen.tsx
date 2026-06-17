import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { FeedCard } from '../components/cards/FeedCard';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { DashboardActivityDto } from '../types/dashboard';
import { HighlightsModal } from '../components/modals/HighlightsModal';
import { parseUtcDate } from '../lib/utils';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface MatchOverviewDto {
    id?: string;
    matchId?: string;
    tournamentId?: string;
    tournamentName: string;
    hubName: string;
    scheduledTime: string | null;
    opponentName: string;
    opponentAvatarUrl?: string;
    opponentNickname?: string;
    userNickname?: string;
    status: number;
    isRoundLocked?: boolean;
}

const SECTION_GAP = 28;

export default function HomeScreen() {
    const navigation = useNavigation<HomeScreenNavigationProp>();
    const { user } = useAuth();
    const [actionRequiredMatches, setActionRequiredMatches] = useState<MatchOverviewDto[]>([]);
    const [myMatches, setMyMatches] = useState<MatchOverviewDto[]>([]);
    const [hubActivities, setHubActivities] = useState<DashboardActivityDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHighlightsModal, setShowHighlightsModal] = useState(false);

    const fetchMatches = async () => {
        if (!user?.id) return;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_USER_HOME_MATCHES(user.id));
            if (response.ok) {
                const data: any[] = await response.json();
                const normalizedData: MatchOverviewDto[] = data.map((m) => ({
                    id: m.id || m.Id,
                    matchId: m.matchId || m.MatchId,
                    tournamentId: m.tournamentId || m.TournamentId,
                    tournamentName: m.tournamentName || m.TournamentName,
                    hubName: m.hubName || m.HubName,
                    scheduledTime: m.scheduledTime || m.ScheduledTime || null,
                    opponentName: m.opponentName || m.OpponentName,
                    opponentAvatarUrl: m.opponentAvatarUrl || m.OpponentAvatarUrl,
                    opponentNickname: m.opponentNickname || m.OpponentNickname,
                    userNickname: m.userNickname || m.UserNickname,
                    status: m.status !== undefined ? m.status : m.Status,
                    isRoundLocked: m.isRoundLocked !== undefined ? m.isRoundLocked : m.IsRoundLocked,
                }));
                const openMatches = normalizedData.filter((m) => !m.isRoundLocked);
                setActionRequiredMatches(openMatches.filter((m) => !m.scheduledTime));
                setMyMatches(openMatches.filter((m) => m.scheduledTime));
            }
        } catch (error) {
            console.error('Error fetching home matches:', error);
        }
    };

    const fetchHubActivities = async () => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_ACTIVITY_HOME);
            if (response.ok) {
                const data: any[] = await response.json();
                const activities: DashboardActivityDto[] = data.map((a) => ({
                    hubName: a.hubName || a.HubName,
                    message: a.message || a.Message,
                    tournamentName: a.tournamentName || a.TournamentName,
                    timeAgo: a.timeAgo || a.TimeAgo,
                    createdOn: a.createdOn || a.CreatedOn,
                    type: a.type || a.Type,
                    hubAvatar: a.hubAvatar || a.HubAvatar,
                    hubAvatarUrl: a.hubAvatarUrl || a.HubAvatarUrl,
                }));
                setHubActivities(activities);
            }
        } catch (error) {
            console.error('Error fetching hub activities:', error);
        }
    };

    const loadData = async () => {
        setLoading(true);
        await Promise.all([fetchMatches(), fetchHubActivities()]);
        setLoading(false);
    };

    useFocusEffect(
        React.useCallback(() => {
            loadData();
        }, [user?.id])
    );

    const greeting = useMemo(() => {
        const h = new Date().getHours();
        if (h < 5) return 'Still up';
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    }, []);

    const dateLabel = useMemo(() => {
        const d = new Date();
        const day = d.toLocaleDateString([], { weekday: 'short' });
        const monthDay = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `${day.toUpperCase()} · ${monthDay.toUpperCase()}`;
    }, []);

    const sortedActiveMatches = useMemo(() => {
        return [...myMatches].sort((a, b) => {
            const da = a.scheduledTime ? parseUtcDate(a.scheduledTime).getTime() : 0;
            const db = b.scheduledTime ? parseUtcDate(b.scheduledTime).getTime() : 0;
            return da - db;
        });
    }, [myMatches]);

    const subtitle = useMemo(() => {
        if (actionRequiredMatches.length && myMatches.length) {
            return `${myMatches.length} scheduled · ${actionRequiredMatches.length} need${actionRequiredMatches.length === 1 ? 's' : ''} action`;
        }
        if (actionRequiredMatches.length) {
            return `${actionRequiredMatches.length} match${actionRequiredMatches.length === 1 ? '' : 'es'} need your attention`;
        }
        if (myMatches.length) {
            return `${myMatches.length} match${myMatches.length === 1 ? '' : 'es'} scheduled today`;
        }
        return 'Ready when you are';
    }, [actionRequiredMatches.length, myMatches.length]);

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            <ScrollView
                className="flex-1"
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={loadData}
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
                <View className="px-5 pt-4 pb-7 flex-row items-start">
                    <View className="flex-1 mr-4">
                        <Text className="text-slate-500 text-sm font-medium mb-1">
                            {greeting},
                        </Text>
                        <Text
                            className="text-white font-black tracking-tighter"
                            style={{ fontSize: 36, lineHeight: 40 }}
                            numberOfLines={1}
                        >
                            {user?.username || user?.nickName || 'Player'}
                        </Text>
                        <Text className="text-slate-400 text-[13px] font-medium mt-3 leading-5">
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
                        <View>
                            <SectionHeader
                                icon="alert-circle"
                                iconColor="#F59E0B"
                                iconBg="rgba(245, 158, 11, 0.01)"
                                iconBorder="rgba(245, 158, 11, 0.1)"
                                title="Needs Attention"
                                subtitle="Requires your action"
                                onSeeAll={() => navigation.navigate('MyMatches')}
                            />
                            <View className="gap-3">
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
                                        onMatchUpdate={fetchMatches}
                                    />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* ── Section: Active Matches ── */}
                    <View style={{ marginTop: actionRequiredMatches.length > 0 ? SECTION_GAP : 0 }}>
                        <SectionHeader
                            icon="game-controller"
                            iconColor="#10B981"
                            iconBg="rgba(16, 185, 129, 0.01)"
                            iconBorder="rgba(16, 185, 129, 0.1)"
                            title="Active Matches"
                            subtitle="In progress & scheduled"
                            onSeeAll={() => navigation.navigate('MyMatches')}
                        />

                        {sortedActiveMatches.length > 0 ? (
                            <View className="gap-3">
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
                                                ? parseUtcDate(match.scheduledTime).toLocaleString([], {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })
                                                : 'TBD'
                                        }
                                        onMatchUpdate={fetchMatches}
                                    />
                                ))}
                            </View>
                        ) : (
                            <EmptyState
                                iconName="game-controller-outline"
                                iconColor="#10B981"
                                title="No active matches"
                                description="Your competitive matches will appear here once they start"
                            />
                        )}
                    </View>

                    {/* ── Section: Highlights ── */}
                    <View style={{ marginTop: SECTION_GAP }}>
                        <SectionHeader
                            icon="sparkles"
                            iconColor="#A78BFA"
                            iconBg="rgba(167, 139, 250, 0.01)"
                            iconBorder="rgba(167, 139, 250, 0.1)"
                            title="Highlights"
                            subtitle="Latest from your hubs"
                            onSeeAll={() => setShowHighlightsModal(true)}
                        />

                        {hubActivities.length > 0 ? (
                            <View className="gap-2.5">
                                {hubActivities.slice(0, 3).map((item, index) => (
                                    <FeedCard
                                        key={index}
                                        hubName={item.hubName}
                                        hubAvatar={item.hubAvatarUrl || item.hubAvatar}
                                        message={item.message}
                                        tournamentName={item.tournamentName}
                                        timestamp={item.timeAgo}
                                        onClick={() => { }}
                                    />
                                ))}
                            </View>
                        ) : (
                            <EmptyState
                                iconName="planet-outline"
                                iconColor="#A78BFA"
                                title="No highlights yet"
                                description="Activity from your hubs will appear here"
                            />
                        )}
                    </View>
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
    onSeeAll?: () => void;
}

function SectionHeader({
    icon,
    iconColor,
    iconBg,
    iconBorder,
    title,
    subtitle,
    onSeeAll,
}: SectionHeaderProps) {
    return (
        <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3 flex-1">
                <View
                    className="w-10 h-10 rounded-2xl items-center justify-center"
                    style={{
                        backgroundColor: iconBg,
                        borderWidth: 1,
                        borderColor: iconBorder,
                    }}
                >
                    <Ionicons name={icon} size={18} color={iconColor} />
                </View>
                <View className="flex-1">
                    <Text className="text-white font-black text-base tracking-tight">
                        {title}
                    </Text>
                    <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-[1.5px] mt-0.5">
                        {subtitle}
                    </Text>
                </View>
            </View>
            {onSeeAll && (
                <Pressable
                    onPress={onSeeAll}
                    className="bg-white/[0.04] py-2 px-3.5 rounded-xl border border-white/[0.06] active:opacity-70 flex-row items-center gap-1"
                    hitSlop={6}
                >
                    <Text className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        See All
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color="#CBD5E1" />
                </Pressable>
            )}
        </View>
    );
}

interface EmptyStateProps {
    iconName: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    title: string;
    description: string;
}

function EmptyState({ iconName, iconColor, title, description }: EmptyStateProps) {
    return (
        <View className="py-12 items-center justify-center bg-white/[0.02] rounded-3xl border border-white/[0.04]">
            <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: iconColor + '22' }}
            >
                <Ionicons name={iconName} size={26} color={iconColor} />
            </View>
            <Text className="text-white font-black text-sm">{title}</Text>
            <Text className="text-slate-500 text-xs mt-1 text-center px-10">
                {description}
            </Text>
        </View>
    );
}
