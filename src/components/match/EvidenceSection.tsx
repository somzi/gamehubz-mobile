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
    /** Opens the picker. Omit for viewers who can't attach anything — the row then only expands. */
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
 * costs one row.
 *
 * While nothing is attached the row itself is the dropzone — dashed edge, and its line says what
 * to add — so one tap opens the picker and expands, showing the picked shots where they landed.
 * Once something is attached it is a plain section that expands to the gallery, where more can
 * be added.
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
    const isEmptySlot = !!onAdd && uploadedCount === 0 && pendingCount === 0;
    // Nothing attached and nothing this viewer can add (a settled match, a spectator): the row only
    // says so — there is nothing to open.
    const isEmptyReadOnly = !onAdd && uploadedCount === 0 && pendingCount === 0;
    // Collapsed-state recap: what's here, or — when there's nothing — what to add.
    const summary = pendingCount > 0
        ? t('evidence.readyToUpload', { count: pendingCount })
        : uploadedCount > 0
            ? t('evidence.attached', { count: uploadedCount })
            : isEmptyReadOnly
                ? t('details.noEvidenceAttached')
                : t('evidence.addScreenshots');

    const onRowPress = () => {
        if (isEmptySlot) {
            onToggle(true);
            onAdd?.();
        } else {
            onToggle(!open);
        }
    };

    return (
        <Animated.View
            layout={LinearTransition.duration(200)}
            className={cn(
                'rounded-[20px] overflow-hidden border',
                isEmptySlot ? 'border-dashed border-primary/30 bg-primary/[0.04]' : 'bg-card/60 border-white/[0.05]',
                className,
            )}
        >
            <Pressable
                onPress={onRowPress}
                disabled={isEmptyReadOnly}
                accessibilityRole={isEmptyReadOnly ? undefined : 'button'}
                accessibilityLabel={`${t('evidence.evidence')}. ${summary}`}
                className="flex-row items-center gap-3 p-3.5 active:opacity-70"
            >
                <View className={cn(
                    'w-9 h-9 rounded-xl items-center justify-center border',
                    isEmptyReadOnly ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-primary/10 border-primary/20',
                )}>
                    <Ionicons
                        name={isEmptySlot ? 'add' : 'images-outline'}
                        size={isEmptySlot ? 20 : 16}
                        color={isEmptyReadOnly ? COLORS.slate500 : COLORS.primaryBright}
                    />
                </View>
                <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                        <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">{t('evidence.evidence')}</Text>
                        {uploadedCount > 0 && (
                            <View className="bg-white/[0.06] px-2 py-0.5 rounded-full">
                                <Text className="text-[9px] font-black text-slate-400">{uploadedCount}</Text>
                            </View>
                        )}
                    </View>
                    <Text
                        numberOfLines={2}
                        className={cn(
                            'mt-0.5',
                            isEmptySlot
                                ? 'text-[12px] leading-[16px] font-semibold text-primary-bright'
                                : cn('text-[11px] leading-[15px] font-medium', pendingCount > 0 ? 'text-warning' : 'text-slate-500'),
                        )}
                    >
                        {summary}
                    </Text>
                </View>

                {!isEmptySlot && !isEmptyReadOnly && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.slate600} />}
            </Pressable>

            {open && !isEmptyReadOnly && (
                <Animated.View entering={FadeIn.duration(150)} className="px-3.5 pb-3.5">
                    {children}
                </Animated.View>
            )}
        </Animated.View>
    );
}
