import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../ui/Skeleton';
import { COLORS } from '../../lib/theme';
import { formatLocalTime } from '../../lib/utils';
import { notificationMeta } from '../../lib/notificationRouting';
import type { NotificationItem } from '../../types/notifications';

const CARD_RADIUS = 18;
const ICON_SIZE = 42;

/**
 * The notification's kind as a round badge. Unread, it is lit in the kind's colour — a gradient
 * fill, a tinted ring and a soft glow; read, it goes grey, so the colour on the screen is exactly
 * what is still new.
 */
function KindBadge({ icon, accent, lit }: { icon: keyof typeof Ionicons.glyphMap; accent: string; lit: boolean }) {
    if (!lit) {
        return (
            <View style={[styles.badge, styles.badgeQuiet]}>
                <Ionicons name={icon} size={18} color={COLORS.slate500} />
            </View>
        );
    }

    return (
        <View
            style={[
                styles.badge,
                { borderColor: accent + '59' },
                Platform.OS === 'ios' && { shadowColor: accent, shadowOpacity: 0.45, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } },
            ]}
        >
            <LinearGradient
                colors={[accent + '42', accent + '12']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: ICON_SIZE / 2 }]}
            />
            <Ionicons name={icon} size={19} color={accent} />
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
    /** Tag it "Needs you" — for an unread action shown among updates (the All tab). */
    needsYou?: boolean;
}

/**
 * One notification in its own card. What is new stands up: a card a step lighter than the page,
 * a glowing rail and an edge in the kind's colour, a lit badge, the time in that colour. What has
 * been read sits flat and grey, so the inbox reads top to bottom as "this is what's waiting".
 */
export const NotificationRow = React.memo(function NotificationRow({ item, onPress, opening = false, needsYou = false }: NotificationRowProps) {
    const { t } = useTranslation('notifications');
    const meta = useMemo(() => notificationMeta(item.data ?? { type: item.type }), [item.data, item.type]);
    const unread = !item.readOn;
    // Clock time only — the day header above carries the date.
    const time = formatLocalTime(item.createdOn);

    const accessibilityLabel = [unread ? t('a11y.unread') : null, needsYou ? t('tabs.action') : null, item.title, item.body, time]
        .filter(Boolean)
        .join('. ');

    return (
        <Pressable
            onPress={() => onPress(item)}
            disabled={opening}
            accessibilityState={{ busy: opening }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={meta.external ? t('a11y.opensOutside') : undefined}
            className="active:opacity-75"
        >
            <View
                style={[
                    styles.card,
                    unread && {
                        backgroundColor: COLORS.cardRaised,
                        borderColor: meta.accent + '33',
                        borderTopColor: meta.accent + '52',
                    },
                ]}
            >
                {unread && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.rail,
                            { backgroundColor: meta.accent },
                            Platform.OS === 'ios' && { shadowColor: meta.accent, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
                        ]}
                    />
                )}

                <View className="flex-row items-start" style={styles.body}>
                    <KindBadge icon={meta.icon} accent={meta.accent} lit={unread} />

                    <View className="flex-1" style={{ paddingTop: 1 }}>
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <Text
                                numberOfLines={1}
                                className="flex-1 text-[14.5px] leading-[19px]"
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
                                    className="text-[11.5px] font-bold"
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
                            className="text-[13px] mt-1"
                            style={{ color: unread ? COLORS.slate300 : COLORS.slate500, lineHeight: 18 }}
                        >
                            {item.body}
                        </Text>

                        {(needsYou || meta.external) && (
                            <View className="flex-row items-center flex-wrap mt-2" style={{ gap: 10 }}>
                                {needsYou && (
                                    <View
                                        className="flex-row items-center rounded-md px-2 py-[3px]"
                                        style={{ gap: 4, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)' }}
                                    >
                                        <Ionicons name="flash" size={10} color="#FBBF24" />
                                        <Text className="text-[10.5px] font-bold" style={{ color: '#FBBF24' }} numberOfLines={1}>
                                            {t('tabs.action')}
                                        </Text>
                                    </View>
                                )}
                                {meta.external && (
                                    <View className="flex-row items-center" style={{ gap: 4 }}>
                                        <Ionicons name="open-outline" size={11} color={COLORS.highlight} />
                                        <Text className="text-[11px] font-bold" style={{ color: COLORS.highlight }}>
                                            {t('opensOutside')}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </Pressable>
    );
});

/** Placeholder at the real card's size and shape, for the inbox's first load and the next page. */
export function NotificationRowSkeleton() {
    return (
        <View style={styles.card}>
            <View className="flex-row items-start" style={styles.body}>
                <Skeleton width={ICON_SIZE} height={ICON_SIZE} radius={ICON_SIZE / 2} />
                <View className="flex-1" style={{ gap: 8, paddingTop: 4 }}>
                    <View className="flex-row items-center" style={{ gap: 12 }}>
                        <Skeleton width="52%" height={12} radius={6} />
                        <View className="flex-1" />
                        <Skeleton width={34} height={10} radius={5} />
                    </View>
                    <Skeleton width="92%" height={10} radius={5} />
                    <Skeleton width="64%" height={10} radius={5} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.card,
        borderRadius: CARD_RADIUS,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderTopColor: 'rgba(255,255,255,0.09)',
        overflow: 'hidden',
    },
    rail: {
        position: 'absolute',
        left: 0,
        top: 14,
        bottom: 14,
        width: 3,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
    },
    body: {
        gap: 12,
        paddingLeft: 15,
        paddingRight: 14,
        paddingVertical: 14,
    },
    badge: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: ICON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    badgeQuiet: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
    },
});
