import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { SearchInput } from '../components/ui/SearchInput';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { HubCard } from '../components/cards/HubCard';

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

export default function HubsScreen() {
    const navigation = useNavigation<HubsScreenNavigationProp>();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState('joined');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Create Hub State
    const [hubName, setHubName] = useState("");
    const [hubDescription, setHubDescription] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const [hubs, setHubs] = useState<Hub[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Pagination State
    const [pageNumber, setPageNumber] = useState(0);
    const [hasMoreHubs, setHasMoreHubs] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const fetchHubs = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        setError(null);
        setPageNumber(0);
        setHasMoreHubs(true);
        try {
            let apiUrl = ENDPOINTS.HUBS;

            if (user?.id) {
                if (activeTab === 'joined') {
                    apiUrl = ENDPOINTS.GET_USER_HUBS(user.id, 0, searchQuery);
                } else if (activeTab === 'discovery') {
                    apiUrl = ENDPOINTS.GET_DISCOVERY_HUBS(user.id, 0, searchQuery);
                }
            }

            console.log(`Fetching hubs (${activeTab}) from:`, apiUrl);

            const response = await authenticatedFetch(apiUrl);

            if (!response.ok) {
                const text = await response.text();
                console.error('API Error Response:', text);
                throw new Error(`Failed to fetch hubs: ${response.status}`);
            }

            const data = await response.json();
            const resultData = data.result || data;
            const hubsList = Array.isArray(resultData) ? resultData : (resultData.items || []);

            if (!Array.isArray(hubsList)) {
                console.error('Invalid data format received:', data);
                throw new Error('Invalid items format received from server');
            }

            setHubs(hubsList);
            setHasMoreHubs(hubsList.length === 10); // Assume page size of 10
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Failed to load hubs. Please check your connection.');
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchHubs();
        }, [activeTab, user?.id])
    );

    const onRefresh = () => {
        setIsRefreshing(true);
        fetchHubs(false);
    };

    const loadMoreHubs = async () => {
        if (!user?.id || isLoadingMore || !hasMoreHubs) return;

        setIsLoadingMore(true);
        const nextPage = pageNumber + 1;

        try {
            let apiUrl = "";
            if (activeTab === 'joined') {
                apiUrl = ENDPOINTS.GET_USER_HUBS(user.id, nextPage, searchQuery);
            } else if (activeTab === 'discovery') {
                apiUrl = ENDPOINTS.GET_DISCOVERY_HUBS(user.id, nextPage, searchQuery);
            } else {
                setHasMoreHubs(false);
                return;
            }

            const response = await authenticatedFetch(apiUrl);
            if (response.ok) {
                const data = await response.json();
                const resultData = data.result || data;
                const hubsList = Array.isArray(resultData) ? resultData : (resultData.items || []);

                if (hubsList.length > 0) {
                    setHubs(prev => [...prev, ...hubsList]);
                    setPageNumber(nextPage);
                    setHasMoreHubs(hubsList.length === 10);
                } else {
                    setHasMoreHubs(false);
                }
            } else {
                setHasMoreHubs(false);
            }
        } catch (error) {
            console.error('Error fetching more hubs:', error);
            setHasMoreHubs(false);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleScroll = (event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const paddingToBottom = 50;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            loadMoreHubs();
        }
    };

    const handleCreateHub = async () => {
        if (!hubName.trim()) {
            setError('Hub name is required');
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const response = await authenticatedFetch(ENDPOINTS.CREATE_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    Name: hubName.trim(),
                    Description: hubDescription.trim() || undefined
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to create hub');
            }

            // Success
            setIsModalOpen(false);
            setHubName("");
            setHubDescription("");
            fetchHubs(); // Refresh list
        } catch (err: any) {
            console.error('Create hub error:', err);
            setError(err.message || 'Failed to create hub');
        } finally {
            setIsCreating(false);
        }
    };

    const handleSearch = () => {
        fetchHubs(true);
    };

    const tabs = [
        { label: 'Joined', value: 'joined', icon: 'checkmark-circle' as const },
        { label: 'Discovery', value: 'discovery', icon: 'compass' as const },
    ];

    const activeTabConfig: Record<string, { color: string; bg: string }> = {
        joined: { color: '#10B981', bg: 'bg-emerald-500/10' },
        discovery: { color: '#818CF8', bg: 'bg-indigo-500/10' },
    };

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
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
                <View className="flex-row gap-1.5">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.value;
                        const tabCfg = activeTabConfig[tab.value];
                        return (
                            <Pressable
                                key={tab.value}
                                onPress={() => setActiveTab(tab.value)}
                                className={cn(
                                    "flex-1 flex-row items-center justify-center py-2.5 rounded-2xl border",
                                    isActive
                                        ? `${tabCfg.bg} border-white/[0.08]`
                                        : "bg-transparent border-white/[0.04]"
                                )}
                            >
                                <Ionicons
                                    name={tab.icon}
                                    size={13}
                                    color={isActive ? tabCfg.color : '#475569'}
                                />
                                <Text className={cn(
                                    "text-[10px] font-bold ml-1 tracking-wide",
                                    isActive ? "text-white" : "text-slate-600"
                                )}>
                                    {tab.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            {/* Content */}
            {loading && !isRefreshing ? (
                <View className="flex-1 items-center justify-center">
                    <View className="w-14 h-14 rounded-2xl bg-indigo-500/10 items-center justify-center mb-4">
                        <ActivityIndicator size="small" color="#818CF8" />
                    </View>
                    <Text className="text-sm font-semibold text-slate-500 tracking-wide">Loading hubs...</Text>
                </View>
            ) : error ? (
                <View className="flex-1 items-center justify-center px-6">
                    <View className="w-16 h-16 rounded-3xl bg-red-500/10 items-center justify-center mb-4">
                        <Ionicons name="alert-circle" size={28} color="#EF4444" />
                    </View>
                    <Text className="text-sm text-red-400 text-center font-semibold mb-1">Something went wrong</Text>
                    <Text className="text-xs text-slate-600 text-center mb-5">{error}</Text>
                    <Pressable
                        onPress={() => fetchHubs()}
                        className="px-5 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                    >
                        <Text className="text-xs font-bold text-indigo-400 tracking-wide">Try Again</Text>
                    </Pressable>
                </View>
            ) : (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ paddingBottom: 24 }}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#818CF8" />
                    }
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                >
                    <View className="px-5">
                        {hubs.length === 0 ? (
                            <View className="items-center py-20">
                                <View className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-4">
                                    <Ionicons name="people-outline" size={28} color="#334155" />
                                </View>
                                <Text className="text-sm font-semibold text-slate-500">
                                    {activeTab === 'joined'
                                        ? "You haven't joined any hubs yet"
                                        : "No hubs found"}
                                </Text>
                                <Text className="text-xs text-slate-600 mt-1">
                                    {activeTab === 'joined'
                                        ? "Discover communities to join"
                                        : "Try a different search"}
                                </Text>
                                {activeTab === 'joined' && (
                                    <Pressable
                                        onPress={() => setActiveTab('discovery')}
                                        className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:opacity-70"
                                    >
                                        <Text className="text-xs font-bold text-indigo-400 tracking-wide">Browse Hubs</Text>
                                    </Pressable>
                                )}
                            </View>
                        ) : (
                            <View className="mt-1">
                                {hubs.map((hub, idx) => (
                                    <View key={`${hub.id}-${idx}`} className="mb-3">
                                        <HubCard
                                            name={hub.name}
                                            description={hub.description}
                                            numberOfUsers={hub.numberOfUsers}
                                            numberOfTournaments={hub.numberOfTournaments}
                                            avatarUrl={hub.avatarUrl || hub.logoUrl}
                                            index={idx}
                                            isJoined={activeTab === 'joined'}
                                            onClick={() => navigation.navigate('HubProfile', { id: hub.id })}
                                        />
                                    </View>
                                ))}
                                {hasMoreHubs && isLoadingMore && (
                                    <View className="py-6 items-center justify-center">
                                        <ActivityIndicator size="small" color="#818CF8" />
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </ScrollView>
            )}

            <Modal
                visible={isModalOpen}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsModalOpen(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    className="flex-1 justify-end bg-black/50"
                >
                    <View className="bg-[#0D1525] p-6 rounded-t-3xl border-t border-white/[0.06]">
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-xl font-black text-white">Create New Hub</Text>
                            <Pressable onPress={() => setIsModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/[0.05] items-center justify-center">
                                <Ionicons name="close" size={18} color="#64748B" />
                            </Pressable>
                        </View>

                        <View className="space-y-4">
                            {error && <Text className="text-red-400 text-sm font-medium">{error}</Text>}
                            <View>
                                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Hub Name</Text>
                                <TextInput
                                    className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm"
                                    placeholder="e.g. Pro Players Guild"
                                    placeholderTextColor="#334155"
                                    value={hubName}
                                    onChangeText={setHubName}
                                />
                            </View>
                            <View>
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
                            <Button
                                onPress={handleCreateHub}
                                className="mt-4"
                                loading={isCreating}
                                disabled={!hubName.trim()}
                            >
                                <Text className="text-white font-bold">Create Hub</Text>
                            </Button>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}
