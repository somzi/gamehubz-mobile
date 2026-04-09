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
    username?: string;
    points: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
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
}

export function TournamentGroups({ groups, onMatchPress, currentUserId, currentUsername, isAdmin, onEditDeadline, tournamentStatus }: TournamentGroupsProps) {
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

                return (
                    <View key={group.groupId} className="flex-col gap-6">
                        <View>
                            <Text className="text-lg font-black text-white mb-4">{group.name}</Text>

                            <View className="bg-[#0D1525] rounded-2xl border border-white/[0.06] overflow-hidden">
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View className="min-w-full">
                                        <View className="flex-row bg-white/[0.03] py-3 px-4 border-b border-white/[0.04]">
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">#</Text>
                                            <Text className="w-32 text-[10px] font-black text-slate-500 ml-2 uppercase tracking-wider">Player</Text>
                                            <Text className="w-12 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">Pts</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">P</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">W</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">D</Text>
                                            <Text className="w-8 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">L</Text>
                                            <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">GF</Text>
                                            <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">GA</Text>
                                            <Text className="w-10 text-[10px] font-black text-slate-500 text-center uppercase tracking-wider">GD</Text>
                                        </View>
                                        {group.standings.map((standing, index) => (
                                            <Pressable
                                                key={standing.participantId}
                                                onPress={() => handlePlayerPress(standing)}
                                                className={cn(
                                                    "flex-row py-3 px-4 border-b border-white/[0.03] items-center",
                                                    index === group.standings.length - 1 && "border-b-0"
                                                )}
                                                style={({ pressed }: { pressed: boolean }) => ({
                                                    backgroundColor: pressed ? 'rgba(255, 255, 255, 0.03)' : 'transparent'
                                                })}
                                            >
                                                <View className="w-8 items-center justify-center">
                                                    <View className={cn(
                                                        "w-5 h-5 rounded-md items-center justify-center",
                                                        standing.position <= 2 ? "bg-emerald-500/15" : "bg-white/[0.04]"
                                                    )}>
                                                        <Text className={cn(
                                                            "text-[10px] font-black",
                                                            standing.position <= 2 ? "text-emerald-400" : "text-slate-500"
                                                        )}>{standing.position}</Text>
                                                    </View>
                                                </View>
                                                <Text className="w-32 text-xs font-bold text-slate-300 ml-2" numberOfLines={1}>
                                                    {standing.username || getUsername(standing.userId, group.matches)}
                                                </Text>
                                                <Text className="w-12 text-xs text-center font-black text-indigo-400">{standing.points}</Text>
                                                <Text className="w-8 text-xs text-center text-slate-500">{standing.matchesPlayed}</Text>
                                                <Text className="w-8 text-xs text-center text-slate-500">{standing.wins}</Text>
                                                <Text className="w-8 text-xs text-center text-slate-500">{standing.draws}</Text>
                                                <Text className="w-8 text-xs text-center text-slate-500">{standing.losses}</Text>
                                                <Text className="w-10 text-xs text-center text-slate-500">{standing.goalsFor}</Text>
                                                <Text className="w-10 text-xs text-center text-slate-500">{standing.goalsAgainst}</Text>
                                                <Text className={cn(
                                                    "w-10 text-xs text-center font-bold",
                                                    standing.goalDifference > 0 ? "text-emerald-400" : standing.goalDifference < 0 ? "text-red-400" : "text-slate-500"
                                                )}>{standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        </View>

                        <View>
                            <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Matches</Text>
                            
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
                                    {(currentRoundMatches[0]?.roundDeadline || (isAdmin && tournamentStatus !== 4 && !(currentRoundMatches.every(m => m.status === 3 || m.status === 4)))) && (
                                        <View className="flex-row items-center justify-between px-1 mb-4">
                                            {currentRoundMatches[0]?.roundDeadline ? (
                                                <View className="flex-row items-center gap-1.5">
                                                    <Ionicons name="time-outline" size={11} color="#EF4444" />
                                                    <Text className="text-[10px] text-red-400 font-semibold">
                                                        {parseUtcDate(currentRoundMatches[0].roundDeadline!).toLocaleDateString()} {parseUtcDate(currentRoundMatches[0].roundDeadline!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                    </Text>
                                                </View>
                                            ) : <View />}
                                            {isAdmin && tournamentStatus !== 4 && !(currentRoundMatches.every(m => m.status === 3 || m.status === 4)) && (
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
