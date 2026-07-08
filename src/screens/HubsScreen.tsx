import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRefetchOnFocusIfStale } from '../hooks/useRefetchOnFocusIfStale';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { SearchInput } from '../components/ui/SearchInput';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgesContext';
import { HubCard } from '../components/cards/HubCard';
import { StatusModal } from '../components/modals/StatusModal';
import { Toggle } from '../components/ui/Toggle';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { EmptyState } from '../components/ui/EmptyState';
import { COLORS } from '../lib/theme';

import { API_BASE_URL, ENDPOINTS, authenticatedFetch } from '../lib/api';

type HubsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface Hub {
    id: string;
    name: string;
    description: string;
    userId: string;
    userDisplayName: string | null;
    userHubs?: any[];
    tournaments?: any[];
    numberOfUsers: number;
    numberOfTournaments: number;
    avatarUrl?: string;
    logoUrl?: string;
}

const PAGE_SIZE = 10;
const EMPTY_HUBS: Hub[] = [];

interface HubsPage {
    items: Hub[];
    nextPage: number | undefined;
}

export default function HubsScreen() {
    const navigation = useNavigation<HubsScreenNavigationProp>();
    const { user } = useAuth();
    const { hubApprovals } = useBadges();
    const queryClient = useQueryClient();

    // Immediate value drives the input; debounced value drives the query key.
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    useEffect(() => {
        if (searchQuery === debouncedSearch) return;
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery, debouncedSearch]);

    const [activeTab, setActiveTab] = useState('joined');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Create Hub State
    const [hubName, setHubName] = useState("");
    const [hubDescription, setHubDescription] = useState("");
    const [hubIsPublic, setHubIsPublic] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    // Only for the Create Hub modal — fetch errors surface via hubsQuery.error.
    const [createHubError, setCreateHubError] = useState<string | null>(null);

    // Error modal state (for backend business-rule errors like 'already owns a hub')
    const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

    // useInfiniteQuery: pages are keyed by (activeTab, debouncedSearch, userId) so
    // changing any of those isolates a separate cache entry — switching tabs, typing
    // a new search, or logging in as a different user gets its own paginated stream
    // without polluting the previous one. Cold-start persistence flows through the
    // PersistQueryClientProvider in App.tsx, so a killed-and-reopened app paints the
    // last-seen page instantly.
    const hubsQuery = useInfiniteQuery<HubsPage>({
        queryKey: ['hubs', activeTab, debouncedSearch, user?.id],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const page = pageParam as number;
            const uid = user!.id;
            const url = activeTab === 'joined'
                ? ENDPOINTS.GET_USER_HUBS(uid, page, debouncedSearch)
                : ENDPOINTS.GET_DISCOVERY_HUBS(uid, page, debouncedSearch);
            const response = await authenticatedFetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch hubs: ${response.status}`);
            }
            const data = await response.json();
            const resultData = data.result || data;
            const list: Hub[] = Array.isArray(resultData) ? resultData : (resultData.items || []);
            if (!Array.isArray(list)) throw new Error('Invalid items format received from server');
            return {
                items: list,
                nextPage: list.length === PAGE_SIZE ? page + 1 : undefined,
            };
        },
        getNextPageParam: (lastPage) => lastPage.nextPage,
        enabled: !!user?.id,
        staleTime: 30_000,
        refetchOnMount: true,
        // Keep showing the previous list while a new key (search change / tab flip)
        // is fetching, instead of blanking to the full-screen "Loading hubs..." view
        // between every debounced keystroke. Prevents the flash-flicker regression.
        placeholderData: keepPreviousData,
    });

    const hubs = useMemo(
        () => hubsQuery.data?.pages.flatMap((p) => p.items) ?? EMPTY_HUBS,
        [hubsQuery.data],
    );

    // Bottom tabs keep this screen mounted; useRefetchOnFocusIfStale bridges the
    // gap without hammering the API on every focus.
    useRefetchOnFocusIfStale(
        hubsQuery.refetch,
        hubsQuery.dataUpdatedAt,
        { enabled: !!user?.id },
    );

    const onRefresh = useCallback(() => {
        // Invalidate every ['hubs', ...] entry so both joined and discovery caches
        // refetch cleanly. Cheap on device because only the currently-mounted key
        // has active observers and will actually fire.
        queryClient.invalidateQueries({ queryKey: ['hubs'] });
    }, [queryClient]);

    const loadMoreHubs = useCallback(() => {
        if (hubsQuery.hasNextPage && !hubsQuery.isFetchingNextPage) {
            hubsQuery.fetchNextPage();
        }
    }, [hubsQuery]);

    const renderHubItem = useCallback(({ item, index }: { item: Hub; index: number }) => (
        <View className="mb-3">
            <HubCard
                name={item.name}
                description={item.description}
                numberOfUsers={item.numberOfUsers}
                numberOfTournaments={item.numberOfTournaments}
                avatarUrl={item.avatarUrl || item.logoUrl}
                index={index}
                isJoined={activeTab === 'joined'}
                isVerified={(item as any).isVerified || (item as any).IsVerified}
                badgeCount={hubApprovals(item.id)}
                onClick={() => navigation.navigate('HubProfile', { id: item.id })}
            />
        </View>
    ), [activeTab, hubApprovals, navigation]);

    const keyExtractor = useCallback((item: Hub, index: number) => `${item.id}-${index}`, []);

    const handleCreateHub = async () => {
        if (!hubName.trim()) {
            setCreateHubError('Hub name is required');
            return;
        }

        setIsCreating(true);
        setCreateHubError(null);

        try {
            const response = await authenticatedFetch(ENDPOINTS.CREATE_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    Name: hubName.trim(),
                    Description: hubDescription.trim() || undefined,
                    IsPublic: hubIsPublic
                })
            });

            if (!response.ok) {
                const text = await response.text();

                // Try to extract a meaningful message from the response
                let errorMessage = 'Failed to create hub';
                try {
                    const parsed = JSON.parse(text);
                    if (typeof parsed === 'string') {
                        errorMessage = parsed;
                    } else if (parsed?.message) {
                        errorMessage = parsed.message;
                    } else if (parsed?.Message) {
                        errorMessage = parsed.Message;
                    } else if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
                        errorMessage = parsed.messages[0];
                    } else if (Array.isArray(parsed?.Messages) && parsed.Messages.length > 0) {
                        errorMessage = parsed.Messages[0];
                    } else if (typeof parsed?.title === 'string') {
                        errorMessage = parsed.title;
                    }
                } catch {
                    // Response wasn't JSON, use raw text
                    if (text) errorMessage = text;
                }

                // Check if this is the "already owns a hub" business rule
                const isAlreadyOwns = errorMessage.toLowerCase().includes('already own');

                if (isAlreadyOwns) {
                    setIsModalOpen(false);
                    setErrorModal({
                        title: 'Hub Limit Reached',
                        message: 'You already own a hub. Each player can only manage one hub at a time.',
                    });
                } else {
                    setCreateHubError(errorMessage);
                }
                return;
            }

            // Success
            setIsModalOpen(false);
            setHubName("");
            setHubDescription("");
            setHubIsPublic(true);
            queryClient.invalidateQueries({ queryKey: ['hubs'] });
        } catch (err: any) {
            console.error('Create hub error:', err);
            setCreateHubError(err.message || 'Failed to create hub');
        } finally {
            setIsCreating(false);
        }
    };

    // SearchInput's onSubmit fires when the user hits enter — the query key already
    // updates via debounced state, so this is just here to short-circuit the wait
    // for an eager user who wants results NOW.
    const handleSearch = () => {
        setDebouncedSearch(searchQuery);
    };

    const tabs: PremiumTabItem[] = [
        { label: 'Joined', value: 'joined', icon: 'checkmark-circle' },
        { label: 'Discovery', value: 'discovery', icon: 'compass' },
    ];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* Premium header */}
            <View className="px-6 pt-4 pb-2">
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="text-2xl font-black text-white tracking-tight">Hubs</Text>
                        <Text className="text-xs text-slate-600 font-medium mt-0.5">Your Communities</Text>
                    </View>
                    <Pressable
                        onPress={() => setIsModalOpen(true)}
                        className="flex-row items-center px-4 py-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                    >
                        <Ionicons name="add" size={16} color="#818CF8" />
                        <Text className="text-xs font-bold text-indigo-400 ml-1.5">Create</Text>
                    </Pressable>
                </View>
            </View>

            {/* Search */}
            <View className="px-5 pb-2">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onSubmit={handleSearch}
                    placeholder="Search hubs..."
                />
            </View>

            {/* Tabs */}
            <View className="px-5 pb-3 pt-1">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />
            </View>

            {/* Content */}
            {hubsQuery.isPending && hubs.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <View className="w-14 h-14 rounded-2xl bg-indigo-500/10 items-center justify-center mb-4">
                        <ActivityIndicator size="small" color="#818CF8" />
                    </View>
                    <Text className="text-sm font-semibold text-slate-500 tracking-wide">Loading hubs...</Text>
                </View>
            ) : hubsQuery.isError && hubs.length === 0 ? (
                <View className="flex-1 items-center justify-center px-6">
                    <View className="w-16 h-16 rounded-3xl bg-red-500/10 items-center justify-center mb-4">
                        <Ionicons name="alert-circle" size={28} color="#EF4444" />
                    </View>
                    <Text className="text-sm text-red-400 text-center font-semibold mb-1">Something went wrong</Text>
                    <Text className="text-xs text-slate-600 text-center mb-5">Failed to load hubs. Please check your connection.</Text>
                    <Pressable
                        onPress={() => hubsQuery.refetch()}
                        className="px-5 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                    >
                        <Text className="text-xs font-bold text-indigo-400 tracking-wide">Try Again</Text>
                    </Pressable>
                </View>
            ) : (
                // FlatList virtualizes rows so a user in dozens of hubs isn't paying the render
                // cost for every card off-screen. Pagination hangs off onEndReached via the
                // useInfiniteQuery cursor rather than manual page-number bookkeeping.
                <FlatList
                    data={hubs}
                    keyExtractor={keyExtractor}
                    renderItem={renderHubItem}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                    refreshControl={
                        // isRefetching (not isFetching) so a background paginate doesn't
                        // spin the pull-to-refresh indicator — that would flicker on scroll.
                        <RefreshControl refreshing={hubsQuery.isRefetching} onRefresh={onRefresh} tintColor="#818CF8" />
                    }
                    onEndReached={loadMoreHubs}
                    onEndReachedThreshold={0.5}
                    removeClippedSubviews
                    ListEmptyComponent={
                        <EmptyState
                            variant="plain"
                            icon="people-outline"
                            color={COLORS.info}
                            title={activeTab === 'joined'
                                ? "You haven't joined any hubs yet"
                                : "No hubs found"}
                            description={activeTab === 'joined'
                                ? "Discover communities to join"
                                : "Try a different search"}
                            action={activeTab === 'joined' ? (
                                <Pressable
                                    onPress={() => setActiveTab('discovery')}
                                    className="px-5 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                                >
                                    <Text className="text-xs font-bold text-indigo-400 tracking-wide">Browse Hubs</Text>
                                </Pressable>
                            ) : undefined}
                        />
                    }
                    ListFooterComponent={
                        hubsQuery.isFetchingNextPage ? (
                            <View className="py-6 items-center justify-center">
                                <ActivityIndicator size="small" color="#818CF8" />
                            </View>
                        ) : null
                    }
                />
            )}

            <Modal
                visible={isModalOpen}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsModalOpen(false)}
            >
                <KeyboardAvoidingView
                    behavior="padding"
                    className="flex-1"
                >
                    <Pressable
                        className="flex-1 bg-black/60 justify-center items-center px-5"
                        onPress={() => setIsModalOpen(false)}
                    >
                        <Pressable
                            className="bg-[#0D1525] rounded-3xl p-6 w-full max-w-md border border-white/[0.06]"
                            onPress={(e) => e.stopPropagation()}
                        >
                            <View className="flex-row justify-between items-center mb-5">
                                <Text className="text-xl font-black text-white">Create New Hub</Text>
                                <Pressable onPress={() => setIsModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/[0.05] items-center justify-center">
                                    <Ionicons name="close" size={18} color="#64748B" />
                                </Pressable>
                            </View>

                            {createHubError && <Text className="text-red-400 text-sm font-medium mb-3">{createHubError}</Text>}

                            <View className="mb-4">
                                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Hub Name</Text>
                                <TextInput
                                    className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm"
                                    placeholder="e.g. Pro Players Guild"
                                    placeholderTextColor="#334155"
                                    value={hubName}
                                    onChangeText={setHubName}
                                />
                            </View>

                            <View className="mb-5">
                                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Description</Text>
                                <TextInput
                                    className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm h-24"
                                    placeholder="Describe your community..."
                                    placeholderTextColor="#334155"
                                    multiline
                                    value={hubDescription}
                                    onChangeText={setHubDescription}
                                />
                            </View>

                            <View className="h-[1px] bg-white/5 mb-5" />

                            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Privacy</Text>
                            <View className="bg-white/[0.03] p-4 rounded-2xl border border-white/[0.06]">
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-row items-center gap-3 flex-1">
                                        <View className={cn(
                                            "w-10 h-10 rounded-2xl items-center justify-center",
                                            hubIsPublic ? "bg-emerald-500/10" : "bg-amber-500/10"
                                        )}>
                                            <Ionicons
                                                name={hubIsPublic ? "globe-outline" : "lock-closed-outline"}
                                                size={18}
                                                color={hubIsPublic ? "#10B981" : "#F59E0B"}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white font-bold text-sm">
                                                {hubIsPublic ? "Public Hub" : "Private Hub"}
                                            </Text>
                                            <Text className="text-slate-500 text-xs mt-0.5">
                                                {hubIsPublic
                                                    ? "Anyone can follow this hub"
                                                    : "Members need approval to join"}
                                            </Text>
                                        </View>
                                    </View>
                                    <Toggle
                                        value={hubIsPublic}
                                        onValueChange={setHubIsPublic}
                                        activeColor="#10B981"
                                        inactiveColor="#F59E0B"
                                    />
                                </View>
                            </View>

                            <Button
                                onPress={handleCreateHub}
                                className="mt-6"
                                loading={isCreating}
                                disabled={!hubName.trim()}
                            >
                                <Text className="text-white font-bold">Create Hub</Text>
                            </Button>
                        </Pressable>
                    </Pressable>
                </KeyboardAvoidingView>
            </Modal>

            {/* Business-rule error modal (e.g. already owns a hub) */}
            <StatusModal
                visible={!!errorModal}
                onClose={() => setErrorModal(null)}
                type="error"
                title={errorModal?.title ?? ''}
                message={errorModal?.message ?? ''}
                buttonText="Got It"
            />
        </SafeAreaView>
    );
}
