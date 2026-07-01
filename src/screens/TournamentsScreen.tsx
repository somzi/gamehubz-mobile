import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { TournamentRegion } from '../types/tournament';
import { TournamentCard } from '../components/cards/TournamentCard';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS, authenticatedFetch } from '../lib/api';
import { useFocusRefetch } from '../hooks/useFocusRefetch';
import { cn, formatDateSafe, getCurrencySymbol } from '../lib/utils';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';

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

    // Loads page 0 on focus / tab change, but skips it when the same tab was loaded within
    // 30s, so flipping between bottom tabs doesn't re-pull an unchanged list every time.
    // Switching the status tab changes the key and always reloads; pull-to-refresh bypasses it.
    useFocusRefetch(() => fetchTournaments(0, false), `${activeTab}:${user?.id ?? ''}`);

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

    const getTournamentStatus = (status: number): 'live' | 'upcoming' | 'completed' => {
        switch (status) {
            case 3: return 'live';
            case 4: return 'completed';
            default: return 'upcoming';
        }
    };


    const tabs: PremiumTabItem[] = [
        { label: 'Live', value: 'live', icon: 'radio' },
        { label: 'Upcoming', value: 'upcoming', icon: 'time' },
        { label: 'Open', value: 'open', icon: 'add-circle' },
        { label: 'Completed', value: 'completed', icon: 'checkmark-circle' },
    ];

    const renderTournament = useCallback(({ item: tournament, index }: { item: any; index: number }) => (
        <View className="mb-3">
            <TournamentCard
                name={tournament.Name || tournament.name}
                description={tournament.Description || tournament.description}
                status={getTournamentStatus(tournament.Status ?? tournament.status)}
                date={formatDateSafe(tournament.StartDate || tournament.startDate)}
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
    ), [navigation]);

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            {/* Premium header */}
            <View className="px-6 pt-4 pb-2">
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="text-2xl font-black text-white tracking-tight">Tournaments</Text>
                        <Text className="text-xs text-slate-600 font-medium mt-0.5">Compete & Conquer</Text>
                    </View>
                    <View className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center">
                        <Ionicons name="trophy" size={18} color="#818CF8" />
                    </View>
                </View>
            </View>

            {/* Tabs - full width */}
            <View className="px-5 pb-3 pt-2">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />
            </View>

            {isLoading && tournaments.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <View className="w-14 h-14 rounded-2xl bg-indigo-500/10 items-center justify-center mb-4">
                        <ActivityIndicator size="small" color="#818CF8" />
                    </View>
                    <Text className="text-sm font-semibold text-slate-500 tracking-wide">Loading tournaments...</Text>
                </View>
            ) : error && tournaments.length === 0 ? (
                <View className="flex-1 items-center justify-center px-6">
                    <View className="w-16 h-16 rounded-3xl bg-red-500/10 items-center justify-center mb-4">
                        <Ionicons name="alert-circle" size={28} color="#EF4444" />
                    </View>
                    <Text className="text-sm text-red-400 text-center font-semibold mb-1">Something went wrong</Text>
                    <Text className="text-xs text-slate-600 text-center mb-5">{error}</Text>
                    <Pressable
                        onPress={() => fetchTournaments(0, false)}
                        className="px-5 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                    >
                        <Text className="text-xs font-bold text-indigo-400 tracking-wide">Try Again</Text>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={tournaments}
                    keyExtractor={(item: any, index) => `${item.Id || item.id || 'tournament'}-${index}`}
                    renderItem={renderTournament}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#818CF8" />
                    }
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    ListEmptyComponent={
                        <View className="items-center py-20">
                            <View className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-4">
                                <Ionicons name="trophy-outline" size={28} color="#334155" />
                            </View>
                            <Text className="text-sm font-semibold text-slate-500">No tournaments found</Text>
                            <Text className="text-xs text-slate-600 mt-1">Check back later for new events</Text>
                        </View>
                    }
                    ListFooterComponent={
                        isMoreLoading ? (
                            <View className="py-6 items-center justify-center">
                                <ActivityIndicator size="small" color="#818CF8" />
                            </View>
                        ) : null
                    }
                    removeClippedSubviews
                />
            )}
        </SafeAreaView>
    );
}
