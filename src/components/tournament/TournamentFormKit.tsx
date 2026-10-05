import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Toggle } from '../ui/Toggle';
import { PressableScale } from '../ui/PressableScale';
import { FIELD_LABEL, FIELD_HINT, FieldInput, RAISED_FIELD } from '../ui/FormField';
import { COLORS } from '../../lib/theme';
import { useRevealField } from '../ui/FormScroll';

/**
 * The parts the Create and Edit tournament forms are built from: a step at a time, choices drawn as
 * cards instead of dropdowns, and on/off settings as cards with a switch — so each screen of the form
 * holds one subject and reads at a glance.
 */

type IconName = keyof typeof Ionicons.glyphMap;

export interface FormStep {
    key: string;
    icon: IconName;
    color: string;
    title: string;
}

/** The steps as a bar of segments, then the current one's icon, name and place. */
export function StepHeader({
    steps,
    current,
    onSelect,
    reachable,
}: {
    steps: FormStep[];
    current: number;
    onSelect: (index: number) => void;
    /** Whether a segment can be tapped to go there — every step when editing, the visited ones when creating. */
    reachable: (index: number) => boolean;
}) {
    const step = steps[current];
    return (
        <View>
            <View className="flex-row" style={{ gap: 5 }}>
                {steps.map((item, index) => {
                    const active = index === current;
                    const done = index < current;
                    const canGo = !active && reachable(index);
                    return (
                        <Pressable
                            key={item.key}
                            onPress={canGo ? () => onSelect(index) : undefined}
                            disabled={!canGo}
                            hitSlop={{ top: 12, bottom: 12 }}
                            accessibilityRole="button"
                            accessibilityLabel={`${index + 1}. ${item.title}`}
                            accessibilityState={{ selected: active, disabled: !canGo }}
                            className="flex-1"
                        >
                            <View
                                style={{
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: active || done ? item.color : 'rgba(255,255,255,0.08)',
                                    opacity: done ? 0.5 : 1,
                                }}
                            />
                        </Pressable>
                    );
                })}
            </View>
            <View className="flex-row items-center" style={{ gap: 10, marginTop: 14 }}>
                <View style={[styles.stepIcon, { backgroundColor: step.color + '1A', borderColor: step.color + '40' }]}>
                    <Ionicons name={step.icon} size={17} color={step.color} />
                </View>
                <Text className="flex-1 text-[17px] font-black text-white tracking-tight" numberOfLines={1}>
                    {step.title}
                </Text>
                <Text className="text-[12px] font-black text-slate-500" style={{ fontVariant: ['tabular-nums'] }}>
                    {current + 1}/{steps.length}
                </Text>
            </View>
        </View>
    );
}

/** A field's label, its control and an optional line under it. */
export function Field({ label, hint, children }: { label: string; hint?: string | null; children: React.ReactNode }) {
    return (
        <View>
            <Text className={FIELD_LABEL}>{label}</Text>
            {children}
            {hint ? <Text className={FIELD_HINT}>{hint}</Text> : null}
        </View>
    );
}

/** The form's text field: FieldInput on the lighter surface, scrolled clear of the keyboard on focus. */
export function FormInput({ onFocus, ...props }: React.ComponentProps<typeof FieldInput>) {
    const reveal = useRevealField();
    const box = useRef<View>(null);
    return (
        <View ref={box} collapsable={false}>
            <FieldInput
                raised
                {...props}
                onFocus={(e) => {
                    reveal?.(box.current);
                    onFocus?.(e);
                }}
            />
        </View>
    );
}

/** A dropdown's box, on the same surface as FormInput: an icon, the value, a chevron. */
export function SelectField({
    label,
    icon,
    value,
    onPress,
    disabled = false,
    loading = false,
}: {
    label?: string;
    icon?: IconName;
    value: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
}) {
    return (
        <View>
            {label ? <Text className={FIELD_LABEL}>{label}</Text> : null}
            <Pressable
                onPress={onPress}
                disabled={disabled || loading}
                accessibilityRole="button"
                accessibilityLabel={label ? `${label}, ${value}` : value}
                accessibilityState={{ disabled: disabled || loading }}
                className="active:opacity-70"
            >
                <View style={[styles.select, disabled && { opacity: 0.5 }]}>
                    {icon ? <Ionicons name={icon} size={17} color={COLORS.slate500} /> : null}
                    {loading ? (
                        <View className="flex-1 items-start">
                            <ActivityIndicator size="small" color={COLORS.primary} />
                        </View>
                    ) : (
                        <Text className="flex-1 text-[15px] text-white" numberOfLines={1}>{value}</Text>
                    )}
                    {!disabled && !loading ? <Ionicons name="chevron-down" size={16} color={COLORS.slate500} /> : null}
                </View>
            </Pressable>
        </View>
    );
}

export interface Choice<T extends string> {
    value: T;
    label: string;
    icon: IconName;
    hint?: string;
    /** The card's colour when chosen; the primary green when unset. */
    color?: string;
    disabled?: boolean;
}

