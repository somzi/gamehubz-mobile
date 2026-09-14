import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../ui/PressableScale';
import { Skeleton } from '../ui/Skeleton';
import { COLORS } from '../../lib/theme';
import { formatLocalTime } from '../../lib/utils';
import { notificationMeta } from '../../lib/notificationRouting';
import type { NotificationItem } from '../../types/notifications';

const ROW_RADIUS = 18;

// Unread = an emerald rail on the leading edge plus a faint emerald wash: the same quiet marker the
// Players tab uses for "you". It reads instantly and stays calm when half the list is unread — no
// loud dot. Read rows drop back to the app's standard glass card.
const UNREAD_BG = 'rgba(16, 185, 129, 0.06)';
const UNREAD_BORDER = 'rgba(16, 185, 129, 0.16)';
const READ_BG = 'rgba(255, 255, 255, 0.02)';
const READ_BORDER = 'rgba(255, 255, 255, 0.05)';

interface NotificationRowProps {
    item: NotificationItem;
    /** Keep it stable (useCallback): rows are memoized and the list is unbounded. */
    onPress: (item: NotificationItem) => void;
}

export const NotificationRow = React.memo(function NotificationRow({ item, onPress }: NotificationRowProps) {
    const { t } = useTranslation('notifications');
    const meta = useMemo(() => notificationMeta(item.data ?? { type: item.type }), [item.data, item.type]);
    const unread = !item.readOn;
    // Clock time only — the day header above the row carries the date.
    const time = formatLocalTime(item.createdOn);

    const accessibilityLabel = [unread ? t('a11y.unread') : null, item.title, item.body, time]
        .filter(Boolean)
        .join('. ');

    return (
        <PressableScale
            onPress={() => onPress(item)}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={meta.external ? t('a11y.opensOutside') : undefined}
        >
            <View
                style={{
                    borderRadius: ROW_RADIUS,
                    borderWidth: 1,
                    borderColor: unread ? UNREAD_BORDER : READ_BORDER,
                    backgroundColor: unread ? UNREAD_BG : READ_BG,
                    overflow: 'hidden',
                }}
            >
                {unread && (
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 14,
                            bottom: 14,
                            width: 3,
                            borderTopRightRadius: 3,
                            borderBottomRightRadius: 3,
                            backgroundColor: COLORS.primary,
                        }}
                    />
                )}

                <View className="flex-row items-start px-4 py-3.5" style={{ gap: 12 }}>
                    <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={{
                            backgroundColor: meta.accent + (unread ? '1F' : '14'),
                            borderWidth: 1,
                            borderColor: meta.accent + (unread ? '38' : '22'),
                            opacity: unread ? 1 : 0.75,
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
                                    color: unread ? COLORS.foreground : COLORS.slate200,
                                    fontWeight: unread ? '800' : '600',
                                }}
                            >
                                {item.title}
                            </Text>
                            <Text
                                className="text-[11px] font-bold"
                                style={{
                                    color: unread ? COLORS.primaryBright : COLORS.slate500,
                                    fontVariant: ['tabular-nums'],
                                }}
                            >
                                {time}
                            </Text>
                        </View>

                        <Text
                            numberOfLines={2}
                            className="text-[13px] mt-0.5"
                            style={{ color: unread ? COLORS.slate300 : COLORS.slate400, lineHeight: 18 }}
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
            </View>
        </PressableScale>
    );
});

/** Placeholder at the real row's size and shape, for the inbox's first load. */
export function NotificationRowSkeleton() {
    return (
        <View
            style={{
                borderRadius: ROW_RADIUS,
                borderWidth: 1,
                borderColor: READ_BORDER,
                backgroundColor: READ_BG,
            }}
        >
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
        </View>
    );
}
