import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
 *  summary in the header, body revealed with a LayoutAnimation. The form-modal
 *  counterpart of the grouped settings card (MenuItem/SectionLabel pattern). */
export function CollapsibleSection({
    icon,
    title,
    summary,
    color = COLORS.primary,
    defaultOpen = false,
    children,
}: CollapsibleSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen(o => !o);
    };

    return (
        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
            <Pressable
                onPress={toggle}
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

            {open && <View className="px-4 pb-4 pt-1">{children}</View>}
        </View>
    );
}
