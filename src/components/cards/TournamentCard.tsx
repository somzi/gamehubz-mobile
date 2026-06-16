import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

const STATUS_THEME: Record<string, { main: string; tint: string; text: string; ring: string }> = {
    live: {
        main: '#EF4444',
        tint: 'rgba(239, 68, 68, 0.05)',
        text: '#FCA5A5',
        ring: 'rgba(239, 68, 68, 0.32)',
    },
    upcoming: {
        main: '#60A5FA',
        tint: 'rgba(96, 165, 250, 0.05)',
        text: '#93C5FD',
        ring: 'rgba(96, 165, 250, 0.32)',
    },
    completed: {
        main: '#10B981',
        tint: 'rgba(16, 185, 129, 0.05)',
        text: '#6EE7B7',
        ring: 'rgba(16, 185, 129, 0.32)',
    },
};

const AVATAR_STYLES = [
    { bg: 'rgba(129, 140, 248, 0.10)', border: 'rgba(129, 140, 248, 0.22)', icon: '#818CF8' },
    { bg: 'rgba(52, 211, 153, 0.10)', border: 'rgba(52, 211, 153, 0.22)', icon: '#34D399' },
    { bg: 'rgba(251, 191, 36, 0.10)', border: 'rgba(251, 191, 36, 0.22)', icon: '#FBBF24' },
];

export function TournamentCard({
    name,
    status,
    date,
    region,
    prizePool,
    onClick,
    className,
    index = 0,
    hubName,
    hubAvatarUrl,
}: TournamentCardProps) {
    const theme = STATUS_THEME[status] || STATUS_THEME.upcoming;
    const avatarStyle = AVATAR_STYLES[index % AVATAR_STYLES.length];

    return (
        <Pressable
            onPress={onClick}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            className={className}
        >
            <View
                className="rounded-[24px] overflow-hidden"
                style={{
                    backgroundColor: '#131B2E',
                    shadowColor: '#000000',
                    shadowOpacity: 0.22,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 3,
                }}
            >
                {/* Hairline border */}
                <View
                    pointerEvents="none"
                    className="absolute inset-0 rounded-[24px]"
                    style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}
                />

                <View className="p-5">
                    {/* Top row */}
                    <View className="flex-row items-center gap-4">
                        <View
                            className="w-14 h-14 rounded-2xl items-center justify-center overflow-hidden"
                            style={{
                                backgroundColor: avatarStyle.bg,
                                borderWidth: 1,
                                borderColor: avatarStyle.border,
                            }}
                        >
                            {hubAvatarUrl ? (
                                <PlayerAvatar
                                    name={hubName || name}
                                    src={hubAvatarUrl}
                                    size="lg"
                                    className="w-full h-full rounded-none border-0"
                                />
                            ) : (
                                <Ionicons name="trophy" size={26} color={avatarStyle.icon} />
                            )}
                        </View>

                        <View className="flex-1 min-w-0">
                            <Text
                                className="text-lg font-black text-white leading-tight mb-0.5"
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                            >
                                {name}
                            </Text>
                            <Text
                                className="text-xs font-bold uppercase tracking-wider"
                                style={{ color: '#34D399' }}
                                numberOfLines={1}
                            >
                                {hubName || 'Official Hub'}
                            </Text>
                        </View>

                        {/* Status pill */}
                        <View className="rounded-full overflow-hidden">
                            <LinearGradient
                                colors={[theme.tint.replace('0.05', '0.20'), theme.tint.replace('0.05', '0.08')]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={{ paddingHorizontal: 12, paddingVertical: 5 }}
                            >
                                <View
                                    pointerEvents="none"
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        borderWidth: 1,
                                        borderColor: theme.ring,
                                        borderRadius: 999,
                                    }}
                                />
                                <Text
                                    className="text-[10px] font-black uppercase"
                                    style={{ color: theme.text, letterSpacing: 1.4 }}
                                >
                                    {status}
                                </Text>
                            </LinearGradient>
                        </View>
                    </View>

                    {/* Divider */}
                    <View
                        style={{
                            height: 1,
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            marginVertical: 16,
                        }}
                    />

                    {/* Bottom row */}
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2.5">
                            <View
                                className="flex-row items-center px-3 py-1.5 rounded-xl"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.05)',
                                }}
                            >
                                <Ionicons name="earth-outline" size={13} color="#34D399" />
                                <Text className="text-[11px] font-black text-slate-300 ml-1.5">
                                    {region}
                                </Text>
                            </View>
                            <View
                                className="flex-row items-center px-3 py-1.5 rounded-xl"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.05)',
                                }}
                            >
                                <Ionicons name="calendar-clear-outline" size={13} color="#A5B4FC" />
                                <Text className="text-[11px] font-black text-slate-300 ml-1.5">
                                    {date}
                                </Text>
                            </View>
                        </View>

                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name="cash" size={16} color="#FBBF24" />
                            <Text className="text-[13px] font-black tracking-tight" style={{ color: '#FBBF24' }}>
                                {prizePool}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </Pressable>
    );
}
