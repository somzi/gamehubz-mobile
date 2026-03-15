import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';
import { PlayerAvatar } from '../ui/PlayerAvatar';

interface HubCardProps {
    name: string;
    description?: string;
    numberOfUsers: number;
    numberOfTournaments?: number;
    avatarUrl?: string;
    onClick: () => void;
    isJoined?: boolean;
    className?: string;
    index?: number;
}

export function HubCard({
    name,
    description,
    numberOfUsers,
    numberOfTournaments = 0,
    avatarUrl,
    onClick,
    isJoined,
    className,
    index = 0,
}: HubCardProps) {
    // Determine icon container style based on index (same as TournamentCard for consistency)
    const getIconStyles = (idx: number) => {
        const types = [
            { bg: "bg-indigo-500/10", border: "border-indigo-500/20", icon: "#818CF8" },
            { bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: "#10B981" },
            { bg: "bg-blue-500/10", border: "border-blue-500/20", icon: "#60A5FA" },
        ];
        return types[idx % types.length];
    };

    const iconStyle = getIconStyles(index);

    return (
        <Card
            onPress={onClick}
            className={cn(
                "bg-[#131B2E] border border-white/5 rounded-[32px] p-5 shadow-sm",
                className
            )}
        >
            {/* Top Section: Icon, Title, Status */}
            <View className="flex-row items-center gap-4">
                <View className={cn(
                    "w-16 h-16 rounded-[22px] items-center justify-center border overflow-hidden",
                    iconStyle.bg,
                    iconStyle.border
                )}>
                    {avatarUrl ? (
                        <PlayerAvatar
                            name={name}
                            src={avatarUrl}
                            size="lg"
                            className="w-full h-full rounded-[20px] border-0"
                        />
                    ) : (
                        <Ionicons
                            name="people"
                            size={28}
                            color={iconStyle.icon}
                        />
                    )}
                </View>

                <View className="flex-1 min-w-0 pr-2">
                    <Text className="text-white font-black text-lg tracking-tight leading-tight mb-1" numberOfLines={2}>
                        {name}
                    </Text>

                </View>

                {isJoined && (
                    <View className="px-3 py-1.5 rounded-xl border bg-primary/10 border-primary/20 flex-row items-center gap-1.5">
                        <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                        <Text className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">
                            Joined
                        </Text>
                    </View>
                )}
            </View>

            {/* Divider */}
            <View className="h-[1px] bg-white/5 my-5" />

            {/* Bottom Section: Fans, Tournaments, etc */}
            <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-4">
                    <View className="flex-row items-center bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5">
                        <Ionicons name="people-outline" size={14} color="#10B981" />
                        <Text className="text-[11px] font-black text-slate-300 tracking-tight ml-2">
                            {numberOfUsers} <Text className="text-slate-500">Fans</Text>
                        </Text>
                    </View>
                    <View className="flex-row items-center bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5">
                        <Ionicons name="trophy-outline" size={14} color="#6366F1" />
                        <Text className="text-[11px] font-black text-slate-300 tracking-tight ml-2">
                            {numberOfTournaments} <Text className="text-slate-500">Tournaments</Text>
                        </Text>
                    </View>
                </View>

                <View className="w-10 h-10 rounded-xl bg-white/5 items-center justify-center border border-white/5">
                    <Ionicons name="chevron-forward" size={16} color="#64748B" />
                </View>
            </View>
        </Card>
    );
}
