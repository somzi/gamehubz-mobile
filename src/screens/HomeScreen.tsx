import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { FeedCard } from '../components/cards/FeedCard';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { DashboardActivityDto } from '../types/dashboard';
import { HighlightsModal } from '../components/modals/HighlightsModal';
import { cn } from '../lib/utils';

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
    status: number;
    isRoundLocked?: boolean;
}

export default function HomeScreen() {
    const navigation = useNavigation<HomeScreenNavigationProp>();
    const { user } = useAuth();
    const [actionRequiredMatches, setActionRequiredMatches] = useState<MatchOverviewDto[]>([]);
    const [myMatches, setMyMatches] = useState<MatchOverviewDto[]>([]);
    const [hubActivities, setHubActivities] = useState<DashboardActivityDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHighlightsModal, setShowHighlightsModal] = useState(false);
    const [isActionRequiredCollapsed, setIsActionRequiredCollapsed] = useState(false);
    const [isActiveMatchesCollapsed, setIsActiveMatchesCollapsed] = useState(false);
    const [isHighlightsCollapsed, setIsHighlightsCollapsed] = useState(false);

    const fetchMatches = async () => {
        if (!user?.id) return;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_USER_HOME_MATCHES(user.id));
            if (response.ok) {
                const data: any[] = await response.json();
                const normalizedData: MatchOverviewDto[] = data.map(m => ({
                    id: m.id || m.Id,
                    matchId: m.matchId || m.MatchId,
                    tournamentId: m.tournamentId || m.TournamentId,
                    tournamentName: m.tournamentName || m.TournamentName,
                    hubName: m.hubName || m.HubName,
                    scheduledTime: m.scheduledTime || m.ScheduledTime || null,
                    opponentName: m.opponentName || m.OpponentName,
                    opponentAvatarUrl: m.opponentAvatarUrl || m.OpponentAvatarUrl,
                    status: m.status !== undefined ? m.status : m.Status,
                    isRoundLocked: m.isRoundLocked !== undefined ? m.isRoundLocked : m.IsRoundLocked
                }));
                const openMatches = normalizedData.filter(m => !m.isRoundLocked);
                setActionRequiredMatches(openMatches.filter(m => !m.scheduledTime));
                setMyMatches(openMatches.filter(m => m.scheduledTime));
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
                const activities: DashboardActivityDto[] = data.map(a => ({
                    hubName: a.hubName || a.HubName,
                    message: a.message || a.Message,
                    tournamentName: a.tournamentName || a.TournamentName,
                    timeAgo: a.timeAgo || a.TimeAgo,
                    createdOn: a.createdOn || a.CreatedOn,
                    type: a.type || a.Type,
                    hubAvatar: a.hubAvatar || a.HubAvatar,
                    hubAvatarUrl: a.hubAvatarUrl || a.HubAvatarUrl
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

    const totalMatches = actionRequiredMatches.length + myMatches.length;

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#10B981" />}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── Premium Header & Hero ─── */}
                <View className="px-5 pt-8 pb-6">
                    <View className="flex-row items-center justify-between mb-8">
                        <View className="flex-1">
                            <Text className="text-slate-500 text-[10px] font-black uppercase tracking-[3px] mb-1">
                                {getGreeting()}
                            </Text>
                            <Text className="text-white text-3xl font-black tracking-tighter">
                                {user?.username || user?.nickName || 'Player'}
                            </Text>
                        </View>
                        <View className="relative">
                            <View className="absolute -inset-1.5 bg-primary/20 rounded-full" />
                            <PlayerAvatar
                                src={user?.avatarUrl || undefined}
                                name={user?.username || 'P'}
                                size="lg"
                                className="border-2 border-primary/20"
                            />
                        </View>
                    </View>

                    {/* Quick Stats Summary Ribbon */}
                    <View className="flex-row bg-[#131B2E] rounded-3xl p-1.5 border border-white/5 shadow-2xl">
                        <View className="flex-1 py-3 items-center">
                            <Text className="text-white text-lg font-black">{totalMatches}</Text>
                            <Text className="text-slate-500 text-[8px] uppercase font-black tracking-widest mt-0.5">Matches</Text>
                        </View>
                        <View className="w-[1px] bg-white/5 my-2.5" />
                        <View className="flex-1 py-3 items-center">
                            <Text className="text-white text-lg font-black">{actionRequiredMatches.length}</Text>
                            <Text className="text-slate-500 text-[8px] uppercase font-black tracking-widest mt-0.5">Alerts</Text>
                        </View>
                    </View>
                </View>

                <View className="px-5 gap-10">

                    {/* ── Section: Action Required ── */}
                    {actionRequiredMatches.length > 0 && (
                        <View>
                            <View className="flex-row items-center justify-between mb-4">
                                <Pressable
                                    onPress={() => setIsActionRequiredCollapsed(!isActionRequiredCollapsed)}
                                    className="flex-row items-center gap-3"
                                >
                                    <View className="w-10 h-10 rounded-2xl bg-yellow-500/10 items-center justify-center border border-yellow-500/20">
                                        <Ionicons name="alert-circle" size={20} color="#EAB308" />
                                    </View>
                                    <View>
                                        <Text className="text-white font-black text-lg tracking-tight">Needs Attention</Text>
                                        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Requires your action</Text>
                                    </View>
                                </Pressable>
                                <Pressable
                                    onPress={() => navigation.navigate('MyMatches')}
                                    className="bg-white/5 py-2 px-4 rounded-xl border border-white/5"
                                >
                                    <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest">See All</Text>
                                </Pressable>
                            </View>

                            {!isActionRequiredCollapsed && (
                                <View className="gap-3">
                                    {actionRequiredMatches.slice(0, 3).map((match, index) => (
                                        <MatchScheduleCard
                                            key={match.matchId || `pending-${index}`}
                                            matchId={match.id || match.matchId || ''}
                                            tournamentId={match.tournamentId || ''}
                                            tournamentName={match.tournamentName}
                                            roundName={match.hubName}
                                            opponentName={match.opponentName}
                                            opponentAvatarUrl={match.opponentAvatarUrl}
                                            status="pending_availability"
                                            onMatchUpdate={fetchMatches}
                                        />
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {/* ── Section: Active Matches ── */}
                    <View>
                        <View className="flex-row items-center justify-between mb-4">
                            <Pressable
                                onPress={() => setIsActiveMatchesCollapsed(!isActiveMatchesCollapsed)}
                                className="flex-row items-center gap-3"
                            >
                                <View className="w-10 h-10 rounded-2xl bg-primary/10 items-center justify-center border border-primary/20">
                                    <Ionicons name="game-controller" size={20} color="#10B981" />
                                </View>
                                <View>
                                    <Text className="text-white font-black text-lg tracking-tight">Active Matches</Text>
                                    <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">In progress & scheduled</Text>
                                </View>
                            </Pressable>
                            <Pressable
                                onPress={() => navigation.navigate('MyMatches')}
                                className="bg-white/5 py-2 px-4 rounded-xl border border-white/5"
                            >
                                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest">See All</Text>
                            </Pressable>
                        </View>

                        {!isActiveMatchesCollapsed && (
                            myMatches.length > 0 ? (
                                <View className="gap-3">
                                    {myMatches.slice(0, 3).map((match, index) => (
                                        <MatchScheduleCard
                                            key={match.matchId || `scheduled-${index}`}
                                            matchId={match.id || ''}
                                            tournamentId={match.tournamentId || ''}
                                            tournamentName={match.tournamentName}
                                            roundName={match.hubName}
                                            opponentName={match.opponentName}
                                            opponentAvatarUrl={match.opponentAvatarUrl}
                                            status="scheduled"
                                            scheduledTime={match.scheduledTime
                                                ? new Date(match.scheduledTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : 'TBD'}
                                            onMatchUpdate={fetchMatches}
                                        />
                                    ))}
                                </View>
                            ) : (
                                <View className="py-12 items-center justify-center bg-[#131B2E] rounded-[32px] border border-white/5">
                                    <View className="w-16 h-16 rounded-[24px] bg-primary/10 items-center justify-center mb-4">
                                        <Ionicons name="game-controller-outline" size={32} color="#10B981" />
                                    </View>
                                    <Text className="text-white font-black text-base">No active matches</Text>
                                    <Text className="text-slate-500 text-xs mt-1 text-center px-10">Your competitive matches will appear here once they start</Text>
                                </View>
                            )
                        )}
                    </View>

                    {/* ── Section: Community Highlights ── */}
                    <View>
                        <View className="flex-row items-center justify-between mb-4">
                            <Pressable
                                onPress={() => setIsHighlightsCollapsed(!isHighlightsCollapsed)}
                                className="flex-row items-center gap-3"
                            >
                                <View className="w-10 h-10 rounded-2xl bg-indigo-500/10 items-center justify-center border border-indigo-500/20">
                                    <Ionicons name="flash" size={20} color="#6366F1" />
                                </View>
                                <View>
                                    <Text className="text-white font-black text-lg tracking-tight">Highlights</Text>
                                    <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Latest from your hubs</Text>
                                </View>
                            </Pressable>
                            <Pressable
                                onPress={() => setShowHighlightsModal(true)}
                                className="bg-white/5 py-2 px-4 rounded-xl border border-white/5"
                            >
                                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest">See All</Text>
                            </Pressable>
                        </View>

                        {!isHighlightsCollapsed && (
                            hubActivities.length > 0 ? (
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
                                <View className="py-10 items-center justify-center bg-white/[0.02] rounded-3xl border border-white/5">
                                    <View className="w-14 h-14 rounded-2xl bg-indigo-500/10 items-center justify-center mb-3">
                                        <Ionicons name="planet-outline" size={28} color="#6366F1" />
                                    </View>
                                    <Text className="text-white font-bold text-sm">No highlights yet</Text>
                                    <Text className="text-slate-500 text-xs mt-1">Activity from your hubs will appear here</Text>
                                </View>
                            )
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
