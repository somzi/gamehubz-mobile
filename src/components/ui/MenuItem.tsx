import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { PressableScale } from './PressableScale';

interface MenuItemProps {
    icon?: keyof typeof Ionicons.glyphMap;
    /** Leading glyph rendered in place of `icon` — e.g. a flag in the language picker. */
    emoji?: string;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    showChevron?: boolean;
    /** Last row in a grouped card — drops the bottom hairline. */
    isLast?: boolean;
    /** Extra content between the label and the chevron (e.g. a status pill). */
    rightElement?: React.ReactNode;
    /** The row's own colour for its icon chip, so a menu scans by colour. Neutral when unset. */
    color?: string;
}

// The hairline between rows starts where the label does: row padding 16 + chip 36 + gap 12.
const DIVIDER_INSET = 64;

/** Settings-menu row: tinted icon chip + label + chevron, for use inside a grouped card
 *  (SettingsGroup). */
export function MenuItem({
    icon,
    emoji,
    label,
    onPress,
    destructive = false,
    showChevron = true,
    isLast = false,
    rightElement,
    color,
}: MenuItemProps) {
    const tone = destructive ? COLORS.destructive : color;

    return (
        <PressableScale
            onPress={onPress}
            pressedScale={0.98}
            accessibilityRole="button"
            className="flex-row items-center justify-between py-3 px-4 active:opacity-80"
        >
            <View className="flex-row items-center flex-1" style={{ gap: 12 }}>
                <View
                    className="w-9 h-9 rounded-xl items-center justify-center"
                    style={
                        tone
                            ? { backgroundColor: tone + '1A', borderWidth: 1, borderColor: tone + '33' }
                            : { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }
                    }
                >
                    {emoji ? (
                        <Text className="text-[17px]">{emoji}</Text>
                    ) : icon ? (
                        <Ionicons name={icon} size={17} color={tone ?? COLORS.slate300} />
                    ) : null}
                </View>
                <Text
                    className={cn('font-bold text-[15px] flex-shrink', destructive ? 'text-red-400' : 'text-white')}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 8 }}>
                {rightElement}
                {showChevron && <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />}
            </View>
            {!isLast && (
                <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: DIVIDER_INSET, right: 0, bottom: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' }}
                />
            )}
        </PressableScale>
    );
}
