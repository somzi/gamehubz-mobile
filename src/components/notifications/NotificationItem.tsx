import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

export interface Notification {
    id: string;
    type: "match_scheduled" | "round_started" | "tournament_update" | "reminder";
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    tournamentId?: string;
    matchId?: string;
}

interface NotificationItemProps {
    notification: Notification;
    onRead: () => void;
    onPress?: () => void;
}

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    match_scheduled: "calendar",
    round_started: "trophy",
    tournament_update: "notifications",
    reminder: "time",
};

const colorMap: Record<string, string> = {
    match_scheduled: "text-primary",
    round_started: "text-accent",
    tournament_update: "text-muted-foreground",
    reminder: "text-destructive",
};

const bgColorMap: Record<string, string> = {
    match_scheduled: "bg-primary/10",
    round_started: "bg-accent/10",
    tournament_update: "bg-muted-foreground/10",
    reminder: "bg-destructive/10",
};

export function NotificationItem({ notification, onRead, onPress }: NotificationItemProps) {
    const iconName = iconMap[notification.type] || "notifications";
    const iconColorClass = colorMap[notification.type] || "text-foreground";
    const iconBgClass = bgColorMap[notification.type] || "bg-secondary";

    const handlePress = () => {
        onRead();
        onPress?.();
    };

    return (
        <Pressable
            onPress={handlePress}
            className={cn(
                "p-3 rounded-xl border mb-2",
                notification.read
                    ? "bg-card/50 border-border/30"
                    : "bg-primary/5 border-primary/20"
            )}
        >
            <View className="flex-row gap-3">
                <View className={cn("w-10 h-10 rounded-lg items-center justify-center shrink-0",
                    notification.read ? "bg-secondary/50" : iconBgClass
                )}>
                    <Ionicons name={iconName} size={20} className={iconColorClass} />
                </View>
                <View className="flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                        <Text
                            numberOfLines={1}
                            className={cn("font-medium text-sm flex-1", !notification.read && "text-foreground")}
                        >
                            {notification.title}
                        </Text>
                        {!notification.read && (
                            <View className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                    </View>
                    <Text numberOfLines={2} className="text-xs text-muted-foreground mt-0.5">
                        {notification.message}
                    </Text>
                    <Text className="text-xs text-muted-foreground/70 mt-1">
                        {notification.timestamp}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}
