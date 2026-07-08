import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRefetchOnFocusIfStale } from '../hooks/useRefetchOnFocusIfStale';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { TournamentRegion } from '../types/tournament';
import { TournamentCard } from '../components/cards/TournamentCard';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS, authenticatedFetch } from '../lib/api';
import { formatDateSafe, getCurrencySymbol } from '../lib/utils';
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

interface TournamentsPage {
    items: any[];
    nextPage: number | undefined;
}

const PAGE_SIZE = 10;

const TAB_TO_STATUS: Record<string, number> = {
    'open': 0,
    'upcoming': 1,
    'live': 2,
    'completed': 3,
};

const EMPTY_TOURNAMENTS: any[] = [];

export default function TournamentsScreen() {
    const navigation = useNavigation<TournamentsScreenNavigationProp>();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();

    const [activeTab, setActiveTab] = useState('live');

    // useInfiniteQuery: pages are keyed by (activeTab, userId) so switching tabs
    // isolates a separate cache entry — the previous tab's page cursor never
    // leaks into the new one (which used to skip pages when the manual `page`
    // state carried over). Cold-start persistence flows through the
    // PersistQueryClientProvider in App.tsx.
    const tournamentsQuery = useInfiniteQuery<TournamentsPage>({
        queryKey: ['tournaments', activeTab, user?.id],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const page = pageParam as number;
            const status = TAB_TO_STATUS[activeTab] ?? 2;
            const url = ENDPOINTS.GET_USER_TOURNAMENTS(user!.id, status, page, PAGE_SIZE);
            const response = await authenticatedFetch(url);
            if (!response.ok) {
                const text = await response.text().catch(() => 'No body');
                throw new Error(`Failed to fetch tournaments (${response.status}): ${text}`);
            }
            const data = await response.json();
            // Backend response has been through several revisions — this accepts each
            // shape rather than requiring the client to be updated in lockstep.
            const resultData = data.result || data;
            const items = resultData.Tournaments ||
                resultData.tournaments ||
                resultData.items ||
                (Array.isArray(resultData) ? resultData : []);
            return {
                items,
                nextPage: items.length === PAGE_SIZE ? page + 1 : undefined,
            };
        },
        getNextPageParam: (lastPage) => lastPage.nextPage,
        enabled: !!user?.id,
        staleTime: 30_000,
        refetchOnMount: true,
        // Keep showing the previous list while a new key (tab flip) is fetching,
        // instead of blanking to the full-screen "Loading tournaments..." view.
        placeholderData: keepPreviousData,
    });

    const tournaments = useMemo(
        () => tournamentsQuery.data?.pages.flatMap((p) => p.items) ?? EMPTY_TOURNAMENTS,
        [tournamentsQuery.data],
    );

    // Bottom tabs keep the screen mounted; useRefetchOnFocusIfStale refetches only
    // when the first-page snapshot is >30s stale.
    useRefetchOnFocusIfStale(
        tournamentsQuery.refetch,
        tournamentsQuery.dataUpdatedAt,
        { enabled: !!user?.id },
    );

    const onRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    }, [queryClient]);

    const loadMore = useCallback(() => {
        if (tournamentsQuery.hasNextPage && !tournamentsQuery.isFetchingNextPage) {
            tournamentsQuery.fetchNextPage();
        }
    }, [tournamentsQuery]);

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

    // Stable so FlatList's PureComponent doesn't invalidate on unrelated parent
    // re-renders (tab flip, badge push).
    const keyExtractor = useCallback(
        (item: any, index: number) => `${item.Id || item.id || 'tournament'}-${index}`,
        [],
    );

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
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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

            {tournamentsQuery.isPending && tournaments.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <View className="w-14 h-14 rounded-2xl bg-indigo-500/10 items-center justify-center mb-4">
                        <ActivityIndicator size="small" color="#818CF8" />
                    </View>
                    <Text className="text-sm font-semibold text-slate-500 tracking-wide">Loading tournaments...</Text>
                </View>
            ) : tournamentsQuery.isError && tournaments.length === 0 ? (
                <View className="flex-1 items-center justify-center px-6">
                    <View className="w-16 h-16 rounded-3xl bg-red-500/10 items-center justify-center mb-4">
                        <Ionicons name="alert-circle" size={28} color="#EF4444" />
                    </View>
                    <Text className="text-sm text-red-400 text-center font-semibold mb-1">Something went wrong</Text>
                    <Text className="text-xs text-slate-600 text-center mb-5">
                        {(tournamentsQuery.error as Error)?.message ?? 'An unexpected error occurred'}
                    </Text>
                    <Pressable
                        onPress={() => tournamentsQuery.refetch()}
                        className="px-5 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                    >
                        <Text className="text-xs font-bold text-indigo-400 tracking-wide">Try Again</Text>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={tournaments}
                    keyExtractor={keyExtractor}
                    renderItem={renderTournament}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                    refreshControl={
                        // isRefetching (not isFetching) so a background paginate doesn't
                        // spin the pull-to-refresh indicator on scroll.
                        <RefreshControl refreshing={tournamentsQuery.isRefetching} onRefresh={onRefresh} tintColor="#818CF8" />
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
                        tournamentsQuery.isFetchingNextPage ? (
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
