import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { BracketMatch } from './BracketMatch';
import { cn, parseUtcDate } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';

interface Standing {
    position: number;
    participantId: string;
    userId: string;
    // Authoritative display name from the backend (LeagueStandingDto.Name):
    // team name for team groups, username for solo groups. Prefer this over the
    // userId→match lookup, which can't resolve team rows (their userId is empty).
    name?: string;
    username?: string;
    points: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    // Swiss only: sum of opponents' points (Buchholz). Null on non-Swiss groups.
    opponentPointsSum?: number | null;
}

interface Participant {
    participantId: string;
    userId: string;
    username: string;
    score: number | null;
    isWinner: boolean;
    seed: number;
}

interface Match {
    id: string;
    order: number;
    status: number;
    startTime: string | null;
    roundDeadline?: string | null;
    nextMatchId: string | null;
    home: Participant | null;
    away: Participant | null;
    round?: number;
    isRoundLocked?: boolean;
    matchOpensAt?: string | null;
}

interface Group {
    groupId: string;
    name: string;
    standings: Standing[];
    matches: Match[];
}

interface TournamentGroupsProps {
    groups: Group[];
    onMatchPress?: (match: Match) => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    onEditDeadline?: (roundInfo: { roundNumber: number; roundDeadline?: string | null; roundOpenAt?: string | null }) => void;
    tournamentStatus?: number;
    // Explicit qualification zones — positions <= direct go straight to the knockout (green),
    // positions <= playInEnd enter the play-in (amber; Swiss only — classic groups pass
    // direct === playInEnd). When omitted, the legacy top-2 group highlight is used.
    qualificationZones?: { direct: number; playInEnd: number };
    // Swiss: total rounds scheduled — drives the "Round X of Y" header on the matches list.
    // When omitted, only "Round X" is shown (legacy group/league behaviour).
    totalRounds?: number;
    // Team tournaments: each group card is a Team-vs-Team match — render the team icon
    // instead of a player avatar, mirroring the knockout bracket.
    isTeamTournament?: boolean;
}

