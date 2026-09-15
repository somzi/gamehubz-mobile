import React, { useState } from 'react';
import { Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { COLORS } from '../../lib/theme';
import { useLanguage } from '../../i18n/useLanguage';
import { ActionSheetModal } from '../modals/ActionSheetModal';

/**
 * Language picker for the signed-out screens: one pill naming the active language, opening the same
 * sheet Settings uses.
 *
 * It used to be a row of inline pills — right for two or three languages, but at seven the row
 * wrapped into three lines above the register hero. The choice is still visible without being
 * hunted for, since the pill shows the current language and its flag. Switching re-renders the form
 * in the chosen language immediately, and the `Language` header on the submit is what stamps the new
 * account's profile.
 *
 * Labels are the language's own name and are never translated.
 */
export function LanguageToggle() {
    const { t } = useTranslation('settings');
    const { current, options, language, change } = useLanguage();
    const [open, setOpen] = useState(false);

    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${t('languagePicker.title')}: ${current.label}`}
                hitSlop={8}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border bg-white/[0.03] border-white/[0.07] active:opacity-70"
            >
                <Text className="text-[12px]">{current.flag}</Text>
                <Text className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    {current.label}
                </Text>
                <Ionicons name="chevron-down" size={12} color={COLORS.slate400} />
            </Pressable>

            <ActionSheetModal
                visible={open}
                onClose={() => setOpen(false)}
                title={t('languagePicker.title')}
                subtitle={t('languagePicker.subtitle')}
                actions={options.map(option => ({
                    label: option.label,
                    emoji: option.flag,
                    selected: option.code === language,
                    onPress: () => { void change(option.code); },
                }))}
            />
        </>
    );
}
