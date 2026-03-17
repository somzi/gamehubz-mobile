import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { SearchInput } from '../components/ui/SearchInput';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../lib/utils';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
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
                    apiUrl = ENDPOINTS.GET_USER_HUBS(user.id, 0);
                } else if (activeTab === 'discovery') {
                    apiUrl = ENDPOINTS.GET_DISCOVERY_HUBS(user.id, 0);
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
                apiUrl = ENDPOINTS.GET_USER_HUBS(user.id, nextPage);
            } else if (activeTab === 'discovery') {
                apiUrl = ENDPOINTS.GET_DISCOVERY_HUBS(user.id, nextPage);
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

    const filteredHubs = hubs.filter((hub) =>
        hub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (hub.description && hub.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const tabs = [
        { label: 'Joined', value: 'joined' },
        { label: 'Discovery', value: 'discovery' },
    ];

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            <PageHeader
                title="Hubs"
                rightElement={
                    <Button onPress={() => setIsModalOpen(true)} size="sm" className="h-9 px-4">
                        <View className="flex-row items-center gap-1">
                            <Ionicons name="add" size={18} color="#FFFFFF" />
                            <Text className="text-white font-bold">Create</Text>
                        </View>
                    </Button>
                }
            />
            <View className="px-4 py-4 flex-1">
                <View className="space-y-4 mb-4">
                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search hubs..."
                    />

                    <Tabs
                        tabs={tabs}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    />
                </View>

                {loading && !isRefreshing ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#8B5CF6" />
                    </View>
                ) : error ? (
                    <View className="flex-1 items-center justify-center">
                        <Text className="text-destructive mb-4">{error}</Text>
                        <Button onPress={() => fetchHubs()} size="sm">Retry</Button>
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ paddingBottom: 20 }}
                        refreshControl={
                            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
                        }
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                    >
                        <View className="mt-2">
                            {filteredHubs.length === 0 ? (
                                <View className="items-center py-12 opacity-50">
                                    <Ionicons name="people-outline" size={48} color="#71717A" />
                                    <Text className="text-muted-foreground mt-4 font-medium text-center">
                                        {activeTab === 'joined'
                                            ? "You haven't joined any hubs yet"
                                            : "No hubs found"}
                                    </Text>
                                    {activeTab === 'joined' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-4"
                                            onPress={() => setActiveTab('discovery')}
                                        >
                                            Browse Hubs
                                        </Button>
                                    )}
                                </View>
                            ) : (
                                <>
                                    {filteredHubs.map((hub, idx) => (
                                        <View key={`${hub.id}-${idx}`} className="mb-5">
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
                                        <View className="py-4 items-center justify-center">
                                            <ActivityIndicator size="small" color="#8B5CF6" />
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </ScrollView>
                )}
            </View>

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
                    <View className="bg-card p-6 rounded-t-3xl border-t border-border space-y-4 pb-10">
                        <View className="flex-row justify-between items-center mb-2">
                            <Text className="text-xl font-bold text-foreground">Create New Hub</Text>
                            <Pressable onPress={() => setIsModalOpen(false)}>
                                <Ionicons name="close" size={24} color="#71717A" />
                            </Pressable>
                        </View>

                        <View className="space-y-4">
                            {error && <Text className="text-destructive text-sm">{error}</Text>}
                            <View>
                                <Text className="text-sm font-medium text-muted-foreground mb-1">Hub Name</Text>
                                <TextInput
                                    className="bg-secondary p-3 rounded-lg text-foreground border border-border/30"
                                    placeholder="e.g. Pro Players Guild"
                                    placeholderTextColor="#71717A"
                                    value={hubName}
                                    onChangeText={setHubName}
                                />
                            </View>
                            <View>
                                <Text className="text-sm font-medium text-muted-foreground mb-1">Description</Text>
                                <TextInput
                                    className="bg-secondary p-3 rounded-lg text-foreground border border-border/30 h-20"
                                    placeholder="Describe your community..."
                                    placeholderTextColor="#71717A"
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
