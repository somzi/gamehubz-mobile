import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { BracketMatch } from './BracketMatch';
import { cn } from '../../lib/utils';
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
                            <Text className="text-lg font-bold text-foreground mb-4">{group.name}</Text>

                            <View className="bg-card rounded-xl border border-border/30 overflow-hidden">
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View className="min-w-full">
                                        <View className="flex-row bg-muted/30 py-3 px-4 border-b border-border/30">
                                            <Text className="w-8 text-xs font-bold text-muted-foreground text-center">#</Text>
                                            <Text className="w-32 text-xs font-bold text-muted-foreground ml-2">Player</Text>
                                            <Text className="w-12 text-xs font-bold text-muted-foreground text-center">Pts</Text>
                                            <Text className="w-8 text-xs font-bold text-muted-foreground text-center">P</Text>
                                            <Text className="w-8 text-xs font-bold text-muted-foreground text-center">W</Text>
                                            <Text className="w-8 text-xs font-bold text-muted-foreground text-center">D</Text>
                                            <Text className="w-8 text-xs font-bold text-muted-foreground text-center">L</Text>
                                            <Text className="w-10 text-xs font-bold text-muted-foreground text-center">GF</Text>
                                            <Text className="w-10 text-xs font-bold text-muted-foreground text-center">GA</Text>
                                            <Text className="w-10 text-xs font-bold text-muted-foreground text-center">GD</Text>
                                        </View>
                                        {group.standings.map((standing, index) => (
                                            <Pressable
                                                key={standing.participantId}
                                                onPress={() => handlePlayerPress(standing)}
                                                className={cn(
                                                    "flex-row py-3 px-4 border-b border-border/10 items-center",
                                                    index === group.standings.length - 1 && "border-b-0"
                                                )}
                                                style={({ pressed }: { pressed: boolean }) => ({
                                                    backgroundColor: pressed ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                                                })}
                                            >
                                                <Text className="w-8 text-sm font-medium text-muted-foreground text-center">{standing.position}</Text>
                                                <Text className="w-32 text-sm font-bold text-foreground ml-2" numberOfLines={1}>
                                                    {standing.username || getUsername(standing.userId, group.matches)}
                                                </Text>
                                                <Text className="w-12 text-sm text-center font-bold text-accent">{standing.points}</Text>
                                                <Text className="w-8 text-sm text-center text-muted-foreground">{standing.matchesPlayed}</Text>
                                                <Text className="w-8 text-sm text-center text-muted-foreground">{standing.wins}</Text>
                                                <Text className="w-8 text-sm text-center text-muted-foreground">{standing.draws}</Text>
                                                <Text className="w-8 text-sm text-center text-muted-foreground">{standing.losses}</Text>
                                                <Text className="w-10 text-sm text-center text-muted-foreground">{standing.goalsFor}</Text>
                                                <Text className="w-10 text-sm text-center text-muted-foreground">{standing.goalsAgainst}</Text>
                                                <Text className="w-10 text-sm text-center text-muted-foreground">{standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        </View>

                        <View>
                            <Text className="text-sm font-semibold text-muted-foreground mb-4">Matches</Text>
                            
                            {/* Horizontal Round Tabs */}
                            {rounds.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8 }}>
                                    {rounds.map(roundNum => {
                                        const rMatches = groupedMatches[roundNum];
                                        const isLocked = rMatches.length > 0 && !!rMatches[0].isRoundLocked;
                                        const isActive = activeRound === roundNum;

                                        return (
                                            <Pressable
                                                key={`tab-${roundNum}`}
                                                onPress={() => handleTabPress(group.groupId, roundNum, isLocked)}
                                                className={cn(
                                                    "flex-row items-center gap-2 px-4 py-2 rounded-xl border",
                                                    isActive
                                                        ? "bg-primary border-primary"
                                                        : "bg-muted/30 border-border/10"
                                                )}
                                            >
                                                <Text className={cn(
                                                    "text-sm font-bold",
                                                    isActive ? "text-primary-foreground" : "text-muted-foreground"
                                                )}>
                                                    Round {roundNum}
                                                </Text>
                                                {isLocked && (
                                                    <Ionicons name="lock-closed" size={14} color="#64748B" />
                                                )}
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            )}

                            {/* Active Round Content */}
                            {currentRoundMatches.length > 0 && (
                                <View className="mb-4">
                                    <View className="flex-row items-center justify-between px-2 mb-4">
                                        <View>
                                            <Text className="text-xs font-bold text-muted-foreground">Round {activeRound}</Text>
                                            {currentRoundMatches[0]?.roundDeadline && (
                                                <Text className="text-[10px] text-red-400 mt-0.5">
                                                    End: {new Date(currentRoundMatches[0].roundDeadline!).toLocaleDateString()} {new Date(currentRoundMatches[0].roundDeadline!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </Text>
                                            )}
                                        </View>
                                        {isAdmin && tournamentStatus !== 4 && !(currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.status === 3 || m.status === 4)) && (
                                            <Pressable
                                                onPress={() => onEditDeadline?.({ roundNumber: Number(activeRound), roundDeadline: currentRoundMatches[0]?.roundDeadline, roundOpenAt: currentRoundMatches[0]?.matchOpensAt })}
                                                className="bg-primary/20 px-3 py-1 rounded-md border border-primary/30"
                                            >
                                                <Text className="text-primary text-[10px] uppercase font-bold tracking-wider">
                                                    Edit Schedule
                                                </Text>
                                            </Pressable>
                                        )}
                                    </View>
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
