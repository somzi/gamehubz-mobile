// Intl.PluralRules polyfill — MUST be imported before i18next.
// i18next v26 resolves plural forms through Intl.PluralRules. Hermes ships Intl on
// current React Native, but engine support has historically varied by platform and
// OS version, and a missing Intl here is a hard crash at app start rather than a
// degraded string. The polyfill is pure JS (~80KB, no native module), so it costs a
// little bundle and keeps the whole i18n layer shippable over EAS Update.
import 'intl-pluralrules';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en';
import es from './locales/es';

/** Key under which the user's explicit language choice is persisted. */
export const STORAGE_KEY_LANGUAGE = 'app_language';

export type LanguageCode = 'en' | 'es';

export interface LanguageOption {
    code: LanguageCode;
    /** Shown in the picker — always written in the language itself, never translated. */
    label: string;
    flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

// Namespaces are split per feature area so a screen only pulls the strings it needs
// and translators get a file per domain rather than one 1000-key blob. The list is
// derived from the English barrel, so adding a namespace never touches this file.
const resources = {
    en,
    es,
};

const namespaces = Object.keys(en);

export function isSupportedLanguage(value: unknown): value is LanguageCode {
    return typeof value === 'string' && SUPPORTED_LANGUAGES.some(l => l.code === value);
}

// Initialised synchronously with the default so any module that calls `t` while it is
// still being imported gets real English text instead of raw keys. The stored choice is
// applied a tick later by `i18nReady` below.
i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: namespaces,
    // A key missing from `es` falls back to the `en` value rather than rendering the
    // key itself. This is what lets Phase 2 ship screen-by-screen over OTA without a
    // half-translated build ever showing "settings.title" to a user.
    fallbackNS: false,
    returnNull: false,
    interpolation: {
        // React Native already escapes text nodes; i18next escaping on top would
        // double-encode apostrophes and accented characters.
        escapeValue: false,
    },
    react: {
        useSuspense: false,
    },
});

/**
 * Resolves the language actually in effect: the stored choice, or English.
 *
 * Deliberately NOT the device locale. Sniffing it would flip an existing account to
 * Spanish on the first launch after the update, without anyone asking — and because
 * the client syncs its language to the profile on every login, that guess would then
 * silently turn their push notifications Spanish too. English is the product default;
 * Spanish is something you choose, at registration or in Settings.
 *
 * App gates its first render on this so a user who HAS chosen Spanish never sees a
 * frame of English first.
 */
export const i18nReady: Promise<void> = (async () => {
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);
        const next = isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
        if (next !== i18n.language) {
            await i18n.changeLanguage(next);
        }
    } catch {
        // Storage unreadable — stay on the default rather than blocking startup.
    }
})();

/** Current language, always narrowed to a supported code. */
export function getCurrentLanguage(): LanguageCode {
    return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/** Language for the API `Language` header. */
export function getRequestLanguage(): LanguageCode {
    return getCurrentLanguage();
}

/**
 * Switches language and persists the choice. Persisting is best-effort: a failed
 * write means the app reverts to detection on next launch, which is preferable to
 * failing the switch the user just asked for.
 */
export async function setLanguage(code: LanguageCode): Promise<void> {
    await i18n.changeLanguage(code);
    try {
        await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, code);
    } catch {
        // Non-fatal — the switch already applied for this session.
    }
}

export default i18n;
