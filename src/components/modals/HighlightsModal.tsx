import React, { useState, useEffect } from 'react';
import { View, Text, Modal, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedCard } from '../cards/FeedCard';
import { DashboardActivityDto } from '../../types/dashboard';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';
import { Button } from '../ui/Button';

interface HighlightsModalProps {
    visible: boolean;
    onClose: () => void;
}

export function HighlightsModal({ visible, onClose }: HighlightsModalProps) {
    const [paginatedActivities, setPaginatedActivities] = useState<DashboardActivityDto[]>([]);
    const [page, setPage] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        if (visible) {
            setPaginatedActivities([]);
            setPage(0);
            setHasMore(true);
            fetchActivities(0);
        }
    }, [visible]);

    const fetchActivities = async (pageNumber: number) => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_ALL_HUB_ACTIVITY(pageNumber));
            if (response.ok) {
                const data = await response.json();
                const itemsList: any[] = data.items || data.Items || [];
                
                const normalizedData: DashboardActivityDto[] = itemsList.map(a => ({
                    hubName: a.hubName || a.HubName,
                    message: a.message || a.Message,
                    tournamentName: a.tournamentName || a.TournamentName,
                    timeAgo: a.timeAgo || a.TimeAgo,
                    createdOn: a.createdOn || a.CreatedOn,
                    type: a.type || a.Type,
                    hubAvatar: a.hubAvatar || a.HubAvatar,
                    hubAvatarUrl: a.hubAvatarUrl || a.HubAvatarUrl
                }));

                if (pageNumber === 0) {
                    setPaginatedActivities(normalizedData);
                } else {
                    setPaginatedActivities(prev => [...prev, ...normalizedData]);
                }

                // If we get 10 items, assume there might be more
                if (normalizedData.length === 10) {
                    setHasMore(true);
                } else {
                    setHasMore(false);
                }
            }
        } catch (error) {
            console.error('Error fetching all hub activities:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadMore = () => {
        if (!isLoading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchActivities(nextPage);
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/50">
                <View className="flex-1 bg-background mt-20 rounded-t-3xl border-t border-border/50">
                    {/* Header */}
                    <View className="flex-row items-center justify-between p-6 border-b border-border/30">
                        <View className="flex-row items-center gap-3">
                            <View className="p-2 bg-primary/10 rounded-xl border border-primary/20">
                                <Ionicons name="planet-outline" size={24} color="#10B981" />
                            </View>
                            <View>
                                <Text className="text-xl font-bold text-foreground">All Highlights</Text>
                                <Text className="text-xs text-muted-foreground mt-0.5">
                                    {paginatedActivities.length} {paginatedActivities.length === 1 ? 'activity' : 'activities'}
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={onClose}
                            className="w-10 h-10 rounded-full bg-secondary items-center justify-center"
                        >
                            <Ionicons name="close" size={24} color="#94A3B8" />
                        </Pressable>
                    </View>

                    {/* Content */}
                    {/* Content */}
                    <FlatList<DashboardActivityDto>
                        data={paginatedActivities}
                        keyExtractor={(_, index) => index.toString()}
                        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <View className="mb-3">
                                <FeedCard
                                    hubName={item.hubName}
                                    hubAvatar={item.hubAvatarUrl || item.hubAvatar}
                                    message={item.message}
                                    tournamentName={item.tournamentName}
                                    timestamp={item.timeAgo}
                                    onClick={() => { }}
                                />
                            </View>
                        )}
                        onEndReached={loadMore}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={() => {
                            if (isLoading && page > 0) {
                                return (
                                    <View className="py-4 items-center">
                                        <ActivityIndicator size="small" color="#10B981" />
                                    </View>
                                );
                            }
                            if (!hasMore && paginatedActivities.length > 0) {
                                return (
                                    <Text className="text-center text-muted-foreground py-4 text-xs font-medium">
                                        No more activities to load
                                    </Text>
                                );
                            }
                            return null;
                        }}
                        ListEmptyComponent={() => {
                            if (isLoading && page === 0) {
                                return (
                                    <View className="flex-1 items-center justify-center py-20">
                                        <ActivityIndicator size="large" color="#10B981" />
                                    </View>
                                );
                            }
                            return (
                                <View className="flex-1 items-center justify-center py-20">
                                    <View className="bg-muted/10 p-6 rounded-full mb-4">
                                        <Ionicons name="planet-outline" size={48} color="#71717A" />
                                    </View>
                                    <Text className="text-foreground font-bold text-lg">No Highlights Yet</Text>
                                    <Text className="text-muted-foreground text-sm mt-2 text-center px-8">
                                        Hub activities and tournament updates will appear here
                                    </Text>
                                </View>
                            );
                        }}
                    />
                </View>
            </View>
        </Modal>
    );
}
