import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE_URL } from './api';

/** Mirrors backend AppVersionCheckDto. */
export interface AppVersionCheck {
    minSupportedVersion: string;
    iosStoreUrl: string | null;
    androidStoreUrl: string | null;
}

const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.codespheresolutions.gamehubzmobile';
const PLAY_STORE_APP_URL = 'market://details?id=com.codespheresolutions.gamehubzmobile';

// The iOS equivalents, and the reason they are hardcoded: the update screen is the one place the
// app must not depend on server config to be useful. When ShareLinks:AppStoreUrl is unset the
// backend sends iosStoreUrl: null, and the old fallback ("itms-apps://apps.apple.com") opened the
// App Store's *front page* — a gated user had one button and it did not lead to the update.
// No country segment on purpose: apps.apple.com/app/id… redirects to the viewer's own storefront,
// which matters for an app shipping in seven languages. A hardcoded /rs/ would send everyone to
// the Serbian store.
const APP_STORE_WEB_URL = 'https://apps.apple.com/app/id6760719022';
const APP_STORE_APP_URL = 'itms-apps://apps.apple.com/app/id6760719022';

/**
 * The installed build's version. With runtimeVersion "appVersion" an OTA update only ever reaches builds
 * of the same version, so the version the running bundle was published with IS the installed build's —
 * the same value api.ts already sends as X-App-Version.
 */
export const installedAppVersion = (): string | null => Constants.expoConfig?.version ?? null;

/**
 * -1 / 0 / 1 for a < b / a = b / a > b, over major.minor.patch ("2.18" reads as 2.18.0; anything after a
 * "-" or "+" is ignored). Null when either side is not a version at all, so a malformed value can never
 * lock anyone out of the app.
 */
export function compareVersions(a: string, b: string): number | null {
    const parse = (value: string): number[] | null => {
        const parts = value.trim().split(/[-+]/)[0].split('.');
        if (parts.length === 0 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;

        const numbers = parts.map(Number);
        while (numbers.length < 3) numbers.push(0);
        return numbers;
    };

    const left = parse(a);
    const right = parse(b);
    if (!left || !right) return null;

    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
    }
    return 0;
}

/** Null on any answer that is not a usable version check — the caller treats that as "carry on". */
export async function fetchVersionCheck(signal?: AbortSignal): Promise<AppVersionCheck | null> {
    const response = await fetch(`${API_BASE_URL}/api/app/version-check`, {
        signal,
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    const minSupportedVersion = data?.minSupportedVersion ?? data?.MinSupportedVersion;
    if (typeof minSupportedVersion !== 'string') return null;

    return {
        minSupportedVersion,
        iosStoreUrl: data?.iosStoreUrl ?? data?.IosStoreUrl ?? null,
        androidStoreUrl: data?.androidStoreUrl ?? data?.AndroidStoreUrl ?? null,
    };
}

/**
 * Opens this platform's store page. Android tries the Play Store app first and falls back to the web
 * page (a device without Play has no handler for market://); iOS uses the configured App Store link, or
 * the App Store app itself when none is configured.
 */
export async function openStorePage(check: AppVersionCheck): Promise<void> {
    if (Platform.OS === 'ios') {
        // Mirrors the Android branch below: try the App Store app first, fall back to the web
        // listing. Both point at the real GameHubz page whether or not the server supplied one.
        const configuredIos = check.iosStoreUrl || APP_STORE_WEB_URL;
        try {
            await Linking.openURL(configuredIos.startsWith('https://apps.apple.com') ? APP_STORE_APP_URL : configuredIos);
        } catch {
            await Linking.openURL(configuredIos).catch(() => { /* nothing more to try */ });
        }
        return;
    }

    const configured = check.androidStoreUrl || PLAY_STORE_WEB_URL;
    try {
        await Linking.openURL(configured.startsWith('https://play.google.com') ? PLAY_STORE_APP_URL : configured);
    } catch {
        await Linking.openURL(configured).catch(() => { /* nothing more to try */ });
    }
}
