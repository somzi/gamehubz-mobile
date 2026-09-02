import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { syncLanguageWithServer } from '../lib/languageSync';
import {
    DEFAULT_LANGUAGE,
    isSupportedLanguage,
    setLanguage,
    SUPPORTED_LANGUAGES,
    type LanguageCode,
    type LanguageOption,
} from './index';

interface UseLanguageResult {
    /** Currently active language code, always one of SUPPORTED_LANGUAGES. */
    language: LanguageCode;
    /** The full option (label + flag) for the active language. */
    current: LanguageOption;
    options: LanguageOption[];
    /** Switches language and persists the choice. */
    change: (code: LanguageCode) => Promise<void>;
}

/**
 * Language state for pickers and any screen that needs to show the active language.
 * Reads through `useTranslation` rather than the i18n singleton so the component
 * re-renders when the language changes.
 */
export function useLanguage(): UseLanguageResult {
    const { i18n } = useTranslation();

    const language: LanguageCode = isSupportedLanguage(i18n.language)
        ? i18n.language
        : DEFAULT_LANGUAGE;

    const current =
        SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0];

    const change = useCallback(async (code: LanguageCode) => {
        if (code === language) return;
        await setLanguage(code);
        // Not awaited: the UI has already switched, and the profile write only affects
        // notifications sent from here on.
        void syncLanguageWithServer(true);
    }, [language]);

    return { language, current, options: SUPPORTED_LANGUAGES, change };
}
