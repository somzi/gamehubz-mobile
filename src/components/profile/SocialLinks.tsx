import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

interface SocialLink {
    platform: "discord" | "tiktok" | "instagram" | "twitter" | "youtube" | "facebook" | "telegram";
    username: string;
    url?: string;
}

interface SocialLinksProps {
    links: SocialLink[];
    className?: string;
}

const platformConfig: any = {
    discord: {
        icon: <Ionicons name="logo-discord" size={20} />,
        color: "text-[#5865F2]",
        bgColor: "bg-[#5865F2]/20",
    },
    tiktok: {
        icon: <Ionicons name="logo-tiktok" size={20} />,
        color: "text-foreground",
        bgColor: "bg-foreground/10",
    },
    instagram: {
        icon: <FontAwesome name="instagram" size={20} />,
        color: "text-[#E4405F]",
        bgColor: "bg-[#E4405F]/20",
    },
    twitter: {
        icon: <FontAwesome name="twitter" size={20} />,
        color: "text-foreground",
        bgColor: "bg-foreground/10",
    },
    youtube: {
        icon: <FontAwesome name="youtube-play" size={20} />,
        color: "text-[#FF0000]",
        bgColor: "bg-[#FF0000]/20",
    },
    facebook: {
        icon: <FontAwesome name="facebook" size={20} />,
        color: "text-[#1877F2]",
        bgColor: "bg-[#1877F2]/20",
    },
    telegram: {
        icon: <Ionicons name="paper-plane" size={18} />,
        color: "text-[#0088cc]",
        bgColor: "bg-[#0088cc]/20",
    },
};

export function SocialLinks({ links, className }: SocialLinksProps) {
    if (!links || links.length === 0) return null;

    const handlePress = (url?: string) => {
        if (url) {
            Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
        }
    };

    return (
        <View className={cn("flex-row flex-wrap gap-3", className)}>
            {links.map((link) => {
                const config = platformConfig[link.platform];
                if (!config) return null;

                return (
                    <Pressable
                        key={link.platform}
                        onPress={() => handlePress(link.url)}
                        className={cn(
                            "items-center justify-center w-10 h-10 rounded-full border border-border/30",
                            config.bgColor
                        )}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                        <Text className={config.color}>{config.icon}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
