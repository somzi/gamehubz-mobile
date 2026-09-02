import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { MAX_BEST_OF, normalizeBestOf } from '../../lib/series';

interface BestOfInputProps {
    value: number;
    onChange: (value: number) => void;
    /** Caption on the left of the row. */
    label?: string;
    disabled?: boolean;
}

/**
 * Stepper for a Best-of length: a caption on the left, and one compact control on the right.
 *
 * The minus, the number and the plus are a single joined unit rather than three things spread
 * across the row. Pushed to opposite edges, the number ends up ringed by empty space and reads as
 * adrift — wedged between its own two buttons it cannot. Typing stays available for reaching a
 * length that would be tedious to step to, and the typed text is held locally until it parses to
 * something the server accepts, so clearing the field to type "8" is not fought halfway through
 * (normalising per keystroke turned that into "18", then clamped it to 15).
 */
export function BestOfInput({ value, onChange, label, disabled = false }: BestOfInputProps) {
    const { t } = useTranslation('common');
    const resolvedLabel = label ?? t('app.bestOf');
    const [text, setText] = useState(String(value));

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
        <View
            className={cn(
                'bg-white/[0.03] h-14 rounded-2xl border border-white/[0.06] flex-row items-center justify-between pl-4 pr-2',
                disabled && 'opacity-50',
            )}
        >
            <Text className="text-slate-400 text-sm font-semibold">{label}</Text>

            {/* One joined control: no gaps between the three parts, so the value is visibly held
                rather than floating. Dividers do the separating that spacing would otherwise. */}
            <View className="flex-row items-center rounded-xl bg-white/[0.05] border border-white/[0.08] overflow-hidden">
                <StepButton icon="remove" onPress={() => step(-1)} disabled={disabled || atMin} />

                {/* The height and the centring live on this wrapper, never on the input.
                    A TextInput given a fixed height aligns its text internally — and does it
                    differently per platform — so the number drifts to the bottom. Sized to its own
                    glyphs and centred by flexbox, it lands in the middle everywhere. */}
                <View className="w-14 h-10 items-center justify-center border-x border-white/[0.08]">
                    <TextInput
                        className="text-white font-black text-center w-full"
                        // fontSize is set here rather than via `text-lg`, because that class also
                        // ships Tailwind's 28px line-height — a line box far taller than an 18px
                        // digit, which is what was pushing the number down in the first place.
                        style={{
                            fontSize: 18,
                            padding: 0,
                            includeFontPadding: false,
                            textAlignVertical: 'center',
                        }}
                        placeholder="1"
                        placeholderTextColor="#334155"
                        keyboardType="numeric"
                        maxLength={2}
                        selectTextOnFocus
                        editable={!disabled}
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

                <StepButton icon="add" onPress={() => step(1)} disabled={disabled || atMax} />
            </View>
        </View>
    );
}

function StepButton({ icon, onPress, disabled }: {
    icon: 'remove' | 'add';
    onPress: () => void;
    disabled: boolean;
}) {
    return (
        <Pressable
            onPress={() => { if (!disabled) onPress(); }}
            disabled={disabled}
            className={cn('w-10 h-10 items-center justify-center', !disabled && 'active:bg-white/[0.06]')}
        >
            <Ionicons name={icon} size={18} color={disabled ? '#334155' : '#94A3B8'} />
        </Pressable>
    );
}
