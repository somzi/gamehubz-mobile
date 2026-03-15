import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { MatchHistoryCard } from '../components/cards/MatchHistoryCard';
import { CircularProgress } from '../components/ui/CircularProgress';
import { SocialLinks } from '../components/profile/SocialLinks';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { UserInfo, SocialType } from '../types/auth';
import { PlayerMatchesDto } from '../types/user';
import { cn } from '../lib/utils';
import { getSocialUrl } from '../lib/social';
import { Button } from '../components/ui/Button';
import { TournamentCard } from '../components/cards/TournamentCard';
import { Tabs } from '../components/ui/Tabs';

import { StackNavigationProp } from '@react-navigation/stack';

type PlayerProfileRouteProp = RouteProp<RootStackParamList, 'PlayerProfile'>;

const tabs = [
    { label: 'Stats', value: 'stats' },
    { label: 'Tournaments', value: 'tournaments' },
    { label: 'Matches', value: 'matches' },
];

export default function PlayerProfileScreen() {
    const route = useRoute<PlayerProfileRouteProp>();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { id } = route.params;

    const [activeTab, setActiveTab] = useState('stats');
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [playerMatches, setPlayerMatches] = useState<PlayerMatchesDto | null>(null);
    const [userTournaments, setUserTournaments] = useState<any[]>([]);
    const [tournamentsPage, setTournamentsPage] = useState(0);
    const [hasMoreTournaments, setHasMoreTournaments] = useState(true);
    const [isLoadingMoreTournaments, setIsLoadingMoreTournaments] = useState(false);

    const [userMatches, setUserMatches] = useState<any[]>([]);
    const [matchesPage, setMatchesPage] = useState(0);
    const [hasMoreMatches, setHasMoreMatches] = useState(true);
    const [isLoadingMoreMatches, setIsLoadingMoreMatches] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlayerData = async () => {
            if (!id) return;
            setIsLoading(true);
            setError(null);
            setTournamentsPage(0);
            setHasMoreTournaments(true);
            setMatchesPage(0);
            setHasMoreMatches(true);
            try {
                const [infoRes, statsRes, tournamentsRes, matchesRes] = await Promise.all([
                    authenticatedFetch(ENDPOINTS.GET_USER_INFO(id)),
                    authenticatedFetch(ENDPOINTS.GET_PLAYER_STATS(id)),
                    authenticatedFetch(ENDPOINTS.GET_PROFILE_TOURNAMENTS(id, 0)),
                    authenticatedFetch(ENDPOINTS.GET_PROFILE_MATCHES(id, 0))
                ]);

                if (infoRes.ok) {
                    const infoData = await infoRes.json();
                    const d = infoData.result || infoData;
                    setUserInfo({
                        ...d,
                        id: d.id || d.Id,
                        username: d.username || d.Username,
                        nickName: d.nickName || d.NickName || d.Nickname || d.nickname,
                        avatarUrl: d.avatarUrl || d.AvatarUrl || d.Avatar || d.avatar
                    });
                }

                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    const s = statsData.result || statsData;
                    const normalizedStats: PlayerMatchesDto = {
                        stats: s.stats || s.Stats ? {
                            totalMatches: s.stats?.TotalMatches || s.stats?.totalMatches || s.Stats?.TotalMatches || s.Stats?.totalMatches || 0,
                            wins: s.stats?.Wins || s.stats?.wins || s.Stats?.Wins || s.Stats?.wins || 0,
                            losses: s.stats?.Losses || s.stats?.losses || s.Stats?.Losses || s.Stats?.losses || 0,
                            draws: s.stats?.Draws || s.stats?.draws || s.Stats?.Draws || s.Stats?.draws || 0,
                            tournamentsWon: s.stats?.tournamentsWon || s.Stats?.tournamentsWon || s.stats?.tournamentsWon || 0,
                            winRate: s.stats?.WinRate || s.stats?.winRate || s.Stats?.WinRate || s.Stats?.winRate || 0,
                        } : null,
                        performance: (s.performance || s.Performance || []).map((m: any) => ({
                            isWin: m.IsWin !== undefined ? m.IsWin : m.isWin
                        }))
                    };
                    setPlayerMatches(normalizedStats);
                }

                if (tournamentsRes.ok) {
                    const tournamentsData = await tournamentsRes.json();
                    const items = tournamentsData.items || tournamentsData.Items || tournamentsData.result || tournamentsData;
                    const itemsArray = Array.isArray(items) ? items : [];
                    setUserTournaments(itemsArray);
                    setHasMoreTournaments(itemsArray.length === 10);
                }

                if (matchesRes.ok) {
                    const matchesData = await matchesRes.json();
                    const items = matchesData.items || matchesData.Items || matchesData.result || matchesData;
                    const itemsArray = Array.isArray(items) ? items : [];
                    setUserMatches(itemsArray);
                    setHasMoreMatches(itemsArray.length === 10);
                }

                if (!infoRes.ok && !statsRes.ok) {
                    throw new Error('Could not load player data');
                }
            } catch (err: any) {
                console.error('Player data fetch error:', err);
                setError(err.message || 'Failed to load player profile');
            } finally {
                setIsLoading(false);
            }
        };

        fetchPlayerData();
    }, [id]);

    const loadMoreTournaments = async () => {
        if (!id || isLoadingMoreTournaments || !hasMoreTournaments) return;

        setIsLoadingMoreTournaments(true);
        const nextPage = tournamentsPage + 1;

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_TOURNAMENTS(id, nextPage));
            if (response.ok) {
                const data = await response.json();
                const items = data.items || data.Items || data.result || data;
                const itemsArray = Array.isArray(items) ? items : [];

                setUserTournaments(prev => [...prev, ...itemsArray]);
                setTournamentsPage(nextPage);
                setHasMoreTournaments(itemsArray.length === 10);
            } else {
                setHasMoreTournaments(false);
            }
        } catch (error) {
            console.error('Error fetching more tournaments:', error);
            setHasMoreTournaments(false);
        } finally {
            setIsLoadingMoreTournaments(false);
        }
    };

    const loadMoreMatches = async () => {
        if (!id || isLoadingMoreMatches || !hasMoreMatches) return;

        setIsLoadingMoreMatches(true);
        const nextPage = matchesPage + 1;

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_MATCHES(id, nextPage));
            if (response.ok) {
                const data = await response.json();
                const items = data.items || data.Items || data.result || data;
                const itemsArray = Array.isArray(items) ? items : [];

                setUserMatches(prev => [...prev, ...itemsArray]);
                setMatchesPage(nextPage);
                setHasMoreMatches(itemsArray.length === 10);
            } else {
                setHasMoreMatches(false);
            }
        } catch (error) {
            console.error('Error fetching more matches:', error);
            setHasMoreMatches(false);
        } finally {
            setIsLoadingMoreMatches(false);
        }
    };


    const getRegionName = (region?: number) => {
        switch (region) {
            case 1: return 'North America';
            case 2: return 'Europe';
            case 3: return 'Asia';
            case 4: return 'South America';
            case 5: return 'Africa';
            case 6: return 'Oceania';
            default: return 'Global';
        }
    };

    const mapSocialsToLinks = (socials: any[]) => {
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

    const getTournamentStatus = (status: number): 'live' | 'upcoming' | 'completed' => {
        switch (status) {
            case 3: return 'live';
            case 4: return 'completed';
            default: return 'upcoming';
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <View className="flex-row items-center px-6 py-2">
                    <Pressable onPress={() => navigation.goBack()} className="p-2 -ml-2">
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </Pressable>
                </View>
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text className="text-muted-foreground mt-4">Loading stats...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error || !userInfo) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <View className="flex-row items-center px-6 py-2">
                    <Pressable onPress={() => navigation.goBack()} className="p-2 -ml-2">
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </Pressable>
                </View>
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-destructive mt-4 text-center font-medium">{error || 'Player not found'}</Text>
                </View>
            </SafeAreaView>
        );
    }

    const displayData = {
        username: userInfo.username || 'Unknown',
        nickName: userInfo.nickName || userInfo.username || 'No Nickname',
        region: getRegionName(userInfo.region),
        totalMatches: playerMatches?.stats?.totalMatches || 0,
        winPercentage: playerMatches?.stats?.winRate || 0,
        wins: playerMatches?.stats?.wins || 0,
        losses: playerMatches?.stats?.losses || 0,
        draws: playerMatches?.stats?.draws || 0,
        tournamentsWon: playerMatches?.stats?.tournamentsWon || 0,
        socials: userInfo.userSocials || []
    };

    const performanceList = playerMatches?.performance || [];

    const handleScroll = (event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const paddingToBottom = 50;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            if (activeTab === 'tournaments' && hasMoreTournaments && !isLoadingMoreTournaments) {
                loadMoreTournaments();
            } else if (activeTab === 'matches' && hasMoreMatches && !isLoadingMoreMatches) {
                loadMoreMatches();
            }
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            {/* Top Bar with Back Button */}
            <View className="flex-row items-center justify-between px-6 py-2">
                <Pressable
                    onPress={() => navigation.goBack()}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                </Pressable>
                <Text className="text-lg font-black text-white tracking-tight">Player Profile</Text>
                <View className="w-10" />
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 150 }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                {/* Profile Header Section */}
                <View className="px-5 mt-4">
                    <View className="bg-[#131B2E] rounded-[28px] p-5 border border-white/5">
                        <View className="flex-row items-center">
                            <View className="mr-5">
                                <View className="p-[3px] rounded-full border-2 border-[#10B981]">
                                    <PlayerAvatar src={userInfo.avatarUrl} name={displayData.username} size="lg" className="border-0" />
                                </View>
                            </View>
                            <View className="flex-1 justify-center">
                                <Text className="text-3xl font-black text-white">{displayData.username}</Text>
                                <View className="flex-row items-center mt-1.5">
                                    <Ionicons name="game-controller" size={16} color="#10B981" />
                                    <Text className="text-[#10B981] font-bold text-base ml-1.5">{displayData.nickName}</Text>
                                </View>
                                <View className="flex-row items-center mt-1.5">
                                    <Ionicons name="globe-outline" size={16} color="#94A3B8" />
                                    <Text className="text-gray-400 font-bold text-xs ml-1.5 uppercase tracking-widest">{displayData.region}</Text>
                                </View>
                            </View>
                        </View>
                        <View className="mt-5 border-t border-white/5 pt-4 items-center">
                            <SocialLinks links={mapSocialsToLinks(displayData.socials)} className="justify-center" />
                        </View>
                    </View>
                </View>

                {/* ─── Stats Ribbon ─── */}
                <View className="flex-row mx-5 bg-[#131B2E] rounded-[28px] p-1.5 border border-white/5 mt-4">
                    <View className="flex-1 py-4 items-center">
                        <View className="w-9 h-9 rounded-xl bg-indigo-500/10 items-center justify-center mb-2.5 border border-indigo-500/20">
                            <Ionicons name="game-controller" size={18} color="#818CF8" />
                        </View>
                        <Text className="text-white text-xl font-black">{displayData.totalMatches}</Text>
                        <Text className="text-slate-500 text-[8px] uppercase font-black tracking-widest mt-0.5">Matches</Text>
                    </View>
                    <View className="w-[1px] bg-white/5 my-3" />
                    <View className="flex-1 py-4 items-center">
                        <View className="w-9 h-9 rounded-xl bg-amber-500/10 items-center justify-center mb-2.5 border border-amber-500/20">
                            <Ionicons name="star" size={18} color="#FBBF24" />
                        </View>
                        <Text className="text-white text-xl font-black">{displayData.wins}</Text>
                        <Text className="text-slate-500 text-[8px] uppercase font-black tracking-widest mt-0.5">Wins</Text>
                    </View>
                    <View className="w-[1px] bg-white/5 my-3" />
                    <View className="flex-1 py-4 items-center">
                        <View className="w-9 h-9 rounded-xl bg-emerald-500/10 items-center justify-center mb-2.5 border border-emerald-500/20">
                            <Ionicons name="trophy" size={18} color="#34D399" />
                        </View>
                        <Text className="text-white text-xl font-black">{displayData.tournamentsWon || 0}</Text>
                        <Text className="text-slate-500 text-[8px] uppercase font-black tracking-widest mt-0.5">Trophies</Text>
                    </View>
                </View>

                {/* Tabs Section */}
                <View className="mt-7 flex-1 min-h-[500px]">
                    <View className="px-5 mb-6">
                        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
                    </View>

                    <View className="px-5 pb-12 flex-1">
                        {activeTab === 'stats' && (
                            <View className="gap-4">
                                {/* Recent Form */}
                                <View className="bg-[#131B2E] rounded-[24px] p-5 border border-white/5">
                                    <View className="flex-row items-center justify-between mb-4">
                                        <View className="flex-row items-center gap-2">
                                            <View className="w-7 h-7 rounded-lg bg-indigo-500/10 items-center justify-center">
                                                <Ionicons name="trending-up" size={14} color="#818CF8" />
                                            </View>
                                            <Text className="text-[11px] font-black text-white uppercase tracking-widest">Recent Form</Text>
                                        </View>
                                        {performanceList.length > 0 && (
                                            <View className="flex-row items-center gap-3">
                                                <View className="flex-row items-center gap-1">
                                                    <View className="w-2 h-2 rounded-full bg-[#10B981]" />
                                                    <Text className="text-[9px] text-slate-500 font-bold uppercase">W</Text>
                                                </View>
                                                <View className="flex-row items-center gap-1">
                                                    <View className="w-2 h-2 rounded-full bg-[#EF4444]" />
                                                    <Text className="text-[9px] text-slate-500 font-bold uppercase">L</Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                    {performanceList.length > 0 ? (
                                        <>
                                            <View className="flex-row items-center justify-center gap-1.5">
                                                {[...performanceList].reverse().slice(-10).map((match, i) => (
                                                    <View key={i} className="flex-1 items-center">
                                                        <View
                                                            className={cn(
                                                                "w-8 h-8 rounded-xl items-center justify-center",
                                                                match.isWin ? "bg-[#10B981]/15 border border-[#10B981]/40" : "bg-[#EF4444]/15 border border-[#EF4444]/40"
                                                            )}
                                                        >
                                                            <Text className={cn(
                                                                "text-[10px] font-black",
                                                                match.isWin ? "text-[#10B981]" : "text-[#EF4444]"
                                                            )}>
                                                                {match.isWin ? 'W' : 'L'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                ))}
                                                {Array.from({ length: Math.max(0, 10 - performanceList.length) }).map((_, i) => (
                                                    <View key={`empty-${i}`} className="flex-1 items-center">
                                                        <View className="w-8 h-8 rounded-xl items-center justify-center bg-white/5 border border-white/5">
                                                            <Text className="text-[10px] font-black text-white/15">-</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                            <View className="flex-row items-center justify-between mt-3 px-0.5">
                                                <Text className="text-[8px] text-slate-600 font-bold uppercase tracking-wider">Oldest</Text>
                                                <View className="flex-1 mx-2 flex-row items-center">
                                                    <View className="flex-1 h-[1px] bg-white/5" />
                                                    <Ionicons name="chevron-forward" size={10} color="rgba(255,255,255,0.1)" />
                                                </View>
                                                <Text className="text-[8px] text-slate-600 font-bold uppercase tracking-wider">Latest</Text>
                                            </View>
                                        </>
                                    ) : (
                                        <View className="items-center py-6">
                                            <Ionicons name="analytics-outline" size={32} color="#1E293B" />
                                            <Text className="text-slate-600 text-xs mt-2">No performance data yet</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Win Rate Card */}
                                <View className="bg-[#131B2E] rounded-[24px] p-5 border border-white/5">
                                    <View className="flex-row items-center gap-2 mb-5">
                                        <View className="w-7 h-7 rounded-lg bg-emerald-500/10 items-center justify-center">
                                            <Ionicons name="stats-chart" size={14} color="#34D399" />
                                        </View>
                                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">Match Statistics</Text>
                                    </View>

                                    <View className="flex-row items-center">
                                        {/* Left Side - W/D/L */}
                                        <View className="flex-1 pr-5">
                                            <View className="bg-[#10B981]/8 rounded-2xl p-4 mb-2 border border-[#10B981]/10">
                                                <View className="flex-row items-center justify-between">
                                                    <View className="flex-row items-center gap-2.5">
                                                        <View className="w-1.5 h-5 bg-[#10B981] rounded-full" />
                                                        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Wins</Text>
                                                    </View>
                                                    <Text className="text-[#10B981] text-xl font-black">{displayData.wins}</Text>
                                                </View>
                                            </View>
                                            <View className="bg-[#EAB308]/8 rounded-2xl p-4 mb-2 border border-[#EAB308]/10">
                                                <View className="flex-row items-center justify-between">
                                                    <View className="flex-row items-center gap-2.5">
                                                        <View className="w-1.5 h-5 bg-[#EAB308] rounded-full" />
                                                        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Draws</Text>
                                                    </View>
                                                    <Text className="text-[#EAB308] text-xl font-black">{displayData.draws}</Text>
                                                </View>
                                            </View>
                                            <View className="bg-[#EF4444]/8 rounded-2xl p-4 border border-[#EF4444]/10">
                                                <View className="flex-row items-center justify-between">
                                                    <View className="flex-row items-center gap-2.5">
                                                        <View className="w-1.5 h-5 bg-[#EF4444] rounded-full" />
                                                        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Losses</Text>
                                                    </View>
                                                    <Text className="text-[#EF4444] text-xl font-black">{displayData.losses}</Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Right Side - Chart */}
                                        <View className="w-[110px] h-[110px] relative items-center justify-center">
                                            <CircularProgress
                                                percentage={Math.round(displayData.winPercentage)}
                                                size={110}
                                                strokeWidth={12}
                                                color="#10B981"
                                                showText={false}
                                            />
                                            <View className="absolute inset-0 items-center justify-center">
                                                <Text className="text-slate-500 text-[7px] uppercase font-black tracking-widest mb-[-1px]">Win Rate</Text>
                                                <Text className="text-white text-2xl font-black">{Math.round(displayData.winPercentage)}%</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        )}

                        {activeTab === 'tournaments' && (
                            <View className="gap-3">
                                {userTournaments.length > 0 ? (
                                    <>
                                        {userTournaments.map((t) => (
                                            <TournamentCard
                                                key={t.id}
                                                name={t.name || t.title}
                                                status={getTournamentStatus(t.status)}
                                                date={t.startDate ? new Date(t.startDate).toLocaleDateString() : 'N/A'}
                                                region="Global"
                                                prizePool={`${t.prizeCurrency === 1 ? '$' : t.prizeCurrency === 2 ? '€' : ''}${t.prize}`}
                                                players={new Array(t.numberOfParticipants || 0).fill({})}
                                                onClick={() => navigation.navigate('TournamentDetails', { id: t.id })}
                                                hubName={t.hubName || t.HubName}
                                                hubAvatarUrl={t.hubAvatarUrl || t.HubAvatarUrl}
                                            />
                                        ))}
                                        {hasMoreTournaments && isLoadingMoreTournaments && (
                                            <View className="mt-4 py-4 items-center justify-center">
                                                <ActivityIndicator size="small" color="#10B981" />
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <View className="bg-[#131B2E] rounded-[24px] p-10 border border-white/5 items-center">
                                        <Ionicons name="trophy-outline" size={48} color="#1E293B" />
                                        <Text className="text-slate-600 mt-4 text-center text-sm">No tournaments found.</Text>
                                    </View>
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
                                                tournamentName={match.tournamentName || match.TournamentName || "Tournament"}
                                                hubName={match.hubName || match.HubName || match.hub || match.Hub}
                                                userName={match.username || match.userName || match.Username || match.UserName || displayData.username}
                                                userAvatarUrl={match.userAvatarUrl || match.userAvatar || match.UserAvatarUrl || match.UserAvatar || userInfo.avatarUrl}
                                                opponentName={match.opponentName || match.OpponentName || "Opponent"}
                                                opponentAvatarUrl={match.opponentAvatarUrl || match.opponentAvatar || match.OpponentAvatarUrl || match.OpponentAvatar || ""}
                                                result={match.isWin === true || match.IsWin === true ? 'win' : (match.isWin === false || match.IsWin === false ? 'loss' : 'draw')}
                                                userScore={match.userScore ?? match.UserScore ?? undefined}
                                                opponentScore={match.opponentScore ?? match.OpponentScore ?? undefined}
                                                date={match.scheduledTime || match.ScheduledTime ? new Date(match.scheduledTime || match.ScheduledTime).toLocaleDateString() : 'N/A'}
                                            />
                                        ))}
                                        {hasMoreMatches && isLoadingMoreMatches && (
                                            <View className="mt-4 py-4 items-center justify-center">
                                                <ActivityIndicator size="small" color="#10B981" />
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <View className="bg-[#131B2E] rounded-[24px] p-10 border border-white/5 items-center">
                                        <Ionicons name="documents-outline" size={48} color="#1E293B" />
                                        <Text className="text-slate-600 mt-4 text-center text-sm">No match history available yet.</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
