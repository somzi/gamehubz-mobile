import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { COLORS } from '../lib/theme';
import {
    AppVersionCheck,
    compareVersions,
    fetchVersionCheck,
    installedAppVersion,
    openStorePage,
} from '../lib/appVersion';

/** How stale the last answer may get before returning to the foreground asks again. */
const RECHECK_AFTER_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Stops a build the server no longer supports. On launch — and when the app comes back to the
 * foreground after a while — it asks the backend for the minimum supported version; an installed build
 * below it gets a full-screen screen that cannot be dismissed, whose only action opens the store.
 *
 * It fails open by design: offline, a server error, a timeout or an unreadable version all mean
 * "carry on". Locking every user out because this one request failed would be far worse than letting an
 * outdated build run a little longer.
 *
 * Raising the minimum is a backend change (AppVersionRules.MinSupportedAppVersion), made once the new
 * store build is live in both stores.
 */
export function ForceUpdateGate() {
    const { t } = useTranslation('common');
    const [required, setRequired] = useState<AppVersionCheck | null>(null);
    const requiredRef = useRef<AppVersionCheck | null>(null);
    const lastCheckedAt = useRef(0);
    const inFlight = useRef(false);

    const check = useCallback(async () => {
        const installed = installedAppVersion();
        if (!installed || inFlight.current) return;

        inFlight.current = true;
        lastCheckedAt.current = Date.now();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const result = await fetchVersionCheck(controller.signal);
            if (!result) return;

            const next = compareVersions(installed, result.minSupportedVersion) === -1 ? result : null;
            requiredRef.current = next;
            setRequired(next);
        } catch {
            // Fail open — see above.
        } finally {
            clearTimeout(timer);
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        void check();

        const subscription = AppState.addEventListener('change', (next) => {
            if (next !== 'active') return;
            // An outdated build asks every time it comes back: the user may have just been to the store,
            // and a minimum that was lowered again should let them straight back in.
            if (requiredRef.current || Date.now() - lastCheckedAt.current > RECHECK_AFTER_MS) {
                void check();
            }
        });

        return () => subscription.remove();
    }, [check]);

    const handleUpdate = useCallback(() => {
        if (required) void openStorePage(required);
    }, [required]);

    return (
        <Modal
            visible={!!required}
            animationType="fade"
            transparent={false}
            statusBarTranslucent
            // Not dismissible: Android's back button must not close it.
            onRequestClose={() => { }}
        >
            <View className="flex-1 bg-background items-center justify-center px-8">
                <View
                    className="w-20 h-20 rounded-3xl items-center justify-center mb-6"
                    style={{ backgroundColor: COLORS.primary + '1A', borderWidth: 1, borderColor: COLORS.primary + '40' }}
                >
                    <Ionicons name="cloud-download-outline" size={36} color={COLORS.primary} />
                </View>

                <Text accessibilityRole="header" className="text-2xl font-black text-white text-center mb-3">
                    {t('forceUpdate.title')}
                </Text>
                <Text className="text-sm text-slate-400 text-center leading-6 mb-8">
                    {t('forceUpdate.body')}
                </Text>

                <Pressable
                    onPress={handleUpdate}
                    accessibilityRole="button"
                    accessibilityLabel={t('forceUpdate.button')}
                    className="w-full h-14 rounded-2xl bg-primary items-center justify-center active:opacity-80"
                >
                    <Text className="text-base font-black text-emerald-950">{t('forceUpdate.button')}</Text>
                </Pressable>
            </View>
        </Modal>
    );
}
