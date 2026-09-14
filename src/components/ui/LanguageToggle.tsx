import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { cn } from '../../lib/utils';
import { useLanguage } from '../../i18n/useLanguage';

/**
 * Language pills for the signed-out screens.
 *
 * Settings opens the full action sheet, but here the choice is short enough to show
 * inline — a sheet would wrap a tap of ceremony around it, and the whole point on the
 * register screen is that the choice is visible without being hunted for.
 * Switching re-renders the form in the chosen language immediately, and the `Language`
 * header on the submit is what stamps the new account's profile.
 *
 * The row wraps: three pills no longer fit on one line on a narrow phone, and the
 * fourth language would not fit either. `flex-1` claims the parent row's width so the
 * wrapped lines stay right-aligned instead of collapsing to content width.
 *
 * Labels are the language's own name and are never translated.
 */
export function LanguageToggle() {
    const { options, language, change } = useLanguage();

    return (
        <View className="flex-1 flex-row flex-wrap justify-end gap-2">
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
