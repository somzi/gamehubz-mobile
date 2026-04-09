import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn } from '../../lib/utils';

interface FeedCardProps {
    hubName: string;
    hubAvatar?: string;
    message: string;
    tournamentName?: string;
    timestamp: string;
    onClick?: () => void;
    className?: string;
    variant?: 'default' | 'compact';
}

export function FeedCard({
    hubName,
    hubAvatar,
    message,
    tournamentName,
    timestamp,
    onClick,
    className,
    variant = 'default',
}: FeedCardProps) {
    if (variant === 'compact') {
        return (
            <Pressable
                onPress={onClick}
                className={cn(
                    "w-[260px] bg-[#131B2E] rounded-3xl p-5 mr-3",
                    className
                )}
            >
                <View className="flex-row items-center gap-3 mb-4">
                    <PlayerAvatar src={hubAvatar} name={hubName} size="md" className="rounded-xl" />
                    <View className="flex-1">
                        <Text className="font-bold text-white text-sm" numberOfLines={1}>{hubName}</Text>
                        <Text className="text-[10px] text-slate-600 uppercase tracking-widest">{timestamp}</Text>
                    </View>
                </View>

                <Text className="text-sm text-slate-400 leading-tight mb-4 h-[40px]" numberOfLines={2}>
                    {message}
                </Text>

                {tournamentName && (
                    <View className="flex-row items-center gap-1.5 bg-emerald-500/[0.06] self-start px-2 py-1 rounded-lg">
                        <Ionicons name="trophy-outline" size={10} color="#10B981" />
                        <Text className="text-[10px] font-black text-emerald-400 uppercase tracking-tight">{tournamentName}</Text>
                    </View>
                )}
            </Pressable>
        );
    }

    return (
        <Pressable onPress={onClick} className="active:opacity-80">
            <View className={cn("bg-[#131B2E] rounded-3xl overflow-hidden", className)}>
                <View className="flex-row">
                    <View style={{ width: 4, backgroundColor: '#6366F1', opacity: 0.4 }} className="rounded-l-3xl" />

                    <View className="flex-1 p-4">
                        <View className="flex-row items-center gap-3">
                            <PlayerAvatar src={hubAvatar} name={hubName} size="md" className="rounded-xl" />
                            <View className="flex-1 min-w-0">
                                <View className="flex-row justify-between items-center">
                                    <Text className="font-black text-white text-sm" numberOfLines={1}>{hubName}</Text>
                                    <Text className="text-[9px] font-medium text-slate-700 uppercase tracking-wider">{timestamp}</Text>
                                </View>
                                <Text className="text-[12px] text-slate-500 mt-1 leading-5" numberOfLines={2}>{message}</Text>
                                {tournamentName && (
                                    <View className="flex-row items-center gap-1.5 mt-2 bg-emerald-500/[0.06] self-start px-2 py-1 rounded-lg">
                                        <Ionicons name="trophy-outline" size={10} color="#10B981" />
                                        <Text className="text-[10px] font-black text-emerald-400 uppercase tracking-tight">{tournamentName}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </Pressable>
    );
}

