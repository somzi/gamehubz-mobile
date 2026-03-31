import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { TournamentCard } from '../components/cards/TournamentCard';

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from '../components/ui/Tabs';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { parseUtcDate } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { SocialLinks } from '../components/profile/SocialLinks';
import { SocialType } from '../types/auth';
import { getSocialUrl } from '../lib/social';
import { buildDeepLink, shareDeepLink } from '../lib/share';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';

type HubProfileRouteProp = RouteProp<RootStackParamList, 'HubProfile'>;

export default function HubProfileScreen() {
    const route = useRoute<HubProfileRouteProp>();
    const navigation = useNavigation<any>();
    const { id } = route.params;

    const { user } = useAuth();
    const [isFollowing, setIsFollowing] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [hubTab, setHubTab] = useState('overview');
    const [tournamentFilter, setTournamentFilter] = useState('live');
    const [hubData, setHubData] = useState<any>(null);
    const [tournaments, setTournaments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isListLoading, setIsListLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGeneralInfoOpen, setIsGeneralInfoOpen] = useState(true);
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
    const [isUnfollowing, setIsUnfollowing] = useState(false);


    useFocusEffect(
        useCallback(() => {
            fetchHubDetails();
        }, [id])
    );

    useEffect(() => {
        // Only fetch if we are on the tournaments tab
        if (hubTab === 'tournaments') {
            setTournaments([]);
            setPage(0);
            setHasMore(true);
            fetchTournaments(0, tournamentFilter);
        }
    }, [tournamentFilter, hubTab]);

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
            fetchTournaments(nextPage, tournamentFilter);
        }
    };

    const handleFollowToggle = async () => {
        if (!user?.id) return;

        if (isFollowing) {
            // Show confirmation before unfollowing
            setShowUnfollowConfirm(true);
            return;
        }

        try {
            // Follow
            const response = await authenticatedFetch(ENDPOINTS.FOLLOW_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    id: null,
                    userId: user.id,
                    hubId: id,
                }),
            });
            if (response.ok) setIsFollowing(true);
        } catch (error) {
            console.error('Error following hub:', error);
        }
    };

    const handleConfirmUnfollow = async () => {
        if (!user?.id) return;
        setIsUnfollowing(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.UNFOLLOW_HUB(user.id, id), {
                method: 'DELETE',
            });
            if (response.ok) {
                setIsFollowing(false);
                setShowUnfollowConfirm(false);
            }
        } catch (error) {
            console.error('Error unfollowing hub:', error);
        } finally {
            setIsUnfollowing(false);
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

    const hubTabs = [
        { label: 'Overview', value: 'overview' },
        { label: 'Tournaments', value: 'tournaments' },
    ];

    const tournamentFilterTabs = [
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
                            date={parseUtcDate(tournament.startDate).toLocaleDateString()}
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

    const handleShare = async () => {
        try {
            const hubName = hubData?.name || 'this hub';
            await shareDeepLink({
                title: hubData?.name || 'Hub',
                description: `Check out ${hubName} on GameHubz.`,
                deepLink: buildDeepLink('hub', id),
            });
        } catch (error) {
            console.error('Share error:', error);
        }
    };

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
                <View className="flex-row items-center gap-2">
{/* Share button hidden - coming soon */}
                    {isOwner && (
                        <Pressable
                            onPress={() => navigation.navigate('ManageHub', { hubId: id })}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
                        </Pressable>
                    )}
                </View>
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
                                </View>
                            </View>

                            {/* Social Links */}
                            {hubData.hubSocials && hubData.hubSocials.length > 0 && (
                                <View className="mt-4 pt-4 border-t border-white/5 items-center">
                                    <SocialLinks links={mapSocialsToLinks(hubData.hubSocials)} className="justify-center" />
                                </View>
                            )}


                            {/* Follow Button */}
                            {!isOwner && (
                                <Pressable
                                    onPress={handleFollowToggle}
                                    className={`mt-4 w-full py-3.5 rounded-2xl flex-row items-center justify-center gap-2 ${
                                        isFollowing
                                            ? "bg-white/5 border border-white/10"
                                            : "bg-[#10B981]"
                                    }`}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                >
                                    <Ionicons
                                        name={isFollowing ? "checkmark-circle" : "add-circle"}
                                        size={17}
                                        color={isFollowing ? "#94A3B8" : "#fff"}
                                    />
                                    <Text className={`font-black text-sm tracking-wide ${
                                        isFollowing ? "text-slate-400" : "text-white"
                                    }`}>
                                        {isFollowing ? "Following" : "Follow Hub"}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                </View>

                {/* ─── Hub Tabs (Overview / Tournaments) ─── */}
                <View className="px-4 py-4">
                    <Tabs tabs={hubTabs} activeTab={hubTab} onTabChange={setHubTab} />
                </View>

                {/* ═══════════════════════════════════════════ */}
                {/* ─── OVERVIEW TAB ─── */}
                {/* ═══════════════════════════════════════════ */}
                {hubTab === 'overview' && (
                    <View className="px-4 pb-12">
                        {/* General Info - Collapsible (matches tournament details design) */}
                        <View className="bg-[#131B2E] rounded-2xl border border-white/5 mb-3 overflow-hidden">
                            <Pressable
                                onPress={() => setIsGeneralInfoOpen(!isGeneralInfoOpen)}
                                className="flex-row items-center justify-between p-4"
                            >
                                <View className="flex-row items-center gap-2.5">
                                    <View className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 items-center justify-center">
                                        <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
                                    </View>
                                    <Text className="text-[11px] font-black text-white uppercase tracking-widest">General Info</Text>
                                </View>
                                <Ionicons name={isGeneralInfoOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
                            </Pressable>
                            {isGeneralInfoOpen && (
                                <View className="px-4 pb-4">
                                    <View className="border-t border-white/5 pt-4">
                                        {/* Followers */}
                                        <View className="flex-row items-center justify-between py-3">
                                            <View className="flex-row items-center gap-3">
                                                <View className="w-8 h-8 rounded-xl bg-[#818CF8]/10 items-center justify-center">
                                                    <Ionicons name="people-outline" size={16} color="#818CF8" />
                                                </View>
                                                <Text className="text-sm text-slate-400 font-bold">Followers</Text>
                                            </View>
                                            <Text className="text-base font-black text-white">
                                                {(hubData.numberOfUsers || 0).toLocaleString()}
                                            </Text>
                                        </View>
                                        <View className="h-[1px] bg-white/5" />
                                        {/* Tournaments */}
                                        <View className="flex-row items-center justify-between py-3">
                                            <View className="flex-row items-center gap-3">
                                                <View className="w-8 h-8 rounded-xl bg-[#FBBF24]/10 items-center justify-center">
                                                    <Ionicons name="trophy-outline" size={16} color="#FBBF24" />
                                                </View>
                                                <Text className="text-sm text-slate-400 font-bold">Tournaments</Text>
                                            </View>
                                            <Text className="text-base font-black text-white">
                                                {hubData.numberOfTournaments || 0}
                                            </Text>
                                        </View>
                                        {/* Owner */}
                                        {(hubData.ownerName || hubData.OwnerName) && (
                                            <>
                                                <View className="h-[1px] bg-white/5" />
                                                <View className="flex-row items-center justify-between py-3">
                                                    <View className="flex-row items-center gap-3">
                                                        <View className="w-8 h-8 rounded-xl bg-[#10B981]/10 items-center justify-center">
                                                            <Ionicons name="person-outline" size={16} color="#10B981" />
                                                        </View>
                                                        <Text className="text-sm text-slate-400 font-bold">Owner</Text>
                                                    </View>
                                                    <Pressable onPress={() => {
                                                        const ownerIdValue = hubData.ownerId || hubData.OwnerId || hubData.userId || hubData.UserId || hubData.createdBy || hubData.CreatedBy;
                                                        if (ownerIdValue) {
                                                            navigation.navigate('PlayerProfile', { id: ownerIdValue });
                                                        }
                                                    }}>
                                                        <Text className="text-base font-black text-[#10B981] underline">
                                                            {hubData.ownerName || hubData.OwnerName}
                                                        </Text>
                                                    </Pressable>
                                                </View>
                                            </>
                                        )}
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* About / Description - Collapsible */}
                        {hubData.description && (
                            <View className="bg-[#131B2E] rounded-2xl border border-white/5 mb-3 overflow-hidden">
                                <Pressable
                                    onPress={() => setIsAboutOpen(!isAboutOpen)}
                                    className="flex-row items-center justify-between p-4"
                                >
                                    <View className="flex-row items-center gap-2.5">
                                        <View className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 items-center justify-center">
                                            <Ionicons name="document-text-outline" size={18} color="#F59E0B" />
                                        </View>
                                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">About</Text>
                                    </View>
                                    <Ionicons name={isAboutOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
                                </Pressable>
                                {isAboutOpen && (
                                    <View className="px-4 pb-4">
                                        <View className="border-t border-white/5 pt-4">
                                            <Text className="text-slate-400 leading-6 text-sm">
                                                {hubData.description}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* ═══════════════════════════════════════════ */}
                {/* ─── TOURNAMENTS TAB ─── */}
                {/* ═══════════════════════════════════════════ */}
                {hubTab === 'tournaments' && (
                    <View className="px-4 pb-12">
                        {isFollowing || isOwner ? (
                            <>
                                {/* Tournament filter tabs */}
                                <View className="mb-4">
                                    <Tabs
                                        tabs={tournamentFilterTabs}
                                        activeTab={tournamentFilter}
                                        onTabChange={setTournamentFilter}
                                    />
                                </View>
                                {renderTournamentList()}
                            </>
                        ) : (
                            <View className="bg-[#131B2E] rounded-2xl border border-white/5 overflow-hidden">
                                <View className="py-12 items-center justify-center px-6">
                                    <View className="w-16 h-16 rounded-2xl bg-[#0F172A] items-center justify-center mb-4 border border-white/5">
                                        <Ionicons name="lock-closed-outline" size={28} color="#334155" />
                                    </View>
                                    <Text className="text-white font-black text-lg text-center">Private Content</Text>
                                    <Text className="text-slate-500 mt-2 text-center text-sm px-6">Follow this hub to see its tournaments and activities</Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            <ConfirmationModal
                visible={showUnfollowConfirm}
                onClose={() => setShowUnfollowConfirm(false)}
                onConfirm={handleConfirmUnfollow}
                title="Unfollow Hub"
                message={`Are you sure you want to unfollow ${hubData?.name || 'this hub'}? You will lose access to its private tournaments.`}
                isDestructive={true}
                isLoading={isUnfollowing}
            />
        </SafeAreaView>
    );
}
