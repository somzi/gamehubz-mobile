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
import { useBadges } from '../context/BadgesContext';
import { SocialLinks } from '../components/profile/SocialLinks';
import { SocialType } from '../types/auth';
import { getSocialUrl } from '../lib/social';
import { ShareHubCardModal } from '../components/modals/ShareHubCardModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { CollapsibleCard, InfoRow, QuoteBlock } from '../components/ui/CollapsibleCard';

type HubProfileRouteProp = RouteProp<RootStackParamList, 'HubProfile'>;

export default function HubProfileScreen() {
    const route = useRoute<HubProfileRouteProp>();
    const navigation = useNavigation<any>();
    const { id } = route.params;

    const { user } = useAuth();
    const { tournamentApprovals, hubApprovalDetail, tournamentsForHub } = useBadges();
    // Split this hub's pending-approvals total so the Tournaments and Members tabs each show their
    // own share (join requests live on Members; registrations / admin-help live under Tournaments).
    const hubDetail = hubApprovalDetail(id);
    const hubJoinCount = hubDetail?.joinRequests ?? 0;
    const hubTournamentsCount = Math.max(0, (hubDetail?.count ?? 0) - hubJoinCount);
    // Bucket the hub's tournaments-with-pending by status so each Live/Upcoming/Past filter tab
    // shows where the items are (status 3 = Live, 4 = Past, everything else = Upcoming).
    const hubTournamentApprovals = tournamentsForHub(id);
    const sumApprovals = (pred: (status: number) => boolean) =>
        hubTournamentApprovals.filter((t) => pred(t.status)).reduce((acc, t) => acc + t.total, 0);
    const liveApprovals = sumApprovals((s) => s === 3);
    const pastApprovals = sumApprovals((s) => s === 4);
    const upcomingApprovals = sumApprovals((s) => s !== 3 && s !== 4);
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
    const [isAboutOpen, setIsAboutOpen] = useState(true);
    const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
    const [shareCardVisible, setShareCardVisible] = useState(false);
    const [isUnfollowing, setIsUnfollowing] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [memberPage, setMemberPage] = useState(0);
    const [hasMoreMembers, setHasMoreMembers] = useState(true);
    const [isMembersLoading, setIsMembersLoading] = useState(false);
    const memberSearchSeq = useRef(0);

    // Stable so the memoized TournamentCard doesn't invalidate on every parent
    // re-render (member search typing, badge tick, follow state change). The
    // inline `() => openTournament(id)` per row still creates a fresh lambda —
    // eliminating that entirely would require changing TournamentCard's onClick
    // signature to take an id, which is out of scope for this pass.
    const openTournament = useCallback(
        (tid: string) => navigation.navigate('TournamentDetails', { id: tid }),
        [navigation],
    );


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

    // Debounce search + initial load whenever the user switches to the Members tab.
    // The list state is cleared INSIDE the setTimeout callback (not on every keystroke)
    // so mid-search the visible results stay onscreen until the debounced fetch resolves
    // — no more empty-flash between letters. The seq guard still handles overlapping
    // in-flight requests.
    useEffect(() => {
        if (hubTab !== 'members') return;
        const seq = ++memberSearchSeq.current;
        const handle = setTimeout(() => {
            setMembers([]);
            setMemberPage(0);
            setHasMoreMembers(true);
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
        if (role === HubRole.HubExclusive) {
            return { label: 'Exclusive', color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15 border border-fuchsia-500/30', icon: 'sparkles', iconColor: '#E879F9' };
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
        return socials.flatMap(s => {
            const type = s.socialType !== undefined ? s.socialType : s.type;
            let platform: any = null;

            switch (type) {
                case SocialType.Instagram: platform = 'instagram'; break;
                case SocialType.X: platform = 'twitter'; break;
                case SocialType.Facebook: platform = 'facebook'; break;
                case SocialType.TikTok: platform = 'tiktok'; break;
                case SocialType.YouTube: platform = 'youtube'; break;
                case SocialType.Discord: platform = 'discord'; break;
                case SocialType.Telegram: platform = 'telegram'; break;
                case SocialType.Twitch: platform = 'twitch'; break;
                case SocialType.Kick: platform = 'kick'; break;
            }

            if (!platform) return [];
            const url = s.url && s.url !== '#' ? s.url : getSocialUrl(platform, s.username);
            return [{ platform, username: s.username, url }];
        });
    };

    const hubTabs: PremiumTabItem[] = [
        { label: 'Overview', value: 'overview', icon: 'grid-outline' },
        {
            label: 'Tournaments', value: 'tournaments', icon: 'trophy-outline',
            badge: hubTournamentsCount > 0 ? hubTournamentsCount : undefined,
            badgeTone: 'alert',
        },
        {
            label: 'Members', value: 'members', icon: 'people-outline',
            badge: hubJoinCount > 0 ? hubJoinCount : undefined,
            badgeTone: 'alert',
        },
    ];

    const tournamentFilterTabs: PremiumTabItem[] = [
        {
            label: 'Live', value: 'live', icon: 'radio',
            badge: liveApprovals > 0 ? liveApprovals : undefined, badgeTone: 'alert',
        },
        {
            label: 'Upcoming', value: 'upcoming', icon: 'time-outline',
            badge: upcomingApprovals > 0 ? upcomingApprovals : undefined, badgeTone: 'alert',
        },
        {
            label: 'Past', value: 'past', icon: 'checkmark-circle-outline',
            badge: pastApprovals > 0 ? pastApprovals : undefined, badgeTone: 'alert',
        },
    ];

    const renderTournamentList = () => {
        if (tournaments.length === 0 && !isListLoading) {
            return (
                <View className="bg-card rounded-[24px] p-10 border border-white/5 items-center">
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
                            onClick={() => openTournament(tournament.id)}
                            index={index}
                            badgeCount={tournamentApprovals(tournament.id)?.total ?? 0}
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
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
                        className="mt-6 bg-card px-8 py-3 rounded-2xl border border-white/5"
                    >
                        <Text className="text-white font-bold">Retry</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const handleShare = () => {
        setShareCardVisible(true);
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
                    <View className="bg-card rounded-[28px] border border-white/5 overflow-hidden">
                        {/* Accent gradient bar */}
                        <View className="h-1.5 bg-primary" />

                        <View className="p-5">
                            {/* Avatar + Name + Stats row */}
                            <View className="flex-row items-center">
                                <View className="mr-4">
                                    <View className="p-[3px] rounded-[22px] border-2 border-primary">
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
                                            ? "bg-primary"
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
                    <PremiumTabs
                        tabs={hubTabs}
                        activeTab={hubTab}
                        onTabChange={setHubTab}
                    />
                </View>

                {/* ═══════════════════════════════════════════ */}
                {/* ─── OVERVIEW TAB ─── */}
                {/* ═══════════════════════════════════════════ */}
                {hubTab === 'overview' && (
                    <View className="px-4 pb-12">
                        {/* General Info */}
                        <CollapsibleCard
                            icon="information-circle"
                            iconColor="#F59E0B"
                            title="General Info"
                            isOpen={isGeneralInfoOpen}
                            onToggle={() => setIsGeneralInfoOpen(!isGeneralInfoOpen)}
                        >
                            <InfoRow
                                icon="people"
                                iconColor="#818CF8"
                                label="Members"
                                value={(hubData.numberOfUsers || 0).toLocaleString()}
                            />
                            <InfoRow
                                icon="trophy"
                                iconColor="#FBBF24"
                                label="Tournaments"
                                value={String(hubData.numberOfTournaments || 0)}
                            />
                            <InfoRow
                                icon={isPublic ? 'globe-outline' : 'lock-closed'}
                                iconColor={isPublic ? '#34D399' : '#F59E0B'}
                                label="Access"
                                value={isPublic ? 'Public' : 'Private'}
                            />
                            {(hubData.createdOn || hubData.CreatedOn) && (
                                <InfoRow
                                    icon="calendar-outline"
                                    iconColor="#38BDF8"
                                    label="Established"
                                    value={formatDateSafe(hubData.createdOn || hubData.CreatedOn)}
                                />
                            )}
                            {(() => {
                                // Old backends don't send userHubRole — fall back to the flags we do have.
                                const myRole = hubData.userHubRole ?? hubData.UserHubRole
                                    ?? (isOwner ? HubRole.HubOwner : isAdmin ? HubRole.HubAdmin : null);
                                if (myRole == null) return null;
                                const roleMeta = getRoleMeta(myRole);
                                return (
                                    <InfoRow
                                        icon={roleMeta.icon as any}
                                        iconColor={roleMeta.iconColor}
                                        label="Your Role"
                                        value={
                                            <View className={`flex-row items-center px-2 py-1 rounded-full ${roleMeta.bg}`} style={{ gap: 4 }}>
                                                <Ionicons name={roleMeta.icon as any} size={10} color={roleMeta.iconColor} />
                                                <Text className={`text-[10px] font-black uppercase tracking-wide ${roleMeta.color}`}>
                                                    {roleMeta.label}
                                                </Text>
                                            </View>
                                        }
                                    />
                                );
                            })()}
                            {(hubData.ownerName || hubData.OwnerName) && (
                                <InfoRow
                                    icon="person"
                                    iconColor="#34D399"
                                    label="Owner"
                                    value={
                                        <Text className="text-[14px] font-black text-emerald-300 text-right" numberOfLines={2}>
                                            {hubData.ownerName || hubData.OwnerName}
                                        </Text>
                                    }
                                    onPress={() => {
                                        const ownerIdValue = hubData.ownerId || hubData.OwnerId || hubData.userId || hubData.UserId || hubData.createdBy || hubData.CreatedBy;
                                        if (ownerIdValue) {
                                            navigation.navigate('PlayerProfile', { id: ownerIdValue });
                                        }
                                    }}
                                />
                            )}
                        </CollapsibleCard>

                        {/* About */}
                        {hubData.description && (
                            <CollapsibleCard
                                icon="document-text"
                                iconColor="#FBBF24"
                                title="About"
                                isOpen={isAboutOpen}
                                onToggle={() => setIsAboutOpen(!isAboutOpen)}
                            >
                                <QuoteBlock accentColor="#FBBF24">
                                    {hubData.description}
                                </QuoteBlock>
                            </CollapsibleCard>
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

                                <View className="bg-card rounded-2xl border border-white/5 overflow-hidden">
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
                            <View className="bg-card rounded-2xl border border-white/5 overflow-hidden">
                                <View className="py-12 items-center justify-center px-6">
                                    <View className="w-16 h-16 rounded-2xl bg-background items-center justify-center mb-4 border border-white/5">
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
                                    <PremiumTabs
                                        tabs={tournamentFilterTabs}
                                        activeTab={tournamentFilter}
                                        onTabChange={setTournamentFilter}
                                    />
                                </View>
                                {renderTournamentList()}
                            </>
                        ) : (
                            <View className="bg-card rounded-2xl border border-white/5 overflow-hidden">
                                <View className="py-12 items-center justify-center px-6">
                                    <View className="w-16 h-16 rounded-2xl bg-background items-center justify-center mb-4 border border-white/5">
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

            <ShareHubCardModal
                visible={shareCardVisible}
                onClose={() => setShareCardVisible(false)}
                hubId={id}
                name={hubData.name || 'Hub'}
                avatarUrl={hubData.avatarUrl || hubData.logoUrl}
                isVerified={!!(hubData.isVerified || hubData.IsVerified)}
                isPublic={isPublic}
                ownerName={hubData.ownerName || hubData.OwnerName || null}
                stats={{
                    followers: hubData.numberOfUsers || 0,
                    tournaments: hubData.numberOfTournaments || 0,
                }}
            />

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
