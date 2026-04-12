import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiClient, ENDPOINTS } from '../lib/api';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export function usePushNotifications() {
    const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lastSyncedToken = useRef<string | null>(null);

    /**
     * Check current permission status and, if already granted,
     * fetch the token and sync with the server.
     * Returns the current permission status so the caller can
     * decide whether to show the opt-in modal.
     */
    const initializePushNotifications = useCallback(async (): Promise<PermissionStatus> => {
        if (!Device.isDevice) {
            setError('Push notifications require a physical device.');
            console.warn('[Push] Must use physical device for push notifications');
            return 'denied';
        }

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#10B981',
            });
        }

        const { status } = await Notifications.getPermissionsAsync();

        if (status === 'granted') {
            const token = await fetchTokenAndSync();
            if (token) setExpoPushToken(token);
        }

        return status as PermissionStatus;
    }, []);

    /**
     * Request permissions from the OS, set up the Android channel,
     * fetch the token, and sync with the server.
     * This is the "second opt-in" that gets called after the user
     * taps "Allow" on the custom modal.
     */
    const registerAndSync = useCallback(async (): Promise<boolean> => {
        if (!Device.isDevice) {
            setError('Push notifications require a physical device.');
            console.warn('[Push] Must use physical device for push notifications');
            return false;
        }

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#10B981',
            });
        }

        const { status } = await Notifications.requestPermissionsAsync();

        if (status !== 'granted') {
            setError('Notification permission not granted.');
            return false;
        }

        const token = await fetchTokenAndSync();
        if (token) {
            setExpoPushToken(token);
            return true;
        }
        return false;
    }, []);

    async function fetchTokenAndSync(): Promise<string | null> {
        try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenResponse = await Notifications.getExpoPushTokenAsync({
                projectId,
            });
            const token = tokenResponse.data;

            if (token && token !== lastSyncedToken.current) {
                await syncTokenWithServer(token);
            }

            return token;
        } catch (e) {
            // Prevents crashes on emulators/simulators where token retrieval fails
            console.warn('[Push] Failed to get push token:', e);
            setError('Failed to retrieve push token. Are you on a physical device?');
            return null;
        }
    }

    async function syncTokenWithServer(token: string) {
        try {
            await apiClient.post(ENDPOINTS.PUSH_TOKEN, {
                token,
                platform: Platform.OS,
            });
            lastSyncedToken.current = token;
            console.log('[Push] Token synced with server');
        } catch (e) {
            console.warn('[Push] Failed to sync token:', e);
        }
    }

    return { expoPushToken, error, initializePushNotifications, registerAndSync };
}
