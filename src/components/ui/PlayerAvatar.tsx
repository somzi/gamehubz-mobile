import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { cn } from '../../lib/utils';
import { getOptimizedCloudinaryUrl } from '../../lib/image';

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

    // Ask Cloudinary for an avatar sized to the actual display box (×2 for retina) in
    // WebP at auto quality. A profile photo uploaded at 1000px+ otherwise downloads in
    // full just to be drawn at 32–80px — this cuts ~80–90% of the bytes per avatar.
    // Non-Cloudinary URLs are returned unchanged, so this is a safe no-op for them.
    const optimizedSrc = src ? getOptimizedCloudinaryUrl(src, dimension * 2) : '';

    return (
        <View
            className={cn(
                "rounded-full border-2 border-border overflow-hidden bg-secondary items-center justify-center",
                className
            )}
            style={{ width: dimension, height: dimension }}
        >
            {optimizedSrc ? (
                <Image
                    source={{ uri: optimizedSrc }}
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
