import { useState, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import type { PermissionStatus, PushPermissionState } from './usePushNotifications';

/**
 * The OS push permission, read-only — this never shows the OS prompt (that is
 * `usePushNotifications().requestAndSync`). Re-read whenever the screen regains focus, so
 * Settings sees a change made on the notification screen above it, and whenever the app returns
 * to the foreground, which is how a user coming back from the system settings page sees their
 * change straight away. `null` until the first read lands, or if it fails.
 */
export function usePushPermission() {
    const [permission, setPermission] = useState<PushPermissionState | null>(null);

    const refresh = useCallback(async () => {
        try {
            const result = await Notifications.getPermissionsAsync();
            setPermission({
                status: result.status as PermissionStatus,
                granted: result.granted || result.status === 'granted',
                canAskAgain: result.canAskAgain,
            });
        } catch { /* best-effort — whatever depends on it stays hidden */ }
    }, []);

    useFocusEffect(useCallback(() => {
        refresh();
    }, [refresh]));

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (next) => {
            if (next === 'active') refresh();
        });
        return () => subscription.remove();
    }, [refresh]);

    return { permission, refresh };
}
