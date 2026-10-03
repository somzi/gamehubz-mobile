import { useRequestGate } from '../hooks/useRequestGate';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MatchHistoryCard } from '../components/cards/MatchHistoryCard';
import { ProfileHeaderCard } from '../components/profile/ProfileHeaderCard';
import { ProfileStatsTab } from '../components/profile/ProfileStatsTab';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { normalizePlayerMatches } from '../lib/profileQueries';
import { PlayerMatchesDto } from '../types/user';
import { SocialType } from '../types/auth';
import { parseUtcDate, formatDateSafe, getCurrencySymbol } from '../lib/utils';
import { getSocialUrl, withDiscordProfileLink } from '../lib/social';
import { SharePlayerCardModal } from '../components/modals/SharePlayerCardModal';
import { TournamentCard } from '../components/cards/TournamentCard';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { EmptyState, LoadFailedState } from '../components/ui/EmptyState';
import { COLORS } from '../lib/theme';


// Module scope: keys, not text — labels are resolved per render in the component.
const TAB_DEFS = [
    { labelKey: 'tabStats', value: 'stats', icon: 'stats-chart' },
    { labelKey: 'tabTournaments', value: 'tournaments', icon: 'trophy-outline' },
    { labelKey: 'tabMatches', value: 'matches', icon: 'game-controller-outline' },
];

