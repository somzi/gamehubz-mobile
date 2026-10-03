import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HUB_KEY, fetchHub } from '../lib/profileQueries';
import { useRefetchOnFocusIfStale } from '../hooks/useRefetchOnFocusIfStale';
import { DETAIL_STALE_MS, invalidateHubData } from '../lib/queryPolicy';

import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { TournamentCard } from '../components/cards/TournamentCard';
import { HubRole } from '../types/hub';

import { Ionicons } from '@expo/vector-icons';

import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { parseUtcDate, formatDateSafe, formatLocalDateTime, getCurrencySymbol } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgesContext';
import { SocialLinks } from '../components/profile/SocialLinks';
import { SocialType } from '../types/auth';
import { getSocialUrl } from '../lib/social';
import { ShareHubCardModal } from '../components/modals/ShareHubCardModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { HeroCard, CoverPill, EmblemImage, COMPACT_EMBLEM_IMAGE } from '../components/ui/HeroCard';
import { Panel, PanelTitle, StatCell, StatDivider, ExpandableText } from '../components/ui/Panel';
import { RefreshFailedBanner } from '../components/ui/RefreshFailedBanner';
import { LoadFailedState } from '../components/ui/EmptyState';
import { COLORS } from '../lib/theme';
import i18n, { dateLocale } from '../i18n';

type HubProfileRouteProp = RouteProp<RootStackParamList, 'HubProfile'>;

// The hub share card's colours: emerald, turning to cyan on the emblem ring.
const HUB_HAIRLINE = ['rgba(52,211,153,0.55)', 'rgba(148,163,184,0.14)', 'rgba(16,185,129,0.5)'] as const;
const HUB_BANNER = ['#065F46', '#059669', '#0F766E'] as const;
const HUB_EMBLEM_RING = ['#34D399', '#2DD4ED'] as const;

