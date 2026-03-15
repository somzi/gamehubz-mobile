import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { TournamentCard } from '../components/cards/TournamentCard';

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from '../components/ui/Tabs';
import { cn } from '../lib/utils';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { SocialLinks } from '../components/profile/SocialLinks';
import { SocialType } from '../types/auth';
import { getSocialUrl } from '../lib/social';

type HubProfileRouteProp = RouteProp<RootStackParamList, 'HubProfile'>;

export default function HubProfileScreen() {
    const route = useRoute<HubProfileRouteProp>();
    const navigation = useNavigation<any>();
    const { id } = route.params;

    const { user } = useAuth();
    const [isFollowing, setIsFollowing] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [activeTab, setActiveTab] = useState('live');
    const [hubData, setHubData] = useState<any>(null);
    const [tournaments, setTournaments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isListLoading, setIsListLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    useEffect(() => {
        fetchHubDetails();
    }, [id]);

    useEffect(() => {
        // Reset list when tab changes
        setTournaments([]);
        setPage(0);
        setHasMore(true);
        fetchTournaments(0, activeTab);
    }, [activeTab]);

    const fetchHubDetails = async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB(id));
            if (!response.ok) {
                throw new Error('Failed to fetch hub details');
            }
            const data = await response.json();
            setHubData(data.result || data);
            setIsFollowing(data.result?.isUserFollowHub || data.isUserFollowHub || false);
            setIsOwner(data.result?.isUserOwner || data.isUserOwner || false);
            setError(null);
        } catch (err: any) {
            console.error('Error fetching hub details:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTournaments = async (currentPage: number, tab: string) => {
        if (!hasMore && currentPage > 0) return;

        try {
            setIsListLoading(true);
            let status = 1; // Default to Upcoming (1)

            if (tab === 'live') status = 3; // InProgress
            else if (tab === 'past') status = 4; // Completed
            else if (tab === 'upcoming') status = 1; // RegistrationOpen (and others potentially handled by backend)

            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_TOURNAMENTS(id, status, currentPage));

            if (response.ok) {
                const data = await response.json();
                const newTournaments = data.tournaments || [];
                const totalCount = data.count || 0;

                if (currentPage === 0) {
                    setTournaments(newTournaments);
                } else {
                    setTournaments(prev => [...prev, ...newTournaments]);
                }

                setHasMore(newTournaments.length === 10); // Assuming pageSize is 10
            }
        } catch (err) {
            console.error('Error fetching tournaments:', err);
        } finally {
            setIsListLoading(false);
        }
    };

    const loadMoreTournaments = () => {
        if (!isListLoading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchTournaments(nextPage, activeTab);
        }
    };

    const handleFollowToggle = async () => {
        if (!user?.id) return;

        try {
            if (isFollowing) {
                // Unfollow - send userId and hubId as query parameters
                const response = await authenticatedFetch(ENDPOINTS.UNFOLLOW_HUB(user.id, id), {
                    method: 'DELETE',
                });

                if (response.ok) {
                    setIsFollowing(false);
                }
            } else {
                // Follow
                const response = await authenticatedFetch(ENDPOINTS.FOLLOW_HUB, {
                    method: 'POST',
                    body: JSON.stringify({
                        id: null,
                        userId: user.id,
                        hubId: id,
                    }),
                });

                if (response.ok) {
                    setIsFollowing(true);
                }
            }
        } catch (error) {
            console.error('Error toggling follow status:', error);
        }
    };

    const handleUpdateHub = async (name: string, description: string) => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.UPDATE_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    id: id,
                    name: name,
                    description: description,
                }),
            });

            if (response.ok) {
                // Refresh hub details after update
                await fetchHubDetails();
            }
        } catch (error) {
            console.error('Error updating hub:', error);
            throw error;
        }
    };

    const mapSocialsToLinks = (socials: any[]) => {
        if (!socials || socials.length === 0) return [];
        return socials.map(s => {
            const type = s.socialType !== undefined ? s.socialType : s.type;
            let platform: any = 'discord';

            switch (type) {
                case SocialType.Instagram: platform = 'instagram'; break;
                case SocialType.X: platform = 'twitter'; break;
                case SocialType.Facebook: platform = 'facebook'; break;
                case SocialType.TikTok: platform = 'tiktok'; break;
                case SocialType.YouTube: platform = 'youtube'; break;
                case SocialType.Discord: platform = 'discord'; break;
                case SocialType.Telegram: platform = 'telegram'; break;
            }

            const url = s.url && s.url !== '#' ? s.url : getSocialUrl(platform, s.username);
            return { platform, username: s.username, url };
        });
    };

    const tabs = [
        { label: 'Live', value: 'live' },
        { label: 'Upcoming', value: 'upcoming' },
        { label: 'Past', value: 'past' },
    ];

    const renderTournamentList = () => {
        if (tournaments.length === 0 && !isListLoading) {
            return (
                <View className="bg-[#131B2E] rounded-[24px] p-10 border border-white/5 items-center">
                    <Ionicons name="trophy-outline" size={48} color="#1E293B" />
                    <Text className="text-slate-600 mt-4 text-center text-sm">No tournaments found</Text>
                </View>
            );
        }

        return (
            <View className="pb-4 mt-2">
                {tournaments.map((tournament: any, index: number) => (
                    <View key={tournament.id || `t-${index}`} className="mb-5">
                        <TournamentCard
                            name={tournament.name}
                            description={tournament.description}
                            status={tournament.status === 3 ? 'live' : (tournament.status === 4 ? 'completed' : 'upcoming')}
                            date={new Date(tournament.startDate).toLocaleDateString()}
                            region={tournament.region === 1 ? 'North America' : 'Europe'}
                            prizePool={`${tournament.prizeCurrency === 1 ? '$' : '€'}${tournament.prize}`}
                            players={new Array(tournament.numberOfParticipants || 0).fill({})}
                            onClick={() => navigation.navigate('TournamentDetails', { id: tournament.id })}
                            index={index}
                            hubName={hubData.name}
                            hubAvatarUrl={hubData.avatarUrl || hubData.logoUrl}
                        />
                    </View>
                ))}
                {isListLoading && (
                    <View className="py-4 items-center">
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                )}
            </View>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
                <View className="flex-row items-center justify-between px-6 py-2">
                    <Pressable
                        onPress={() => navigation.goBack()}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                    </Pressable>
                    <Text className="text-lg font-black text-white tracking-tight">Hub</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text className="text-slate-500 mt-4">Loading hub...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error || !hubData) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
                <View className="flex-row items-center justify-between px-6 py-2">
                    <Pressable
                        onPress={() => navigation.goBack()}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                    </Pressable>
                    <Text className="text-lg font-black text-white tracking-tight">Hub</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-red-400 mt-4 text-center font-medium">{error || 'Hub not found'}</Text>
                    <Pressable
                        onPress={fetchHubDetails}
                        className="mt-6 bg-[#131B2E] px-8 py-3 rounded-2xl border border-white/5"
                    >
                        <Text className="text-white font-bold">Retry</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            {/* Top Bar */}
            <View className="flex-row items-center justify-between px-6 py-2">
                <Pressable
                    onPress={() => navigation.goBack()}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                </Pressable>
                <Text className="text-lg font-black text-white tracking-tight">Hub</Text>
                {isOwner ? (
                    <Pressable
                        onPress={() => navigation.navigate('ManageHub', { hubId: id })}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
                    </Pressable>
                ) : (
                    <View className="w-10" />
                )}
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 150 }}
                onScroll={({ nativeEvent }) => {
                    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
                        loadMoreTournaments();
                    }
                }}
                scrollEventThrottle={16}
            >
                {/* ─── Unified Hub Hero ─── */}
                <View className="px-5 mt-4">
                    <View className="bg-[#131B2E] rounded-[28px] border border-white/5 overflow-hidden">
                        {/* Accent gradient bar */}
                        <View className="h-1.5 bg-[#10B981]" />

                        <View className="p-5">
                            {/* Avatar + Name + Stats row */}
                            <View className="flex-row items-center">
                                <View className="mr-4">
                                    <View className="p-[3px] rounded-[22px] border-2 border-[#10B981]">
                                        <PlayerAvatar
                                            name={hubData.name}
                                            src={hubData.avatarUrl || hubData.logoUrl}
                                            size="lg"
                                            className="border-0 rounded-[18px]"
                                        />
                                    </View>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-2xl font-black text-white leading-tight" numberOfLines={2}>{hubData.name}</Text>
                                    {/* Inline stats */}
                                    <View className="flex-row items-center mt-2 gap-4">
                                        <View className="flex-row items-center gap-1.5">
                                            <Ionicons name="people" size={14} color="#818CF8" />
                                            <Text className="text-white font-bold text-sm">{(hubData.numberOfUsers || 0).toLocaleString()}</Text>
                                            <Text className="text-slate-500 text-xs">followers</Text>
                                        </View>
                                        <View className="w-[1px] h-3.5 bg-white/10" />
                                        <View className="flex-row items-center gap-1.5">
                                            <Ionicons name="trophy" size={14} color="#FBBF24" />
                                            <Text className="text-white font-bold text-sm">{hubData.numberOfTournaments || 0}</Text>
                                            <Text className="text-slate-500 text-xs">tournaments</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {/* Social Links */}
                            {hubData.hubSocials && hubData.hubSocials.length > 0 && (
                                <View className="mt-4 pt-4 border-t border-white/5 items-center">
                                    <SocialLinks links={mapSocialsToLinks(hubData.hubSocials)} className="justify-center" />
                                </View>
                            )}

                            {/* About Hub (inline collapsible) */}
                            {hubData.description ? (
                                <Pressable
                                    onPress={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                    className="mt-4 pt-4 border-t border-white/5"
                                >
                                    <View className="flex-row items-center justify-between">
                                        <View className="flex-row items-center gap-2">
                                            <View className="w-6 h-6 rounded-lg bg-emerald-500/10 items-center justify-center">
                                                <Ionicons name="information-circle" size={13} color="#10B981" />
                                            </View>
                                            <Text className="text-[11px] font-black text-white uppercase tracking-widest">About</Text>
                                        </View>
                                        <View className={cn(
                                            "w-6 h-6 rounded-full bg-white/5 items-center justify-center",
                                            isDescriptionExpanded && "bg-emerald-500/10"
                                        )}>
                                            <Ionicons
                                                name={isDescriptionExpanded ? "chevron-up" : "chevron-down"}
                                                size={14}
                                                color={isDescriptionExpanded ? "#10B981" : "#64748B"}
                                            />
                                        </View>
                                    </View>
                                    {isDescriptionExpanded && (
                                        <View className="mt-3">
                                            <Text className="text-slate-400 text-[14px] leading-6">
                                                {hubData.description}
                                            </Text>
                                        </View>
                                    )}
                                </Pressable>
                            ) : null}

                            {/* Follow Button */}
                            {!isOwner && (
                                <Pressable
                                    onPress={handleFollowToggle}
                                    className={cn(
                                        "mt-4 w-full py-3.5 rounded-2xl flex-row items-center justify-center gap-2",
                                        isFollowing
                                            ? "bg-white/5 border border-white/10"
                                            : "bg-[#10B981]"
                                    )}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                >
                                    <Ionicons
                                        name={isFollowing ? "checkmark-circle" : "add-circle"}
                                        size={17}
                                        color={isFollowing ? "#94A3B8" : "#fff"}
                                    />
                                    <Text className={cn(
                                        "font-black text-sm tracking-wide",
                                        isFollowing ? "text-slate-400" : "text-white"
                                    )}>
                                        {isFollowing ? "Following" : "Follow Hub"}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                </View>

                {/* ─── Tournament Tabs ─── */}
                {isFollowing || isOwner ? (
                    <View className="mt-7 flex-1">
                        <View className="px-5 mb-6">
                            <Tabs
                                tabs={tabs}
                                activeTab={activeTab}
                                onTabChange={setActiveTab}
                            />
                        </View>
                        <View className="px-5">
                            {renderTournamentList()}
                        </View>
                    </View>
                ) : (
                    <View className="px-5 mt-7 mb-10">
                        <View className="py-12 items-center justify-center bg-[#131B2E]/50 rounded-[28px] border border-white/5">
                            <View className="w-16 h-16 rounded-2xl bg-[#0F172A] items-center justify-center mb-4 border border-white/5">
                                <Ionicons name="lock-closed-outline" size={28} color="#334155" />
                            </View>
                            <Text className="text-white font-black text-lg text-center">Private Content</Text>
                            <Text className="text-slate-500 mt-2 text-center text-sm px-6">Follow this hub to see its tournaments and activities</Text>
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
