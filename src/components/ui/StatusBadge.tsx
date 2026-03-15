import React from 'react';
import { View, Text, Animated } from 'react-native';
import { cn } from '../../lib/utils';
import { useEffect, useRef } from 'react';

interface StatusBadgeProps {
    status: 'live' | 'upcoming' | 'completed';
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (status === 'live') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.6,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [status, pulseAnim]);

    const getStatusStyles = () => {
        switch (status) {
            case 'live':
                return {
                    container: 'bg-live',
                    text: 'text-live-foreground',
                };
            case 'upcoming':
                return {
                    container: 'bg-primary/20',
                    text: 'text-primary',
                };
            case 'completed':
                return {
                    container: 'bg-muted',
                    text: 'text-muted-foreground',
                };
            default:
                return {
                    container: 'bg-muted',
                    text: 'text-muted-foreground',
                };
        }
    };

    const styles = getStatusStyles();

    const badge = (
        <View
            className={cn(
                'px-2 py-0.5 rounded-full',
                styles.container,
                className
            )}
        >
            <Text className={cn('text-xs font-semibold uppercase', styles.text)}>
                {status}
            </Text>
        </View>
    );

    if (status === 'live') {
        return (
            <Animated.View style={{ opacity: pulseAnim }}>
                {badge}
            </Animated.View>
        );
    }

    return badge;
}
