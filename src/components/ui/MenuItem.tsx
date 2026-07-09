import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { PressableScale } from './PressableScale';

interface MenuItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    showChevron?: boolean;
    /** Last row in a grouped card — drops the bottom hairline. */
    isLast?: boolean;
    /** Extra content between the label and the chevron (e.g. a status pill). */
    rightElement?: React.ReactNode;
}

/** Settings-menu row: tinted icon chip + label + chevron, for use inside a
 *  grouped glassy card (the SettingsScreen pattern). */
export function MenuItem({
    icon,
    label,
    onPress,
    destructive = false,
    showChevron = true,
    isLast = false,
    rightElement,
}: MenuItemProps) {
    return (
        <PressableScale
            onPress={onPress}
            pressedScale={0.98}
            className={cn(
                "flex-row items-center justify-between py-3.5 px-4",
                !isLast && "border-b border-white/5"
            )}
        >
            <View className="flex-row items-center gap-3 flex-1">
                <View
                    className={cn(
                        "w-9 h-9 rounded-xl items-center justify-center border",
                        destructive
                            ? "bg-red-500/10 border-red-500/20"
                            : "bg-white/[0.04] border-white/[0.06]"
                    )}
                >
                    <Ionicons name={icon} size={17} color={destructive ? COLORS.destructive : COLORS.slate300} />
                </View>
                <Text
                    className={cn("font-semibold text-[15px] flex-shrink", destructive ? "text-red-400" : "text-white")}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 8 }}>
                {rightElement}
                {showChevron && <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />}
            </View>
        </PressableScale>
    );
}
