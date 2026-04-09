import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiClient, ENDPOINTS } from '../lib/api';

export function usePushNotifications() {
    const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lastSyncedToken = useRef<string | null>(null);

    useEffect(() => {
        registerForPushNotifications().then(token => {
            if (token) setExpoPushToken(token);
        });
    }, []);

    useEffect(() => {
        if (expoPushToken && expoPushToken !== lastSyncedToken.current) {
            syncTokenWithServer(expoPushToken);
        }
    }, [expoPushToken]);

    async function registerForPushNotifications(): Promise<string | null> {
        if (!Device.isDevice) {
            setError('Push notifications require a physical device.');
            console.warn('[Push] Must use physical device for push notifications');
            return null;
        }

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#10B981',
            });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            setError('Notification permission not granted.');
            return null;
        }

        try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenResponse = await Notifications.getExpoPushTokenAsync({
                projectId,
            });
            return tokenResponse.data;
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

    return { expoPushToken, error };
}
