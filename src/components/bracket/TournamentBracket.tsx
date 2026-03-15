import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { BracketMatch } from './BracketMatch';

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
    nextMatchId: string | null;
    home: Participant | null;
    away: Participant | null;
}

interface Round {
    roundNumber: number;
    name: string;
    roundDeadline?: string | null;
    roundOpenAt?: string | null;
    matches: Match[];
}

interface TournamentBracketProps {
    rounds: Round[];
    onMatchPress?: (match: Match) => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    onEditDeadline?: (round: Round) => void;
    tournamentStatus?: number;
}

export function TournamentBracket({ rounds, onMatchPress, currentUserId, currentUsername, isAdmin, onEditDeadline, tournamentStatus }: TournamentBracketProps) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-8 p-4">
                {rounds.map((round) => (
                    <View key={round.roundNumber} className="flex-col">
                        <View className="items-center mb-4 text-center">
                            <Text className="text-sm font-semibold text-muted-foreground">
                                {round.name}
                            </Text>
                            {round.roundDeadline && (
                                <Text className="text-[10px] text-red-400 mt-1">
                                    End: {new Date(round.roundDeadline).toLocaleDateString()} {new Date(round.roundDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </Text>
                            )}
                            {isAdmin && tournamentStatus !== 4 && !(round.matches.length > 0 && round.matches.every(m => m.status === 3 || m.status === 4)) && (
                                <Pressable
                                    onPress={() => onEditDeadline?.(round)}
                                    className="mt-2 bg-primary/20 px-3 py-1 rounded-md border border-primary/30"
                                >
                                    <Text className="text-primary text-[10px] uppercase font-bold tracking-wider">
                                        Edit Schedule
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                        <View className="flex-col justify-around flex-1 gap-4">
                            {round.matches.map((match) => (
                                <View key={match.id} className="flex-row items-center">
                                    <BracketMatch
                                        home={match.home}
                                        away={match.away}
                                        startTime={match.startTime}
                                        status={match.status}
                                        onPress={() => onMatchPress?.(match)}
                                        currentUserId={currentUserId}
                                        currentUsername={currentUsername}
                                        isAdmin={isAdmin}
                                    />
                                    {match.nextMatchId && (
                                        <View className="w-8 h-[1px] bg-border" />
                                    )}
                                </View>
                            ))}
                        </View>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}
