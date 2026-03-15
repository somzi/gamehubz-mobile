import React from 'react';
import { View, Text } from 'react-native';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

interface MatchHistoryCardProps {
    tournamentName: string;
    hubName?: string;
    userName?: string;
    userAvatarUrl?: string;
    opponentName: string;
    opponentAvatarUrl?: string;
    result: "win" | "loss" | "draw";
    date: string;
    userScore?: number;
    opponentScore?: number;
    onPress?: () => void;
    className?: string;
}

export function MatchHistoryCard({
    tournamentName,
    hubName,
    userName = "Me",
    userAvatarUrl,
    opponentName,
    opponentAvatarUrl,
    result,
    date,
    userScore,
    opponentScore,
    onPress,
    className,
}: MatchHistoryCardProps) {
    const isWin = result === "win";
    const isDraw = result === "draw";

    return (
        <Card onPress={onPress} className={cn("overflow-hidden", className)}>
            <View className="w-full">
                {/* Header Row: Hub/Tournament + Date */}
                <View className="flex-row justify-between items-start mb-6 pb-2 border-b border-white/5">
                    <View className="flex-row items-start flex-1 pr-4">
                        <View className={cn("w-1.5 h-1.5 rounded-full mr-2 mt-1.5", isWin ? "bg-primary" : (result === 'draw' ? "bg-blue-400" : "bg-destructive"))} />
                        <View className="flex-1">
                            {hubName && (
                                <Text className="text-[11px] font-bold text-white uppercase tracking-widest mb-0.5" numberOfLines={1}>
                                    {hubName}
                                </Text>
                            )}
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest" numberOfLines={1}>
                                {tournamentName}
                            </Text>
                        </View>
                    </View>
                    <Text className="text-[10px] font-bold text-slate-500 uppercase mt-1">{date}</Text>
                </View>

                {/* Versus Content */}
                <View className="flex-row items-center justify-between px-2">
                    {/* User side */}
                    <View className="items-center w-[30%]">
                        <PlayerAvatar src={userAvatarUrl} name={userName} size="md" className="rounded-2xl mb-2" />
                        <Text className="text-[11px] font-bold text-white text-center" numberOfLines={1}>
                            {userName}
                        </Text>
                    </View>

                    {/* Score section */}
                    <View className="items-center flex-1">
                        {userScore !== undefined && opponentScore !== undefined ? (
                            <Text className="text-2xl font-black text-white mb-2 tracking-widest">
                                {userScore} : {opponentScore}
                            </Text>
                        ) : (
                            <Text className="text-lg font-black text-slate-500 mb-2 uppercase italic">VS</Text>
                        )}
                        <View className={cn(
                            "px-4 py-1 rounded-full",
                            isWin ? "bg-primary/20 border border-primary/30" :
                                isDraw ? "bg-blue-400/20 border border-blue-400/30" :
                                    "bg-destructive/20 border border-destructive/30"
                        )}>
                            <Text className={cn(
                                "text-[10px] font-black uppercase tracking-tight",
                                isWin ? "text-primary" : isDraw ? "text-blue-400" : "text-destructive"
                            )}>
                                {isWin ? "Victory" : isDraw ? "Draw" : "Defeat"}
                            </Text>
                        </View>
                    </View>

                    {/* Opponent side */}
                    <View className="items-center w-[30%]">
                        <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="rounded-2xl mb-2" />
                        <Text className="text-xs font-bold text-white text-center" numberOfLines={1}>
                            {opponentName}
                        </Text>
                    </View>
                </View>
            </View>
        </Card>
    );
}
