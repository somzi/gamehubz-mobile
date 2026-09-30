import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';

interface CollapsibleSectionProps {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    /** One-line state recap shown under the title while collapsed (e.g. "Solo · Global"). */
    summary?: string;
    /** Accent for the icon chip. Defaults to the primary green. */
    color?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

/** Expand/collapse form section on the edit forms' card surface: tinted icon chip + title +
 *  collapsed-state summary in the header; an open section lights its chip and draws a hairline
 *  between header and body. The body is revealed with a Reanimated layout transition.
 *  (LayoutAnimation is off-limits here — on the new architecture it leaves ghost
 *  copies of sibling text at stale positions while sections reflow.) */
export function CollapsibleSection({
    icon,
    title,
    summary,
    color = COLORS.primary,
    defaultOpen = false,
    children,
}: CollapsibleSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <Animated.View
            layout={LinearTransition.duration(200)}
            style={{
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: open ? color + '33' : 'rgba(255,255,255,0.07)',
                borderTopColor: open ? color + '4D' : 'rgba(255,255,255,0.11)',
                borderRadius: 22,
                overflow: 'hidden',
            }}
        >
            <Pressable
                onPress={() => setOpen(o => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="flex-row items-center justify-between px-4 py-3.5 active:opacity-70"
            >
                <View className="flex-row items-center flex-1 mr-2" style={{ gap: 12 }}>
                    <View
                        className="w-9 h-9 rounded-xl items-center justify-center"
                        style={{
                            backgroundColor: color + (open ? '26' : '14'),
                            borderWidth: 1,
                            borderColor: color + (open ? '55' : '2E'),
                        }}
                    >
                        <Ionicons name={icon} size={17} color={color} />
                    </View>
                    <View className="flex-1">
                        <Text className="text-white font-black text-[15px] tracking-tight">{title}</Text>
                        {!open && summary ? (
                            <Text className="text-slate-500 text-[12px] font-medium mt-0.5" numberOfLines={1}>
                                {summary}
                            </Text>
                        ) : null}
                    </View>
                </View>
                <View
                    className="w-7 h-7 rounded-lg items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={open ? color : COLORS.slate500} />
                </View>
            </Pressable>

            {open && (
                <Animated.View
                    entering={FadeIn.duration(150)}
                    style={{
                        paddingHorizontal: 16,
                        paddingBottom: 16,
                        paddingTop: 14,
                        borderTopWidth: 1,
                        borderTopColor: 'rgba(255,255,255,0.05)',
                    }}
                >
                    {children}
                </Animated.View>
            )}
        </Animated.View>
    );
}
