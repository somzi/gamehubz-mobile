import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../components/layout/PageHeader';
import { NotificationItem, Notification } from '../components/notifications/NotificationItem';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/ui/Button';

// Mock data
const mockNotifications: Notification[] = [
    {
        id: "1",
        type: "match_scheduled",
        title: "Match Scheduled",
        message: "Your match against GamerX is scheduled for Tomorrow at 18:00",
        timestamp: "5 min ago",
        read: false,
        tournamentId: "1",
        matchId: "qf1",
    },
    {
        id: "2",
        type: "round_started",
        title: "New Round Started",
        message: "Semifinals have begun in Winter Championship 2024",
        timestamp: "1 hour ago",
        read: false,
        tournamentId: "1",
    },
    {
        id: "3",
        type: "reminder",
        title: "Match Reminder",
        message: "Your match starts in 30 minutes. Don't forget to click Ready!",
        timestamp: "2 hours ago",
        read: true,
        matchId: "qf1",
    },
    {
        id: "4",
        type: "tournament_update",
        title: "Registration Open",
        message: "Spring Showdown is now accepting registrations",
        timestamp: "1 day ago",
        read: true,
        tournamentId: "2",
    },
];

export default function NotificationsScreen() {
    const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
    const unreadCount = notifications.filter((n) => !n.read).length;

    const markAsRead = (id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
    };

    const markAllAsRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title="Notifications"
                showBack
                rightElement={
                    unreadCount > 0 ? (
                        <Button
                            onPress={markAllAsRead}
                            variant="ghost"
                            size="sm"
                        >
                            <Text className="text-primary text-xs font-medium">Mark all read</Text>
                        </Button>
                    ) : null
                }
            />
            <ScrollView className="flex-1 px-4 py-4">
                {notifications.length === 0 ? (
                    <View className="items-center justify-center py-12 opacity-50">
                        <Ionicons name="notifications-off-outline" size={48} color="#71717A" />
                        <Text className="text-muted-foreground mt-4">No notifications yet</Text>
                    </View>
                ) : (
                    <View className="pb-8">
                        {notifications.map((notification) => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onRead={() => markAsRead(notification.id)}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
