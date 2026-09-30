import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { COLORS } from '../../lib/theme';

export interface ParticipantRowProps {
    /** Raw participant record off the API — casing varies, so both spellings are read. */
    participant: any;
    seed: number;
    isCurrentUser: boolean;
    /** First row of the roster panel: no hairline above it. */
    first: boolean;
    canSwap: boolean;
    canRemove: boolean;
    /** This row's own removal is in flight. */
    isProcessing: boolean;
    /** The swap sheet for this row is loading before it opens. */
    isOpeningSwap: boolean;
    /** Some row's action is in flight — every row's buttons go inert. */
    actionsDisabled: boolean;
    onOpenProfile: (userId: string) => void;
    onSwap: (target: { userId: string; username: string; avatarUrl?: string }) => void;
    onRemove: (target: { userId: string; username: string }) => void;
}

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * One confirmed player, as a row of the Players tab's roster panel: seed, avatar, name, and the
 * organiser's swap / remove actions on the same line. The viewer's own row carries an emerald tint
 * and rail.
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
    first,
    canSwap,
    canRemove,
    isProcessing,
    isOpeningSwap,
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
    const hasActions = canSwap || canRemove;

    return (
        <View
            className={`flex-row items-center pl-4 pr-3 py-2.5 ${first ? '' : 'border-t border-white/[0.05]'}`}
            style={isCurrentUser ? { backgroundColor: 'rgba(16,185,129,0.07)' } : undefined}
        >
            {isCurrentUser && (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute', left: 0, top: 10, bottom: 10, width: 3,
                        backgroundColor: COLORS.primary, borderTopRightRadius: 3, borderBottomRightRadius: 3,
                        shadowColor: COLORS.primary, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                    }}
                />
            )}

            <Pressable
                onPress={() => { if (pUserId) onOpenProfile(pUserId); }}
                accessibilityRole="button"
                className="flex-1 flex-row items-center active:opacity-70"
            >
                <Text
                    style={[TABULAR, { width: 26, color: isCurrentUser ? COLORS.primaryBright : COLORS.slate500 }]}
                    className="text-[13px] font-black text-center mr-2"
                >
                    {seed}
                </Text>
                <View>
                    <View style={{ borderWidth: 1.5, borderColor: isCurrentUser ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 1.5 }}>
                        <PlayerAvatar src={avatarUrl} name={username || tCommon('player')} size="md" className="border-0" />
                    </View>
                    <View
                        className="absolute items-center justify-center"
                        style={{ bottom: -2, right: -2, width: 16, height: 16, borderRadius: 999, backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.card }}
                    >
                        <Ionicons name="checkmark" size={8} color={COLORS.background} />
                    </View>
                </View>
                <View className="flex-1 flex-row items-center ml-3" style={{ gap: 6 }}>
                    <Text className="shrink text-[15px] font-black text-white" numberOfLines={1}>{username}</Text>
                    {isCurrentUser && (
                        <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                            <Text className="text-[9px] font-black uppercase tracking-wider text-emerald-300">{t('details.youBadge')}</Text>
                        </View>
                    )}
                </View>
                {!hasActions && <Ionicons name="chevron-forward" size={14} color={COLORS.slate600} style={{ marginLeft: 6 }} />}
            </Pressable>

            {hasActions && (
                <View className="flex-row items-center ml-2" style={{ gap: 6 }}>
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
                            className="w-9 h-9 rounded-xl items-center justify-center bg-indigo-400/10 border border-indigo-400/25 active:opacity-60"
                        >
                            {isOpeningSwap ? (
                                <ActivityIndicator size="small" color="#818CF8" />
                            ) : (
                                <Ionicons name="swap-horizontal" size={16} color="#818CF8" />
                            )}
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
                            className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="#EF4444" />
                            ) : (
                                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                            )}
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );
});
