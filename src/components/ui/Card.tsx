import React from 'react';
import { View, Pressable, ViewStyle, StyleSheet } from 'react-native';
import { cn } from '../../lib/utils';

interface CardProps {
    children: React.ReactNode;
    onPress?: () => void;
    className?: string;
    variant?: 'default' | 'gradient';
}

export function Card({ children, onPress, className, variant = 'gradient' }: CardProps) {
    const cardContent = (
        <View
            className={cn(
                "rounded-[24px] border border-white/5 p-5",
                variant === 'gradient' ? "bg-white/[0.03]" : "bg-card",
                className
            )}
        >
            {children}
        </View>
    );

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                className="active:opacity-70"
            >
                {cardContent}
            </Pressable>
        );
    }

    return cardContent;
}

const styles = StyleSheet.create({
});

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
    return <View className={cn("mb-2", className)}>{children}</View>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
    return <View className={cn("", className)}>{children}</View>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
    return <View className={cn("", className)}>{children}</View>;
}

