import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { cn } from '../../lib/utils';

interface ButtonProps {
    onPress?: () => void;
    children: React.ReactNode;
    variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
    size?: 'default' | 'sm' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    className?: string;
}

export function Button({
    onPress = () => { },
    children,
    variant = 'default',
    size = 'default',
    disabled = false,
    loading = false,
    className
}: ButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled || loading}
            className={cn(
                "rounded-lg items-center justify-center flex-row",
                size === 'default' && "px-4 py-3",
                size === 'sm' && "px-3 py-2",
                size === 'lg' && "px-6 py-4",
                variant === 'default' && "bg-primary",
                variant === 'secondary' && "bg-secondary",
                variant === 'outline' && "border border-border bg-transparent",
                variant === 'ghost' && "bg-transparent",
                variant === 'destructive' && "bg-destructive",
                (disabled || loading) && "opacity-50",
                className
            )}
            style={({ pressed }) => [
                pressed && !disabled && !loading && styles.pressed
            ]}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'outline' ? '#8B5CF6' : '#FAFAFA'} />
            ) : (
                typeof children === 'string' || typeof children === 'number' ? (
                    <Text
                        className={cn(
                            "font-medium",
                            size === 'default' && "text-base",
                            size === 'sm' && "text-sm",
                            size === 'lg' && "text-lg",
                            variant === 'default' && "text-primary-foreground",
                            variant === 'secondary' && "text-secondary-foreground",
                            variant === 'outline' && "text-foreground",
                            variant === 'ghost' && "text-foreground",
                            variant === 'destructive' && "text-destructive-foreground"
                        )}
                    >
                        {children}
                    </Text>
                ) : (
                    children
                )
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    pressed: {
        opacity: 0.7,
    },
});
