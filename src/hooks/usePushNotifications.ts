import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { apiClient, ENDPOINTS } from '../lib/api';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PushPermissionState {
    status: PermissionStatus;
    granted: boolean;
    canAskAgain: boolean;
}

export const STORAGE_KEY_LAST_SYNCED_TOKEN = 'push_last_synced_token';

/**
 * Hook for managing push notification permissions, token retrieval,
 * and idempotent backend synchronization.
 *
 * Key behaviours:
 *  - `checkAndSync()` — Non-intrusive. Reads current permission status,
 *    fetches the token if granted, syncs only when the token differs from
 *    the last successfully synced value (persisted in SecureStore).
 *    Covers the "recovery" scenario where a user enables notifications
 *    in system settings after previously denying.
 *
 *  - `requestAndSync()` — Intrusive. Calls `requestPermissionsAsync()`
 *    which shows the native OS prompt (Android 13+ system dialog / iOS
 *    first-time prompt). Then fetches + syncs the token if granted.
 *    On iOS, the OS ensures this prompt only appears once — subsequent
 *    calls resolve immediately without a popup.
 */
export function usePushNotifications() {
    const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // ─── Android notification channel ──────────────────────────────
    const ensureAndroidChannel = useCallback(async () => {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#10B981',
            });
        }
    }, []);

    // ─── Token fetch + idempotent sync ─────────────────────────────
    const fetchTokenAndSync = useCallback(async (force = false): Promise<string | null> => {
        try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenResponse = await Notifications.getExpoPushTokenAsync({
                projectId,
            });
            const token = tokenResponse.data;
            console.log(`[Push] Token fetched successfully: ${token ? token.substring(0, 20) + '…' : 'null'}`);

            if (!token) {
                console.warn('[Push] Token fetch returned null');
                return null;
            }

            // Idempotency: skip only for non-forced (foreground) re-checks.
            // The backend is the source of truth, so login/restore always
            // forces a sync — the local cache can drift from the DB (e.g. the
            // row was deleted server-side) and must never block a re-write.
            if (!force) {
                const lastSynced = await SecureStore.getItemAsync(STORAGE_KEY_LAST_SYNCED_TOKEN);
                if (token === lastSynced) {
                    console.log('[Push] Backend sync SKIPPED — token unchanged since last successful sync');
                    return token;
                }
            }

            console.log('[Push] Backend sync INITIATED — token is new or changed');
            await syncTokenWithServer(token);
            return token;
        } catch (e) {
            console.warn('[Push] Token fetch FAILED:', e);
            setError('Failed to retrieve push token. Are you on a physical device?');
            return null;
        }
    }, []);

    const syncTokenWithServer = async (token: string) => {
        try {
            await apiClient.post(ENDPOINTS.PUSH_TOKEN, {
                token,
                platform: Platform.OS,
            });
            // Persist on success so future launches can skip redundant calls
            await SecureStore.setItemAsync(STORAGE_KEY_LAST_SYNCED_TOKEN, token);
            console.log('[Push] Token synced with server and persisted locally');
        } catch (e) {
            console.warn('[Push] Backend sync FAILED:', e);
        }
    };

    // ─── Public API ────────────────────────────────────────────────

    /**
     * Non-intrusive check: reads current permission status without
     * triggering any OS prompt. If already granted, fetches the
     * token and syncs idempotently.
     *
     * Use on every app launch / auth restore to handle the recovery
     * case (user granted permissions later via system settings).
     */
    const checkAndSync = useCallback(async (force = false): Promise<PushPermissionState> => {
        if (!Device.isDevice) {
            setError('Push notifications require a physical device.');
            console.warn('[Push] Must use physical device for push notifications');
            return {
                status: 'denied',
                granted: false,
                canAskAgain: false,
            };
        }

        await ensureAndroidChannel();

        const permission = await Notifications.getPermissionsAsync();
        const granted = permission.granted || permission.status === 'granted';

        console.log(
            `[Push] Permission status detected: ${permission.status} | granted=${granted} | canAskAgain=${permission.canAskAgain}`,
        );

        if (granted) {
            const token = await fetchTokenAndSync(force);
            if (token) setExpoPushToken(token);
        }

        return {
            status: permission.status as PermissionStatus,
            granted,
            canAskAgain: permission.canAskAgain,
        };
    }, [ensureAndroidChannel, fetchTokenAndSync]);

    /**
     * Explicitly request notification permissions from the OS.
     *
     * - Android 13+ (API 33): triggers the native POST_NOTIFICATIONS
     *   system dialog.
     * - iOS: triggers the native alert exactly once per app install.
     *   Subsequent calls are a no-op (Apple policy).
     *
     * If permission is granted, fetches the token and syncs.
     */
    const requestAndSync = useCallback(async (): Promise<boolean> => {
        if (!Device.isDevice) {
            setError('Push notifications require a physical device.');
            console.warn('[Push] Must use physical device for push notifications');
            return false;
        }

        await ensureAndroidChannel();

        console.log('[Push] Requesting notification permissions from OS…');
        const { status } = await Notifications.requestPermissionsAsync();
        console.log(`[Push] Permission request result: ${status}`);

        if (status !== 'granted') {
            setError('Notification permission not granted.');
            console.log('[Push] User denied notification permissions');
            return false;
        }

        const token = await fetchTokenAndSync(true);
        if (token) {
            setExpoPushToken(token);
            return true;
        }
        return false;
    }, [ensureAndroidChannel, fetchTokenAndSync]);

    return { expoPushToken, error, checkAndSync, requestAndSync };
}
