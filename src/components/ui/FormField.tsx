import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from './PressableScale';
import { COLORS } from '../../lib/theme';

/**
 * The edit forms' shared pieces (profile, hub, tournament): fields sit as darker insets in the
 * card, labels are small tracked caps, and the one save action wears the calm emerald gradient of
 * the own chat bubble. The class strings are exported for forms that lay out raw TextInputs.
 */
export const FIELD_LABEL = 'text-[10.5px] font-black uppercase tracking-[1.4px] text-slate-400 mb-2 ml-0.5';
export const FIELD_INPUT = 'bg-black/25 px-4 h-12 rounded-[14px] text-white border border-white/[0.08] text-[15px]';
export const FIELD_MULTILINE = 'bg-black/25 px-4 pt-3 pb-3 h-24 rounded-[14px] text-white border border-white/[0.08] text-[15px]';
export const FIELD_HINT = 'text-[11px] leading-4 text-slate-500 mt-1.5 ml-0.5';
export const FIELD_PLACEHOLDER = COLORS.slate600;

const SAVE_GRADIENT = ['#1FBF88', '#0E9F6E'] as const;

/**
 * A lighter, glassy surface for a control that sits on a panel: lifted off the card rather than sunk
 * into it. The tournament form uses it for every field; the darker inset stays the default.
 */
export const RAISED_FIELD = {
    backgroundColor: 'rgba(148,163,184,0.09)',
    borderColor: 'rgba(148,163,184,0.18)',
    borderTopColor: 'rgba(255,255,255,0.13)',
} as const;
const FOCUS_BORDER = 'rgba(52,211,153,0.55)';

/** A block of the form: card navy, hairline edge, a brighter top edge. */
export function FormPanel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.panel, style]}>{children}</View>;
}

interface FieldInputProps extends TextInputProps {
    label?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    hint?: string;
    /** The lighter surface (RAISED_FIELD) instead of the dark inset. */
    raised?: boolean;
}

/** Labelled inset field; the edge and icon turn emerald while it has focus. */
export function FieldInput({ label, icon, hint, multiline, raised = false, style, onFocus, onBlur, ...props }: FieldInputProps) {
    const [focused, setFocused] = useState(false);

    return (
        <View>
            {label ? <Text className={FIELD_LABEL}>{label}</Text> : null}
            <View
                style={[
                    styles.field,
                    raised && RAISED_FIELD,
                    multiline ? styles.fieldMultiline : styles.fieldSingle,
                    focused && { borderColor: FOCUS_BORDER },
                    // A locked field reads as one at a glance.
                    props.editable === false && { opacity: 0.5 },
                ]}
            >
                {icon ? (
                    <Ionicons
                        name={icon}
                        size={17}
                        color={focused ? COLORS.primaryBright : COLORS.slate500}
                        style={multiline ? { marginTop: 13 } : undefined}
                    />
                ) : null}
                <TextInput
                    {...props}
                    multiline={multiline}
                    textAlignVertical={multiline ? 'top' : 'center'}
                    placeholderTextColor={FIELD_PLACEHOLDER}
                    onFocus={(e) => { setFocused(true); onFocus?.(e); }}
                    onBlur={(e) => { setFocused(false); onBlur?.(e); }}
                    style={[styles.input, multiline ? styles.inputMultiline : styles.inputSingle, style]}
                />
            </View>
            {hint ? <Text className={FIELD_HINT}>{hint}</Text> : null}
        </View>
    );
}

/** The form's one save action: calm emerald gradient, dark ink, a spinner while it works. */
export function GradientButton({
    label,
    icon,
    onPress,
    loading = false,
    disabled = false,
    compact = false,
    style,
}: {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    /** A lower button, for a footer that shares its row with other controls. */
    compact?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const inactive = disabled || loading;
    return (
        <PressableScale
            onPress={onPress}
            disabled={inactive}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityState={{ disabled: inactive, busy: loading }}
            containerStyle={style}
        >
            <View style={[styles.button, compact && styles.buttonCompact, inactive && !loading && { opacity: 0.5 }]}>
                <LinearGradient colors={SAVE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                {loading ? (
                    <ActivityIndicator color={COLORS.primaryForeground} />
                ) : (
                    <>
                        {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={SAVE_INK} /> : null}
                        <Text style={[styles.buttonText, compact && styles.buttonTextCompact]} numberOfLines={1}>{label}</Text>
                    </>
                )}
            </View>
        </PressableScale>
    );
}

/** Quiet partner of GradientButton (Cancel): glass fill, hairline edge. */
export function GhostButton({
    label,
    onPress,
    disabled = false,
    compact = false,
    style,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    /** Matches a compact GradientButton beside it. */
    compact?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    return (
        <PressableScale onPress={onPress} disabled={disabled} pressedScale={0.98} accessibilityRole="button" containerStyle={style}>
            <View style={[styles.button, compact && styles.buttonCompact, styles.ghost, disabled && { opacity: 0.5 }]}>
                <Text style={[styles.ghostText, compact && styles.ghostTextCompact]} numberOfLines={1}>{label}</Text>
            </View>
        </PressableScale>
    );
}

const SAVE_INK = '#03140E';

const styles = StyleSheet.create({
    panel: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderTopColor: 'rgba(255,255,255,0.11)',
        padding: 16,
    },
    field: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    fieldSingle: {
        height: 50,
    },
    fieldMultiline: {
        alignItems: 'flex-start',
        minHeight: 104,
    },
    input: {
        flex: 1,
        color: COLORS.foreground,
        fontSize: 15,
    },
    inputSingle: {
        height: '100%',
    },
    inputMultiline: {
        minHeight: 104,
        paddingTop: 13,
        paddingBottom: 13,
    },
    button: {
        height: 54,
        borderRadius: 16,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 18,
    },
    buttonCompact: {
        height: 46,
        borderRadius: 14,
    },
    buttonText: {
        color: SAVE_INK,
        fontSize: 16,
        fontWeight: '900',
    },
    buttonTextCompact: {
        fontSize: 15,
    },
    ghost: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    ghostText: {
        color: COLORS.slate200,
        fontSize: 15,
        fontWeight: '800',
    },
    ghostTextCompact: {
        fontSize: 14,
    },
});
