import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatSchedulePickerValue } from '../../lib/utils';

function withAlpha(hex: string, alpha: number): string {
    const c = hex.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ScheduleFieldProps {
    label: string;
    value?: string | null;
    placeholder: string;
    iconName: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    onPress: () => void;
    disabled?: boolean;
}

/**
 * A date+time picker trigger for the tournament Schedule section. Shows the picked
 * value as a bold date line + a muted HH:mm line inside a tinted-icon card — replaces
 * the old single-line `toLocaleString()` button that overflowed and truncated with "…".
 * Value may be a backend UTC ISO string or the picker's local "YYYY-MM-DD HH:mm".
 */
export function ScheduleField({
    label,
    value,
    placeholder,
    iconName,
    iconColor,
    onPress,
    disabled,
}: ScheduleFieldProps) {
    const parts = formatSchedulePickerValue(value);
    return (
        <View className="flex-1">
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                {label}
            </Text>
            <TouchableOpacity
                onPress={onPress}
                disabled={disabled}
                activeOpacity={0.7}
                className={`bg-white/[0.03] border border-white/[0.06] rounded-2xl px-3 py-2.5 flex-row items-center ${disabled ? 'opacity-50' : ''}`}
                style={{ minHeight: 56 }}
            >
                <View
                    className="w-9 h-9 rounded-xl items-center justify-center mr-2.5"
                    style={{
                        backgroundColor: withAlpha(iconColor, 0.14),
                        borderWidth: 1,
                        borderColor: withAlpha(iconColor, 0.25),
                    }}
                >
                    <Ionicons name={iconName} size={16} color={iconColor} />
                </View>
                <View className="flex-1">
                    {parts ? (
                        <>
                            <Text className="text-white text-[13px] font-bold" numberOfLines={1}>
                                {parts.date}
                            </Text>
                            <Text
                                className="text-slate-400 text-[11px] font-semibold mt-0.5"
                                numberOfLines={1}
                            >
                                {parts.time}
                            </Text>
                        </>
                    ) : (
                        <Text className="text-slate-500 text-[13px]" numberOfLines={1}>
                            {placeholder}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        </View>
    );
}
