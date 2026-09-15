import React, { useEffect } from 'react';
import { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../hooks/useReduceMotion';

interface SkeletonProps {
    width?: DimensionValue;
    height: number;
    /** Corner radius — pass height / 2 for a pill or a circle. */
    radius?: number;
    style?: StyleProp<ViewStyle>;
}

/**
 * A placeholder block in the shape of the content that is still loading. It breathes on the UI
 * thread (Reanimated), so a screenful of them costs no JS work while the request is in flight, and
 * every block starts its loop on mount — the blocks of one placeholder list pulse in step.
 * Compose several into the real layout (see NotificationRowSkeleton) rather than showing a spinner.
 */
export function Skeleton({ width = '100%', height, radius = 8, style }: SkeletonProps) {
    // The OS "Reduce motion" setting asks apps to drop decorative, looping motion — a placeholder
    // that pulses for as long as a request takes is exactly that. Held still it still reads as
    // "loading"; the shape is what carries it.
    const reduceMotion = useReduceMotion();
    const opacity = useSharedValue(0.45);

    useEffect(() => {
        if (reduceMotion) {
            cancelAnimation(opacity);
            opacity.value = 0.7;
            return;
        }

        opacity.value = withRepeat(
            withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        );
        return () => cancelAnimation(opacity);
    }, [opacity, reduceMotion]);

    const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View
            style={[
                { width, height, borderRadius: radius, backgroundColor: 'rgba(255, 255, 255, 0.07)' },
                animatedStyle,
                style,
            ]}
        />
    );
}
