import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

export type StatStripTone = 'info' | 'warning' | 'primary' | 'muted';

export interface StatStripItem {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    /** The number that matters — kept short, it is the thing being scanned. */
    value: string;
    /** Tiny caption underneath. */
    label: string;
    tone: StatStripTone;
    onPress?: () => void;
}

const TONES: Record<StatStripTone, string> = {
    info: COLORS.info,
    warning: COLORS.warning,
    primary: COLORS.primary,
    muted: COLORS.slate500,
};

/**
 * A row of equal-width stat cells inside one bordered container.
 *
 * Replaces a set of free-floating pills: pills size to their own text, so three of them wrap
 * onto two lines at different widths and read as clutter. Equal flex cells always occupy one
 * line, line up with each other, and shrink together — the strip looks deliberate whether it
 * has the full width to itself or is sharing a row with the bracket's zoom controls.
 */
export function StatStrip({ items }: { items: StatStripItem[] }) {
    if (items.length === 0) return null;

    return (
        <View className="flex-1 flex-row rounded-2xl bg-card border border-white/[0.06] overflow-hidden">
            {items.map((item, index) => {
                const color = TONES[item.tone];
                const content = (
                    <View className="flex-1 items-center justify-center py-2 px-1.5">
                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name={item.icon} size={12} color={color} />
                            <Text
                                className="text-[12px] font-black tracking-tight"
                                style={{ color }}
                                numberOfLines={1}
                            >
                                {item.value}
                            </Text>
                        </View>
                        <Text
                            className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-0.5"
                            numberOfLines={1}
                        >
                            {item.label}
                        </Text>
                    </View>
                );

                return (
                    <View
                        key={item.key}
                        className={cn('flex-1 flex-row', index > 0 && 'border-l border-white/[0.06]')}
                    >
                        {item.onPress ? (
                            <Pressable onPress={item.onPress} className="flex-1 flex-row active:opacity-60">
                                {content}
                            </Pressable>
                        ) : (
                            content
                        )}
                    </View>
                );
            })}
        </View>
    );
}
