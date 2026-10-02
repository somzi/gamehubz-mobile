import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../ui/Skeleton';
import { COLORS } from '../../lib/theme';
import { formatLocalTime } from '../../lib/utils';
import { notificationMeta } from '../../lib/notificationRouting';
import type { NotificationItem } from '../../types/notifications';

const CARD_RADIUS = 18;

/**
 * One notification's own card: card navy, a clear hairline edge, a touch brighter along the top.
 * Unread cards trade the neutral edge for one in the notification's colour.
 */
function CardShell({ accent, children }: { accent?: string; children: React.ReactNode }) {
    return (
        <View
            style={{
                backgroundColor: COLORS.card,
                borderRadius: CARD_RADIUS,
                borderWidth: 1,
                borderColor: accent ? accent + '33' : 'rgba(255,255,255,0.07)',
                borderTopColor: accent ? accent + '4D' : 'rgba(255,255,255,0.11)',
                overflow: 'hidden',
            }}
        >
            {children}
        </View>
    );
}

interface NotificationRowProps {
    item: NotificationItem;
    /** Keep it stable (useCallback): rows are memoized and the list is unbounded. */
    onPress: (item: NotificationItem) => void;
    /** Its destination is still being worked out (a chat looked up first): the time gives way
     *  to a spinner, in the same spot, and the row takes no second tap. */
    opening?: boolean;
}

/**
 * One notification in its own card. Unread cards carry the notification's colour — a glowing rail
 * on the leading edge, a faint wash, a tinted edge, the time in that colour — so what is waiting
 * reads at a glance and still says what kind of thing it is. Read cards go quiet.
 */
export const NotificationRow = React.memo(function NotificationRow({ item, onPress, opening = false }: NotificationRowProps) {
    const { t } = useTranslation('notifications');
    const meta = useMemo(() => notificationMeta(item.data ?? { type: item.type }), [item.data, item.type]);
    const unread = !item.readOn;
    // Clock time only — the day header above carries the date.
    const time = formatLocalTime(item.createdOn);

    const accessibilityLabel = [unread ? t('a11y.unread') : null, item.title, item.body, time]
        .filter(Boolean)
        .join('. ');

    return (
        <CardShell accent={unread ? meta.accent : undefined}>
            <Pressable
                onPress={() => onPress(item)}
                disabled={opening}
                accessibilityState={{ busy: opening }}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={meta.external ? t('a11y.opensOutside') : undefined}
                className="active:opacity-70"
            >
                {unread && (
                    <>
                        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: meta.accent + '0F' }} />
                        <View
                            pointerEvents="none"
                            style={{
                                position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
                                borderTopRightRadius: 3, borderBottomRightRadius: 3,
                                backgroundColor: meta.accent,
                                shadowColor: meta.accent, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                            }}
                        />
                    </>
                )}

                <View className="flex-row items-start px-4 py-3.5" style={{ gap: 12 }}>
                    <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={{
                            backgroundColor: meta.accent + (unread ? '24' : '14'),
                            borderWidth: 1,
                            borderColor: meta.accent + (unread ? '47' : '22'),
                            opacity: unread ? 1 : 0.7,
                            shadowColor: meta.accent,
                            shadowOpacity: unread ? 0.35 : 0,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 0 },
                        }}
                    >
                        <Ionicons name={meta.icon} size={18} color={meta.accent} />
                    </View>

                    <View className="flex-1">
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <Text
                                numberOfLines={1}
                                className="flex-1 text-[14px]"
                                style={{
                                    color: unread ? COLORS.foreground : COLORS.slate300,
                                    fontWeight: unread ? '800' : '600',
                                }}
                            >
                                {item.title}
                            </Text>
                            {opening ? (
                                <ActivityIndicator size="small" color={meta.accent} style={{ height: 14, transform: [{ scale: 0.8 }] }} />
                            ) : (
                                <Text
                                    className="text-[11px] font-bold"
                                    style={{
                                        color: unread ? meta.accent : COLORS.slate500,
                                        fontVariant: ['tabular-nums'],
                                    }}
                                >
                                    {time}
                                </Text>
                            )}
                        </View>

                        <Text
                            numberOfLines={2}
                            className="text-[13px] mt-0.5"
                            style={{ color: unread ? COLORS.slate300 : COLORS.slate500, lineHeight: 18 }}
                        >
                            {item.body}
                        </Text>

                        {meta.external && (
                            <View className="flex-row items-center mt-1.5" style={{ gap: 4 }}>
                                <Ionicons name="open-outline" size={11} color={COLORS.highlight} />
                                <Text className="text-[11px] font-bold" style={{ color: COLORS.highlight }}>
                                    {t('opensOutside')}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </Pressable>
        </CardShell>
    );
});

/** Placeholder at the real card's size and shape, for the inbox's first load and the next page. */
export function NotificationRowSkeleton() {
    return (
        <CardShell>
            <View className="flex-row items-start px-4 py-3.5" style={{ gap: 12 }}>
                <Skeleton width={40} height={40} radius={12} />
                <View className="flex-1" style={{ gap: 8, paddingTop: 3 }}>
                    <View className="flex-row items-center" style={{ gap: 12 }}>
                        <Skeleton width="52%" height={12} radius={6} />
                        <View className="flex-1" />
                        <Skeleton width={34} height={10} radius={5} />
                    </View>
                    <Skeleton width="92%" height={10} radius={5} />
                    <Skeleton width="64%" height={10} radius={5} />
                </View>
            </View>
        </CardShell>
    );
}
