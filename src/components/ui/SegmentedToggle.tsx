import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { cn } from '../../lib/utils';

interface SegmentedToggleProps {
    options: ReadonlyArray<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

/** Segmented control for small exclusive choices (YES/NO, SOLO/TEAM, SINGLE/DOUBLE), set into the
 *  form like the fields around it. The active segment fills with the primary green. */
export function SegmentedToggle({ options, value, onChange, disabled = false }: SegmentedToggleProps) {
    return (
        <View className={cn(
            "bg-black/25 p-1 rounded-[14px] flex-row border border-white/[0.08]",
            disabled && "opacity-50"
        )}>
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => { if (!disabled) onChange(opt.value); }}
                        disabled={disabled}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active, disabled }}
                        className={cn(
                            "flex-1 py-2.5 rounded-[10px] items-center justify-center",
                            active && "bg-primary"
                        )}
                    >
                        <Text numberOfLines={1} className={cn(
                            "text-[12px] font-black tracking-wide uppercase w-full text-center",
                            active ? "text-primary-foreground" : "text-slate-400"
                        )}>
                            {opt.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
