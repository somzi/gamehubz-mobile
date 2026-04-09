import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { BracketMatch } from './BracketMatch';
import { parseUtcDate } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';

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
    isTeamTournament?: boolean;
}

export function TournamentBracket({ rounds, onMatchPress, currentUserId, currentUsername, isAdmin, onEditDeadline, tournamentStatus, isTeamTournament }: TournamentBracketProps) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-6 p-4">
                {rounds.map((round) => (
                    <View key={round.roundNumber} className="flex-col">
                        {/* Round header */}
                        <View className="items-center mb-4">
                            <View className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2 items-center">
                                <Text className="text-xs font-black text-white tracking-wide">
                                    {round.name}
                                </Text>
                                {round.roundDeadline && (
                                    <View className="flex-row items-center mt-1 gap-1">
                                        <Ionicons name="time-outline" size={9} color="#EF4444" />
                                        <Text className="text-[9px] text-red-400 font-semibold">
                                            {parseUtcDate(round.roundDeadline).toLocaleDateString()} {parseUtcDate(round.roundDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            {isAdmin && tournamentStatus !== 4 && !(round.matches.length > 0 && round.matches.every(m => m.status === 3 || m.status === 4)) && (
                                <Pressable
                                    onPress={() => onEditDeadline?.(round)}
                                    className="mt-2 flex-row items-center gap-1 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 active:opacity-70"
                                >
                                    <Ionicons name="calendar-outline" size={10} color="#818CF8" />
                                    <Text className="text-[9px] font-bold text-indigo-400 uppercase tracking-[1.5px]">
                                        Edit Schedule
                                    </Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Matches */}
                        <View className="flex-col justify-around flex-1 gap-3">
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
                                        isTeamTournament={isTeamTournament}
                                    />
                                    {match.nextMatchId && (
                                        <View className="w-6 items-center justify-center">
                                            <View className="w-6 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                                        </View>
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
