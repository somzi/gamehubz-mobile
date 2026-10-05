import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MAX_BEST_OF, normalizeBestOf } from '../../lib/series';
import { RAISED_FIELD } from '../ui/FormField';
import { COLORS } from '../../lib/theme';
import { useRevealField } from '../ui/FormScroll';

interface BestOfInputProps {
    value: number;
    onChange: (value: number) => void;
    /** Caption over the number; "Best of" when unset. */
    label?: string;
    disabled?: boolean;
}

/**
 * Stepper for a Best-of length, across the whole width: minus on the left, plus on the right, and the
 * length itself large in the middle under its caption — the one thing the row is about, centred.
 *
 * Typing stays available for reaching a length that would be tedious to step to, and the typed text is
 * held locally until it parses to something the server accepts, so clearing the field to type "8" is
 * not fought halfway through (normalising per keystroke turned that into "18", then clamped it to 15).
 */
export function BestOfInput({ value, onChange, label, disabled = false }: BestOfInputProps) {
    const { t } = useTranslation('common');
    const caption = label ?? t('app.bestOf');
    const [text, setText] = useState(String(value));
    // Typing a length in a form: keep the row clear of the keyboard.
    const reveal = useRevealField();
    const row = useRef<View>(null);

    // Re-sync when the value changes from elsewhere (a reset, a loaded tournament, a step). A value
    // the field itself just produced already matches, so this never interrupts typing.
    useEffect(() => {
        if (parseInt(text, 10) !== value) setText(String(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const step = (delta: number) => {
        const next = normalizeBestOf(value + delta);
        if (next !== value) onChange(next);
    };

    const atMin = value <= 1;
    const atMax = value >= MAX_BEST_OF;

    return (
        <View ref={row} collapsable={false} style={[styles.row, disabled && { opacity: 0.5 }]}>
            <StepButton icon="remove" label="−" onPress={() => step(-1)} disabled={disabled || atMin} />

            <View className="flex-1 items-center">
                <Text className="text-[9.5px] font-black uppercase tracking-[1.3px] text-slate-400" numberOfLines={1}>
                    {caption}
                </Text>
                {/* The height and the centring live on this wrapper, never on the input: a TextInput
                    given a fixed height aligns its text differently per platform, and the number drifts. */}
                <View style={styles.valueBox}>
                    <TextInput
                        className="text-white font-black text-center w-full"
                        style={styles.value}
                        placeholder="1"
                        placeholderTextColor={COLORS.slate600}
                        keyboardType="numeric"
                        maxLength={2}
                        selectTextOnFocus
                        onFocus={() => reveal?.(row.current)}
                        editable={!disabled}
                        accessibilityLabel={caption}
                        value={text}
                        onChangeText={raw => {
                            const digits = raw.replace(/[^0-9]/g, '');
                            setText(digits);

                            const parsed = parseInt(digits, 10);
                            if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= MAX_BEST_OF) onChange(parsed);
                        }}
                        onBlur={() => {
                            // A field left empty or out of range falls back to the last good length.
                            const parsed = parseInt(text, 10);
                            if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_BEST_OF) {
                                const restored = normalizeBestOf(value);
                                setText(String(restored));
                                onChange(restored);
                            }
                        }}
                    />
                </View>
            </View>

            <StepButton icon="add" label="+" onPress={() => step(1)} disabled={disabled || atMax} />
        </View>
    );
}

function StepButton({ icon, label, onPress, disabled }: {
    icon: 'remove' | 'add';
    label: string;
    onPress: () => void;
    disabled: boolean;
}) {
    return (
        <Pressable
            onPress={() => { if (!disabled) onPress(); }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            hitSlop={6}
            className="active:opacity-70"
        >
            <View style={[styles.button, disabled && styles.buttonOff]}>
                <Ionicons name={icon} size={18} color={disabled ? '#475569' : COLORS.primaryBright} />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 7,
        paddingVertical: 7,
        borderRadius: 16,
        borderWidth: 1,
        ...RAISED_FIELD,
    },
    valueBox: {
        height: 26,
        width: 64,
        alignItems: 'center',
        justifyContent: 'center',
    },
    value: {
        // fontSize here rather than a text class: Tailwind's size classes ship a line-height far
        // taller than the digit, which pushes the number down inside the box.
        fontSize: 20,
        padding: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
        fontVariant: ['tabular-nums'],
    },
    button: {
        width: 38,
        height: 38,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.30)',
        backgroundColor: 'rgba(52,211,153,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonOff: {
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
});
