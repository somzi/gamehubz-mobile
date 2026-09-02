import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text } from 'react-native';
import { PressableScale } from '../ui/PressableScale';
import { LinearGradient } from 'expo-linear-gradient';
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
    isVerified?: boolean;
    className?: string;
    index?: number;
    /** Pending items the user has to approve in this hub — shown as a red corner badge. */
    badgeCount?: number;
}

const AVATAR_STYLES = [
    { bg: 'rgba(129, 140, 248, 0.10)', border: 'rgba(129, 140, 248, 0.22)', icon: '#818CF8' },
    { bg: 'rgba(52, 211, 153, 0.10)', border: 'rgba(52, 211, 153, 0.22)', icon: '#34D399' },
    { bg: 'rgba(96, 165, 250, 0.10)', border: 'rgba(96, 165, 250, 0.22)', icon: '#60A5FA' },
];

// Memoized to avoid re-rendering the whole hubs list every time an unrelated piece of
// state changes (search input, badge tick). Callers should pass a stable onClick.
export const HubCard = React.memo(function HubCard({
    name,
    numberOfUsers,
    numberOfTournaments = 0,
    avatarUrl,
    onClick,
    isJoined,
    isVerified,
    className,
    index = 0,
    badgeCount = 0,
}: HubCardProps) {
    const { t } = useTranslation('common');
    const avatarStyle = AVATAR_STYLES[index % AVATAR_STYLES.length];

    // Joined hubs get an emerald-tinted gradient; non-joined get a subtle neutral indigo
    const accentTint = isJoined ? 'rgba(16, 185, 129, 0.05)' : 'rgba(129, 140, 248, 0.04)';

    return (
        <PressableScale onPress={onClick} className={className}>
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

                {/* Pending-approvals badge — sits inside the card's top-right corner
                    so it isn't clipped by FlatList's removeClippedSubviews. */}
                {badgeCount > 0 && (
                    <View
                        pointerEvents="none"
                        className="absolute z-10 rounded-full items-center justify-center"
                        style={{
                            top: 8,
                            right: 8,
                            minWidth: 22,
                            height: 22,
                            paddingHorizontal: 6,
                            backgroundColor: '#EF4444',
                            borderWidth: 2,
                            borderColor: '#0B1120',
                        }}
                    >
                        <Text className="text-white text-[11px] font-black">
                            {badgeCount > 99 ? '99+' : badgeCount}
                        </Text>
                    </View>
                )}

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
                            {avatarUrl ? (
                                <PlayerAvatar
                                    name={name}
                                    src={avatarUrl}
                                    size="lg"
                                    className="w-full h-full rounded-2xl border-0"
                                />
                            ) : (
                                <Ionicons name="people" size={26} color={avatarStyle.icon} />
                            )}
                        </View>

                        <View className="flex-1 min-w-0 pr-2">
                            <View className="flex-row items-center" style={{ gap: 6 }}>
                                <Text
                                    className="text-white font-black text-lg tracking-tight leading-tight flex-shrink"
                                    numberOfLines={2}
                                >
                                    {name}
                                </Text>
                                {isVerified && (
                                    <View className="w-5 h-5 rounded-full bg-sky-500 items-center justify-center">
                                        <Ionicons name="checkmark" size={13} color="#fff" />
                                    </View>
                                )}
                            </View>
                        </View>

                        {isJoined && (
                            <View className="rounded-full overflow-hidden">
                                <LinearGradient
                                    colors={['rgba(16, 185, 129, 0.20)', 'rgba(16, 185, 129, 0.08)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 5,
                                    }}
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
                                            borderColor: 'rgba(16, 185, 129, 0.32)',
                                            borderRadius: 999,
                                        }}
                                    />
                                    <Ionicons name="checkmark-circle" size={11} color="#34D399" />
                                    <Text
                                        className="text-[10px] font-black uppercase text-emerald-300"
                                        style={{ letterSpacing: 1.4 }}
                                    >
                                        {t('app.joined')}
                                    </Text>
                                </LinearGradient>
                            </View>
                        )}
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
                                <Ionicons name="people-outline" size={13} color="#34D399" />
                                <Text className="text-[11px] font-black text-slate-300 ml-1.5">
                                    {numberOfUsers} <Text className="text-slate-500 font-bold">{t('app.fans')}</Text>
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
                                <Ionicons name="trophy-outline" size={13} color="#A5B4FC" />
                                <Text className="text-[11px] font-black text-slate-300 ml-1.5">
                                    {numberOfTournaments} <Text className="text-slate-500 font-bold">{t('common:nav.tournaments')}</Text>
                                </Text>
                            </View>
                        </View>

                        <View
                            className="w-9 h-9 rounded-full items-center justify-center"
                            style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                borderWidth: 1,
                                borderColor: 'rgba(255, 255, 255, 0.06)',
                            }}
                        >
                            <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                        </View>
                    </View>
                </View>
            </View>

        </PressableScale>
    );
});
