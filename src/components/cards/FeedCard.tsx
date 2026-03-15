import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
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
                    "w-[260px] bg-card/60 rounded-[32px] border border-white/5 p-5 mr-3",
                    className
                )}
            >
                <View className="flex-row items-center gap-3 mb-4">
                    <PlayerAvatar src={hubAvatar} name={hubName} size="md" className="rounded-xl" />
                    <View className="flex-1">
                        <Text className="font-bold text-white text-sm" numberOfLines={1}>{hubName}</Text>
                        <Text className="text-[10px] text-slate-500 uppercase tracking-widest">{timestamp}</Text>
                    </View>
                </View>

                <Text className="text-sm text-slate-300 leading-tight mb-4 h-[40px]" numberOfLines={2}>
                    {message}
                </Text>

                {tournamentName && (
                    <View className="flex-row items-center gap-1.5 bg-primary/10 self-start px-2 py-1 rounded-lg border border-primary/20">
                        <Ionicons name="trophy-outline" size={10} color="#10B981" />
                        <Text className="text-[10px] font-black text-primary uppercase tracking-tight">{tournamentName}</Text>
                    </View>
                )}
            </Pressable>
        );
    }

    return (
        <Card onPress={onClick} className={className}>
            <View className="flex-row items-center gap-4">
                <PlayerAvatar src={hubAvatar} name={hubName} size="md" className="rounded-2xl" />
                <View className="flex-1">
                    <View className="flex-row justify-between items-center">
                        <Text className="font-bold text-white text-base" numberOfLines={1}>{hubName}</Text>
                        <Text className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{timestamp}</Text>
                    </View>
                    <Text className="text-sm text-slate-400 mt-1 leading-5" numberOfLines={2}>{message}</Text>
                    {tournamentName && (
                        <View className="flex-row items-center gap-1.5 mt-2 bg-primary/10 self-start px-2.5 py-1 rounded-lg">
                            <Ionicons name="trophy-outline" size={12} color="#10B981" />
                            <Text className="text-[11px] font-bold text-primary uppercase tracking-tight">{tournamentName}</Text>
                        </View>
                    )}
                </View>
            </View>
        </Card>
    );
}


