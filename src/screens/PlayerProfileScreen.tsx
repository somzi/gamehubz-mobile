import { useRequestGate } from '../hooks/useRequestGate';
import { useTranslation } from 'react-i18next';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { MatchHistoryCard } from '../components/cards/MatchHistoryCard';
import { ProfileHeaderCard, ProfileHeaderSkeleton } from '../components/profile/ProfileHeaderCard';
import { ProfileStatsTab } from '../components/profile/ProfileStatsTab';
import { EmptyState, LoadFailedState } from '../components/ui/EmptyState';
import { RefreshFailedBanner } from '../components/ui/RefreshFailedBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { COLORS } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PLAYER_PROFILE_KEY, fetchPlayerProfile } from '../lib/profileQueries';
import { UserInfo, SocialType } from '../types/auth';
import { PlayerMatchesDto } from '../types/user';
import { formatDateSafe, getCurrencySymbol } from '../lib/utils';
import { getSocialUrl, withDiscordProfileLink } from '../lib/social';
import { SharePlayerCardModal } from '../components/modals/SharePlayerCardModal';
import { Button } from '../components/ui/Button';
import { TournamentCard } from '../components/cards/TournamentCard';
import { FriendActionBar } from '../components/profile/FriendActionBar';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';


import { StackNavigationProp } from '@react-navigation/stack';

type PlayerProfileRouteProp = RouteProp<RootStackParamList, 'PlayerProfile'>;

// Module scope: keys, not text — labels are resolved per render in the component.
const TAB_DEFS = [
    { labelKey: 'tabStats', value: 'stats', icon: 'stats-chart' },
    { labelKey: 'tabTournaments', value: 'tournaments', icon: 'trophy-outline' },
    { labelKey: 'tabMatches', value: 'matches', icon: 'game-controller-outline' },
];