export default function ProfileScreen() {
    const { t } = useTranslation('profile');
    const { t: tCommon } = useTranslation('common');
    const tabs: PremiumTabItem[] = TAB_DEFS.map(d => ({ ...d, label: t(d.labelKey) })) as PremiumTabItem[];
    const { user, refreshUser } = useAuth();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [activeTab, setActiveTab] = useState('stats');
    const [playerMatches, setPlayerMatches] = useState<PlayerMatchesDto | null>(null);
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

    // When the stats last loaded — the focus refetch below skips anything fresher than 30s.
    const statsLoadedAtRef = useRef(0);
    const [error, setError] = useState<string | null>(null);
    const [shareCardVisible, setShareCardVisible] = useState(false);

    // Stable so the memoized TournamentCard doesn't invalidate on every parent
    // re-render (tab-flip, badge tick, pagination). Note: the map below still
    // creates a fresh `() => openTournament(row.id)` per row, so memo bails on
    // that lambda alone — collapsing that fully would require either changing
    // TournamentCard's onClick signature to accept an id or lifting each row
    // into its own memoized child, both of which are out of scope here.
    const openTournament = useCallback(
        (id: string) => navigation.navigate('TournamentDetails', { id }),
        [navigation],
    );

    // Stats only. The tournament / match lists keep their pages: resetting the cursors here while the
    // rows stayed on screen made the next "load more" fetch page 0 again and append it a second time.
    const fetchDetailedData = useCallback(async () => {
        if (!user?.id) return;
        setError(null);
        try {
            const statsRes = await authenticatedFetch(ENDPOINTS.GET_PLAYER_STATS(user.id));

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setPlayerMatches(normalizePlayerMatches(statsData.result || statsData));
                statsLoadedAtRef.current = Date.now();
            }

        } catch (error: any) {
            console.error('Error fetching profile detailed data:', error);
            setError(t('refreshStatsFailed'));
        }
    }, [user?.id]);

    const listRequests = useRequestGate(user?.id);
    const pageRequests = useMemo(() => new Set<string>(), [listRequests]);
    const loadMoreTournaments = async () => {
        if (!user?.id || isLoadingMoreTournaments || !hasMoreTournaments) return;

        const requestKey = 'tournaments:' + user?.id;
        if (pageRequests.has(requestKey)) return;
        pageRequests.add(requestKey);
        const current = listRequests.begin('tournaments');
        setTournamentsError(false);
        setIsLoadingMoreTournaments(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_TOURNAMENTS(user.id, tournamentsPage));
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
        if (!user?.id || isLoadingMoreMatches || !hasMoreMatches) return;

        const requestKey = 'matches:' + user?.id;
        if (pageRequests.has(requestKey)) return;
        pageRequests.add(requestKey);
        const current = listRequests.begin('matches');
        setMatchesError(false);
        setIsLoadingMoreMatches(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_MATCHES(user.id, matchesPage));
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

    useEffect(() => {
        if (activeTab === 'tournaments' && userTournaments.length === 0 && hasMoreTournaments && !isLoadingMoreTournaments) {
            loadMoreTournaments();
        } else if (activeTab === 'matches' && userMatches.length === 0 && hasMoreMatches && !isLoadingMoreMatches) {
            loadMoreMatches();
        }
    }, [activeTab, userMatches.length, userTournaments.length]);

    // Refresh the user's stats + profile silently when the tab regains focus. Do NOT
    // reset the tournaments / matches lists — those are paginated and blowing them away
    // would drop the user's scroll position and re-fetch page 0 every time they hop
    // between bottom tabs. Explicit pull-to-refresh (if added) should call fetchDetailedData
    // + reset separately.
    // Same 30s rule as the other tabs (useRefetchOnFocusIfStale): hopping between tabs used to
    // refetch the user and the stats on every single visit.
    useFocusEffect(
        useCallback(() => {
            if (!user?.id) return;
            if (Date.now() - statsLoadedAtRef.current < 30_000) return;
            refreshUser();
            fetchDetailedData();
        }, [user?.id, refreshUser, fetchDetailedData])
    );

    const displayData = {
        username: user?.username || t('guest'),
        totalMatches: playerMatches?.stats?.totalMatches || 0,
        winPercentage: playerMatches?.stats?.winRate || 0,
        wins: playerMatches?.stats?.wins || 0,
        losses: playerMatches?.stats?.losses || 0,
        draws: playerMatches?.stats?.draws || 0,
        tournamentsWon: playerMatches?.stats?.tournamentsWon || 0,
        socials: user?.userSocials || []
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

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* Top Bar */}
            <View className="flex-row justify-between items-center px-6 py-2">
                <Text className="text-lg font-black text-white tracking-tight">{t('common:nav.profile')}</Text>
                <View className="flex-row items-center gap-2">
                    <Pressable
                        onPress={() => { if (user?.id) setShareCardVisible(true); }}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                        accessibilityLabel={t('shareProfile')}
                    >
                        <Ionicons name="share-outline" size={20} color="#FAFAFA" />
                    </Pressable>
                    <Pressable
                        onPress={() => navigation.navigate('Settings')}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
                    </Pressable>
                </View>
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                {/* ─── Profile Card ─── */}
                <ProfileHeaderCard
                    className="mx-5 mt-3"
                    avatarUrl={user?.avatarUrl}
                    username={displayData.username}
                    nickname={user?.nickName}
                    countryFlag={user?.countryFlag}
                    countryName={user?.countryName}
                    region={user?.region}
                    socialLinks={withDiscordProfileLink(
                        mapSocialsToLinks(displayData.socials),
                        user?.discordUserId,
                        user?.discordUsername,
                    )}
                />

                {/* ─── Tabs ─── */}
                <View className="mt-2">
                    <View className="px-5 mb-3">
                        <PremiumTabs
                            tabs={tabs}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                        />
                    </View>

                    <View className="px-5 pb-12">
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
                                                tournamentName={match.tournamentName || match.TournamentName || t('matchWord')}
                                                hubName={match.hubName || match.HubName || match.hub || match.Hub}
                                                userName={match.username || match.userName || match.Username || match.UserName || displayData.username}
                                                userAvatarUrl={match.userAvatarUrl || match.userAvatar || match.UserAvatarUrl || match.UserAvatar || user?.avatarUrl}
                                                opponentName={match.opponentName || match.OpponentName || t('opponent')}
                                                opponentAvatarUrl={match.opponentAvatarUrl || match.opponentAvatar || match.OpponentAvatarUrl || match.OpponentAvatar}
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

            {user?.id && (
                <SharePlayerCardModal
                    visible={shareCardVisible}
                    onClose={() => setShareCardVisible(false)}
                    playerId={user.id}
                    name={user.nickName || user.username || tCommon('player')}
                    avatarUrl={user.avatarUrl}
                    stats={{
                        matches: displayData.totalMatches,
                        winRate: displayData.winPercentage,
                        wins: displayData.wins,
                        draws: displayData.draws,
                        losses: displayData.losses,
                        trophies: displayData.tournamentsWon,
                    }}
                />
            )}
        </SafeAreaView>
    );
}
