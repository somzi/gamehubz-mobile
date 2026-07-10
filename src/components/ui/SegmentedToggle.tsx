import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { cn } from '../../lib/utils';

interface SegmentedToggleProps {
    options: ReadonlyArray<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

/** Pill segmented control for small exclusive choices (YES/NO, SOLO/TEAM,
 *  SINGLE/DOUBLE). Active segment fills with the primary green. */
export function SegmentedToggle({ options, value, onChange, disabled = false }: SegmentedToggleProps) {
    return (
        <View className={cn(
            "bg-white/[0.03] p-1 rounded-2xl flex-row border border-white/[0.06]",
            disabled && "opacity-50"
        )}>
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => { if (!disabled) onChange(opt.value); }}
                        disabled={disabled}
                        className={cn(
                            "flex-1 py-3 rounded-xl items-center justify-center",
                            active && "bg-primary"
                        )}
                    >
                        <Text className={cn(
                            "text-xs font-black tracking-wide uppercase",
                            active ? "text-primary-foreground" : "text-slate-500"
                        )}>
                            {opt.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
