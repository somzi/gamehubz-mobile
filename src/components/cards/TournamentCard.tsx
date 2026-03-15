import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { cn } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';

import { PlayerAvatar } from '../ui/PlayerAvatar';

interface TournamentCardProps {
    name: string;
    description?: string;
    status: 'live' | 'upcoming' | 'completed';
    date: string;
    region: string;
    prizePool: string;
    players: any[];
    showApply?: boolean;
    onApply?: () => void;
    onClick: () => void;
    className?: string;
    index?: number;
    hubName?: string;
    hubAvatarUrl?: string;
}

export function TournamentCard({
    name,
    description,
    status,
    date,
    region,
    prizePool,
    players,
    showApply,
    onApply,
    onClick,
    className,
    index = 0,
    hubName,
    hubAvatarUrl,
}: TournamentCardProps) {
    // Determine icon container style based on index
    const getIconStyles = (idx: number) => {
        const types = [
            { bg: "bg-indigo-500/10", border: "border-indigo-500/20", icon: "#818CF8" },
            { bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: "#34D399" },
            { bg: "bg-amber-500/10", border: "border-amber-500/20", icon: "#FBBF24" },
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
            {/* Top Section: Icon, Title/Hub, Status */}
            <View className="flex-row items-center gap-4">
                <View className={cn(
                    "w-16 h-16 rounded-[22px] items-center justify-center border overflow-hidden",
                    iconStyle.bg,
                    iconStyle.border
                )}>
                    {hubAvatarUrl ? (
                        <PlayerAvatar
                            name={hubName || name}
                            src={hubAvatarUrl}
                            size="lg"
                            className="w-full h-full rounded-none border-0"
                        />
                    ) : (
                        <Ionicons
                            name="trophy"
                            size={28}
                            color={iconStyle.icon}
                        />
                    )}
                </View>

                <View className="flex-1 min-w-0">
                    <Text className="text-lg font-black text-white leading-tight mb-0.5">
                        {name}
                    </Text>
                    <Text className="text-[#10B981] text-xs font-bold uppercase tracking-wider">
                        {hubName || 'Official Hub'}
                    </Text>
                </View>

                <View className={cn(
                    "px-4 py-2 rounded-full border",
                    status === 'live' ? "bg-red-500/10 border-red-500/30" :
                    status === 'completed' ? "bg-[#10B981]/10 border-[#10B981]/30" : "bg-blue-500/10 border-blue-500/30"
                )}>
                    <Text className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        status === 'live' ? "text-red-500" :
                        status === 'completed' ? "text-[#10B981]" : "text-blue-400"
                    )}>
                        {status}
                    </Text>
                </View>
            </View>

            {/* Divider */}
            <View className="h-[1px] bg-white/5 my-5" />

            {/* Bottom Section: Region, Date, Prize */}
            <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-4">
                    <View className="flex-row items-center bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5">
                        <Ionicons name="earth-outline" size={14} color="#10B981" />
                        <Text className="text-[11px] font-black text-slate-300 tracking-tight ml-2">
                            {region}
                        </Text>
                    </View>
                    <View className="flex-row items-center bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5">
                        <Ionicons name="calendar-clear-outline" size={14} color="#6366F1" />
                        <Text className="text-[11px] font-black text-slate-300 tracking-tight ml-2">
                            {date}
                        </Text>
                    </View>
                </View>

                <View className="flex-row items-center gap-2">
                    <Ionicons name="cash" size={18} color="#FBBF24" />
                    <Text className="text-[13px] font-black text-[#FBBF24] tracking-tight">{prizePool}</Text>
                </View>
            </View>
        </Card>
    );
}
