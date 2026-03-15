import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

interface StatCardProps {
    icon: keyof typeof Ionicons.glyphMap;
    value: string | number;
    label: string;
    variant?: 'gold' | 'accent' | 'default';
    className?: string;
}

export function StatCard({ icon, value, label, variant = 'default', className }: StatCardProps) {
    const getVariantColors = () => {
        switch (variant) {
            case 'gold':
                return { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20' };
            case 'accent':
                return { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20' };
            default:
                return { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' };
        }
    };

    const colors = getVariantColors();

    // Use specific hex colors to match the theme precisely on native
    const iconColor = variant === 'gold' ? '#EAB308' : variant === 'accent' ? '#10B981' : '#10B981';

    return (
        <View className={cn("rounded-xl border p-4 bg-card", colors.border, className)}>
            <View className={cn("w-10 h-10 rounded-lg items-center justify-center mb-3", colors.bg)}>
                <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <Text className={cn("text-2xl font-bold", colors.text)}>{value}</Text>
            <Text className="text-xs text-muted-foreground font-medium mt-1">{label}</Text>
        </View>
    );
}
