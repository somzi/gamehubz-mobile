import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation, NavigationProp, useNavigationState } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
    title: string;
    showBack?: boolean;
    showNotifications?: boolean;
    rightElement?: React.ReactNode;
    className?: string;
}

export function PageHeader({ title, showBack, showNotifications = false, rightElement, className }: PageHeaderProps) {
    const navigation = useNavigation<any>();

    // We check if we can go back inside the render logic to decide whether to show the button
    const canGoBack = showBack && navigation.canGoBack();

    const handleGoBack = () => {
        if (navigation.canGoBack()) {
            navigation.goBack();
        }
    };

    return (
        <View className={cn("bg-transparent", className)}>
            <View className="flex-row items-center justify-between h-16 px-6">
                <View className="flex-row items-center gap-4">
                    {showBack && canGoBack && (
                        <Pressable
                            onPress={handleGoBack}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                        </Pressable>
                    )}
                    <Text className="text-xl font-bold text-white tracking-tight">{title}</Text>
                </View>
                <View className="flex-row items-center gap-3">
                    {showNotifications && (
                        <Pressable
                            onPress={() => navigation.navigate('Notifications')}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <Ionicons name="notifications-outline" size={20} color="#FAFAFA" />
                            <View className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border border-background" />
                        </Pressable>
                    )}
                    {rightElement}
                </View>
            </View>
        </View>
    );
}
