import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

interface EmptyStateProps {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description?: string;
    /** Icon-chip accent; defaults to emerald. */
    color?: string;
    /** 'card' — glassy rounded container (inside a section); 'plain' — transparent, for full-screen list empties. */
    variant?: 'card' | 'plain';
    /** Optional call-to-action rendered under the text. */
    action?: React.ReactNode;
    className?: string;
}

/** The shared "nothing here" block: tinted icon chip + title + optional description/action. */
export function EmptyState({
    icon,
    title,
    description,
    color = COLORS.primary,
    variant = 'card',
    action,
    className,
}: EmptyStateProps) {
    return (
        <View
            className={cn(
                'items-center justify-center',
                variant === 'card'
                    ? 'py-12 bg-white/[0.02] rounded-3xl border border-white/[0.04]'
                    : 'py-16',
                className
            )}
        >
            <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '26' }}
            >
                <Ionicons name={icon} size={26} color={color} />
            </View>
            <Text className="text-white font-black text-sm">{title}</Text>
            {description ? (
                <Text className="text-slate-500 text-xs mt-1 text-center px-10 leading-5">
                    {description}
                </Text>
            ) : null}
            {action ? <View className="mt-4">{action}</View> : null}
        </View>
    );
}
