import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SwapTeam {
    id: string;
    name: string;
    seed?: number | null;
}

export interface SwapBracketModalProps {
    visible: boolean;
    onClose: () => void;
    teams: SwapTeam[];
    onConfirm: (aId: string, bId: string) => void;
    busy?: boolean;
}

// Premium two-step re-seed: tap one team, then another, then Swap. The two glow as A / B and a
// live "A ⇄ B" preview sits above the CTA. Only first-round, unplayed teams are passed in.
export function SwapBracketModal({ visible, onClose, teams, onConfirm, busy }: SwapBracketModalProps) {
    const { t } = useTranslation('tournament');
    const [selected, setSelected] = useState<string[]>([]);

    // Reset the selection whenever the sheet is (re)opened.
    useEffect(() => {
        if (visible) setSelected([]);
    }, [visible]);

    const toggle = (id: string) => {
        setSelected((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= 2) return [prev[1], id]; // keep the most recent two
            return [...prev, id];
        });
    };

    const teamById = (id?: string) => teams.find((t) => t.id === id);
    const a = teamById(selected[0]);
    const b = teamById(selected[1]);
    const ready = !!a && !!b && !busy;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View className="flex-1 bg-black/60 justify-end">
                <Pressable className="absolute inset-0" onPress={busy ? undefined : onClose} />

                <View className="bg-card rounded-t-[32px] border-t border-x border-white/[0.06] overflow-hidden" style={{ maxHeight: '85%' }}>
                    {/* Header */}
                    <View className="px-6 pt-5 pb-4 border-b border-white/[0.05]">
                        <View className="flex-row items-center gap-2.5">
                            <View className="w-9 h-9 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' }}>
                                <Ionicons name="swap-horizontal" size={18} color="#818CF8" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-black text-white">{t('swapBracket.title')}</Text>
                                <Text className="text-[11px] text-slate-500 mt-0.5">{t('swapBracket.subtitle')}</Text>
                            </View>
                            <Pressable onPress={busy ? undefined : onClose} className="w-8 h-8 items-center justify-center rounded-full bg-white/[0.04]">
                                <Ionicons name="close" size={18} color="#94A3B8" />
                            </Pressable>
                        </View>
                    </View>

                    {/* Team list */}
                    <ScrollView className="px-4 py-3" contentContainerStyle={{ gap: 8 }}>
                        {teams.length === 0 ? (
                            <Text className="text-slate-500 text-center py-8 px-6">{t('swapBracket.noSwappable')}</Text>
                        ) : (
                            teams.map((t) => {
                                const role = t.id === selected[0] ? 'A' : t.id === selected[1] ? 'B' : null;
                                const isSel = role !== null;
                                return (
                                    <Pressable
                                        key={t.id}
                                        onPress={() => toggle(t.id)}
                                        disabled={busy}
                                        className="flex-row items-center gap-3 px-4 py-3 rounded-2xl border"
                                        style={{
                                            backgroundColor: isSel ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                                            borderColor: isSel ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.06)',
                                        }}
                                    >
                                        <View className="w-7 h-7 rounded-lg items-center justify-center bg-white/[0.05]">
                                            <Text className="text-[11px] font-black text-slate-400">{t.seed ?? '–'}</Text>
                                        </View>
                                        <Text className="flex-1 text-sm font-bold text-slate-100" numberOfLines={1}>{t.name}</Text>
                                        {role && (
                                            <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                                                <Text className="text-[11px] font-black text-white">{role}</Text>
                                            </View>
                                        )}
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>

                    {/* Footer: live preview + CTA */}
                    <View className="px-6 pt-3 pb-7 border-t border-white/[0.05] gap-3">
                        <View className="flex-row items-center justify-center gap-2 min-h-[20px]">
                            <Text className="text-sm font-bold text-indigo-300" numberOfLines={1}>{a?.name ?? t('swapBracket.teamA')}</Text>
                            <Ionicons name="swap-horizontal" size={16} color="#64748B" />
                            <Text className="text-sm font-bold text-indigo-300" numberOfLines={1}>{b?.name ?? t('swapBracket.teamB')}</Text>
                        </View>
                        <Pressable
                            onPress={() => { if (ready) onConfirm(a!.id, b!.id); }}
                            disabled={!ready}
                            className="w-full flex-row items-center justify-center gap-2 py-3.5 rounded-2xl"
                            style={{ backgroundColor: ready ? '#4F46E5' : 'rgba(255,255,255,0.06)' }}
                        >
                            {busy
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Ionicons name="swap-horizontal" size={16} color={ready ? '#FFFFFF' : '#64748B'} />}
                            <Text className="text-sm font-black" style={{ color: ready ? '#FFFFFF' : '#64748B' }}>{t('swapBracket.swapPositions')}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