export function TournamentGroups({ groups, onMatchPress, currentUserId, currentUsername, isAdmin, onEditDeadline, tournamentStatus, qualificationZones, totalRounds, isTeamTournament }: TournamentGroupsProps) {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [selectedRounds, setSelectedRounds] = useState<Record<string, number>>({});

    const handlePlayerPress = (participant: any) => {
        const userId = participant.id || participant.userId || participant.UserId;
        if (userId) {
            navigation.navigate('PlayerProfile', { id: userId });
        }
    };

    const getUsername = (userId: string, matches: Match[]) => {
        for (const match of matches) {
            if (match.home?.userId === userId) return match.home.username;
            if (match.away?.userId === userId) return match.away.username;
        }
        return 'Unknown';
    };

    const handleTabPress = (groupId: string, roundNum: number, isLocked: boolean) => {
        setSelectedRounds(prev => ({ ...prev, [groupId]: roundNum }));
    };

    return (
        <View className="flex-col gap-8 p-4">
            {groups.map((group) => {
                const groupedMatches = group.matches.reduce((acc, match) => {
                    const roundNum = match.round !== undefined && match.round !== 0 ? match.round : (match.order !== undefined && match.order !== 0 ? match.order : 1);
                    if (!acc[roundNum]) acc[roundNum] = [];
                    acc[roundNum].push(match);
                    return acc;
                }, {} as Record<number, Match[]>);

                const rounds = Object.keys(groupedMatches).map(Number).sort((a, b) => a - b);
                const activeRound = selectedRounds[group.groupId] || (rounds.length > 0 ? rounds[0] : 1);
                const currentRoundMatches = groupedMatches[activeRound] || [];

                // Buchholz column visible when at least one row carries it — i.e. on Swiss groups.
                // Sits between Pts and W/D/L since it ranks tied players right after Pts.
                const showBuchholz = group.standings.some(s => s.opponentPointsSum != null);

                return (
                    <View key={group.groupId} className="flex-col gap-6">
                        <View>
                            <View className="flex-row items-center gap-2.5 mb-4">
                                <View
                                    className="w-9 h-9 rounded-2xl items-center justify-center"
                                    style={{ backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' }}
                                >
                                    <Ionicons name="grid" size={16} color="#818CF8" />
                                </View>
                                <Text className="text-lg font-black text-white flex-1" numberOfLines={1}>{group.name}</Text>
                            </View>

                            <View
                                className="rounded-[22px] border border-white/[0.06] overflow-hidden"
                                style={{ backgroundColor: '#131B2E', shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 }}
                            >
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View className="min-w-full">
                                        <View className="flex-row bg-white/[0.03] py-3 px-4 border-b border-white/[0.04]">
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">#</Text>
                                            <Text className="w-32 text-[10px] font-black text-slate-500 ml-2 uppercase tracking-wider">Player</Text>
                                            <Text className="w-12 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">Pts</Text>
                                            {showBuchholz && (
                                                <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">OPP</Text>
                                            )}
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">P</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">W</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">D</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">L</Text>
                                            <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">GF</Text>
                                            <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">GA</Text>
                                            <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">GD</Text>
                                        </View>
                                        {group.standings.map((standing, index) => {
                                            const isMe = (!!currentUserId && !!standing.userId && standing.userId.toLowerCase() === currentUserId.toLowerCase())
                                                || (!!currentUsername && !!standing.username && standing.username.toLowerCase() === currentUsername.toLowerCase());
                                            const isDirect = qualificationZones
                                                ? standing.position <= qualificationZones.direct
                                                : standing.position <= 2;
                                            const isPlayIn = !!qualificationZones
                                                && !isDirect
                                                && standing.position <= qualificationZones.playInEnd;
                                            const zoneColor = isDirect ? '#10B981' : isPlayIn ? '#F59E0B' : null;
                                            // Team rows carry no real user (UserId = empty GUID) — disable the tap so we
                                            // don't navigate to a non-existent player profile (the backend 500s on it).
                                            const canOpenProfile = !!standing.userId && standing.userId !== '00000000-0000-0000-0000-000000000000';
                                            return (
                                                <Pressable
                                                    key={standing.participantId}
                                                    onPress={canOpenProfile ? () => handlePlayerPress(standing) : undefined}
                                                    disabled={!canOpenProfile}
                                                    className={cn(
                                                        "flex-row py-3 px-4 border-b border-white/[0.03] items-center",
                                                        index === group.standings.length - 1 && "border-b-0"
                                                    )}
                                                    style={({ pressed }: { pressed: boolean }) => ({
                                                        backgroundColor: pressed
                                                            ? 'rgba(255,255,255,0.05)'
                                                            : isMe
                                                                ? 'rgba(16,185,129,0.08)'
                                                                : 'transparent',
                                                    })}
                                                >
                                                    {zoneColor && (
                                                        <View
                                                            style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: zoneColor }}
                                                        />
                                                    )}
                                                    <View className="w-8 items-center justify-center">
                                                        <View className={cn(
                                                            "w-5 h-5 rounded-md items-center justify-center",
                                                            isDirect ? "bg-emerald-500/15" : isPlayIn ? "bg-amber-500/15" : "bg-white/[0.04]"
                                                        )}>
                                                            <Text className={cn(
                                                                "text-[10px] font-black",
                                                                isDirect ? "text-emerald-400" : isPlayIn ? "text-amber-400" : "text-slate-500"
                                                            )}>{standing.position}</Text>
                                                        </View>
                                                    </View>
                                                    <View className="w-32 ml-2 flex-row items-center gap-1.5">
                                                        <Text className={cn("text-xs font-bold flex-1", isMe ? "text-emerald-300" : "text-slate-200")} numberOfLines={1}>
                                                            {standing.name || standing.username || getUsername(standing.userId, group.matches)}
                                                        </Text>
                                                        {isMe && (
                                                            <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                                                                <Text className="text-[8px] font-black uppercase tracking-wider text-emerald-300">You</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text className="w-12 text-xs text-center font-black text-indigo-400">{standing.points}</Text>
                                                    {showBuchholz && (
                                                        <Text className="w-10 text-xs text-center font-semibold text-slate-400">{standing.opponentPointsSum ?? 0}</Text>
                                                    )}
                                                    <Text className="w-8 text-xs text-center text-slate-500">{standing.matchesPlayed}</Text>
                                                    <Text className="w-8 text-xs text-center text-slate-400">{standing.wins}</Text>
                                                    <Text className="w-8 text-xs text-center text-slate-500">{standing.draws}</Text>
                                                    <Text className="w-8 text-xs text-center text-slate-500">{standing.losses}</Text>
                                                    <Text className="w-10 text-xs text-center text-slate-500">{standing.goalsFor}</Text>
                                                    <Text className="w-10 text-xs text-center text-slate-500">{standing.goalsAgainst}</Text>
                                                    <Text className={cn(
                                                        "w-10 text-xs text-center font-bold",
                                                        standing.goalDifference > 0 ? "text-emerald-400" : standing.goalDifference < 0 ? "text-red-400" : "text-slate-500"
                                                    )}>{standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </ScrollView>
                            </View>
                        </View>

                        <View>
                            <View className="flex-row items-center justify-between mb-4">
                                <Text className="text-xs font-black text-slate-500 uppercase tracking-widest">Matches</Text>
                                {totalRounds != null && totalRounds > 0 && (
                                    <Text className="text-[11px] font-bold text-slate-500">
                                        Round {activeRound} of {totalRounds}
                                    </Text>
                                )}
                            </View>

                            {/* Horizontal Round Tabs */}
                            {rounds.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 6 }}>
                                    {rounds.map(roundNum => {
                                        const rMatches = groupedMatches[roundNum];
                                        const isLocked = rMatches.length > 0 && !!rMatches[0].isRoundLocked;
                                        const isActive = activeRound === roundNum;

                                        return (
                                            <Pressable
                                                key={`tab-${roundNum}`}
                                                onPress={() => handleTabPress(group.groupId, roundNum, isLocked)}
                                                className={cn(
                                                    "flex-row items-center gap-1.5 px-4 py-2 rounded-xl border",
                                                    isActive
                                                        ? "bg-indigo-500/10 border-indigo-500/20"
                                                        : "bg-transparent border-white/[0.04]"
                                                )}
                                            >
                                                <Text className={cn(
                                                    "text-xs font-bold",
                                                    isActive ? "text-white" : "text-slate-600"
                                                )}>
                                                    Round {roundNum}
                                                </Text>
                                                {isLocked && (
                                                    <Ionicons name="lock-closed" size={11} color={isActive ? "#818CF8" : "#475569"} />
                                                )}
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            )}

                            {/* Active Round Content */}
                            {currentRoundMatches.length > 0 && (
                                <View className="mb-4">
                                    {/* Deadline + Edit Schedule row (only if deadline exists or admin) */}
                                    {(currentRoundMatches[0]?.roundDeadline || (isAdmin && tournamentStatus !== 4 && !(currentRoundMatches.every(m => m.status === 3 || m.status === 4 || m.status === 5)))) && (
                                        <View className="flex-row items-center justify-between px-1 mb-4">
                                            {currentRoundMatches[0]?.roundDeadline ? (
                                                <View className="flex-row items-center gap-1.5">
                                                    <Ionicons name="time-outline" size={11} color="#EF4444" />
                                                    <Text className="text-[10px] text-red-400 font-semibold">
                                                        {parseUtcDate(currentRoundMatches[0].roundDeadline!).toLocaleDateString()} {parseUtcDate(currentRoundMatches[0].roundDeadline!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                    </Text>
                                                </View>
                                            ) : <View />}
                                            {isAdmin && tournamentStatus !== 4 && !(currentRoundMatches.every(m => m.status === 3 || m.status === 4 || m.status === 5)) && (
                                                <Pressable
                                                    onPress={() => onEditDeadline?.({ roundNumber: Number(activeRound), roundDeadline: currentRoundMatches[0]?.roundDeadline, roundOpenAt: currentRoundMatches[0]?.matchOpensAt })}
                                                    className="flex-row items-center gap-1 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 active:opacity-70"
                                                >
                                                    <Ionicons name="calendar-outline" size={10} color="#818CF8" />
                                                    <Text className="text-[9px] font-bold text-indigo-400 uppercase tracking-[1.5px]">
                                                        Edit Schedule
                                                    </Text>
                                                </Pressable>
                                            )}
                                        </View>
                                    )}
                                    <View className="flex-col gap-3 items-center">
                                        {currentRoundMatches.map((match) => (
                                            <BracketMatch
                                                key={match.id}
                                                home={match.home}
                                                away={match.away}
                                                startTime={match.startTime}
                                                status={match.status}
                                                className="w-full"
                                                onPress={() => onMatchPress?.({ ...match, isRoundLocked: !!match.isRoundLocked })}
                                                currentUserId={currentUserId}
                                                currentUsername={currentUsername}
                                                isAdmin={isAdmin}
                                                isTeamTournament={isTeamTournament}
                                                proposedByUserId={(match as any).proposedByUserId ?? (match as any).ProposedByUserId ?? null}
                                            />
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}
