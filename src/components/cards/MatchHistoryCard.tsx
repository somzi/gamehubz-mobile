import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn } from '../../lib/utils';

interface MatchHistoryCardProps {
    tournamentName: string;
    hubName?: string;
    userName?: string;
    userAvatarUrl?: string;
    opponentName: string;
    opponentAvatarUrl?: string;
    result: 'win' | 'loss' | 'draw';
    date: string;
    userScore?: number;
    opponentScore?: number;
    onPress?: () => void;
    className?: string;
}

const RESULT_THEME = {
    win: {
        main: '#10B981',
        light: '#6EE7B7',
        text: '#A7F3D0',
        ring: 'rgba(16, 185, 129, 0.55)',
        bgFrom: 'rgba(16, 185, 129, 0.28)',
        bgTo: 'rgba(16, 185, 129, 0.10)',
        tint: 'rgba(16, 185, 129, 0.12)',
        glow: '#10B981',
        labelKey: 'app.victory',
    },
    loss: {
        main: '#EF4444',
        light: '#FCA5A5',
        text: '#FECACA',
        ring: 'rgba(239, 68, 68, 0.55)',
        bgFrom: 'rgba(239, 68, 68, 0.28)',
        bgTo: 'rgba(239, 68, 68, 0.10)',
        tint: 'rgba(239, 68, 68, 0.12)',
        glow: '#EF4444',
        labelKey: 'app.defeat',
    },
    draw: {
        main: '#6366F1',
        light: '#A5B4FC',
        text: '#C7D2FE',
        ring: 'rgba(99, 102, 241, 0.55)',
        bgFrom: 'rgba(99, 102, 241, 0.28)',
        bgTo: 'rgba(99, 102, 241, 0.10)',
        tint: 'rgba(99, 102, 241, 0.12)',
        glow: '#6366F1',
        labelKey: 'app.drawResult',
    },
} as const;

// Memoized so scrolling / loading additional pages doesn't re-render every history row.
export const MatchHistoryCard = React.memo(function MatchHistoryCard({
    tournamentName,
    hubName,
    userName,
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
    const { t } = useTranslation('common');
    const theme = RESULT_THEME[result];
    const hasScore = userScore !== undefined && opponentScore !== undefined;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({ opacity: pressed && onPress ? 0.9 : 1 })}
            className={className}
        >
            <View
                className="rounded-[22px] overflow-hidden"
                style={{
                    backgroundColor: '#131B2E',
                    shadowColor: theme.glow,
                    shadowOpacity: 0.14,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                }}
            >
                {/* Status-tinted gradient (subtle, left-to-right) */}
                <LinearGradient
                    colors={[theme.tint, 'transparent']}
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

                {/* Left glowing accent */}
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 14,
                        bottom: 14,
                        width: 3,
                        backgroundColor: theme.main,
                        borderTopRightRadius: 3,
                        borderBottomRightRadius: 3,
                        shadowColor: theme.glow,
                        shadowOpacity: 0.7,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 0 },
                    }}
                />

                <View className="p-4 pl-5">
                    {/* Header: Hub / Tournament / Date */}
                    <View className="flex-row justify-between items-start mb-4">
                        <View className="flex-1 pr-3">
                            {hubName && (
                                <View className="flex-row items-center gap-1.5 mb-0.5">
                                    <View
                                        style={{
                                            width: 4,
                                            height: 4,
                                            borderRadius: 2,
                                            backgroundColor: theme.main,
                                        }}
                                    />
                                    <Text
                                        className="text-[10px] font-black uppercase tracking-[2px]"
                                        style={{ color: theme.light }}
                                        numberOfLines={1}
                                    >
                                        {hubName}
                                    </Text>
                                </View>
                            )}
                            <Text
                                className="text-[10px] font-bold text-slate-500 uppercase tracking-wider"
                                numberOfLines={1}
                            >
                                {tournamentName}
                            </Text>
                        </View>
                        <Text className="text-[10px] font-bold text-slate-500">
                            {date}
                        </Text>
                    </View>

                    {/* Versus row */}
                    <View className="flex-row items-center">
                        {/* User side */}
                        <View className="items-center w-[28%]">
                            <View
                                style={{
                                    shadowColor: theme.glow,
                                    shadowOpacity: 0.4,
                                    shadowRadius: 10,
                                    shadowOffset: { width: 0, height: 3 },
                                }}
                            >
                                <View
                                    style={{
                                        borderWidth: 1.5,
                                        borderColor: theme.ring,
                                        borderRadius: 16,
                                        padding: 2,
                                    }}
                                >
                                    <PlayerAvatar
                                        src={userAvatarUrl}
                                        name={userName ?? t('app.me')}
                                        size="md"
                                        className="rounded-[12px]"
                                    />
                                </View>
                            </View>
                            <Text
                                className="text-[11px] font-black text-white mt-2 text-center"
                                numberOfLines={1}
                            >
                                {userName}
                            </Text>
                        </View>

                        {/* Score + Result pill */}
                        <View className="items-center flex-1 px-2">
                            {hasScore ? (
                                <Text
                                    className="text-[26px] font-black text-white"
                                    style={{ letterSpacing: 3, lineHeight: 30 }}
                                >
                                    {userScore} : {opponentScore}
                                </Text>
                            ) : (
                                <Text className="text-base font-black text-slate-600 uppercase tracking-widest">
                                    VS
                                </Text>
                            )}

                            <View
                                className="rounded-lg overflow-hidden mt-2"
                                style={{
                                    shadowColor: theme.glow,
                                    shadowOpacity: 0.3,
                                    shadowRadius: 6,
                                    shadowOffset: { width: 0, height: 2 },
                                }}
                            >
                                <LinearGradient
                                    colors={[theme.bgFrom, theme.bgTo]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    style={{ paddingHorizontal: 12, paddingVertical: 4 }}
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
                                            borderRadius: 8,
                                        }}
                                    />
                                    <Text
                                        className="text-[10px] font-black uppercase"
                                        style={{
                                            color: theme.text,
                                            letterSpacing: 1.4,
                                        }}
                                    >
                                        {t(theme.labelKey)}
                                    </Text>
                                </LinearGradient>
                            </View>
                        </View>

                        {/* Opponent side */}
                        <View className="items-center w-[28%]">
                            <View
                                style={{
                                    borderWidth: 1.5,
                                    borderColor: 'rgba(255, 255, 255, 0.10)',
                                    borderRadius: 16,
                                    padding: 2,
                                }}
                            >
                                <PlayerAvatar
                                    src={opponentAvatarUrl}
                                    name={opponentName}
                                    size="md"
                                    className="rounded-[12px]"
                                />
                            </View>
                            <Text
                                className="text-[11px] font-bold text-slate-300 mt-2 text-center"
                                numberOfLines={1}
                            >
                                {opponentName}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </Pressable>
    );
});
