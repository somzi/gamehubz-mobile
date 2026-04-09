import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { PlayerAvatar } from '../ui/PlayerAvatar';
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
        <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.85 : 1 })} className={cn("overflow-hidden", className)}>
            <View className="flex-row bg-[#131B2E] rounded-3xl overflow-hidden">
                {/* Left accent bar */}
                <View
                    className="w-1"
                    style={{ backgroundColor: isWin ? 'rgba(16,185,129,0.6)' : isDraw ? 'rgba(129,140,248,0.6)' : 'rgba(239,68,68,0.6)' }}
                />

                <View className="flex-1 p-4">
                    {/* Header: Hub/Tournament + Date */}
                    <View className="flex-row justify-between items-center mb-4 pb-2.5" style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                        <View className="flex-row items-center flex-1 pr-4">
                            <View className={cn("w-1.5 h-1.5 rounded-full mr-2", isWin ? "bg-[#10B981]" : isDraw ? "bg-indigo-400" : "bg-[#EF4444]")} />
                            <View className="flex-1">
                                {hubName && (
                                    <Text className="text-[10px] font-black text-white uppercase tracking-widest mb-0.5" numberOfLines={1}>
                                        {hubName}
                                    </Text>
                                )}
                                <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest" numberOfLines={1}>
                                    {tournamentName}
                                </Text>
                            </View>
                        </View>
                        <Text className="text-[9px] font-bold text-slate-600 uppercase">{date}</Text>
                    </View>

                    {/* Versus Content */}
                    <View className="flex-row items-center justify-between px-1">
                        {/* User side */}
                        <View className="items-center w-[28%]">
                            <PlayerAvatar src={userAvatarUrl} name={userName} size="md" className="rounded-2xl mb-2" />
                            <Text className="text-[10px] font-bold text-white text-center" numberOfLines={1}>
                                {userName}
                            </Text>
                        </View>

                        {/* Score section */}
                        <View className="items-center flex-1">
                            {userScore !== undefined && opponentScore !== undefined ? (
                                <Text className="text-2xl font-black text-white mb-2.5" style={{ letterSpacing: 6 }}>
                                    {userScore} : {opponentScore}
                                </Text>
                            ) : (
                                <Text className="text-lg font-black text-slate-600 mb-2.5 uppercase">VS</Text>
                            )}
                            <View
                                className={cn(
                                    "px-4 py-1.5 rounded-xl",
                                    isWin ? "bg-[#10B981]/10" :
                                        isDraw ? "bg-indigo-400/10" :
                                            "bg-[#EF4444]/10"
                                )}
                                style={{ borderWidth: 1, borderColor: isWin ? 'rgba(16,185,129,0.2)' : isDraw ? 'rgba(129,140,248,0.2)' : 'rgba(239,68,68,0.2)' }}
                            >
                                <Text className={cn(
                                    "text-[9px] font-black uppercase tracking-wider",
                                    isWin ? "text-[#10B981]" : isDraw ? "text-indigo-400" : "text-[#EF4444]"
                                )}>
                                    {isWin ? "Victory" : isDraw ? "Draw" : "Defeat"}
                                </Text>
                            </View>
                        </View>

                        {/* Opponent side */}
                        <View className="items-center w-[28%]">
                            <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="rounded-2xl mb-2" />
                            <Text className="text-[10px] font-bold text-white text-center" numberOfLines={1}>
                                {opponentName}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </Pressable>
    );
}