/** A choice between a few things, each a card: icon, name and a line on what it means. */
export function ChoiceCards<T extends string>({
    options,
    value,
    onChange,
    disabled = false,
    compact = false,
}: {
    options: Choice<T>[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    /** One row per card — icon, name, check — for a small choice inside a panel. */
    compact?: boolean;
}) {
    // Every card as tall as the tallest one, so a grid of choices is even whatever each one says:
    // each reports its natural height once, and all of them take the largest.
    const [tallest, setTallest] = useState(0);
    const measure = (height: number) => setTallest(current => (height > current ? height : current));

    return (
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            {options.map(option => {
                const selected = option.value === value;
                const color = option.color ?? COLORS.primaryBright;
                const off = disabled || option.disabled;
                return (
                    <PressableScale
                        key={option.value}
                        onPress={() => { if (!off) onChange(option.value); }}
                        disabled={off}
                        pressedScale={0.97}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: off }}
                        accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
                        containerStyle={styles.choiceCell}
                    >
                        {compact ? (
                            <View
                                onLayout={e => measure(e.nativeEvent.layout.height)}
                                style={[
                                    styles.choiceCompact,
                                    tallest > 0 && { minHeight: tallest },
                                    selected && { borderColor: color + '80', backgroundColor: color + '1A' },
                                    off && !selected && { opacity: 0.4 },
                                ]}
                            >
                                <Ionicons name={option.icon} size={16} color={selected ? color : COLORS.slate400} />
                                {/* Shrinks rather than breaking a word across lines ("Aggregat / e Score"). */}
                                <Text
                                    className="flex-1 text-[12.5px] leading-[16px] font-bold text-white"
                                    numberOfLines={2}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {option.label}
                                </Text>
                                <Ionicons
                                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={17}
                                    color={selected ? color : 'rgba(255,255,255,0.22)'}
                                />
                            </View>
                        ) : (
                        <View
                            onLayout={e => measure(e.nativeEvent.layout.height)}
                            style={[
                                styles.choice,
                                tallest > 0 && { minHeight: tallest },
                                selected && { borderColor: color + '80', backgroundColor: color + '1A' },
                                off && !selected && { opacity: 0.4 },
                            ]}
                        >
                            <View className="flex-row items-center justify-between">
                                <View style={[styles.choiceIcon, { backgroundColor: (selected ? color : '#94A3B8') + '1A' }]}>
                                    <Ionicons name={option.icon} size={17} color={selected ? color : COLORS.slate400} />
                                </View>
                                <Ionicons
                                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={18}
                                    color={selected ? color : 'rgba(255,255,255,0.18)'}
                                />
                            </View>
                            {/* Two lines for a long name ("Groups + Bracket") rather than an ellipsis. */}
                            <Text className="text-[14px] leading-[18px] font-black text-white mt-2.5" numberOfLines={2}>
                                {option.label}
                            </Text>
                            {option.hint ? (
                                <Text className="text-[11.5px] leading-4 text-slate-400 mt-0.5" numberOfLines={2}>
                                    {option.hint}
                                </Text>
                            ) : null}
                        </View>
                        )}
                    </PressableScale>
                );
            })}
        </View>
    );
}

/**
 * An on/off setting as a card: icon, name and the switch. The whole card toggles it. What it does is
 * said once it is on, with whatever only matters then (a number to set) — off, the card is one line.
 */
export function ToggleCard({
    icon,
    color,
    title,
    hint,
    value,
    onChange,
    disabled = false,
    children,
}: {
    icon: IconName;
    color: string;
    title: string;
    hint?: string;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <View style={[styles.toggleCard, value && { borderColor: color + '4D', backgroundColor: color + '0D' }, disabled && { opacity: 0.5 }]}>
            <Pressable
                onPress={() => { if (!disabled) onChange(!value); }}
                disabled={disabled}
                accessibilityRole="switch"
                accessibilityLabel={title}
                accessibilityHint={hint}
                accessibilityState={{ checked: value, disabled }}
                className="flex-row items-center active:opacity-80"
                style={{ gap: 12 }}
            >
                <View style={[styles.toggleIcon, { backgroundColor: (value ? color : '#94A3B8') + '1A' }]}>
                    <Ionicons name={icon} size={17} color={value ? color : COLORS.slate400} />
                </View>
                <View className="flex-1 min-w-0">
                    <Text className="text-[14px] font-bold text-white">{title}</Text>
                    {hint && value ? <Text className="text-[11.5px] leading-4 text-slate-400 mt-0.5">{hint}</Text> : null}
                </View>
                {/* Drawn only: the card itself is the switch, so there is one target and one announcement. */}
                <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Toggle value={value} onValueChange={() => {}} activeColor={color} size="sm" />
                </View>
            </Pressable>
            {value && children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
        </View>
    );
}

/** Square arrow button for moving between steps while editing. */
export function StepArrow({ direction, onPress, disabled, label }: {
    direction: 'back' | 'forward';
    onPress: () => void;
    disabled: boolean;
    label: string;
}) {
    return (
        <PressableScale onPress={onPress} disabled={disabled} pressedScale={0.95} accessibilityRole="button" accessibilityLabel={label}>
            <View style={[styles.arrow, disabled && { opacity: 0.35 }]}>
                <Ionicons name={direction === 'back' ? 'chevron-back' : 'chevron-forward'} size={20} color={COLORS.slate300} />
            </View>
        </PressableScale>
    );
}

/** The error that stopped a step, in one red line above the buttons. */
export function FormError({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <View className="flex-row items-center bg-red-500/10 border border-red-500/25 rounded-2xl px-3 py-2.5 mb-3" style={{ gap: 8 }}>
            <Ionicons name="alert-circle" size={16} color="#F87171" />
            <Text className="flex-1 text-red-300 text-xs font-bold">{message}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    stepIcon: {
        width: 34,
        height: 34,
        borderRadius: 11,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    choiceCell: {
        width: '46%',
        flexGrow: 1,
    },
    choice: {
        minHeight: 104,
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
        ...RAISED_FIELD,
    },
    choiceCompact: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 11,
        paddingVertical: 9,
        borderRadius: 14,
        borderWidth: 1,
        ...RAISED_FIELD,
    },
    choiceIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleCard: {
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        ...RAISED_FIELD,
    },
    toggleIcon: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    select: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 50,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        ...RAISED_FIELD,
    },
    arrow: {
        width: 54,
        height: 54,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
