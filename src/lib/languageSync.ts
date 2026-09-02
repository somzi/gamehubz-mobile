import * as SecureStore from 'expo-secure-store';

import { apiClient, ENDPOINTS } from './api';
import { getRequestLanguage } from '../i18n';

/**
 * Marker for the last language the server confirmed. Cleared on logout alongside the
 * push-token marker, so the next account on this device syncs its own choice instead of
 * inheriting the previous user's "already synced" state.
 */
export const STORAGE_KEY_LAST_SYNCED_LANGUAGE = 'last_synced_language';

/**
 * Pushes the in-app language choice to the user's profile.
 *
 * The `Language` request header covers anything rendered inside a request, but push
 * notifications and e-mails are read later by someone who is not the caller — those are
 * written from the stored profile language, which is what this call sets.
 *
 * Fire-and-forget by design: a failed sync only means notifications stay in the previous
 * language until the next attempt, which is never worth surfacing to the user or blocking
 * the language switch they just made.
 *
 * Does nothing while signed out. The picker is reachable from the register screen, and
 * there is no profile to write to yet — worse, the unauthenticated POST would come back
 * 401 and drive the axios interceptor into a refresh it cannot complete, which ends in a
 * spurious logout. Registration stamps the language from the request header anyway, and
 * the AuthContext effect syncs again the moment a session exists.
 *
 * @param force skip the unchanged-since-last-sync short-circuit (used right after login,
 *              where the local marker can be stale relative to the account).
 */
export async function syncLanguageWithServer(force = false): Promise<void> {
    const language = getRequestLanguage();

    try {
        if (!(await SecureStore.getItemAsync('access_token'))) return;

        if (!force) {
            const lastSynced = await SecureStore.getItemAsync(STORAGE_KEY_LAST_SYNCED_LANGUAGE);
            if (lastSynced === language) return;
        }

        await apiClient.post(ENDPOINTS.SET_LANGUAGE, { language });
        await SecureStore.setItemAsync(STORAGE_KEY_LAST_SYNCED_LANGUAGE, language);
    } catch {
        // Non-fatal — retried on the next switch or the next login.
    }
}
