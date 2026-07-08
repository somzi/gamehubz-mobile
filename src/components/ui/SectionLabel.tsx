import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

interface SectionLabelProps {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    /** Accent for the icon chip; defaults to emerald. Pass e.g. COLORS.destructive for danger sections. */
    color?: string;
    className?: string;
}

/** Micro section header: small tinted icon chip + uppercase tracked label.
 *  The shared form-section pattern introduced on RegisterScreen. */
export function SectionLabel({ icon, title, color = COLORS.primary, className }: SectionLabelProps) {
    return (
        <View className={cn('flex-row items-center gap-2 mb-4', className)}>
            <View
                className="w-7 h-7 rounded-lg items-center justify-center border"
                style={{ backgroundColor: color + '1A', borderColor: color + '33' }}
            >
                <Ionicons name={icon} size={13} color={color} />
            </View>
            <Text className="text-slate-300 text-[11px] font-black uppercase tracking-[2px]">{title}</Text>
        </View>
    );
}
