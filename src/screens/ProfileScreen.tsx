import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { MatchHistoryCard } from '../components/cards/MatchHistoryCard';
import { CircularProgress } from '../components/ui/CircularProgress';
import { SocialLinks } from '../components/profile/SocialLinks';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PlayerMatchesDto } from '../types/user';
import { SocialType } from '../types/auth';
import { cn, parseUtcDate, formatDateSafe, getCurrencySymbol } from '../lib/utils';
import { getSocialUrl, withDiscordProfileLink } from '../lib/social';
import { SharePlayerCardModal } from '../components/modals/SharePlayerCardModal';
import { TournamentCard } from '../components/cards/TournamentCard';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';


const tabs: PremiumTabItem[] = [
    { label: 'Stats', value: 'stats', icon: 'stats-chart' },
    { label: 'Tournaments', value: 'tournaments', icon: 'trophy-outline' },
    { label: 'Matches', value: 'matches', icon: 'game-controller-outline' },
];

export default function ProfileScreen() {
    const { user, refreshUser } = useAuth();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [activeTab, setActiveTab] = useState('stats');
    const [playerMatches, setPlayerMatches] = useState<PlayerMatchesDto | null>(null);
    const [userTournaments, setUserTournaments] = useState<any[]>([]);
    const [tournamentsPage, setTournamentsPage] = useState(0);
    const [hasMoreTournaments, setHasMoreTournaments] = useState(true);
    const [isLoadingMoreTournaments, setIsLoadingMoreTournaments] = useState(false);

    const [userMatches, setUserMatches] = useState<any[]>([]);
    const [matchesPage, setMatchesPage] = useState(0);
    const [hasMoreMatches, setHasMoreMatches] = useState(true);
    const [isLoadingMoreMatches, setIsLoadingMoreMatches] = useState(false);

    const [isLoadingData, setIsLoadingData] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareCardVisible, setShareCardVisible] = useState(false);

    // Stable so the memoized TournamentCard doesn't invalidate on every parent
    // re-render (tab-flip, badge tick, pagination). Note: the map below still
    // creates a fresh `() => openTournament(t.id)` per row, so memo bails on
    // that lambda alone — collapsing that fully would require either changing
    // TournamentCard's onClick signature to accept an id or lifting each row
    // into its own memoized child, both of which are out of scope here.
    const openTournament = useCallback(
        (id: string) => navigation.navigate('TournamentDetails', { id }),
        [navigation],
    );

    const fetchDetailedData = useCallback(async () => {
        if (!user?.id) return;
        setIsLoadingData(true);
        setError(null);
        setTournamentsPage(0);
        setHasMoreTournaments(true);
        setMatchesPage(0);
        setHasMoreMatches(true);
        try {
            const statsRes = await authenticatedFetch(ENDPOINTS.GET_PLAYER_STATS(user.id));

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
                        outcome: (m.outcome || m.Outcome || 'L') as 'W' | 'L' | 'D'
                    }))
                };
                setPlayerMatches(normalizedStats);
            }

        } catch (error: any) {
            console.error('Error fetching profile detailed data:', error);
            setError('Failed to refresh stats');
        } finally {
            setIsLoadingData(false);
        }
    }, [user?.id]);

    const loadMoreTournaments = async () => {
        if (!user?.id || isLoadingMoreTournaments || !hasMoreTournaments) return;

        setIsLoadingMoreTournaments(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_TOURNAMENTS(user.id, tournamentsPage));
            if (response.ok) {
                const data = await response.json();
                const items = data.items || data.Items || data.result || data;
                const itemsArray = Array.isArray(items) ? items : [];

                setUserTournaments(prev => {
                    const existingIds = new Set(prev.map((t: any) => t.id || t.Id));
                    const newItems = itemsArray.filter((t: any) => !existingIds.has(t.id || t.Id));
                    return [...prev, ...newItems];
                });
                setTournamentsPage(prev => prev + 1);
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
        if (!user?.id || isLoadingMoreMatches || !hasMoreMatches) return;

        setIsLoadingMoreMatches(true);

        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PROFILE_MATCHES(user.id, matchesPage));
            if (response.ok) {
                const data = await response.json();
                const items = data.items || data.Items || data.result || data;
                const itemsArray = Array.isArray(items) ? items : [];

                setUserMatches(prev => [...prev, ...itemsArray]);
                setMatchesPage(prev => prev + 1);
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
    useFocusEffect(
        useCallback(() => {
            if (user?.id) {
                refreshUser();
                fetchDetailedData();
            }
        }, [user?.id, refreshUser, fetchDetailedData])
    );

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

    const displayData = {
        username: user?.username || 'Guest',
        nickName: user?.nickName || 'No Nickname',
        region: getRegionName(user?.region),
        countryName: user?.countryName || null,
        countryFlag: user?.countryFlag || null,
        totalMatches: playerMatches?.stats?.totalMatches || 0,
        winPercentage: playerMatches?.stats?.winRate || 0,
        wins: playerMatches?.stats?.wins || 0,
        losses: playerMatches?.stats?.losses || 0,
        draws: playerMatches?.stats?.draws || 0,
        tournamentsWon: playerMatches?.stats?.tournamentsWon || 0,
        socials: user?.userSocials || []
    };

    const performanceList = playerMatches?.performance || [];

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
            if (activeTab === 'tournaments' && hasMoreTournaments && !isLoadingMoreTournaments) {
                loadMoreTournaments();
            } else if (activeTab === 'matches' && hasMoreMatches && !isLoadingMoreMatches) {
                loadMoreMatches();
            }
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* Top Bar */}
            <View className="flex-row justify-between items-center px-6 py-2">
                <Text className="text-lg font-black text-white tracking-tight">Profile</Text>
                <View className="flex-row items-center gap-2">
                    <Pressable
                        onPress={() => { if (user?.id) setShareCardVisible(true); }}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                        accessibilityLabel="Share profile"
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
                <View className="mx-5 mt-3">
                    <View className="bg-card rounded-3xl p-5">
                        {/* Header: Avatar + Info side by side */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                            {/* Avatar with glow border */}
                            <View style={{
                                borderRadius: 999,
                                borderWidth: 2.5,
                                borderColor: 'rgba(16,185,129,0.5)',
                                padding: 3,
                                shadowColor: '#10B981',
                                shadowOffset: { width: 0, height: 0 },
                                shadowOpacity: 0.35,
                                shadowRadius: 10,
                                elevation: 6,
                            }}>
                                <PlayerAvatar src={user?.avatarUrl} name={displayData.username} size="xl" className="border-0" />
                            </View>
                            {/* Text info - flex: 1 prevents overlapping */}
                            <View style={{ flex: 1, flexShrink: 1 }}>
                                <Text
                                    className="text-xl font-black text-white tracking-tight"
                                    numberOfLines={1}
                                    style={{ flexShrink: 1 }}
                                >
                                    {displayData.username}
                                </Text>
                                <View style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                                    <View className="flex-row items-center bg-emerald-500/10 px-2.5 py-1 rounded-lg" style={{ flexShrink: 1 }}>
                                        <Ionicons name="game-controller" size={12} color="#10B981" />
                                        <Text
                                            className="text-primary font-bold text-xs ml-1.5"
                                            numberOfLines={1}
                                            style={{ flexShrink: 1 }}
                                        >
                                            {displayData.nickName}
                                        </Text>
                                    </View>
                                </View>
                                {displayData.countryName ? (
                                    <View className="mt-2">
                                        <View className="flex-row items-center mb-1">
                                            <View style={{ width: 18, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 13 }}>
                                                    {displayData.countryFlag ?? '🌐'}
                                                </Text>
                                            </View>
                                            <Text className="text-slate-200 font-black text-[11px] ml-1.5 uppercase tracking-[2px]">
                                                {displayData.countryName}
                                            </Text>
                                        </View>
                                        <View className="flex-row items-center">
                                            <View style={{ width: 18, alignItems: 'center' }}>
                                                <Ionicons name="globe-outline" size={11} color="#94A3B8" />
                                            </View>
                                            <Text className="text-slate-400 font-bold text-[10px] ml-1.5 uppercase tracking-[2px]">
                                                {displayData.region}
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    <View className="flex-row items-center mt-1.5">
                                        <Ionicons name="globe-outline" size={11} color="#64748B" />
                                        <Text className="text-slate-500 font-bold text-[10px] ml-1.5 uppercase tracking-widest">
                                            {displayData.region}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                        {(() => {
                            const socialLinks = withDiscordProfileLink(
                                mapSocialsToLinks(displayData.socials),
                                user?.discordUserId,
                                user?.discordUsername,
                            );
                            if (socialLinks.length === 0) return null;
                            return (
                                <View className="mt-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }}>
                                    <SocialLinks links={socialLinks} className="justify-center" />
                                </View>
                            );
                        })()}
                    </View>
                </View>

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
                        {activeTab === 'stats' && (
                            <View style={{ gap: 10 }}>
                                {/* ─── Quick Stats ─── */}
                                <View className="flex-row bg-card rounded-2xl p-1" style={{ gap: 2 }}>
                                    <View className="flex-1 py-2 items-center">
                                        <Text className="text-white text-base font-black">{displayData.totalMatches}</Text>
                                        <Text className="text-slate-600 text-[7px] uppercase font-black tracking-[2px]">Played</Text>
                                    </View>
                                    <View className="w-[1px] bg-white/[0.04] my-2" />
                                    <View className="flex-1 py-2 items-center">
                                        <Text className="text-primary text-base font-black">{displayData.wins}</Text>
                                        <Text className="text-slate-600 text-[7px] uppercase font-black tracking-[2px]">Wins</Text>
                                    </View>
                                    <View className="w-[1px] bg-white/[0.04] my-2" />
                                    <View className="flex-1 py-2 items-center">
                                        <Text className="text-amber-400 text-base font-black">{displayData.tournamentsWon || 0}</Text>
                                        <Text className="text-slate-600 text-[7px] uppercase font-black tracking-[2px]">Trophies</Text>
                                    </View>
                                    <View className="w-[1px] bg-white/[0.04] my-2" />
                                    <View className="flex-1 py-2 items-center">
                                        <Text className="text-indigo-400 text-base font-black">{Math.round(displayData.winPercentage)}%</Text>
                                        <Text className="text-slate-600 text-[7px] uppercase font-black tracking-[2px]">Win %</Text>
                                    </View>
                                </View>

                                {/* ─── Recent Form ─── */}
                                <View className="bg-card rounded-3xl p-4">
                                    <View className="flex-row items-center justify-between mb-3">
                                        <View className="flex-row items-center" style={{ gap: 8 }}>
                                            <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center">
                                                <Ionicons name="trending-up" size={14} color="#818CF8" />
                                            </View>
                                            <Text className="text-[11px] font-black text-white uppercase tracking-widest">Recent Form</Text>
                                        </View>
                                        {performanceList.length > 0 && (
                                            <View className="flex-row items-center" style={{ gap: 8 }}>
                                                <View className="flex-row items-center" style={{ gap: 3 }}>
                                                    <View className="w-2 h-2 rounded-full bg-primary" />
                                                    <Text className="text-[8px] text-slate-500 font-bold uppercase">Win</Text>
                                                </View>
                                                <View className="flex-row items-center" style={{ gap: 3 }}>
                                                    <View className="w-2 h-2 rounded-full bg-yellow-500" />
                                                    <Text className="text-[8px] text-slate-500 font-bold uppercase">Draw</Text>
                                                </View>
                                                <View className="flex-row items-center" style={{ gap: 3 }}>
                                                    <View className="w-2 h-2 rounded-full bg-destructive" />
                                                    <Text className="text-[8px] text-slate-500 font-bold uppercase">Loss</Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                    {performanceList.length > 0 ? (
                                        <>
                                            <View className="flex-row items-center justify-center" style={{ gap: 5 }}>
                                                {[...performanceList].reverse().slice(-10).map((match, i) => (
                                                    <View key={i} className="flex-1 items-center">
                                                        <View
                                                            className={cn(
                                                                "w-7 h-7 rounded-lg items-center justify-center",
                                                                match.outcome === 'W' ? "bg-primary/15" : match.outcome === 'D' ? "bg-yellow-500/15" : "bg-destructive/15"
                                                            )}
                                                            style={{ borderWidth: 1.5, borderColor: match.outcome === 'W' ? 'rgba(16,185,129,0.3)' : match.outcome === 'D' ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)' }}
                                                        >
                                                            <Text className={cn(
                                                                "text-[10px] font-black",
                                                                match.outcome === 'W' ? "text-primary" : match.outcome === 'D' ? "text-yellow-500" : "text-destructive"
                                                            )}>
                                                                {match.outcome}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                ))}
                                                {Array.from({ length: Math.max(0, 10 - performanceList.length) }).map((_, i) => (
                                                    <View key={`empty-${i}`} className="flex-1 items-center">
                                                        <View
                                                            className="w-7 h-7 rounded-lg items-center justify-center bg-white/[0.03]"
                                                            style={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.04)' }}
                                                        >
                                                            <Text className="text-[10px] font-black text-white/10">-</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                            <View className="flex-row items-center justify-between mt-2 px-1">
                                                <Text className="text-[7px] text-slate-600 font-bold uppercase tracking-wider">Oldest</Text>
                                                <View className="flex-1 mx-3 h-[1px] bg-white/[0.04]" />
                                                <Text className="text-[7px] text-slate-600 font-bold uppercase tracking-wider">Latest</Text>
                                            </View>
                                        </>
                                    ) : (
                                        <View className="items-center py-4">
                                            <Ionicons name="analytics-outline" size={28} color="#1E293B" />
                                            <Text className="text-slate-600 text-[10px] mt-2">No performance data yet</Text>
                                        </View>
                                    )}
                                </View>

                                {/* ─── Win Rate Hero ─── */}
                                <View className="bg-card rounded-3xl p-5 items-center">
                                    <View style={{
                                        width: 100,
                                        height: 100,
                                        position: 'relative',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: 14,
                                        shadowColor: '#10B981',
                                        shadowOffset: { width: 0, height: 0 },
                                        shadowOpacity: 0.3,
                                        shadowRadius: 14,
                                        elevation: 4,
                                    }}>
                                        <CircularProgress
                                            percentage={Math.round(displayData.winPercentage)}
                                            size={100}
                                            strokeWidth={9}
                                            color="#10B981"
                                            backgroundColor="#1E293B"
                                            showText={false}
                                        />
                                        <View className="absolute inset-0 items-center justify-center">
                                            <Text className="text-white text-2xl font-black">{Math.round(displayData.winPercentage)}%</Text>
                                            <Text className="text-slate-500 text-[7px] uppercase font-black tracking-[2px]">Win Rate</Text>
                                        </View>
                                    </View>

                                    {/* ─── W / D / L Horizontal Bars ─── */}
                                    <View className="w-full" style={{ gap: 8 }}>
                                        <View>
                                            <View className="flex-row items-center justify-between mb-1">
                                                <View className="flex-row items-center" style={{ gap: 6 }}>
                                                    <View className="w-2 h-2 rounded-full bg-primary" />
                                                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Wins</Text>
                                                </View>
                                                <Text className="text-primary text-sm font-black">{displayData.wins}</Text>
                                            </View>
                                            <View className="bg-white/[0.04] rounded-full overflow-hidden" style={{ height: 6 }}>
                                                <View
                                                    className="h-full bg-primary rounded-full"
                                                    style={{ width: displayData.totalMatches > 0 ? `${(displayData.wins / displayData.totalMatches) * 100}%` : '0%' }}
                                                />
                                            </View>
                                        </View>
                                        <View>
                                            <View className="flex-row items-center justify-between mb-1">
                                                <View className="flex-row items-center" style={{ gap: 6 }}>
                                                    <View className="w-2 h-2 rounded-full bg-yellow-500" />
                                                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Draws</Text>
                                                </View>
                                                <Text className="text-yellow-500 text-sm font-black">{displayData.draws}</Text>
                                            </View>
                                            <View className="bg-white/[0.04] rounded-full overflow-hidden" style={{ height: 6 }}>
                                                <View
                                                    className="h-full bg-yellow-500 rounded-full"
                                                    style={{ width: displayData.totalMatches > 0 ? `${(displayData.draws / displayData.totalMatches) * 100}%` : '0%' }}
                                                />
                                            </View>
                                        </View>
                                        <View>
                                            <View className="flex-row items-center justify-between mb-1">
                                                <View className="flex-row items-center" style={{ gap: 6 }}>
                                                    <View className="w-2 h-2 rounded-full bg-destructive" />
                                                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Losses</Text>
                                                </View>
                                                <Text className="text-destructive text-sm font-black">{displayData.losses}</Text>
                                            </View>
                                            <View className="bg-white/[0.04] rounded-full overflow-hidden" style={{ height: 6 }}>
                                                <View
                                                    className="h-full bg-destructive rounded-full"
                                                    style={{ width: displayData.totalMatches > 0 ? `${(displayData.losses / displayData.totalMatches) * 100}%` : '0%' }}
                                                />
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
                                                date={formatDateSafe(t.startDate, 'N/A')}
                                                region="Global"
                                                prizePool={`${getCurrencySymbol(t.prizeCurrency)}${t.prize}`}
                                                players={new Array(t.numberOfParticipants || 0).fill({})}
                                                onClick={() => openTournament(t.id)}
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
                                    <View className="bg-card rounded-[24px] p-10 border border-white/5 items-center">
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
                                                tournamentName={match.tournamentName || match.TournamentName || 'Match'}
                                                hubName={match.hubName || match.HubName || match.hub || match.Hub}
                                                userName={match.username || match.userName || match.Username || match.UserName || displayData.username}
                                                userAvatarUrl={match.userAvatarUrl || match.userAvatar || match.UserAvatarUrl || match.UserAvatar || user?.avatarUrl}
                                                opponentName={match.opponentName || match.OpponentName || 'Opponent'}
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
                                                date={formatDateSafe(match.scheduledTime || match.ScheduledTime, 'N/A')}
                                            />
                                        ))}
                                        {hasMoreMatches && isLoadingMoreMatches && (
                                            <View className="mt-4 py-4 items-center justify-center">
                                                <ActivityIndicator size="small" color="#10B981" />
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <View className="bg-card rounded-[24px] p-10 border border-white/5 items-center">
                                        <Ionicons name="documents-outline" size={48} color="#1E293B" />
                                        <Text className="text-slate-600 mt-4 text-center text-sm">No match history available yet.</Text>
                                    </View>
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
                    name={user.nickName || user.username || 'Player'}
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
