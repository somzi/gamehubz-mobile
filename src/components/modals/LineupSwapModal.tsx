import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { ConfirmationModal } from './ConfirmationModal';
import { COLORS } from '../../lib/theme';

export interface LineupPlayer {
    userId: string;
    username: string;
    avatarUrl?: string | null;
    isCaptain?: boolean;
}

interface LineupSwapModalProps {
    visible: boolean;
    onClose: () => void;
    /** The bench player being brought in. Null closes the sheet. */
    reserve: LineupPlayer | null;
    /** The current lineup — one of these has to come out. */
    starters: LineupPlayer[];
    busy?: boolean;
    error?: string | null;
    onConfirm: (starterUserId: string) => void;
}

/**
 * Captain's substitution sheet: pick which player in the lineup the bench player replaces.
 *
 * The captain chooses *who* comes out, never *which game* the sub walks into — the replacement
 * inherits the outgoing player's exact fixture. That's deliberate: match-ups are drawn at random
 * when the games are created, so letting a captain place a sub into a chosen slot after seeing the
 * draw would turn substitutions into hand-picked match-ups.
 */
export function LineupSwapModal({
    visible,
    onClose,
    reserve,
    starters,
    busy,
    error,
    onConfirm,
}: LineupSwapModalProps) {
    const { t } = useTranslation('team');
    const insets = useSafeAreaInsets();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Set once the captain taps the CTA — a lineup change reassigns real fixtures, so it never
    // fires straight off a tap. Cancelling drops back to this sheet with the pick intact.
    const [confirming, setConfirming] = useState(false);

    // Fresh selection each time the sheet opens (or switches to another bench player).
    useEffect(() => {
        if (visible) {
            setSelectedId(null);
            setConfirming(false);
        }
    }, [visible, reserve?.userId]);

    // A failed swap comes back with the sheet open, so drop out of the confirm step to show it.
    useEffect(() => {
        if (error) setConfirming(false);
    }, [error]);

    const selected = starters.find((s) => s.userId === selectedId) ?? null;
    const accent = COLORS.team;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            // The confirmation is an overlay, not a window, so back has to be routed by hand.
            onRequestClose={() => {
                if (busy) return;
                if (confirming) { setConfirming(false); return; }
                onClose();
            }}
        >
            <View className="flex-1 justify-end">
                <Pressable className="absolute inset-0 bg-black/70" onPress={busy ? undefined : onClose} />

                <View
                    className="bg-card rounded-t-[32px] border-t border-x border-white/[0.07] overflow-hidden"
                    style={{ maxHeight: '88%', paddingBottom: Math.max(insets.bottom, 12) }}
                >
                    <View className="self-center w-10 h-1 rounded-full bg-white/15 mt-3 mb-3" />

                    {/* ── Header ─────────────────────────────────────────────────────────── */}
                    <View className="px-5 pb-4 flex-row items-center gap-3 border-b border-white/[0.05]">
                        <View
                            className="w-10 h-10 rounded-2xl items-center justify-center"
                            style={{ backgroundColor: `${accent}1F`, borderWidth: 1, borderColor: `${accent}38` }}
                        >
                            <Ionicons name="repeat" size={20} color={accent} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white text-lg font-black" numberOfLines={1}>
                                {t('lineupSwap.title')}
                            </Text>
                            <Text className="text-slate-500 text-[11px] mt-0.5" numberOfLines={2}>
                                {t('lineupSwap.subtitle')}
                            </Text>
                        </View>
                        <Pressable
                            onPress={busy ? undefined : onClose}
                            hitSlop={8}
                            className="w-9 h-9 rounded-full bg-white/[0.05] items-center justify-center"
                        >
                            <Ionicons name="close" size={18} color="#94A3B8" />
                        </Pressable>
                    </View>

                    {/* flexShrink keeps the confirm button inside the sheet: without it a long roster
                        grows the list past maxHeight and the clipped footer takes the button with it. */}
                    <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
                        {/* ── Coming in ──────────────────────────────────────────────────── */}
                        {reserve && (
                            <View className="px-5 pt-4">
                                <Text className="text-[10px] font-black uppercase tracking-[1.6px] text-slate-500 mb-2.5">
                                    {t('lineupSwap.comingIn')}
                                </Text>
                                <View
                                    className="rounded-3xl overflow-hidden"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: `${accent}2E` }}
                                >
                                    <LinearGradient
                                        colors={[`${accent}16`, 'transparent']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 0.9, y: 1 }}
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                    />
                                    <View className="flex-row items-center p-4 gap-3">
                                        <View style={{ borderWidth: 1.5, borderColor: `${accent}66`, borderRadius: 999, padding: 2 }}>
                                            <PlayerAvatar src={reserve.avatarUrl ?? undefined} name={reserve.username} size="md" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white font-black text-[15px]" numberOfLines={1}>
                                                {reserve.username}
                                            </Text>
                                            <Text className="text-[10px] font-black uppercase tracking-wider mt-1" style={{ color: accent }}>
                                                {t('lineupSwap.fromTheBench')}
                                            </Text>
                                        </View>
                                        <Ionicons name="arrow-forward" size={18} color={accent} />
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* ── Going out ──────────────────────────────────────────────────── */}
                        <View className="px-5 pt-5">
                            <Text className="text-[10px] font-black uppercase tracking-[1.6px] text-slate-500 mb-2.5">
                                {t('lineupSwap.goingOut')}
                            </Text>

                            {starters.length === 0 ? (
                                <View
                                    className="items-center py-8 px-6 rounded-3xl"
                                    style={{
                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(255,255,255,0.06)',
                                    }}
                                >
                                    <Ionicons name="people-outline" size={32} color="#475569" />
                                    <Text className="text-slate-400 text-[13px] font-bold mt-3 text-center">
                                        {t('lineupSwap.noOneInLineup')}
                                    </Text>
                                </View>
                            ) : (
                                <View className="gap-2">
                                    {starters.map((starter) => {
                                        const isSelected = selectedId === starter.userId;

                                        return (
                                            <PressableScale
                                                key={starter.userId}
                                                onPress={() => setSelectedId(isSelected ? null : starter.userId)}
                                                className="flex-row items-center gap-3 p-3 rounded-2xl"
                                                style={{
                                                    backgroundColor: isSelected ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.025)',
                                                    borderWidth: 1,
                                                    borderColor: isSelected ? 'rgba(239,68,68,0.40)' : 'rgba(255,255,255,0.06)',
                                                }}
                                            >
                                                <PlayerAvatar src={starter.avatarUrl ?? undefined} name={starter.username} size="sm" />
                                                <View className="flex-1">
                                                    <Text className="text-white font-bold text-[14px]" numberOfLines={1}>
                                                        {starter.username}
                                                    </Text>
                                                    <Text
                                                        className="text-[10px] font-black uppercase tracking-wider mt-0.5"
                                                        style={{ color: starter.isCaptain ? COLORS.warning : COLORS.slate500 }}
                                                    >
                                                        {starter.isCaptain ? t('captainBadge') : t('lineupSwap.inTheLineup')}
                                                    </Text>
                                                </View>
                                                <View
                                                    className="w-6 h-6 rounded-full items-center justify-center"
                                                    style={{
                                                        backgroundColor: isSelected ? COLORS.destructive : 'rgba(255,255,255,0.05)',
                                                        borderWidth: 1,
                                                        borderColor: isSelected ? COLORS.destructive : 'rgba(255,255,255,0.12)',
                                                    }}
                                                >
                                                    {isSelected && <Ionicons name="arrow-down" size={13} color="#FFFFFF" />}
                                                </View>
                                            </PressableScale>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </ScrollView>

                    {/* ── Confirm ────────────────────────────────────────────────────────── */}
                    <View className="px-5 pt-3 border-t border-white/[0.05]">
                        {selected && reserve && (
                            <View className="flex-row items-center justify-center gap-2.5 mb-3">
                                <Text className="text-slate-400 text-[12px] font-bold flex-shrink" numberOfLines={1}>
                                    {selected.username}
                                </Text>
                                <Ionicons name="swap-horizontal" size={14} color={accent} />
                                <Text className="text-white text-[12px] font-black flex-shrink" numberOfLines={1}>
                                    {reserve.username}
                                </Text>
                            </View>
                        )}

                        {error && (
                            <View
                                className="flex-row items-start gap-2 p-3 rounded-2xl mb-3"
                                style={{
                                    backgroundColor: 'rgba(239,68,68,0.08)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(239,68,68,0.22)',
                                }}
                            >
                                <Ionicons name="alert-circle" size={15} color={COLORS.destructive} />
                                <Text className="flex-1 text-[12px] leading-[17px] text-red-200">{error}</Text>
                            </View>
                        )}

                        <PressableScale
                            onPress={() => selected && setConfirming(true)}
                            disabled={!selected || busy}
                            className="h-14 rounded-2xl flex-row items-center justify-center gap-2"
                            style={{
                                backgroundColor: !selected || busy ? 'rgba(255,255,255,0.05)' : accent,
                                borderWidth: 1,
                                borderColor: !selected || busy ? 'rgba(255,255,255,0.08)' : accent,
                            }}
                        >
                            {busy ? (
                                <ActivityIndicator size="small" color={COLORS.teamForeground} />
                            ) : (
                                <>
                                    <Ionicons
                                        name="repeat"
                                        size={18}
                                        color={selected ? COLORS.teamForeground : '#64748B'}
                                    />
                                    <Text
                                        className="font-black text-[15px]"
                                        style={{ color: selected ? COLORS.teamForeground : '#64748B' }}
                                    >
                                        {selected ? t('lineupSwap.makeTheSwap') : t('lineupSwap.pickWhoComesOut')}
                                    </Text>
                                </>
                            )}
                        </PressableScale>
                    </View>
                </View>
            </View>

            {/* Overlay, not a nested Modal: this keeps the sheet and its confirmation in one
                Android window, so closing them cannot strand a window over the screen. */}
            <ConfirmationModal
                overlay
                visible={confirming && !!selected && !!reserve}
                onClose={() => setConfirming(false)}
                onConfirm={() => {
                    if (!selected) return;
                    // Drop the confirmation before the request goes out: the dashboard closes
                    // this sheet on success, and unmounting it while the dialog is still
                    // presented strands that dialog over the screen. The sheet's own CTA
                    // carries the busy spinner, and a failure already renders inline above it.
                    setConfirming(false);
                    onConfirm(selected.userId);
                }}
                title={t('lineupSwap.confirmTitle')}
                message={selected && reserve
                    ? t('lineupSwap.confirmMessage', { incoming: reserve.username, outgoing: selected.username })
                    : ''}
                confirmText={t('lineupSwap.makeTheSwap')}
                isDestructive={false}
                isLoading={busy}
                stacked
            />
        </Modal>
    );
}
