import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { cn } from '../../lib/utils';

interface PlayerAvatarProps {
    src?: string;
    name: string;
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
}

const sizes = {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 80,
};

const textSizes = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-base",
    xl: "text-xl",
};

export function PlayerAvatar({ src, name, size = "md", className }: PlayerAvatarProps) {
    const initials = (name || "")
        .split(" ")
        .map((n) => n?.[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 2);

    const dimension = sizes[size];

    return (
        <View
            className={cn(
                "rounded-full border-2 border-border overflow-hidden bg-secondary items-center justify-center",
                className
            )}
            style={{ width: dimension, height: dimension }}
        >
            {src ? (
                <Image
                    source={{ uri: src }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                />
            ) : (
                <Text className={cn("text-foreground font-semibold", textSizes[size])}>
                    {initials}
                </Text>
            )}
        </View>
    );
}
