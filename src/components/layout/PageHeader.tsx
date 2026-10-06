import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
    title: string;
    showBack?: boolean;
    rightElement?: React.ReactNode;
    className?: string;
}

export function PageHeader({ title, showBack, rightElement, className }: PageHeaderProps) {
    const navigation = useNavigation<any>();

    const canGoBack = showBack && navigation.canGoBack();

    const handleGoBack = () => {
        if (navigation.canGoBack()) {
            navigation.goBack();
        }
    };

    return (
        <View className={cn("bg-transparent", className)}>
            <View className="flex-row items-center justify-between h-16 px-6">
                {/* The title gives way (one line, ellipsis) when the buttons on the right need the room. */}
                <View className="flex-1 flex-row items-center gap-4 mr-3">
                    {showBack && canGoBack && (
                        <Pressable
                            onPress={handleGoBack}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                        </Pressable>
                    )}
                    <Text className="shrink text-xl font-bold text-white tracking-tight" numberOfLines={1}>{title}</Text>
                </View>
                <View className="flex-row items-center gap-3">
                    {rightElement}
                </View>
            </View>
        </View>
    );
}
