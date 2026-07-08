import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { COLORS } from '../lib/theme';

interface MatchOverviewDto {
    id: string;
    tournamentId: string;
    tournamentName: string;
    hubName: string;
    scheduledTime: string | null;
    opponentName: string;
    opponentAvatarUrl?: string;
    status: number;
    isRoundLocked?: boolean;
    unreadMessages?: number;
}

export default function MyMatchesScreen() {
    const navigation = useNavigation();
    const { user } = useAuth();
    const [matches, setMatches] = useState<MatchOverviewDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'scheduled'>('all');

    const fetchMatches = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_USER_HOME_MATCHES(user.id));
            if (response.ok) {
                const data: any[] = await response.json();
                const normalizedData: MatchOverviewDto[] = data.map(m => ({
                    id: m.id || m.Id,
                    tournamentId: m.tournamentId || m.TournamentId,
                    tournamentName: m.tournamentName || m.TournamentName,
                    hubName: m.hubName || m.HubName,
                    scheduledTime: m.scheduledTime || m.ScheduledTime || null,
                    opponentName: m.opponentName || m.OpponentName,
                    opponentAvatarUrl: m.opponentAvatarUrl || m.OpponentAvatarUrl,
                    status: m.status !== undefined ? m.status : m.Status,
                    isRoundLocked: m.isRoundLocked !== undefined ? m.isRoundLocked : m.IsRoundLocked,
                    unreadMessages: m.unreadMessages !== undefined ? m.unreadMessages : m.UnreadMessages
                }));
                // Optionally filter them out completely if the user expects them gone from here too.
                // The user explicitly requested filtering in "Home panel", but keeping them here with locks is better UI.
                setMatches(normalizedData);
            }
        } catch (error) {
            console.error('Error fetching matches:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMatches();
    }, [user?.id]);

    const filteredMatches = matches.filter(m => {
        if (activeTab === 'all') return true;
        if (activeTab === 'pending') return !m.scheduledTime;
        if (activeTab === 'scheduled') return m.scheduledTime && m.status !== 3; // Assuming status 3 is completed
        if (activeTab === 'completed') return m.status === 3;
        return true;
    });

    const pendingCount = matches.filter(m => !m.scheduledTime).length;

    const tabs: PremiumTabItem[] = [
        { value: 'all', label: 'All', icon: 'apps' },
        { value: 'pending', label: 'Pending', icon: 'time', badge: pendingCount > 0 ? pendingCount : undefined },
        { value: 'scheduled', label: 'Scheduled', icon: 'calendar' },
    ];

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title="My Matches"
                showBack={true}
            />

            <View className="px-4 pb-3">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(value) => setActiveTab(value as typeof activeTab)}
                />
            </View>

            <ScrollView
                className="flex-1 px-4"
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMatches} tintColor={COLORS.primary} />}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                <View className="gap-3">
                    {filteredMatches.length > 0 ? (
                        filteredMatches.map((match) => (
                            <MatchScheduleCard
                                key={match.id}
                                matchId={match.id}
                                tournamentId={match.tournamentId}
                                tournamentName={match.tournamentName}
                                roundName={match.hubName}
                                opponentName={match.opponentName}
                                opponentAvatarUrl={match.opponentAvatarUrl}
                                status={!match.scheduledTime ? 'pending_availability' : match.status === 3 ? 'completed' : 'scheduled'}
                                scheduledTime={match.scheduledTime ? new Date(match.scheduledTime).toLocaleString() : undefined}
                                onMatchUpdate={fetchMatches}
                                isRoundLocked={match.isRoundLocked}
                                unreadMessages={match.unreadMessages}
                            />
                        ))
                    ) : (
                        <View className="py-12 items-center justify-center bg-white/[0.02] rounded-3xl border border-white/[0.04]">
                            <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-3">
                                <Ionicons name="game-controller-outline" size={26} color={COLORS.primary} />
                            </View>
                            <Text className="text-white font-black text-sm">No matches found</Text>
                            <Text className="text-slate-500 text-xs mt-1 text-center px-10">
                                Check back later or join a tournament
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
