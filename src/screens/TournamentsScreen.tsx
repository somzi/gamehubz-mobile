import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { TournamentRegion } from '../types/tournament';
import { TournamentCard } from '../components/cards/TournamentCard';
import { StatCard } from '../components/ui/StatCard';
import { PageHeader } from '../components/layout/PageHeader';
// import { FloatingActionButton } from '../components/layout/FloatingActionButton'; // Removed
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS, authenticatedFetch } from '../lib/api';

type TournamentsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface Tournament {
    id: string;
    name: string;
    description?: string;
    status: 'live' | 'upcoming' | 'completed';
    startDate: string;
    registrationDeadline: string;
    region: number;
    prize: number;
    prizeCurrency: number;
    participantsCount?: number;
}

const PAGE_SIZE = 10;

const TAB_TO_STATUS: Record<string, number> = {
    'open': 0,
    'upcoming': 1,
    'live': 2,
    'completed': 3,
};

export default function TournamentsScreen() {
    const navigation = useNavigation<TournamentsScreenNavigationProp>();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    const [activeTab, setActiveTab] = useState('live');

    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [page, setPage] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isMoreLoading, setIsMoreLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchTournaments = async (pageNum: number, shouldAppend = false) => {
        if (!user?.id) return;

        if (pageNum === 0) setIsLoading(true);
        else setIsMoreLoading(true);

        setError(null);

        try {
            const status = TAB_TO_STATUS[activeTab] ?? 2;
            const url = ENDPOINTS.GET_USER_TOURNAMENTS(user.id, status, pageNum, PAGE_SIZE);

            const response = await authenticatedFetch(url);
            if (!response.ok) {
                const text = await response.text().catch(() => 'No body');
                console.error(`Fetch failed with status ${response.status}: ${text}`);
                throw new Error(`Failed to fetch tournaments (${response.status})`);
            }

            const data = await response.json();
            // Handle various response structures: PascalCase, camelCase, or nested in 'result'
            const resultData = data.result || data;
            const items = resultData.Tournaments ||
                resultData.tournaments ||
                resultData.items ||
                (Array.isArray(resultData) ? resultData : []);

            if (shouldAppend) {
                setTournaments(prev => [...prev, ...items]);
            } else {
                setTournaments(items);
            }

            setHasMore(items.length === PAGE_SIZE);
        } catch (err: any) {
            console.error('Error fetching tournaments:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
            setIsMoreLoading(false);
            setIsRefreshing(false);
        }
    };

    // useEffect removed - useFocusEffect below handles initialization and re-focus fetching

    useFocusEffect(
        useCallback(() => {
            fetchTournaments(0, false);
        }, [activeTab, user?.id])
    );

    const onRefresh = () => {
        setIsRefreshing(true);
        setPage(0);
        fetchTournaments(0, false);
    };

    const loadMore = () => {
        if (!isLoading && !isMoreLoading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchTournaments(nextPage, true);
        }
    };

    const getRegionName = (region?: number) => {
        switch (region) {
            case TournamentRegion.NorthAmerica: return 'North America';
            case TournamentRegion.Europe: return 'Europe';
            case TournamentRegion.Asia: return 'Asia';
            case TournamentRegion.SouthAmerica: return 'South America';
            case TournamentRegion.Africa: return 'Africa';
            case TournamentRegion.Oceania: return 'Oceania';
            case TournamentRegion.Global:
            default: return 'Global';
        }
    };

    const getCurrencySymbol = (currency?: number | string) => {
        if (typeof currency === 'string') {
            const lower = currency.toLowerCase();
            if (lower === 'eur') return '€';
            if (lower === 'usd') return '$';
            if (lower === 'starpass') return 'SP';
            if (lower === 'fcp') return 'FCP';
        }
        switch (currency) {
            case 1: return '€';
            case 2: return '$';
            case 3: return 'SP';
            case 4: return 'FCP';
            default: return '€';
        }
    };

    const getTournamentStatus = (status: number): 'live' | 'upcoming' | 'completed' => {
        switch (status) {
            case 3: return 'live';
            case 4: return 'completed';
            default: return 'upcoming';
        }
    };

    const tabs = [
        { label: 'Live', value: 'live' },
        { label: 'Upcoming', value: 'upcoming' },
        { label: 'Open', value: 'open' },
        { label: 'Completed', value: 'completed' },
    ];

    const handleScroll = (event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const paddingToBottom = 50;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            loadMore();
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <View className="items-center py-20">
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text className="text-muted-foreground mt-4 font-medium">Loading tournaments...</Text>
                </View>
            );
        }

        if (error) {
            return (
                <View className="items-center py-12 px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-destructive mt-4 text-center font-medium">{error}</Text>
                    <Button onPress={() => fetchTournaments(0, false)} size="sm" className="mt-4">
                        Retry
                    </Button>
                </View>
            );
        }

        if (tournaments.length === 0) {
            return (
                <View className="items-center py-12 opacity-50">
                    <Ionicons name="trophy-outline" size={48} color="#71717A" />
                    <Text className="text-muted-foreground mt-4 font-medium">No tournaments found</Text>
                </View>
            );
        }

        return (
            <View className="mt-2">
                {tournaments.map((tournament: any, index: number) => (
                    <View key={tournament.Id || tournament.id || `t-${index}`} className="mb-5">
                        <TournamentCard
                            name={tournament.Name || tournament.name}
                            description={tournament.Description || tournament.description}
                            status={getTournamentStatus(tournament.Status ?? tournament.status)}
                            date={new Date(tournament.StartDate || tournament.startDate).toLocaleDateString()}
                            region={getRegionName(tournament.Region ?? tournament.region)}
                            prizePool={`${getCurrencySymbol(tournament.PrizeCurrency ?? tournament.prizeCurrency)}${tournament.Prize ?? tournament.prize}`}
                            players={new Array(tournament.NumberOfParticipants ?? tournament.numberOfParticipants ?? tournament.participantsCount ?? tournament.tournamentParticipants?.length ?? 0).fill({})}
                            onClick={() => {
                                const tId = tournament.Id || tournament.id || tournament.tournamentId;
                                navigation.navigate('TournamentDetails', { id: tId });
                            }}
                            index={index}
                            hubName={tournament.HubName || tournament.hubName}
                            hubAvatarUrl={tournament.HubAvatarUrl || tournament.hubAvatarUrl}
                        />
                    </View>
                ))}

                {hasMore && isMoreLoading && (
                    <View className="py-8 items-center justify-center">
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            <PageHeader
                title="Tournaments"
                rightElement={<Ionicons name="trophy" size={24} color="#10B981" />}
            />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 20 }}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#10B981" />
                }
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                <View className="px-4 py-4 gap-4">
                    <Tabs
                        tabs={tabs}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    />

                    {renderContent()}
                </View>
            </ScrollView>

        </SafeAreaView>
    );
}
