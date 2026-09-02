import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '../ui/MenuItem';
import { PressableScale } from '../ui/PressableScale';
import { COLORS } from '../../lib/theme';

export interface ActionSheetAction {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    /** Leading glyph rendered instead of `icon` — e.g. a flag in the language picker. */
    emoji?: string;
    destructive?: boolean;
    /** Marks the active choice with a trailing check, for sheets used as a picker. */
    selected?: boolean;
    onPress: () => void;
}

interface ActionSheetModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    /** Optional leading visual next to the title (e.g. an avatar). */
    header?: React.ReactNode;
    actions: ActionSheetAction[];
}

/** In-app replacement for the native action-sheet Alert: a bottom sheet with
 *  grouped MenuItem rows — regular actions first, destructive ones in their own
 *  tinted card. An action runs AFTER the sheet closes (deferred), so a follow-up
 *  native confirm Alert isn't swallowed by the dismissing Modal on iOS. */
export function ActionSheetModal({
    visible,
    onClose,
    title,
    subtitle,
    header,
    actions,
}: ActionSheetModalProps) {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('common');

    const run = (action: () => void) => {
        onClose();
        setTimeout(action, 350);
    };

    const regular = actions.filter(a => !a.destructive);
    const destructive = actions.filter(a => a.destructive);

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
                        {header}
                        <View className="flex-1">
                            <Text className="text-white text-lg font-black" numberOfLines={1}>
                                {title}
                            </Text>
                            {subtitle ? (
                                <Text className="text-slate-500 text-xs mt-0.5" numberOfLines={1}>
                                    {subtitle}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    {regular.length > 0 && (
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden mb-3">
                            {regular.map((action, i) => (
                                <MenuItem
                                    key={action.label}
                                    icon={action.icon}
                                    emoji={action.emoji}
                                    label={action.label}
                                    onPress={() => run(action.onPress)}
                                    showChevron={false}
                                    isLast={i === regular.length - 1}
                                    rightElement={
                                        action.selected ? (
                                            <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                                        ) : undefined
                                    }
                                />
                            ))}
                        </View>
                    )}

                    {destructive.length > 0 && (
                        <View className="bg-red-500/[0.03] border border-red-500/10 rounded-3xl overflow-hidden mb-3">
                            {destructive.map((action, i) => (
                                <MenuItem
                                    key={action.label}
                                    icon={action.icon}
                                    emoji={action.emoji}
                                    label={action.label}
                                    onPress={() => run(action.onPress)}
                                    destructive
                                    showChevron={false}
                                    isLast={i === destructive.length - 1}
                                />
                            ))}
                        </View>
                    )}

                    <PressableScale
                        onPress={onClose}
                        className="h-14 rounded-2xl bg-white/[0.05] border border-white/[0.08] items-center justify-center"
                    >
                        <Text className="text-white font-bold text-[15px]">{t('cancel')}</Text>
                    </PressableScale>
                </View>
            </View>
        </Modal>
    );
}
