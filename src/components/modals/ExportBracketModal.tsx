import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';

interface ExportBracketModalProps {
    visible: boolean;
    onClose: () => void;
    /** Called with the chosen mode. Fires AFTER the sheet has dismissed so the
     *  follow-up download + native share sheet aren't swallowed by the closing Modal. */
    onSelect: (includeSchedule: boolean) => void;
}

interface OptionProps {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    accent: string;
    accentBg: string;
    accentBorder: string;
    badge?: string;
    onPress: () => void;
}

function ExportOption({ icon, title, subtitle, accent, accentBg, accentBorder, badge, onPress }: OptionProps) {
    return (
        <PressableScale
            onPress={onPress}
            containerStyle={{ marginBottom: 12 }}
            className="flex-row items-center gap-4 rounded-3xl border p-4"
            style={{ backgroundColor: accentBg, borderColor: accentBorder }}
        >
            <View
                className="w-12 h-12 rounded-2xl items-center justify-center"
                style={{ backgroundColor: `${accent}1F`, borderWidth: 1, borderColor: `${accent}33` }}
            >
                <Ionicons name={icon} size={24} color={accent} />
            </View>

            <View className="flex-1">
                <View className="flex-row items-center gap-2">
                    <Text className="text-white text-[15px] font-black" numberOfLines={1}>
                        {title}
                    </Text>
                    {badge ? (
                        <View
                            className="px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${accent}22`, borderWidth: 1, borderColor: `${accent}44` }}
                        >
                            <Text style={{ color: accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 }}>
                                {badge}
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Text className="text-slate-400 text-xs mt-1 leading-4" numberOfLines={2}>
                    {subtitle}
                </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#64748B" />
        </PressableScale>
    );
}

/** Premium bottom-sheet that lets the organiser pick what the exported PDF contains:
 *  the standings/bracket only, or the full report with every round's schedule + results.
 *  Only shown when the tournament actually has a group/league stage the schedule applies to. */
export function ExportBracketModal({ visible, onClose, onSelect }: ExportBracketModalProps) {
    const insets = useSafeAreaInsets();

    const choose = (includeSchedule: boolean) => {
        onClose();
        setTimeout(() => onSelect(includeSchedule), 350);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end">
                <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />

                <View
                    className="bg-card border-t border-white/[0.08] rounded-t-[32px] px-5 pt-3"
                    style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
                >
                    {/* Grab handle */}
                    <View className="self-center w-10 h-1 rounded-full bg-white/15 mb-4" />

                    {/* Header */}
                    <View className="flex-row items-center gap-3 mb-5 px-1">
                        <View className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center">
                            <Ionicons name="document-text-outline" size={20} color="#10B981" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white text-lg font-black" numberOfLines={1}>
                                Export PDF
                            </Text>
                            <Text className="text-slate-500 text-xs mt-0.5" numberOfLines={1}>
                                Choose what to include
                            </Text>
                        </View>
                    </View>

                    <ExportOption
                        icon="podium-outline"
                        title="Standings & bracket"
                        subtitle="Final tables and the bracket diagram"
                        accent="#94A3B8"
                        accentBg="rgba(255,255,255,0.02)"
                        accentBorder="rgba(255,255,255,0.08)"
                        onPress={() => choose(false)}
                    />

                    <ExportOption
                        icon="calendar-outline"
                        title="With schedule"
                        subtitle="Adds every round's fixtures, deadlines & results"
                        accent="#10B981"
                        accentBg="rgba(16,185,129,0.06)"
                        accentBorder="rgba(16,185,129,0.22)"
                        badge="DETAILED"
                        onPress={() => choose(true)}
                    />

                    <PressableScale
                        onPress={onClose}
                        className="h-14 rounded-2xl bg-white/[0.05] border border-white/[0.08] items-center justify-center mt-1"
                    >
                        <Text className="text-white font-bold text-[15px]">Cancel</Text>
                    </PressableScale>
                </View>
            </View>
        </Modal>
    );
}
