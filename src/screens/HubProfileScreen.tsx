import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { TournamentCard } from '../components/cards/TournamentCard';
import { HubRole } from '../types/hub';

import { Ionicons } from '@expo/vector-icons';

import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { parseUtcDate, formatDateSafe, getCurrencySymbol } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { SocialLinks } from '../components/profile/SocialLinks';
import { SocialType } from '../types/auth';
import { getSocialUrl } from '../lib/social';
import { shareHub } from '../lib/share';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';

type HubProfileRouteProp = RouteProp<RootStackParamList, 'HubProfile'>;

export default function HubProfileScreen() {
    const route = useRoute<HubProfileRouteProp>();
    const navigation = useNavigation<any>();
    const { id } = route.params;

    const { user } = useAuth();
    const [isFollowing, setIsFollowing] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isPublic, setIsPublic] = useState(true);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [isRequestingJoin, setIsRequestingJoin] = useState(false);
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
    const [memberSearch, setMemberSearch] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [memberPage, setMemberPage] = useState(0);
    const [hasMoreMembers, setHasMoreMembers] = useState(true);
    const [isMembersLoading, setIsMembersLoading] = useState(false);
    const memberSearchSeq = useRef(0);


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
            const hub = data.result || data;
            setHubData(hub);
            setIsFollowing(hub.isUserFollowHub || false);
            setIsOwner(hub.isUserOwner || false);
            setIsAdmin(hub.isUserAdmin || hub.IsUserAdmin || false);
            setIsPublic(hub.isPublic !== false);
            setHasPendingRequest(hub.hasPendingJoinRequest || false);
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

    const fetchMembers = useCallback(async (pageNumber: number, search: string, seq: number) => {
        try {
            if (pageNumber === 0) setIsMembersLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_MEMBERS_PAGED(id, pageNumber, search));
            if (!response.ok) return;
            const data = await response.json();
            const list: any[] = Array.isArray(data) ? data : (data.result || []);
            // ignore stale results from older searches
            if (seq !== memberSearchSeq.current) return;
            setMembers(prev => (pageNumber === 0 ? list : [...prev, ...list]));
            setHasMoreMembers(list.length === 10);
        } catch (err) {
            console.error('Error fetching members:', err);
        } finally {
            if (seq === memberSearchSeq.current) setIsMembersLoading(false);
        }
    }, [id]);

    // Debounce search + initial load whenever the user switches to the Members tab
    useEffect(() => {
        if (hubTab !== 'members') return;
        const seq = ++memberSearchSeq.current;
        setMembers([]);
        setMemberPage(0);
        setHasMoreMembers(true);
        const handle = setTimeout(() => {
            fetchMembers(0, memberSearch.trim(), seq);
        }, memberSearch ? 300 : 0);
        return () => clearTimeout(handle);
    }, [hubTab, memberSearch, fetchMembers]);

    const loadMoreMembers = () => {
        if (isMembersLoading || !hasMoreMembers) return;
        const nextPage = memberPage + 1;
        setMemberPage(nextPage);
        fetchMembers(nextPage, memberSearch.trim(), memberSearchSeq.current);
    };

    const getRoleMeta = (role: number) => {
        if (role === HubRole.HubOwner) {
            return { label: 'Owner', color: 'text-amber-400', bg: 'bg-amber-500/15 border border-amber-500/30', icon: 'shield-checkmark', iconColor: '#FBBF24' };
        }
        if (role === HubRole.HubAdmin) {
            return { label: 'Admin', color: 'text-indigo-300', bg: 'bg-indigo-500/15 border border-indigo-500/30', icon: 'star', iconColor: '#A5B4FC' };
        }
        return { label: 'Member', color: 'text-slate-400', bg: 'bg-white/[0.05] border border-white/10', icon: 'person', iconColor: '#94A3B8' };
    };

    const handleFollowToggle = async () => {
        if (!user?.id) return;

        if (isFollowing) {
            // Show confirmation before unfollowing
            setShowUnfollowConfirm(true);
            return;
        }

        if (hasPendingRequest) {
            // Cancel pending request
            setIsRequestingJoin(true);
            try {
                const response = await authenticatedFetch(ENDPOINTS.CANCEL_HUB_JOIN_REQUEST(id), {
                    method: 'DELETE',
                });
                if (response.ok) {
                    setHasPendingRequest(false);
                } else {
                    const text = await response.text();
                    Alert.alert('Unable to cancel', getErrorMessage(text) || 'Failed to cancel join request.');
                }
            } catch (error) {
                Alert.alert('Unable to cancel', getErrorMessage(error));
            } finally {
                setIsRequestingJoin(false);
            }
            return;
        }

        setIsRequestingJoin(true);
        try {
            // Use unified join endpoint - backend decides between immediate follow (public) or request (private)
            const response = await authenticatedFetch(ENDPOINTS.REQUEST_HUB_JOIN(id), {
                method: 'POST',
            });
            if (response.ok) {
                if (isPublic) {
                    setIsFollowing(true);
                } else {
                    setHasPendingRequest(true);
                }
            } else {
                const text = await response.text();
                Alert.alert('Unable to join', getErrorMessage(text) || 'Failed to join hub.');
            }
        } catch (error) {
            Alert.alert('Unable to join', getErrorMessage(error));
        } finally {
            setIsRequestingJoin(false);
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
            } else {
                const text = await response.text();
                Alert.alert('Unable to unfollow', getErrorMessage(text) || 'Failed to unfollow hub.');
            }
        } catch (error) {
            Alert.alert('Unable to unfollow', getErrorMessage(error));
        } finally {
            setIsUnfollowing(false);
        }
    };

    const handleUpdateHub = async (name: string, description: string, isPublicValue?: boolean) => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.UPDATE_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    id: id,
                    name: name,
                    description: description,
                    isPublic: isPublicValue !== undefined ? isPublicValue : isPublic,
                }),
            });

            if (response.ok) {
                fetchHubDetails();
            }
        } catch (error) {
            console.error('Error updating hub:', error);
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
        { label: 'Members', value: 'members' },
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
                            date={formatDateSafe(tournament.startDate)}
                            region={tournament.region === 1 ? 'North America' : 'Europe'}
                            prizePool={`${getCurrencySymbol(tournament.prizeCurrency)}${tournament.prize}`}
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
        await shareHub(id, hubData?.name);
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
                    <Pressable
                        onPress={handleShare}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                        accessibilityLabel="Share hub"
                    >
                        <Ionicons name="share-outline" size={20} color="#FAFAFA" />
                    </Pressable>
                    {(isOwner || isAdmin) && (
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
                        if (hubTab === 'tournaments') loadMoreTournaments();
                        else if (hubTab === 'members') loadMoreMembers();
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
                                    <View className="flex-row items-center" style={{ gap: 8 }}>
                                        <Text className="text-2xl font-black text-white leading-tight flex-shrink" numberOfLines={2}>{hubData.name}</Text>
                                        {(hubData.isVerified || hubData.IsVerified) && (
                                            <View className="w-6 h-6 rounded-full bg-sky-500 items-center justify-center">
                                                <Ionicons name="checkmark" size={16} color="#fff" />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>

                            {/* Social Links */}
                            {hubData.hubSocials && hubData.hubSocials.length > 0 && (
                                <View className="mt-4 pt-4 border-t border-white/5 items-center">
                                    <SocialLinks links={mapSocialsToLinks(hubData.hubSocials)} className="justify-center" />
                                </View>
                            )}


                            {/* Follow / Request Join Button */}
                            {!isOwner && (() => {
                                const buttonLabel = isFollowing
                                    ? "Following"
                                    : hasPendingRequest
                                        ? "Request Pending"
                                        : isPublic
                                            ? "Follow Hub"
                                            : "Request to Join";
                                const buttonIcon = isFollowing
                                    ? "checkmark-circle"
                                    : hasPendingRequest
                                        ? "time-outline"
                                        : isPublic
                                            ? "add-circle"
                                            : "lock-open-outline";
                                const buttonBg = isFollowing
                                    ? "bg-white/5 border border-white/10"
                                    : hasPendingRequest
                                        ? "bg-amber-500/15 border border-amber-500/30"
                                        : isPublic
                                            ? "bg-[#10B981]"
                                            : "bg-amber-500";
                                const textColor = isFollowing
                                    ? "text-slate-400"
                                    : hasPendingRequest
                                        ? "text-amber-400"
                                        : "text-white";
                                const iconColor = isFollowing
                                    ? "#94A3B8"
                                    : hasPendingRequest
                                        ? "#F59E0B"
                                        : "#fff";

                                return (
                                    <Pressable
                                        onPress={handleFollowToggle}
                                        disabled={isRequestingJoin}
                                        className={`mt-3 w-full py-3.5 rounded-2xl flex-row items-center justify-center gap-2 ${buttonBg}`}
                                        style={({ pressed }) => ({ opacity: (pressed || isRequestingJoin) ? 0.8 : 1 })}
                                    >
                                        {isRequestingJoin ? (
                                            <ActivityIndicator size="small" color={iconColor} />
                                        ) : (
                                            <Ionicons name={buttonIcon as any} size={17} color={iconColor} />
                                        )}
                                        <Text className={`font-black text-sm tracking-wide ${textColor}`}>
                                            {buttonLabel}
                                        </Text>
                                    </Pressable>
                                );
                            })()}
                        </View>
                    </View>
                </View>

                {/* ─── Hub Tabs (Overview / Tournaments) ─── */}
                <View className="px-5 mt-6 mb-5">
                    <View className="flex-row bg-[#0D1525] rounded-2xl border border-white/[0.06] p-1.5" style={{ gap: 6 }}>
                        {hubTabs.map((tab) => {
                            const isActive = hubTab === tab.value;
                            const iconMap: Record<string, string> = { overview: 'grid-outline', tournaments: 'trophy-outline', members: 'people-outline' };
                            return (
                                <Pressable
                                    key={tab.value}
                                    onPress={() => setHubTab(tab.value)}
                                    className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
                                        isActive ? 'bg-indigo-500/15 border border-indigo-500/25' : ''
                                    }`}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                >
                                    <Ionicons name={(iconMap[tab.value] || 'ellipse') as any} size={15} color={isActive ? '#818CF8' : '#475569'} />
                                    <Text className={`text-sm font-black ${
                                        isActive ? 'text-white' : 'text-slate-600'
                                    }`}>{tab.label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
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
                {/* ─── MEMBERS TAB ─── */}
                {/* ═══════════════════════════════════════════ */}
                {hubTab === 'members' && (
                    <View className="px-4 pb-12">
                        {(isFollowing || isOwner) ? (
                            <>
                                <View className="mb-4">
                                    <View className="flex-row items-center bg-[#0D1525] px-3 rounded-xl border border-white/5">
                                        <Ionicons name="search-outline" size={18} color="#475569" />
                                        <TextInput
                                            className="flex-1 h-11 text-white ml-2 text-sm"
                                            placeholder="Search members..."
                                            placeholderTextColor="#475569"
                                            value={memberSearch}
                                            onChangeText={setMemberSearch}
                                            autoCorrect={false}
                                            autoCapitalize="none"
                                        />
                                        {memberSearch.length > 0 && (
                                            <Pressable onPress={() => setMemberSearch('')} hitSlop={10}>
                                                <Ionicons name="close-circle" size={18} color="#475569" />
                                            </Pressable>
                                        )}
                                    </View>
                                </View>

                                <View className="bg-[#131B2E] rounded-2xl border border-white/5 overflow-hidden">
                                    {members.map((member, index) => {
                                        const mId = member.userId || member.UserId;
                                        const mName = member.username || member.Username || 'Unknown';
                                        const mAvatar = member.avatarUrl || member.AvatarUrl;
                                        const role = member.hubRole ?? member.HubRole ?? HubRole.HubMember;
                                        const roleMeta = getRoleMeta(role);
                                        const isLast = index === members.length - 1;
                                        return (
                                            <Pressable
                                                key={mId || `m-${index}`}
                                                onPress={() => mId && navigation.navigate('PlayerProfile', { id: mId })}
                                                className={`flex-row items-center justify-between px-4 py-3 ${isLast ? '' : 'border-b border-white/5'}`}
                                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                            >
                                                <View className="flex-row items-center flex-1 mr-2" style={{ gap: 12 }}>
                                                    <PlayerAvatar name={mName} src={mAvatar} size="md" />
                                                    <Text className="text-white font-semibold text-sm flex-1" numberOfLines={1}>
                                                        {mName}
                                                    </Text>
                                                </View>
                                                <View className={`flex-row items-center px-2 py-1 rounded-full ${roleMeta.bg}`} style={{ gap: 4 }}>
                                                    <Ionicons name={roleMeta.icon as any} size={10} color={roleMeta.iconColor} />
                                                    <Text className={`text-[10px] font-black uppercase tracking-wide ${roleMeta.color}`}>
                                                        {roleMeta.label}
                                                    </Text>
                                                </View>
                                            </Pressable>
                                        );
                                    })}

                                    {isMembersLoading && (
                                        <View className="py-6 items-center">
                                            <ActivityIndicator size="small" color="#818CF8" />
                                        </View>
                                    )}

                                    {!isMembersLoading && members.length === 0 && (
                                        <View className="py-12 items-center px-6">
                                            <View className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-3">
                                                <Ionicons name="people-outline" size={24} color="#334155" />
                                            </View>
                                            <Text className="text-sm font-semibold text-slate-500">
                                                {memberSearch ? 'No matches' : 'No members yet'}
                                            </Text>
                                            {memberSearch ? (
                                                <Text className="text-xs text-slate-600 mt-1">Try a different search</Text>
                                            ) : null}
                                        </View>
                                    )}
                                </View>
                            </>
                        ) : (
                            <View className="bg-[#131B2E] rounded-2xl border border-white/5 overflow-hidden">
                                <View className="py-12 items-center justify-center px-6">
                                    <View className="w-16 h-16 rounded-2xl bg-[#0F172A] items-center justify-center mb-4 border border-white/5">
                                        <Ionicons name="lock-closed-outline" size={28} color="#334155" />
                                    </View>
                                    <Text className="text-white font-black text-lg text-center">Private Content</Text>
                                    <Text className="text-slate-500 mt-2 text-center text-sm px-6">Follow this hub to see its members</Text>
                                </View>
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
                                <View className="mb-5">
                                    <View className="flex-row bg-[#0D1525] rounded-2xl border border-white/[0.06] p-1.5" style={{ gap: 6 }}>
                                        {tournamentFilterTabs.map((tab) => {
                                            const isActive = tournamentFilter === tab.value;
                                            const colorMap: Record<string, { activeBg: string; activeBorder: string; text: string; icon: string }> = {
                                                live: { activeBg: 'bg-red-500/10', activeBorder: 'border-red-500/20', text: 'text-red-400', icon: '#EF4444' },
                                                upcoming: { activeBg: 'bg-indigo-500/10', activeBorder: 'border-indigo-500/20', text: 'text-indigo-400', icon: '#818CF8' },
                                                past: { activeBg: 'bg-slate-500/10', activeBorder: 'border-slate-500/20', text: 'text-slate-400', icon: '#64748B' },
                                            };
                                            const iconMap: Record<string, string> = { live: 'radio', upcoming: 'time-outline', past: 'checkmark-circle-outline' };
                                            const colors = colorMap[tab.value] || colorMap.upcoming;
                                            return (
                                                <Pressable
                                                    key={tab.value}
                                                    onPress={() => setTournamentFilter(tab.value)}
                                                    className={`flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl ${
                                                        isActive ? `${colors.activeBg} border ${colors.activeBorder}` : ''
                                                    }`}
                                                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                                >
                                                    <Ionicons name={iconMap[tab.value] as any} size={13} color={isActive ? colors.icon : '#334155'} />
                                                    <Text className={`text-xs font-black ${
                                                        isActive ? colors.text : 'text-slate-700'
                                                    }`}>{tab.label}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
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
