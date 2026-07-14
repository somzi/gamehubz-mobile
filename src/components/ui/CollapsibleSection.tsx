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

/** Glassy expand/collapse form section: tinted icon chip + title + collapsed-state
 *  summary in the header, body revealed with a Reanimated layout transition.
 *  (LayoutAnimation is off-limits here — on the new architecture it leaves ghost
 *  copies of sibling text at stale positions while sections reflow.)
 *  The form-modal counterpart of the grouped settings card (MenuItem/SectionLabel pattern). */
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
                backgroundColor: 'rgba(255,255,255,0.02)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.05)',
                borderRadius: 24,
                overflow: 'hidden',
            }}
        >
            <Pressable
                onPress={() => setOpen(o => !o)}
                className="flex-row items-center justify-between p-4 active:opacity-70"
            >
                <View className="flex-row items-center gap-3 flex-1 mr-2">
                    <View
                        className="w-9 h-9 rounded-xl items-center justify-center border"
                        style={{ backgroundColor: color + '1A', borderColor: color + '33' }}
                    >
                        <Ionicons name={icon} size={17} color={color} />
                    </View>
                    <View className="flex-1">
                        <Text className="text-white font-bold text-[15px]">{title}</Text>
                        {!open && summary ? (
                            <Text className="text-slate-500 text-xs mt-0.5" numberOfLines={1}>
                                {summary}
                            </Text>
                        ) : null}
                    </View>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.slate600} />
            </Pressable>

            {open && (
                <Animated.View
                    entering={FadeIn.duration(150)}
                    style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}
                >
                    {children}
                </Animated.View>
            )}
        </Animated.View>
    );
}
