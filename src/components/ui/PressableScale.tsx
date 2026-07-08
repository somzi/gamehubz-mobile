import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

interface PressableScaleProps extends PressableProps {
    children?: React.ReactNode;
    /** How far the content sinks while pressed. Keep subtle. */
    pressedScale?: number;
    /** Style for the outer animated wrapper — pass e.g. { flex: 1 } when used inside a row. */
    containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Pressable with a press-down scale animation (runs on the UI thread via
 * Reanimated). The transform lives on an OUTER Animated.View — NativeWind
 * classes stay on the Pressable itself, which sidesteps the unreliable
 * Pressable function-style + className interop.
 */
export function PressableScale({
    children,
    pressedScale = 0.97,
    containerStyle,
    onPressIn,
    onPressOut,
    disabled,
    ...props
}: PressableScaleProps) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Animated.View style={[animatedStyle, containerStyle]}>
            <Pressable
                disabled={disabled}
                onPressIn={(e) => {
                    if (!disabled) scale.value = withTiming(pressedScale, { duration: 90 });
                    onPressIn?.(e);
                }}
                onPressOut={(e) => {
                    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
                    onPressOut?.(e);
                }}
                {...props}
            >
                {children}
            </Pressable>
        </Animated.View>
    );
}
