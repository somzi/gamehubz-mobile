import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';

export interface ParticipantRowProps {
    /** Raw participant record off the API — casing varies, so both spellings are read. */
    participant: any;
    seed: number;
    isCurrentUser: boolean;
    canSwap: boolean;
    canRemove: boolean;
    /** This row's own removal is in flight. */
    isProcessing: boolean;
    /** Some row's action is in flight — every row's buttons go inert. */
    actionsDisabled: boolean;
    onOpenProfile: (userId: string) => void;
    onSwap: (target: { userId: string; username: string; avatarUrl?: string }) => void;
    onRemove: (target: { userId: string; username: string }) => void;
}

/**
 * One confirmed player in the Players tab.
 *
 * Memoized on purpose: the tab lives inside the screen's single ScrollView, so a full
 * 128-player field is mounted at once and used to re-render in full on every one of the
 * screen's state changes — most visibly on each keystroke in the player search. The
 * participant objects keep their identity across a filter, so with this boundary only
 * the rows that actually enter or leave the result set do any work.
 */
export const ParticipantRow = React.memo(function ParticipantRow({
    participant: p,
    seed,
    isCurrentUser,
    canSwap,
    canRemove,
    isProcessing,
    actionsDisabled,
    onOpenProfile,
    onSwap,
    onRemove,
}: ParticipantRowProps) {
    const { t } = useTranslation('tournament');
    const { t: tCommon } = useTranslation('common');

    const pUserId = p.userId || p.UserId || p.id;
    const username = p.username || p.Username;
    const avatarUrl = p.avatarUrl || p.AvatarUrl;

    return (
        <View className="flex-row items-center gap-2.5">
            <Pressable
                onPress={() => { if (pUserId) onOpenProfile(pUserId); }}
                className="flex-1 active:opacity-80"
            >
                <View
                    className="rounded-[22px] overflow-hidden"
                    style={{
                        backgroundColor: '#131B2E',
                        shadowColor: isCurrentUser ? '#10B981' : '#000000',
                        shadowOpacity: isCurrentUser ? 0.18 : 0.22,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 5 },
                        elevation: 4,
                    }}
                >
                    <LinearGradient
                        colors={[isCurrentUser ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.035)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.85, y: 0 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                    <View
                        pointerEvents="none"
                        className="absolute inset-0 rounded-[22px]"
                        style={{ borderWidth: 1, borderColor: isCurrentUser ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.06)' }}
                    />
                    {isCurrentUser && (
                        <View
                            style={{
                                position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
                                backgroundColor: '#10B981', borderTopRightRadius: 3, borderBottomRightRadius: 3,
                                shadowColor: '#10B981', shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                            }}
                        />
                    )}
                    <View className="flex-row items-center p-3.5 pl-4">
                        <View
                            className="w-8 h-8 rounded-xl items-center justify-center mr-3"
                            style={{
                                backgroundColor: isCurrentUser ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                                borderWidth: 1,
                                borderColor: isCurrentUser ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)',
                            }}
                        >
                            <Text className="font-black text-[13px]" style={{ color: isCurrentUser ? '#34D399' : '#64748B' }}>{seed}</Text>
                        </View>
                        <View style={{ shadowColor: '#10B981', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 2 } }}>
                            <View style={{ borderWidth: 1.5, borderColor: isCurrentUser ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 2 }}>
                                <PlayerAvatar src={avatarUrl} name={username || tCommon('player')} size="md" />
                            </View>
                            <View
                                className="absolute items-center justify-center"
                                style={{ bottom: -2, right: -2, width: 18, height: 18, borderRadius: 999, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#131B2E' }}
                            >
                                <Ionicons name="checkmark" size={9} color="#0F172A" />
                            </View>
                        </View>
                        <View className="flex-1 ml-3 justify-center">
                            <View className="flex-row items-center gap-2">
                                <Text className="font-black text-base text-white" numberOfLines={1}>{username}</Text>
                                {isCurrentUser && (
                                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                                        <Text className="text-[9px] font-black uppercase tracking-wider text-emerald-300">{t('details.youBadge')}</Text>
                                    </View>
                                )}
                            </View>
                            <View className="flex-row items-center gap-1 mt-1">
                                <View className="w-1 h-1 rounded-full" style={{ backgroundColor: '#10B981' }} />
                                <Text className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: 'rgba(16,185,129,0.8)' }}>{t('details.confirmedBadge')}</Text>
                            </View>
                        </View>
                        <View
                            className="w-8 h-8 rounded-full items-center justify-center ml-2"
                            style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}
                        >
                            <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                        </View>
                    </View>
                </View>
            </Pressable>
            {canSwap && (
                <Pressable
                    onPress={() => onSwap({
                        userId: pUserId,
                        username: username || tCommon('player'),
                        avatarUrl,
                    })}
                    disabled={actionsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={t('swap.swapThePlayer')}
                    className="w-11 h-11 rounded-2xl items-center justify-center active:opacity-60"
                    style={{
                        backgroundColor: 'rgba(129,140,248,0.10)',
                        borderWidth: 1,
                        borderColor: 'rgba(129,140,248,0.22)',
                    }}
                >
                    <Ionicons name="swap-horizontal" size={18} color="#818CF8" />
                </Pressable>
            )}
            {canRemove && (
                <Pressable
                    onPress={() => onRemove({
                        userId: pUserId,
                        username: username || t('details.thisPlayer'),
                    })}
                    disabled={actionsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={t('details.removePlayer')}
                    className="w-11 h-11 rounded-2xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                >
                    {isProcessing ? (
                        <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    )}
                </Pressable>
            )}
        </View>
    );
});
