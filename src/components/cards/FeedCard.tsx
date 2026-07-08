import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

const ACCENT = '#A78BFA';

// Memoized so refreshing an adjacent card (or an unrelated setState in the parent
// screen) doesn't re-render every visible feed item. All props are primitives except
// onClick, which callers should keep stable (useCallback) for the memo to bite.
export const FeedCard = React.memo(function FeedCard({
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
                    'w-[260px] bg-card rounded-3xl p-5 mr-3 active:opacity-90',
                    className
                )}
            >
                <View className="flex-row items-center gap-3 mb-4">
                    <PlayerAvatar
                        src={hubAvatar}
                        name={hubName}
                        size="md"
                        className="rounded-xl"
                    />
                    <View className="flex-1">
                        <Text
                            className="font-bold text-white text-sm"
                            numberOfLines={1}
                        >
                            {hubName}
                        </Text>
                        <Text className="text-[10px] text-slate-600 uppercase tracking-widest">
                            {timestamp}
                        </Text>
                    </View>
                </View>

                <Text
                    className="text-sm text-slate-300 leading-tight mb-4 h-[40px]"
                    numberOfLines={2}
                >
                    {message}
                </Text>

                {tournamentName && (
                    <View className="flex-row items-center gap-1.5 bg-emerald-500/[0.08] self-start px-2 py-1 rounded-lg">
                        <Ionicons name="trophy-outline" size={10} color="#34D399" />
                        <Text className="text-[10px] font-black text-emerald-300 uppercase tracking-tight">
                            {tournamentName}
                        </Text>
                    </View>
                )}
            </Pressable>
        );
    }

    return (
        <Pressable onPress={onClick} className="active:opacity-90">
            <View
                className={cn('rounded-[22px] overflow-hidden', className)}
                style={{
                    backgroundColor: '#131B2E',
                    shadowColor: ACCENT,
                    shadowOpacity: 0.12,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                }}
            >
                {/* Subtle purple-tinted gradient */}
                <LinearGradient
                    colors={['rgba(167, 139, 250, 0.10)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.7, y: 0 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />

                {/* Soft hairline border */}
                <View
                    pointerEvents="none"
                    className="absolute inset-0 rounded-[22px]"
                    style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }}
                />

                {/* Left accent line (glowing) */}
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 14,
                        bottom: 14,
                        width: 3,
                        backgroundColor: ACCENT,
                        borderTopRightRadius: 3,
                        borderBottomRightRadius: 3,
                        shadowColor: ACCENT,
                        shadowOpacity: 0.7,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 0 },
                    }}
                />

                <View className="p-4 pl-5">
                    <View className="flex-row items-start gap-3.5">
                        <View
                            style={{
                                shadowColor: ACCENT,
                                shadowOpacity: 0.35,
                                shadowRadius: 10,
                                shadowOffset: { width: 0, height: 2 },
                            }}
                        >
                            <View
                                style={{
                                    borderWidth: 1.5,
                                    borderColor: 'rgba(167, 139, 250, 0.55)',
                                    borderRadius: 16,
                                    padding: 2,
                                }}
                            >
                                <PlayerAvatar
                                    src={hubAvatar}
                                    name={hubName}
                                    size="md"
                                    className="rounded-[12px]"
                                />
                            </View>
                        </View>

                        <View className="flex-1 min-w-0">
                            {/* Hub name gets the full row — no longer fights the
                                timestamp for width, so it stops truncating. */}
                            <Text
                                className="font-black text-white text-[14px] tracking-tight"
                                numberOfLines={1}
                            >
                                {hubName}
                            </Text>
                            {/* Timestamp lives on its own line as a quiet subtitle. */}
                            <View className="flex-row items-center gap-1 mt-0.5 mb-1.5">
                                <Ionicons name="time-outline" size={10} color="#64748B" />
                                <Text className="text-[9.5px] font-bold text-slate-500 uppercase tracking-[1px]">
                                    {timestamp}
                                </Text>
                            </View>
                            <Text
                                className="text-[13px] text-slate-300 leading-[18px]"
                                numberOfLines={2}
                            >
                                {message}
                            </Text>
                            {tournamentName && (
                                <View
                                    className="flex-row items-center gap-1.5 mt-2.5 self-start px-2.5 py-1 rounded-lg"
                                    style={{
                                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(16, 185, 129, 0.28)',
                                    }}
                                >
                                    <Ionicons name="trophy" size={10} color="#34D399" />
                                    <Text
                                        className="text-[10px] font-black text-emerald-300 uppercase tracking-tight"
                                        numberOfLines={1}
                                    >
                                        {tournamentName}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </Pressable>
    );
});
