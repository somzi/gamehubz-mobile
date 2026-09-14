import React, { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { COLORS } from '../../lib/theme';
import { useNotifications } from '../../context/NotificationsContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';

interface NotificationBellProps {
    onPress: () => void;
}

/**
 * Entry point to the notification inbox. The badge counts what arrived since the inbox was last
 * opened (not everything unread), so opening the inbox is enough to clear it.
 */
export function NotificationBell({ onPress }: NotificationBellProps) {
    const { t } = useTranslation('notifications');
    const { summary } = useNotifications();
    const count = summary.unseen;

    // A short ring when something new lands while the bell is on screen: a badge going from 3 to 4
    // is easy to miss on its own. Purely decorative, so it is exactly the kind of motion the OS
    // setting asks us to drop — the badge still changes, which is the part that carries meaning.
    const reduceMotion = useReduceMotion();
    const rotation = useSharedValue(0);
    const previousCount = useRef(count);
    useEffect(() => {
        if (count > previousCount.current && !reduceMotion) {
            rotation.value = withSequence(
                withTiming(-14, { duration: 70 }),
                withTiming(12, { duration: 90 }),
                withTiming(-8, { duration: 80 }),
                withTiming(5, { duration: 70 }),
                withTiming(0, { duration: 60 }),
            );
        }
        // Updated outside the branch: skipping the ring must not leave the bell thinking the count
        // is still the old one, or the next arrival would compare against a stale number.
        previousCount.current = count;
    }, [count, reduceMotion, rotation]);

    const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

    return (
        <PressableScale
            onPress={onPress}
            pressedScale={0.92}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={count > 0 ? t('bell.a11yNew', { count }) : t('bell.a11y')}
        >
            <View className="w-10 h-10 rounded-2xl items-center justify-center bg-white/5 border border-white/10">
                <Animated.View style={ringStyle}>
                    <Ionicons
                        name={count > 0 ? 'notifications' : 'notifications-outline'}
                        size={19}
                        color={count > 0 ? COLORS.foreground : COLORS.slate300}
                    />
                </Animated.View>

                {count > 0 && (
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            top: -5,
                            right: -5,
                            minWidth: 18,
                            height: 18,
                            borderRadius: 9,
                            paddingHorizontal: 4,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: COLORS.destructive,
                            borderWidth: 2,
                            borderColor: COLORS.background,
                        }}
                    >
                        <Text numberOfLines={1} style={{ color: COLORS.foreground, fontSize: 10, fontWeight: '900', lineHeight: 13 }}>
                            {count > 99 ? '99+' : count}
                        </Text>
                    </View>
                )}
            </View>
        </PressableScale>
    );
}
