import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { cn } from '../lib/utils';

interface MatchOverviewDto {
    id: string;
    tournamentId: string;
    tournamentName: string;
    hubName: string;
    scheduledTime: string | null;
    opponentName: string;
    status: number;
    isRoundLocked?: boolean;
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
                    status: m.status !== undefined ? m.status : m.Status,
                    isRoundLocked: m.isRoundLocked !== undefined ? m.isRoundLocked : m.IsRoundLocked
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

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: 'all', label: 'All' },
        { id: 'pending', label: 'Pending' },
        { id: 'scheduled', label: 'Scheduled' },
    ];

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title="My Matches"
                showBack={true}
            />

            <View className="flex-row px-4 mb-4 gap-2">
                {tabs.map(tab => (
                    <Pressable
                        key={tab.id}
                        onPress={() => setActiveTab(tab.id)}
                        className={cn(
                            "px-4 py-2 rounded-xl border",
                            activeTab === tab.id
                                ? "bg-primary/10 border-primary/30"
                                : "bg-white/5 border-white/5"
                        )}
                    >
                        <Text className={cn(
                            "text-xs font-bold uppercase tracking-wider",
                            activeTab === tab.id ? "text-primary" : "text-slate-500"
                        )}>
                            {tab.label}
                        </Text>
                    </Pressable>
                ))}
            </View>

            <ScrollView
                className="flex-1 px-4"
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMatches} tintColor="#10B981" />}
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
                                status={!match.scheduledTime ? 'pending_availability' : match.status === 3 ? 'completed' : 'scheduled'}
                                scheduledTime={match.scheduledTime ? new Date(match.scheduledTime).toLocaleString() : undefined}
                                onMatchUpdate={fetchMatches}
                                isRoundLocked={match.isRoundLocked}
                            />
                        ))
                    ) : (
                        <View className="py-20 items-center justify-center border border-dashed border-white/5 rounded-[40px] bg-white/[0.02]">
                            <Ionicons name="game-controller-outline" size={48} color="#1E293B" />
                            <Text className="text-slate-400 font-bold mt-4 uppercase tracking-widest text-center">No matches found</Text>
                            <Text className="text-slate-500 text-xs mt-2 text-center">Check back later or join a tournament</Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
