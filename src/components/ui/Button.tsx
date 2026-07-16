import React from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { PressableScale } from './PressableScale';

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
    // Callers size buttons via `flex-1` / `w-full` — the animated wrapper has to
    // carry that sizing, and ONLY the wrapper: left on the inner Pressable,
    // `flex-1` acts on the wrapper's column axis (flex-basis 0 height) and
    // collapses the button to its padding, swallowing the label. The Pressable
    // fills the sized wrapper via the default align-items: stretch.
    const fillsRow = /\bflex-1\b/.test(className ?? '');
    const fillsWidth = /\bw-full\b/.test(className ?? '');
    const innerClassName = className
        ?.replace(/\bflex-1\b/g, '')
        .replace(/\bw-full\b/g, '')
        .trim();

    return (
        <PressableScale
            onPress={onPress}
            disabled={disabled || loading}
            containerStyle={
                fillsRow ? { flex: 1 } :
                    fillsWidth ? { width: '100%' } :
                        undefined
            }
            className={cn(
                "rounded-lg items-center justify-center flex-row",
                size === 'default' && "px-4 py-3",
                size === 'sm' && "px-3 py-2",
                size === 'lg' && "px-6 py-4",
                variant === 'default' && "bg-primary",
                variant === 'secondary' && "bg-secondary",
                variant === 'outline' && "border border-border bg-transparent",
                variant === 'ghost' && "bg-transparent",
                variant === 'destructive' && "bg-destructive/10 border border-destructive/25",
                (disabled || loading) && "opacity-50",
                innerClassName
            )}
        >
            {loading ? (
                <ActivityIndicator color={
                    variant === 'default' ? COLORS.primaryForeground :
                    variant === 'destructive' ? '#F87171' :
                    COLORS.foreground
                } />
            ) : (
                typeof children === 'string' || typeof children === 'number' ? (
                    <Text
                        numberOfLines={1}
                        className={cn(
                            "font-medium text-center",
                            size === 'default' && "text-base",
                            size === 'sm' && "text-sm",
                            size === 'lg' && "text-lg",
                            variant === 'default' && "text-primary-foreground",
                            variant === 'secondary' && "text-secondary-foreground",
                            variant === 'outline' && "text-foreground",
                            variant === 'ghost' && "text-foreground",
                            variant === 'destructive' && "text-red-400 font-bold"
                        )}
                    >
                        {children}
                    </Text>
                ) : (
                    children
                )
            )}
        </PressableScale>
    );
}
