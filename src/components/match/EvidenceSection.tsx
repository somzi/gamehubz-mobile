import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

interface EvidenceSectionProps {
    /** Screenshots already on the match. */
    uploadedCount?: number;
    /** Screenshots picked on-device but not sent yet. */
    pendingCount?: number;
    /** Opens the picker. Omit for viewers who can't attach anything — the Add pill disappears. */
    onAdd?: () => void;
    /** Controlled so the host can pop the section open right after a pick. */
    open: boolean;
    onToggle: (next: boolean) => void;
    children: React.ReactNode;
    className?: string;
}

/**
 * Collapsed-by-default evidence block.
 *
 * The gallery + upload dropzone is the tallest thing on the match screen and is empty most of
 * the time, which pushed everything below it (notably "Need Help?") off screen. Collapsed it
 * costs one row — but the Add pill stays on that row, so attaching a screenshot is still one
 * tap and the summary line spells out what the section is for. Tapping Add opens the picker
 * *and* expands, so the picked shots are visible where they landed.
 */
export function EvidenceSection({
    uploadedCount = 0,
    pendingCount = 0,
    onAdd,
    open,
    onToggle,
    children,
    className,
}: EvidenceSectionProps) {
    const { t } = useTranslation('match');
    // Collapsed-state recap: what's here, or — when there's nothing — what it's for.
    const summary = pendingCount > 0
        ? t('evidence.readyToUpload', { count: pendingCount })
        : uploadedCount > 0
            ? t('evidence.attached', { count: uploadedCount })
            : t('evidence.addScreenshots');

    return (
        <Animated.View
            layout={LinearTransition.duration(200)}
            className={cn('rounded-[20px] bg-card/60 border border-white/[0.05] overflow-hidden', className)}
        >
            <Pressable
                onPress={() => onToggle(!open)}
                className="flex-row items-center gap-2.5 p-3.5 active:opacity-70"
            >
                <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center border border-primary/20">
                    <Ionicons name="images-outline" size={15} color={COLORS.primary} />
                </View>
                <View className="flex-1 mr-1">
                    <View className="flex-row items-center gap-2">
                        <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">{t('evidence.evidence')}</Text>
                        {uploadedCount > 0 && (
                            <View className="bg-white/[0.06] px-2 py-0.5 rounded-full">
                                <Text className="text-[9px] font-black text-slate-400">{uploadedCount}</Text>
                            </View>
                        )}
                    </View>
                    <Text
                        numberOfLines={1}
                        className={cn('text-[10px] font-medium mt-0.5', pendingCount > 0 ? 'text-warning' : 'text-slate-500')}
                    >
                        {summary}
                    </Text>
                </View>

                {onAdd && (
                    <Pressable
                        onPress={() => { onToggle(true); onAdd(); }}
                        hitSlop={6}
                        className="flex-row items-center bg-primary/10 border border-primary/20 px-2.5 py-1.5 rounded-xl active:opacity-70"
                    >
                        <Ionicons name="add" size={14} color={COLORS.primary} />
                        <Text className="text-[10px] font-black text-primary ml-1 uppercase tracking-wider">{t('evidence.add')}</Text>
                    </Pressable>
                )}
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.slate600} />
            </Pressable>

            {open && (
                <Animated.View entering={FadeIn.duration(150)} className="px-3.5 pb-3.5">
                    {children}
                </Animated.View>
            )}
        </Animated.View>
    );
}
