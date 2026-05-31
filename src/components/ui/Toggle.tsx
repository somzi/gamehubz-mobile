import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    interpolateColor,
} from 'react-native-reanimated';

interface ToggleProps {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    activeColor?: string;
    inactiveColor?: string;
    size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
    sm: { track: { width: 36, height: 22 }, thumb: 16, padding: 3 },
    md: { track: { width: 50, height: 28 }, thumb: 22, padding: 3 },
    lg: { track: { width: 60, height: 34 }, thumb: 28, padding: 3 },
};

export function Toggle({
    value,
    onValueChange,
    disabled = false,
    activeColor = '#10B981',
    inactiveColor = '#1E293B',
    size = 'md',
}: ToggleProps) {
    const dims = SIZES[size];
    const travel = dims.track.width - dims.thumb - dims.padding * 2;

    const offset = useSharedValue(value ? travel : 0);
    const colorProgress = useSharedValue(value ? 1 : 0);

    useEffect(() => {
        offset.value = withSpring(value ? travel : 0, {
            damping: 18,
            stiffness: 220,
            mass: 0.6,
        });
        colorProgress.value = withTiming(value ? 1 : 0, { duration: 200 });
    }, [value, travel]);

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: offset.value }],
    }));

    const trackStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            colorProgress.value,
            [0, 1],
            [inactiveColor, activeColor]
        ),
    }));

    return (
        <Pressable
            onPress={() => !disabled && onValueChange(!value)}
            disabled={disabled}
            style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
        >
            <Animated.View
                style={[
                    {
                        width: dims.track.width,
                        height: dims.track.height,
                        borderRadius: dims.track.height / 2,
                        padding: dims.padding,
                        justifyContent: 'center',
                    },
                    trackStyle,
                ]}
            >
                <Animated.View
                    style={[
                        {
                            width: dims.thumb,
                            height: dims.thumb,
                            borderRadius: dims.thumb / 2,
                            backgroundColor: '#FFFFFF',
                            shadowColor: '#000',
                            shadowOpacity: 0.2,
                            shadowOffset: { width: 0, height: 1 },
                            shadowRadius: 2,
                            elevation: 2,
                        },
                        thumbStyle,
                    ]}
                />
            </Animated.View>
        </Pressable>
    );
}
