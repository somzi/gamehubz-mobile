import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { cn } from '../../lib/utils';
import { useLanguage } from '../../i18n/useLanguage';

/**
 * Two-pill language switch for the signed-out screens.
 *
 * Settings opens the full action sheet, but here the entire choice is two options — a
 * sheet would wrap a tap of ceremony around something that fits on one row, and the whole
 * point on the register screen is that the choice is visible without being hunted for.
 * Switching re-renders the form in the chosen language immediately, and the `Language`
 * header on the submit is what stamps the new account's profile.
 *
 * Labels are the language's own name and are never translated.
 */
export function LanguageToggle() {
    const { options, language, change } = useLanguage();

    return (
        <View className="flex-row gap-2">
            {options.map(option => {
                const active = option.code === language;

                return (
                    <Pressable
                        key={option.code}
                        onPress={() => { void change(option.code); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={option.label}
                        hitSlop={6}
                        className={cn(
                            'flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border active:opacity-70',
                            active
                                ? 'bg-primary/10 border-primary/30'
                                : 'bg-white/[0.03] border-white/[0.07]',
                        )}
                    >
                        <Text className="text-[12px]">{option.flag}</Text>
                        <Text
                            className={cn(
                                'text-[11px] font-black uppercase tracking-wider',
                                active ? 'text-primary' : 'text-slate-500',
                            )}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