export default function HubProfileScreen() {
    const { t } = useTranslation('hub');
    const { t: tCommon } = useTranslation('common');
    const { t: tAuth } = useTranslation('auth');
    const route = useRoute<HubProfileRouteProp>();
    const navigation = useNavigation<any>();
    const { id } = route.params;

    const { user } = useAuth();
    const isFocused = useIsFocused();
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
        hubTournamentApprovals.filter((row) => pred(row.status)).reduce((acc, row) => acc + row.total, 0);
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
    const [tournaments, setTournaments] = useState<any[]>([]);
    const [isListLoading, setIsListLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
    const [shareCardVisible, setShareCardVisible] = useState(false);
    const [isUnfollowing, setIsUnfollowing] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [memberPage, setMemberPage] = useState(0);
    const [hasMoreMembers, setHasMoreMembers] = useState(true);
    const [isMembersLoading, setIsMembersLoading] = useState(false);
    // A first page that failed to load, per list: shown as a load failure, not as "no tournaments" /
    // "no members yet".
    const [tournamentsError, setTournamentsError] = useState(false);
    const [membersError, setMembersError] = useState(false);
    // Which tournaments request is the current one: switching Live → Past while Live is still in
    // flight must not let Live's late answer (or its failure) land under Past.
    const tournamentsSeq = useRef(0);
    const memberSearchSeq = useRef(0);
    const pagesInFlight = useRef(new Set<string>());

    // Stable so the memoized TournamentCard doesn't invalidate on every parent
    // re-render (member search typing, badge tick, follow state change). The
    // inline `() => openTournament(id)` per row still creates a fresh lambda —
    // eliminating that entirely would require changing TournamentCard's onClick
    // signature to take an id, which is out of scope for this pass.
    const openTournament = useCallback(
        (tid: string) => navigation.navigate('TournamentDetails', { id: tid }),
        [navigation],
    );


    // The hub header is cached: re-opening a hub paints the last snapshot immediately instead of
    // going blank, and the refetch below swaps in fresh data a moment later. Same contract the
    // Hubs and Tournaments tabs already run on — see the persister in App.tsx.
    const queryClient = useQueryClient();
    const hubQuery = useQuery({
        queryKey: HUB_KEY(id),
        queryFn: () => fetchHub(id),
        enabled: !!id && isFocused,
        staleTime: DETAIL_STALE_MS,
    });

    const hubData = hubQuery.data ?? null;
    // "Nothing to paint yet" rather than "a request is in flight": on a cache hit this is already
    // false in the first frame, which is the whole point of the change.
    const isLoading = hubQuery.isPending;
    const error = hubQuery.isError
        ? (hubQuery.error instanceof Error ? hubQuery.error.message : tCommon('unexpectedError'))
        : null;

    const refetchHub = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: HUB_KEY(id) });
    }, [queryClient, id]);

    // Follow / join / cancel answer instantly and let the server confirm afterwards, so these stay
    // local state rather than being read straight off the query. Re-seeding them whenever a fetch
    // lands is what makes a change made on another device show up here.
    useEffect(() => {
        if (!hubData) return;
        setIsFollowing(hubData.isUserFollowHub || false);
        setIsOwner(hubData.isUserOwner || false);
        setIsAdmin(hubData.isUserAdmin || hubData.IsUserAdmin || false);
        setIsPublic(hubData.isPublic !== false);
        setHasPendingRequest(hubData.hasPendingJoinRequest || false);
    }, [hubData]);

    useRefetchOnFocusIfStale(hubQuery.refetch, hubQuery.dataUpdatedAt, {
        enabled: !!id, queryKey: HUB_KEY(id), staleMs: DETAIL_STALE_MS,
    });

    useEffect(() => {
        const seq = ++tournamentsSeq.current;
        if (hubTab === 'tournaments') {
            setTournaments([]);
            setPage(0);
            setHasMore(true);
            setTournamentsError(false);
            fetchTournaments(0, tournamentFilter, seq);
        }
        return () => { tournamentsSeq.current += 1; };
    }, [id, tournamentFilter, hubTab]);

    const fetchTournaments = async (currentPage: number, tab: string, seq = tournamentsSeq.current) => {
        if (!hasMore && currentPage > 0) return;
        const requestKey = `tournaments:${seq}:${currentPage}`;
        if (pagesInFlight.current.has(requestKey)) return;
        pagesInFlight.current.add(requestKey);

        try {
            setIsListLoading(true);
            let status = 1; // Default to Upcoming (1)

            if (tab === 'live') status = 3; // InProgress
            else if (tab === 'past') status = 4; // Completed
            else if (tab === 'upcoming') status = 1; // RegistrationOpen (and others potentially handled by backend)

            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_TOURNAMENTS(id, status, currentPage));

            if (seq !== tournamentsSeq.current) return;
            if (!response.ok) {
                setTournamentsError(true);
                return;
            }

            const data = await response.json();
            if (seq !== tournamentsSeq.current) return;
            const newTournaments = data.tournaments || [];
            setTournamentsError(false);
            setPage(currentPage);

            if (currentPage === 0) {
                setTournaments(newTournaments);
            } else {
                setTournaments(prev => [...prev, ...newTournaments]);
            }

            setHasMore(newTournaments.length === 10); // Assuming pageSize is 10
        } catch (err) {
            console.error('Error fetching tournaments:', err);
            if (seq === tournamentsSeq.current) setTournamentsError(true);
        } finally {
            pagesInFlight.current.delete(requestKey);
            if (seq === tournamentsSeq.current) setIsListLoading(false);
        }
    };

    const loadMoreTournaments = () => {
        if (!isListLoading && hasMore) {
            const nextPage = tournaments.length ? page + 1 : 0;
            fetchTournaments(nextPage, tournamentFilter);
        }
    };

    const fetchMembers = useCallback(async (pageNumber: number, search: string, seq: number) => {
        const requestKey = `members:${seq}:${pageNumber}`;
        if (pagesInFlight.current.has(requestKey)) return;
        pagesInFlight.current.add(requestKey);
        try {
            setIsMembersLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_MEMBERS_PAGED(id, pageNumber, search));
            if (!response.ok) {
                if (seq === memberSearchSeq.current) setMembersError(true);
                return;
            }
            const data = await response.json();
            const list: any[] = Array.isArray(data) ? data : (data.result || []);
            // ignore stale results from older searches
            if (seq !== memberSearchSeq.current) return;
            setMembersError(false);
            setMemberPage(pageNumber);
            setMembers(prev => (pageNumber === 0 ? list : [...prev, ...list]));
            setHasMoreMembers(list.length === 10);
        } catch (err) {
            console.error('Error fetching members:', err);
            if (seq === memberSearchSeq.current) setMembersError(true);
        } finally {
            pagesInFlight.current.delete(requestKey);
            if (seq === memberSearchSeq.current) setIsMembersLoading(false);
        }
    }, [id]);

    // Debounce search + initial load whenever the user switches to the Members tab.
    // The list state is cleared INSIDE the setTimeout callback (not on every keystroke)
    // so mid-search the visible results stay onscreen until the debounced fetch resolves
    // — no more empty-flash between letters. The seq guard still handles overlapping
    // in-flight requests.
    useEffect(() => {
        const seq = ++memberSearchSeq.current;
        if (hubTab !== 'members') return;
        // Block pagination of the old search while the new query is debouncing.
        setIsMembersLoading(true);
        const handle = setTimeout(() => {
            setMembers([]);
            setMemberPage(0);
            setHasMoreMembers(true);
            setMembersError(false);
            fetchMembers(0, memberSearch.trim(), seq);
        }, memberSearch ? 300 : 0);
        return () => { clearTimeout(handle); memberSearchSeq.current += 1; };
    }, [hubTab, memberSearch, fetchMembers]);

    const loadMoreMembers = () => {
        if (isMembersLoading || !hasMoreMembers) return;
        const nextPage = members.length ? memberPage + 1 : 0;
        fetchMembers(nextPage, memberSearch.trim(), memberSearchSeq.current);
    };

    const getRoleMeta = (role: number) => {
        if (role === HubRole.HubOwner) {
            return { label: t('role.owner'), color: 'text-amber-400', bg: 'bg-amber-500/15 border border-amber-500/30', icon: 'shield-checkmark', iconColor: '#FBBF24' };
        }
        if (role === HubRole.HubAdmin) {
            return { label: t('role.admin'), color: 'text-indigo-300', bg: 'bg-indigo-500/15 border border-indigo-500/30', icon: 'star', iconColor: '#A5B4FC' };
        }
        if (role === HubRole.HubExclusive) {
            return { label: t('role.exclusive'), color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15 border border-fuchsia-500/30', icon: 'sparkles', iconColor: '#E879F9' };
        }
        return { label: t('role.member'), color: 'text-slate-400', bg: 'bg-white/[0.05] border border-white/10', icon: 'person', iconColor: '#94A3B8' };
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
                    await invalidateHubData(queryClient, id);
                    refetchHub();
                } else {
                    const text = await response.text();
                    Alert.alert(t('profile.unableToCancel'), getErrorMessage(text) || t('profile.cancelRequestFailed'));
                }
            } catch (error) {
                Alert.alert(t('profile.unableToCancel'), getErrorMessage(error));
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
                await invalidateHubData(queryClient, id);
                refetchHub();
            } else {
                const text = await response.text();
                Alert.alert(t('profile.unableToJoin'), getErrorMessage(text) || t('profile.joinFailed'));
            }
        } catch (error) {
            Alert.alert(t('profile.unableToJoin'), getErrorMessage(error));
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
                await invalidateHubData(queryClient, id);
                refetchHub();
            } else {
                const text = await response.text();
                Alert.alert(t('profile.unableToUnfollow'), getErrorMessage(text) || t('profile.unfollowFailed'));
            }
        } catch (error) {
            Alert.alert(t('profile.unableToUnfollow'), getErrorMessage(error));
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
                await invalidateHubData(queryClient, id);
                refetchHub();
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
        { label: t('profile.tabOverview'), value: 'overview', icon: 'grid-outline' },
        {
            label: t('profile:tabTournaments'), value: 'tournaments', icon: 'trophy-outline',
            badge: hubTournamentsCount > 0 ? hubTournamentsCount : undefined,
            badgeTone: 'alert',
        },
        {
            label: t('profile.tabMembers'), value: 'members', icon: 'people-outline',
            badge: hubJoinCount > 0 ? hubJoinCount : undefined,
            badgeTone: 'alert',
        },
    ];

    const tournamentFilterTabs: PremiumTabItem[] = [
        {
            label: t('profile.tabLive'), value: 'live', icon: 'radio',
            badge: liveApprovals > 0 ? liveApprovals : undefined, badgeTone: 'alert',
        },
        {
            label: t('profile.tabUpcoming'), value: 'upcoming', icon: 'time-outline',
            badge: upcomingApprovals > 0 ? upcomingApprovals : undefined, badgeTone: 'alert',
        },
        {
            label: t('profile.tabPast'), value: 'past', icon: 'checkmark-circle-outline',
            badge: pastApprovals > 0 ? pastApprovals : undefined, badgeTone: 'alert',
        },
    ];

    const retryTournaments = () => {
        setTournamentsError(false);
        setHasMore(true);
        setPage(0);
        fetchTournaments(0, tournamentFilter, ++tournamentsSeq.current);
    };

    const renderTournamentList = () => {
        if (tournaments.length === 0 && !isListLoading && tournamentsError) {
            return <LoadFailedState onRetry={retryTournaments} className="mt-2" />;
        }
        if (tournaments.length === 0 && !isListLoading) {
            return (
                <View className="bg-card rounded-[24px] p-10 border border-white/5 items-center">
                    <Ionicons name="trophy-outline" size={48} color="#1E293B" />
                    <Text className="text-slate-600 mt-4 text-center text-sm">{t('profile.noTournamentsFound')}</Text>
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
                            // Draft + an opening time = waiting for its scheduled registration; the
                            // card then leads with that time instead of the start date.
                            status={tournament.status === 3 ? 'live'
                                : tournament.status === 4 ? 'completed'
                                : (tournament.status === 0 && tournament.registrationOpensAt) ? 'scheduled'
                                : 'upcoming'}
                            date={(tournament.status === 0 && tournament.registrationOpensAt)
                                ? formatLocalDateTime(tournament.registrationOpensAt)
                                : formatDateSafe(tournament.startDate)}
                            dateIso={(tournament.status === 0 && tournament.registrationOpensAt)
                                ? tournament.registrationOpensAt
                                : tournament.startDate}
                            region={tournament.region === 1 ? tAuth('region.northAmerica') : tAuth('region.europe')}
                            prizePool={`${getCurrencySymbol(tournament.prizeCurrency)}${tournament.prize}`}
                            players={new Array(tournament.numberOfParticipants || 0).fill({})}
                            onClick={() => openTournament(tournament.id)}
                            index={index}
                            badgeCount={tournamentApprovals(tournament.id)?.total ?? 0}
                            hubName={hubData.name}
                            hubAvatarUrl={hubData.avatarUrl || hubData.logoUrl}
                            isPrivate={!!tournament.isPrivate}
                        />
                    </View>
                ))}
                {isListLoading && (
                    <View className="py-4 items-center">
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                )}
                {tournamentsError && tournaments.length > 0 && <LoadFailedState onRetry={loadMoreTournaments} retrying={isListLoading} />}
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
                    <Text className="text-lg font-black text-white tracking-tight">{t('profile.headerHub')}</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text className="text-slate-500 mt-4">{t('profile.loadingHub')}</Text>
                </View>
            </SafeAreaView>
        );
    }

    // Only with nothing to show: a refresh that fails over a loaded hub keeps it on screen, with the
    // banner above the hero.
    if (!hubData) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <View className="flex-row items-center justify-between px-6 py-2">
                    <Pressable
                        onPress={() => navigation.goBack()}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                    </Pressable>
                    <Text className="text-lg font-black text-white tracking-tight">{t('profile.headerHub')}</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-red-400 mt-4 text-center font-medium">{error || t('profile.hubNotFound')}</Text>
                    <Pressable
                        onPress={refetchHub}
                        className="mt-6 bg-card px-8 py-3 rounded-2xl border border-white/5"
                    >
                        <Text className="text-white font-bold">{tCommon('retry')}</Text>
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
                <Text className="text-lg font-black text-white tracking-tight">{t('profile.headerHub')}</Text>
                <View className="flex-row items-center gap-2">
                    <Pressable
                        onPress={handleShare}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                        accessibilityLabel={t('profile.shareHub')}
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
                keyboardShouldPersistTaps="handled"
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 150 }}
                onScroll={({ nativeEvent }) => {
                    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
                        if (hubTab === 'tournaments' && !tournamentsError) loadMoreTournaments();
                        else if (hubTab === 'members' && !membersError) loadMoreMembers();
                    }
                }}
                scrollEventThrottle={16}
            >
                {hubQuery.isError && (
                    <RefreshFailedBanner className="mx-5 mt-3" onRetry={refetchHub} retrying={hubQuery.isFetching} />
                )}

                {/* ─── Hub hero: the in-app version of the hub's share card ─── */}
                {(() => {
                    const socials = mapSocialsToLinks(hubData.hubSocials);
                    const isVerified = !!(hubData.isVerified || hubData.IsVerified);

                    return (
                        <HeroCard
                            className="mx-5 mt-3"
                            compact
                            hairline={HUB_HAIRLINE}
                            banner={HUB_BANNER}
                            emblemRing={HUB_EMBLEM_RING}
                            glowColor={COLORS.primary}
                            emblem={
                                <EmblemImage
                                    name={hubData.name}
                                    src={hubData.avatarUrl || hubData.logoUrl}
                                    size={COMPACT_EMBLEM_IMAGE}
                                    radius={19}
                                />
                            }
                            // The name rides beside the logo, on one line, with the verified tick right after it.
                            asideAlign="start"
                            aside={
                                <View className="flex-row items-center self-stretch" style={{ gap: 6 }}>
                                    {/* One line always: a longer name shrinks to fit rather than wrap. */}
                                    <Text
                                        className="shrink text-[22px] leading-[27px] font-extrabold text-white tracking-tight"
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.55}
                                    >
                                        {hubData.name}
                                    </Text>
                                    {isVerified && (
                                        <View className="w-[18px] h-[18px] rounded-full bg-sky-500 items-center justify-center">
                                            <Ionicons name="checkmark" size={12} color="#fff" />
                                        </View>
                                    )}
                                </View>
                            }
                            // Who can get in, on the banner's corner
                            bannerAccessory={
                                <CoverPill
                                    icon={isPublic ? 'globe-outline' : 'lock-closed'}
                                    iconColor={isPublic ? COLORS.primaryBright : '#FBBF24'}
                                    label={isPublic ? t('profile.public') : t('profile.private')}
                                    border={isPublic ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.4)'}
                                />
                            }
                        >
                            {/* The hub's links, centred under a hairline */}
                            {socials.length > 0 && (
                                <View className="mt-3.5 pt-3 border-t border-white/[0.06] items-center">
                                    <SocialLinks links={socials} className="justify-center" />
                                </View>
                            )}

                            {/* Follow / Request Join Button */}
                            {!isOwner && (() => {
                                const buttonLabel = isFollowing
                                    ? t('profile.following')
                                    : hasPendingRequest
                                        ? t('profile.requestPending')
                                        : isPublic
                                            ? t('profile.followHub')
                                            : t('profile.requestToJoin');
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
                                    <View className="mt-3">
                                        <Pressable
                                            onPress={handleFollowToggle}
                                            disabled={isRequestingJoin}
                                            className={`w-full h-12 rounded-2xl flex-row items-center justify-center gap-2 active:opacity-80 ${buttonBg} ${isRequestingJoin ? 'opacity-80' : ''}`}
                                        >
                                            {isRequestingJoin ? (
                                                <ActivityIndicator size="small" color={iconColor} />
                                            ) : (
                                                <Ionicons name={buttonIcon as any} size={17} color={iconColor} />
                                            )}
                                            <Text className={`font-black text-sm tracking-wide ${textColor}`} numberOfLines={1}>
                                                {buttonLabel}
                                            </Text>
                                        </Pressable>
                                    </View>
                                );
                            })()}
                        </HeroCard>
                    );
                })()}

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
                {hubTab === 'overview' && (() => {
                    const createdOnRaw = hubData.createdOn || hubData.CreatedOn;
                    const createdOn = createdOnRaw ? parseUtcDate(createdOnRaw) : null;
                    const ownerName = hubData.ownerName || hubData.OwnerName;
                    const ownerId = hubData.ownerId || hubData.OwnerId || hubData.userId || hubData.UserId || hubData.createdBy || hubData.CreatedBy;

                    return (
                        <View className="px-5 pb-12" style={{ gap: 10 }}>
                            {/* The hub in numbers — the share card's row — with its owner underneath */}
                            <Panel style={{ paddingTop: 14, paddingBottom: ownerName ? 0 : 14 }}>
                                <View className="flex-row items-center" style={{ paddingHorizontal: 4 }}>
                                    <StatCell
                                        icon="trophy"
                                        iconColor="rgba(251,191,36,0.85)"
                                        value={String(hubData.numberOfTournaments || 0)}
                                        label={t('profile:tabTournaments')}
                                        valueColor="#FBBF24"
                                    />
                                    <StatDivider />
                                    <StatCell
                                        icon="people"
                                        iconColor="rgba(52,211,153,0.8)"
                                        value={(hubData.numberOfUsers || 0).toLocaleString(i18n.language)}
                                        label={t('profile.membersLabel')}
                                    />
                                    {createdOn && !isNaN(createdOn.getTime()) && (
                                        <>
                                            <StatDivider />
                                            <StatCell
                                                icon="calendar"
                                                iconColor="rgba(56,189,248,0.8)"
                                                value={createdOn.toLocaleDateString(dateLocale(), { month: 'short', year: 'numeric' })}
                                                label={t('profile.established')}
                                                valueSize={17}
                                            />
                                        </>
                                    )}
                                </View>

                                {!!ownerName && (
                                    <>
                                        <View className="mx-4 mt-3.5 h-px bg-white/[0.06]" />
                                        <Pressable
                                            onPress={() => ownerId && navigation.navigate('PlayerProfile', { id: ownerId })}
                                            disabled={!ownerId}
                                            accessibilityRole="button"
                                            className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                                        >
                                            <View
                                                className="w-9 h-9 rounded-xl items-center justify-center"
                                                style={{ backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' }}
                                            >
                                                <Ionicons name="shield-checkmark" size={17} color="#FBBF24" />
                                            </View>
                                            <View className="flex-1">
                                                <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-slate-500">
                                                    {t('profile.ownerLabel')}
                                                </Text>
                                                <Text className="text-[15px] font-black text-white mt-0.5" numberOfLines={1}>
                                                    {ownerName}
                                                </Text>
                                            </View>
                                            {!!ownerId && <Ionicons name="chevron-forward" size={16} color={COLORS.slate500} />}
                                        </Pressable>
                                    </>
                                )}
                            </Panel>

                            {!!hubData.description && (
                                <Panel style={{ padding: 16 }}>
                                    <PanelTitle icon="document-text" color="#FBBF24" title={t('profile.about')} />
                                    <ExpandableText text={hubData.description} collapsedLines={5} />
                                </Panel>
                            )}
                        </View>
                    );
                })()}

                {/* ═══════════════════════════════════════════ */}
                {/* ─── MEMBERS TAB ─── */}
                {/* ═══════════════════════════════════════════ */}
                {hubTab === 'members' && (
                    <View className="px-5 pb-12">
                        {(isFollowing || isOwner) ? (
                            <>
                                {/* Search, on the same card surface as the list */}
                                <View
                                    className="flex-row items-center px-3.5 h-12 rounded-2xl mb-4"
                                    style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.11)' }}
                                >
                                    <Ionicons name="search" size={17} color={COLORS.slate500} />
                                    <TextInput
                                        className="flex-1 h-12 text-white ml-2.5 text-[14px]"
                                        placeholder={t('profile.searchMembers')}
                                        placeholderTextColor={COLORS.slate500}
                                        value={memberSearch}
                                        onChangeText={setMemberSearch}
                                        autoCorrect={false}
                                        autoCapitalize="none"
                                    />
                                    {memberSearch.length > 0 && (
                                        <Pressable onPress={() => setMemberSearch('')} hitSlop={10} accessibilityRole="button">
                                            <Ionicons name="close-circle" size={18} color={COLORS.slate500} />
                                        </Pressable>
                                    )}
                                </View>

                                {/* How many there are, like a day header in the inbox */}
                                {!memberSearch && (
                                    <View className="flex-row items-center px-1 mb-2" style={{ gap: 8 }}>
                                        <Text className="text-slate-400 text-[11px] font-black uppercase tracking-[1.6px]">
                                            {t('profile.membersLabel')}
                                        </Text>
                                        <Text className="text-slate-600 text-[11px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                                            {(hubData.numberOfUsers || 0).toLocaleString(i18n.language)}
                                        </Text>
                                    </View>
                                )}

                                {/* The roster: one panel, a row per member */}
                                <Panel>
                                    {members.map((member, index) => {
                                        const mId = member.userId || member.UserId;
                                        const mName = member.username || member.Username || tCommon('unknown');
                                        const mAvatar = member.avatarUrl || member.AvatarUrl;
                                        const role = member.hubRole ?? member.HubRole ?? HubRole.HubMember;
                                        const roleMeta = getRoleMeta(role);
                                        // Plain members carry no pill — on a roster it would repeat on every row.
                                        const hasRank = role !== HubRole.HubMember;
                                        const isMe = !!user?.id && !!mId && user.id.toLowerCase() === String(mId).toLowerCase();

                                        return (
                                            <Pressable
                                                key={mId || `m-${index}`}
                                                onPress={() => mId && navigation.navigate('PlayerProfile', { id: mId })}
                                                accessibilityRole="button"
                                                className={`flex-row items-center pl-4 pr-3 py-2.5 active:opacity-70 ${index === 0 ? '' : 'border-t border-white/[0.05]'} ${isMe ? 'bg-primary/[0.07]' : ''}`}
                                            >
                                                {isMe && (
                                                    <View
                                                        pointerEvents="none"
                                                        style={{
                                                            position: 'absolute', left: 0, top: 10, bottom: 10, width: 3,
                                                            backgroundColor: COLORS.primary, borderTopRightRadius: 3, borderBottomRightRadius: 3,
                                                            shadowColor: COLORS.primary, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                                                        }}
                                                    />
                                                )}
                                                <View
                                                    style={{
                                                        borderRadius: 999,
                                                        padding: 1.5,
                                                        borderWidth: 1.5,
                                                        borderColor: hasRank ? roleMeta.iconColor + '80' : isMe ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)',
                                                    }}
                                                >
                                                    <PlayerAvatar name={mName} src={mAvatar} size="md" className="border-0" />
                                                </View>
                                                <View className="flex-1 flex-row items-center ml-3" style={{ gap: 6 }}>
                                                    <Text className="shrink text-[15px] font-black text-white" numberOfLines={1}>
                                                        {mName}
                                                    </Text>
                                                    {isMe && (
                                                        <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                                                            <Text className="text-[9px] font-black uppercase tracking-wider text-emerald-300">{tCommon('app.me')}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                {hasRank && (
                                                    <View className={`flex-row items-center px-2 py-1 rounded-full ml-2 ${roleMeta.bg}`} style={{ gap: 4 }}>
                                                        <Ionicons name={roleMeta.icon as any} size={10} color={roleMeta.iconColor} />
                                                        <Text className={`text-[10px] font-black uppercase tracking-wide ${roleMeta.color}`}>
                                                            {roleMeta.label}
                                                        </Text>
                                                    </View>
                                                )}
                                                <Ionicons name="chevron-forward" size={14} color={COLORS.slate600} style={{ marginLeft: 6 }} />
                                            </Pressable>
                                        );
                                    })}

                                    {isMembersLoading && (
                                        <View className={`py-6 items-center ${members.length > 0 ? 'border-t border-white/[0.05]' : ''}`}>
                                            <ActivityIndicator size="small" color={COLORS.info} />
                                        </View>
                                    )}
                                    {membersError && members.length > 0 && <LoadFailedState onRetry={loadMoreMembers} retrying={isMembersLoading} />}

                                    {!isMembersLoading && members.length === 0 && membersError && (
                                        <LoadFailedState
                                            variant="plain"
                                            className="py-10"
                                            onRetry={() => {
                                                setMembersError(false);
                                                fetchMembers(0, memberSearch.trim(), ++memberSearchSeq.current);
                                            }}
                                        />
                                    )}

                                    {!isMembersLoading && members.length === 0 && !membersError && (
                                        <View className="py-10 items-center px-6">
                                            <View className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-3">
                                                <Ionicons name={memberSearch ? 'search-outline' : 'people-outline'} size={22} color={COLORS.slate500} />
                                            </View>
                                            <Text className="text-sm font-semibold text-slate-400">
                                                {memberSearch ? t('profile.noMatches') : t('profile.noMembersYet')}
                                            </Text>
                                            {memberSearch ? (
                                                <Text className="text-xs text-slate-500 mt-1">{t('profile.tryDifferentSearch')}</Text>
                                            ) : null}
                                        </View>
                                    )}
                                </Panel>
                            </>
                        ) : (
                            <Panel style={{ paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center' }}>
                                <View
                                    className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
                                    style={{ backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' }}
                                >
                                    <Ionicons name="lock-closed" size={24} color="#FBBF24" />
                                </View>
                                <Text className="text-white font-black text-lg text-center">{t('profile.privateContent')}</Text>
                                <Text className="text-slate-400 mt-2 text-center text-sm px-4">{t('profile.privateMembersHint')}</Text>
                            </Panel>
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
                                    <Text className="text-white font-black text-lg text-center">{t('profile.privateContent')}</Text>
                                    <Text className="text-slate-500 mt-2 text-center text-sm px-6">{t('profile.privateTournamentsHint')}</Text>
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
                name={hubData.name || t('profile.headerHub')}
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
                title={t('profile.unfollowTitle')}
                message={t('profile.unfollowMessage', { name: hubData?.name || t('profile.thisHub') })}
                isDestructive={true}
                isLoading={isUnfollowing}
            />
        </SafeAreaView>
    );
}