export default function PlayerProfileScreen() {
    const { t } = useTranslation('profile');
    const { t: tCommon } = useTranslation('common');
    const tabs: PremiumTabItem[] = TAB_DEFS.map(d => ({ ...d, label: t(d.labelKey) })) as PremiumTabItem[];
    const route = useRoute<PlayerProfileRouteProp>();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { id } = route.params;

    const [activeTab, setActiveTab] = useState('stats');
    const [userTournaments, setUserTournaments] = useState<any[]>([]);
    const [tournamentsPage, setTournamentsPage] = useState(0);
    const [hasMoreTournaments, setHasMoreTournaments] = useState(true);
    const [isLoadingMoreTournaments, setIsLoadingMoreTournaments] = useState(false);
    // The first page of a list failed: shown as a load failure with a retry, not as "no tournaments".
    const [tournamentsError, setTournamentsError] = useState(false);

    const [userMatches, setUserMatches] = useState<any[]>([]);
    const [matchesPage, setMatchesPage] = useState(0);
    const [hasMoreMatches, setHasMoreMatches] = useState(true);
    const [isLoadingMoreMatches, setIsLoadingMoreMatches] = useState(false);
    const [matchesError, setMatchesError] = useState(false);

    const [shareCardVisible, setShareCardVisible] = useState(false);

    // Stable so the memoized TournamentCard doesn't invalidate on every parent
    // re-render (tab-flip, pagination). Per-row inline `() => openTournament(row.id)`
    // still churns — see ProfileScreen for the same trade-off note.
    const openTournament = useCallback(
        (id: string) => navigation.navigate('TournamentDetails', { id }),
        [navigation],
    );

    // The header (identity + career numbers) is cached, so re-opening a player paints the last
    // snapshot immediately instead of going blank; the refetch lands underneath. The paginated
    // tournament and match lists below still load per visit — see the note on the reset effect.
    const queryClient = useQueryClient();
    const profileQuery = useQuery({
        queryKey: PLAYER_PROFILE_KEY(id),
        queryFn: () => fetchPlayerProfile(id),
        enabled: !!id,
        staleTime: 30_000,
    });

    const userInfo = profileQuery.data?.userInfo ?? null;
    const playerMatches = profileQuery.data?.playerMatches ?? null;
    // "Nothing to paint yet", not "a request is in flight": on a cache hit this is already false
    // in the first frame.
    const isLoading = profileQuery.isPending;
    const error = profileQuery.isError
        ? (profileQuery.error instanceof Error ? profileQuery.error.message : t('loadProfileFailed'))
        : null;

    const refetchProfile = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: PLAYER_PROFILE_KEY(id) });
    }, [queryClient, id]);

    // Switching to another player has to drop the previous one's rows. The pagination cursors only
    // decide WHERE the next fetch starts, they don't wipe the visible list — without this, opening
    // Player B after Player A shows B's header over A's rows, and loadMore then APPENDS B's onto
    // A's instead of replacing them. Kept as its own effect now that the header is a query.
    useEffect(() => {
        setTournamentsPage(0);
        setHasMoreTournaments(true);
        setMatchesPage(0);
        setHasMoreMatches(true);
        setUserTournaments([]);
        setUserMatches([]);
        setTournamentsError(false);
        setMatchesError(false);
        setIsLoadingMoreTournaments(false);
        setIsLoadingMoreMatches(false);
    }, [id]);

    useEffect(() => {
        if (activeTab === 'tournaments' && userTournaments.length === 0 && hasMoreTournaments && !isLoadingMoreTournaments && !tournamentsError) {
            loadMoreTournaments();
        } else if (activeTab === 'matches' && userMatches.length === 0 && hasMoreMatches && !isLoadingMoreMatches && !matchesError) {
            loadMoreMatches();
        }
    }, [activeTab, id, userMatches.length, userTournaments.length, isLoadingMoreTournaments, isLoadingMoreMatches, tournamentsError, matchesError, hasMoreTournaments, hasMoreMatches]);

    // (Removed the useFocusEffect that wiped the tournaments / matches lists on every
    // focus. The [id] effect above already resets them when the profile actually changes;
    // firing on refocus just discarded the user's scroll position and re-fetched page 0
    // every time they came back to this profile.)

    const listRequests = useRequestGate(id);
    const pageRequests = useMemo(() => new Set<string>(), [listRequests]);
    const loadMoreTournaments = async () => {
        if (!id || isLoadingMoreTournaments || !hasMoreTournaments) return;

        const requestKey = 'tournaments:' + id;
        if (pageRequests.has(requestKey)) return;
        pageRequests.add(requestKey);
        const current = listRequests.begin('tournaments');
        setTournamentsError(false);
        setIsLoadingMoreTournaments(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_TOURNAMENTS(id, tournamentsPage));
            if (!current()) return;
            if (response.ok) {
                const data = await response.json();
                if (!current()) return;
                const items = data.items || data.Items || data.result || data;
                const itemsArray = Array.isArray(items) ? items : [];

                setUserTournaments(prev => {
                    const existingIds = new Set(prev.map((row: any) => row.id || row.Id));
                    const newItems = itemsArray.filter((row: any) => !existingIds.has(row.id || row.Id));
                    return [...prev, ...newItems];
                });
                setTournamentsPage(prev => prev + 1);
                setHasMoreTournaments(itemsArray.length === 10);
                setTournamentsError(false);
            } else {
                setTournamentsError(true);
            }
        } catch (error) {
            console.error('Error fetching more tournaments:', error);
            // A failed first page keeps hasMore, so the retry (and the next visit to the tab) loads it.
            if (current()) setTournamentsError(true);
        } finally {
            pageRequests.delete(requestKey);
            if (current()) setIsLoadingMoreTournaments(false);
        }
    };

    const loadMoreMatches = async () => {
        if (!id || isLoadingMoreMatches || !hasMoreMatches) return;

        const requestKey = 'matches:' + id;
        if (pageRequests.has(requestKey)) return;
        pageRequests.add(requestKey);
        const current = listRequests.begin('matches');
        setMatchesError(false);
        setIsLoadingMoreMatches(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_MATCHES(id, matchesPage));
            if (!current()) return;
            if (response.ok) {
                const data = await response.json();
                if (!current()) return;
                const items = data.items || data.Items || data.result || data;
                const itemsArray = Array.isArray(items) ? items : [];

                setUserMatches(prev => [...prev, ...itemsArray]);
                setMatchesPage(prev => prev + 1);
                setHasMoreMatches(itemsArray.length === 10);
                setMatchesError(false);
            } else {
                setMatchesError(true);
            }
        } catch (error) {
            console.error('Error fetching more matches:', error);
            if (current()) setMatchesError(true);
        } finally {
            pageRequests.delete(requestKey);
            if (current()) setIsLoadingMoreMatches(false);
        }
    };


    const mapSocialsToLinks = (socials: any[]) => {
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

    const getTournamentStatus = (status: number): 'live' | 'upcoming' | 'completed' => {
        switch (status) {
            case 3: return 'live';
            case 4: return 'completed';
            default: return 'upcoming';
        }
    };

    // First visit to this player: the page in its own shape instead of a spinner, with the same top
    // bar so the back button sits exactly where it will be.
    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <View className="flex-row items-center justify-between px-6 py-2">
                    <Pressable
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                    </Pressable>
                    <Text className="text-lg font-black text-white tracking-tight">{t('playerProfile')}</Text>
                    <View className="w-10 h-10" />
                </View>
                <View accessibilityLabel={t('loadingStats')}>
                    <ProfileHeaderSkeleton className="mx-5 mt-3" />
                    <View className="px-5 mt-3">
                        <Skeleton height={48} radius={16} />
                    </View>
                    <View className="px-5 mt-4" style={{ gap: 12 }}>
                        <Skeleton height={46} radius={16} />
                        <Skeleton height={112} radius={20} />
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // Only with nothing to show: a refresh that fails over a loaded profile keeps it on screen and
    // says so in the banner below the top bar.
    if (!userInfo) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <View className="flex-row items-center px-6 py-2">
                    <Pressable onPress={() => navigation.goBack()} className="p-2 -ml-2">
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </Pressable>
                </View>
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-destructive mt-4 text-center font-medium">{error || t('playerNotFound')}</Text>
                    {/* A failed load used to be a dead end — the only way out was the back arrow. */}
                    <Pressable
                        onPress={refetchProfile}
                        accessibilityRole="button"
                        className="mt-6 bg-card px-8 py-3 rounded-2xl border border-white/5 active:opacity-70"
                    >
                        <Text className="text-white font-bold">{tCommon('retry')}</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const displayData = {
        username: userInfo.username || tCommon('unknown'),
        totalMatches: playerMatches?.stats?.totalMatches || 0,
        winPercentage: playerMatches?.stats?.winRate || 0,
        wins: playerMatches?.stats?.wins || 0,
        losses: playerMatches?.stats?.losses || 0,
        draws: playerMatches?.stats?.draws || 0,
        tournamentsWon: playerMatches?.stats?.tournamentsWon || 0,
        socials: userInfo.userSocials || []
    };

    const handleScroll = (event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const paddingToBottom = 50;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            if (activeTab === 'tournaments' && hasMoreTournaments && !isLoadingMoreTournaments && !tournamentsError) {
                loadMoreTournaments();
            } else if (activeTab === 'matches' && hasMoreMatches && !isLoadingMoreMatches && !matchesError) {
                loadMoreMatches();
            }
        }
    };

    const handleShare = () => {
        setShareCardVisible(true);
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* Top Bar with Back Button */}
            <View className="flex-row items-center justify-between px-6 py-2">
                <Pressable
                    onPress={() => navigation.goBack()}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                </Pressable>
                <Text className="text-lg font-black text-white tracking-tight">{t('playerProfile')}</Text>
                <Pressable
                    onPress={handleShare}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                    accessibilityLabel={t('shareProfile')}
                >
                    <Ionicons name="share-outline" size={20} color="#FAFAFA" />
                </Pressable>
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 150 }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                {profileQuery.isError && (
                    <RefreshFailedBanner
                        className="mx-5 mt-3"
                        onRetry={refetchProfile}
                        retrying={profileQuery.isFetching}
                    />
                )}

                {/* ─── Profile Card ─── */}
                <ProfileHeaderCard
                    className="mx-5 mt-3"
                    avatarUrl={userInfo.avatarUrl}
                    username={displayData.username}
                    nickname={userInfo.nickName}
                    countryFlag={userInfo.countryFlag}
                    countryName={userInfo.countryName}
                    region={userInfo.region}
                    socialLinks={withDiscordProfileLink(
                        mapSocialsToLinks(displayData.socials),
                        userInfo.discordUserId,
                        userInfo.discordUsername,
                    )}
                />

                {/* ─── Friend / Message / Block ─── */}
                <FriendActionBar otherUserId={id} otherUsername={displayData.username} otherAvatarUrl={userInfo.avatarUrl} />

                {/* Tabs Section */}
                <View className="mt-2 flex-1 min-h-[500px]">
                    <View className="px-5 mb-3">
                        <PremiumTabs
                            tabs={tabs}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                        />
                    </View>

                    <View className="px-5 pb-12 flex-1">
                        {activeTab === 'stats' && <ProfileStatsTab playerMatches={playerMatches} />}

                        {activeTab === 'tournaments' && (
                            <View className="gap-3">
                                {userTournaments.length > 0 ? (
                                    <>
                                        {userTournaments.map((row) => (
                                            <TournamentCard
                                                key={row.id}
                                                name={row.name || row.title}
                                                status={getTournamentStatus(row.status)}
                                                date={formatDateSafe(row.startDate, tCommon('app.notAvailableShort'))}
                                                dateIso={row.startDate}
                                                region={t('regionGlobal')}
                                                prizePool={`${getCurrencySymbol(row.prizeCurrency)}${row.prize}`}
                                                players={new Array(row.numberOfParticipants || 0).fill({})}
                                                onClick={() => openTournament(row.id)}
                                                hubName={row.hubName || row.HubName}
                                                hubAvatarUrl={row.hubAvatarUrl || row.HubAvatarUrl}
                                                isPrivate={!!(row.isPrivate ?? row.IsPrivate)}
                                            />
                                        ))}
                                        {tournamentsError && <LoadFailedState onRetry={loadMoreTournaments} retrying={isLoadingMoreTournaments} />}
                                        {hasMoreTournaments && isLoadingMoreTournaments && (
                                            <View className="mt-4 py-4 items-center justify-center">
                                                <ActivityIndicator size="small" color="#10B981" />
                                            </View>
                                        )}
                                    </>
                                ) : tournamentsError ? (
                                    <LoadFailedState onRetry={() => { setTournamentsError(false); loadMoreTournaments(); }} />
                                ) : hasMoreTournaments || isLoadingMoreTournaments ? (
                                    // The first page is still on its way — not "no tournaments" yet.
                                    <View className="py-10 items-center justify-center">
                                        <ActivityIndicator size="small" color="#10B981" />
                                    </View>
                                ) : (
                                    <EmptyState icon="trophy-outline" color={COLORS.warning} title={t('noTournamentsFound')} />
                                )}
                            </View>
                        )}

                        {activeTab === 'matches' && (
                            <View className="gap-3">
                                {userMatches.length > 0 ? (
                                    <>
                                        {userMatches.map((match, idx) => (
                                            <MatchHistoryCard
                                                key={idx}
                                                tournamentName={match.tournamentName || match.TournamentName || t('tournamentWord')}
                                                hubName={match.hubName || match.HubName || match.hub || match.Hub}
                                                userName={match.username || match.userName || match.Username || match.UserName || displayData.username}
                                                userAvatarUrl={match.userAvatarUrl || match.userAvatar || match.UserAvatarUrl || match.UserAvatar || userInfo.avatarUrl}
                                                opponentName={match.opponentName || match.OpponentName || t('opponent')}
                                                opponentAvatarUrl={match.opponentAvatarUrl || match.opponentAvatar || match.OpponentAvatarUrl || match.OpponentAvatar || ""}
                                                result={(
                                                    (match.userScore ?? match.UserScore) !== null &&
                                                    (match.userScore ?? match.UserScore) !== undefined &&
                                                    (match.opponentScore ?? match.OpponentScore) !== null &&
                                                    (match.opponentScore ?? match.OpponentScore) !== undefined &&
                                                    (match.userScore ?? match.UserScore) === (match.opponentScore ?? match.OpponentScore)
                                                ) ? 'draw' : (match.isWin === true || match.IsWin === true ? 'win' : (match.isWin === false || match.IsWin === false ? 'loss' : 'draw'))}
                                                userScore={match.userScore ?? match.UserScore ?? undefined}
                                                opponentScore={match.opponentScore ?? match.OpponentScore ?? undefined}
                                                date={formatDateSafe(match.scheduledTime || match.ScheduledTime, tCommon('app.notAvailableShort'))}
                                            />
                                        ))}
                                        {matchesError && <LoadFailedState onRetry={loadMoreMatches} retrying={isLoadingMoreMatches} />}
                                        {hasMoreMatches && isLoadingMoreMatches && (
                                            <View className="mt-4 py-4 items-center justify-center">
                                                <ActivityIndicator size="small" color="#10B981" />
                                            </View>
                                        )}
                                    </>
                                ) : matchesError ? (
                                    <LoadFailedState onRetry={() => { setMatchesError(false); loadMoreMatches(); }} />
                                ) : hasMoreMatches || isLoadingMoreMatches ? (
                                    <View className="py-10 items-center justify-center">
                                        <ActivityIndicator size="small" color="#10B981" />
                                    </View>
                                ) : (
                                    <EmptyState icon="game-controller-outline" color={COLORS.primary} title={t('noMatchHistory')} />
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            <SharePlayerCardModal
                visible={shareCardVisible}
                onClose={() => setShareCardVisible(false)}
                playerId={id}
                name={userInfo.nickName || userInfo.username || tCommon('player')}
                avatarUrl={userInfo.avatarUrl}
                stats={{
                    matches: displayData.totalMatches,
                    winRate: displayData.winPercentage,
                    wins: displayData.wins,
                    draws: displayData.draws,
                    losses: displayData.losses,
                    trophies: displayData.tournamentsWon,
                }}
            />
        </SafeAreaView>
    );
}
