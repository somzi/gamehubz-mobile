import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { authenticatedFetch, ENDPOINTS } from './api';

/**
 * The phone's identity for result verification, and the biometric-locked key that proves it.
 *
 * On first use the server issues this phone an installation id and a random key. The key is written to
 * the Keychain (iOS) / Keystore (Android) with `requireAuthentication`, which hands it to the operating
 * system's biometric access control: iOS will only release it after Face ID / Touch ID succeeds against
 * the CURRENT enrolment (`biometryCurrentSet`), Android only after a Class 3 BiometricPrompt. GameHubz
 * never sees a face or a fingerprint — it asks the OS for the key, and the OS decides.
 *
 * Every verification then signs a fresh server challenge with that key (lib/hmacSha256), which is what
 * proves possession of the installation key for that attempt. The server cannot independently attest
 * the OS biometric prompt with this HMAC protocol.
 *
 * Only native modules already in the shipped build are used here (expo-secure-store, expo-device,
 * expo-constants, and expo-application — linked through expo-notifications), so this ships over the air.
 */

/** Installation id: plain secure storage, this device only (a backup restored elsewhere starts fresh). */
const DEVICE_ID_KEY = 'gh_verify_device_id';

/** Where the biometric-locked key lives. Its own service, apart from every non-authenticated item. */
const BIOMETRIC_SERVICE = 'gamehubz.verification';

// Per account: two accounts on one phone share the installation id but never a key. SecureStore keys
// allow [A-Za-z0-9._-], which a GUID satisfies.
const secretKeyFor = (userId: string) => `gh_verify_key_${userId.toLowerCase()}`;

// Non-authenticated marker saying a key was stored for this account on this installation. Reading the
// key itself to find out would raise a Face ID prompt just to ask the question.
const registrationKeyFor = (userId: string) => `gh_verify_reg_${userId.toLowerCase()}`;

export type BiometricFailureReason = 'cancelled' | 'unavailable' | 'lockout' | 'failed';

/** A biometric step that did not produce a key: the user backed out, or the phone could not ask. */
export class BiometricError extends Error {
    constructor(public readonly reason: BiometricFailureReason, message?: string) {
        super(message ?? reason);
        this.name = 'BiometricError';
    }
}

export interface DevicePrompts {
    /** Shown by Android's BiometricPrompt (and Touch ID) when the key is first locked in. */
    register: string;
    /** Shown when the key is unlocked to sign a verification. */
    unlock: string;
}

/** What the phone says about itself — all of it the phone's word; the key is what gets checked. */
export interface DeviceSnapshot {
    platform: 'ios' | 'android';
    deviceModel: string | null;
    deviceBrand: string | null;
    osVersion: string | null;
    appVersion: string | null;
    isPhysicalDevice: boolean;
    platformDeviceId: string | null;
    appInstalledOn: string | null;
}

/**
 * expo-application arrives through expo-notifications, so it is in every build that can receive a
 * push; still loaded behind a guard, because a verification must never fail over a device label.
 */
let applicationModule: typeof import('expo-application') | null | undefined;

function getApplicationModule() {
    if (applicationModule === undefined) {
        try {
            applicationModule = require('expo-application');
        } catch {
            applicationModule = null;
        }
    }
    return applicationModule;
}

/**
 * Whether this phone can hold a biometric-locked key at all: hardware present and at least one face or
 * finger enrolled (on iOS, also Face ID allowed for this app). A plain yes/no — the platforms do not
 * say which of those is missing, so the copy that goes with a "no" covers all of them.
 */
export function isBiometricAvailable(): boolean {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
    try {
        return SecureStore.canUseBiometricAuthentication();
    } catch {
        return false;
    }
}

export async function getDeviceSnapshot(): Promise<DeviceSnapshot> {
    const application = getApplicationModule();

    let platformDeviceId: string | null = null;
    let appInstalledOn: string | null = null;
    try {
        platformDeviceId = Platform.OS === 'ios'
            ? (await application?.getIosIdForVendorAsync()) ?? null
            : application?.getAndroidId() ?? null;
    } catch { /* optional — the installation id still identifies the phone */ }
    try {
        const installed = await application?.getInstallationTimeAsync();
        appInstalledOn = installed ? installed.toISOString() : null;
    } catch { /* optional */ }

    return {
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceModel: Device.modelName ?? null,
        deviceBrand: Device.brand ?? Device.manufacturer ?? null,
        osVersion: Device.osVersion ?? null,
        // The JS bundle's version is the one the server already sees on every request (X-App-Version).
        appVersion: Constants.expoConfig?.version ?? null,
        isPhysicalDevice: Device.isDevice,
        platformDeviceId,
        appInstalledOn,
    };
}

/**
 * What the phone is right now, sent with every attempt. Registration only happens once per key, so
 * without this the server would keep describing the phone as it was on its first day — before every
 * OS and app update since.
 */
export function getDeviceDescription(): { deviceModel: string | null; osVersion: string | null; appVersion: string | null } {
    return {
        deviceModel: Device.modelName ?? null,
        osVersion: Device.osVersion ?? null,
        appVersion: Constants.expoConfig?.version ?? null,
    };
}

export async function getStoredDeviceId(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(DEVICE_ID_KEY);
    } catch {
        return null;
    }
}

/**
 * What the phone tells the server when it registers: its own description and the installation id it
 * already holds (null on a phone that never registered). Reading it raises no biometric prompt.
 */
export async function getDeviceRegistrationBody() {
    const snapshot = await getDeviceSnapshot();
    return {
        deviceId: await getStoredDeviceId(),
        platform: snapshot.platform,
        deviceModel: snapshot.deviceModel,
        deviceBrand: snapshot.deviceBrand,
        osVersion: snapshot.osVersion,
        appVersion: snapshot.appVersion,
        isPhysicalDevice: snapshot.isPhysicalDevice,
        platformDeviceId: snapshot.platformDeviceId,
        appInstalledOn: snapshot.appInstalledOn,
    };
}

/** Keeps the installation id the server issued. This device only: a restored backup starts fresh. */
export async function rememberDeviceId(deviceId: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}

/** Maps what the two platforms throw from a biometric-locked read or write onto what the UI can say. */
function toBiometricError(error: unknown): BiometricError {
    const message = String((error as any)?.message ?? error ?? '');

    // iOS: errSecUserCanceled — "User canceled the operation." Android: "User canceled the authentication".
    if (/cancel/i.test(message)) return new BiometricError('cancelled', message);
    // Android: too many failed attempts.
    if (/lockout/i.test(message)) return new BiometricError('lockout', message);
    // Android: no hardware / nothing enrolled / needs an update. iOS: Face ID not allowed for the app.
    if (/no hardware|not enrolled|none enrolled|no biometrics|unsupported|NSFaceIDUsageDescription|biometry/i.test(message)) {
        return new BiometricError('unavailable', message);
    }
    return new BiometricError('failed', message);
}

/**
 * Registers this phone for the account and locks the issued key behind biometrics.
 *
 * Returns the key only when locking it in already required a biometric unlock — Android authenticates
 * writes as well as reads, so the key it just wrote is one the owner unlocked seconds ago, and asking
 * again straight away would be a second prompt for the same person. iOS writes without a prompt, so
 * there the caller still has to read the key back through Face ID.
 */
async function registerDevice(userId: string, prompts: DevicePrompts): Promise<{ deviceId: string; unlockedSecret: string | null }> {
    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_REGISTER_DEVICE, {
        method: 'POST',
        body: JSON.stringify(await getDeviceRegistrationBody()),
    });

    if (!response.ok) {
        throw new Error(await response.text().catch(() => ''));
    }

    const data = await response.json();
    const deviceId: string = data?.deviceId ?? data?.DeviceId;
    const secret: string = data?.secret ?? data?.Secret;
    if (!deviceId || !secret) throw new Error('Invalid registration response');

    await rememberDeviceId(deviceId);

    // Cleared first: on iOS, writing over an existing biometric item is an update, and an update asks
    // for Face ID — a prompt nobody would understand in the middle of a registration.
    await SecureStore.deleteItemAsync(secretKeyFor(userId), { keychainService: BIOMETRIC_SERVICE }).catch(() => { });

    try {
        await SecureStore.setItemAsync(secretKeyFor(userId), secret, {
            keychainService: BIOMETRIC_SERVICE,
            requireAuthentication: true,
            authenticationPrompt: prompts.register,
            // Needs a passcode, never leaves this phone, and is gone if the passcode is removed.
            keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
        });
    } catch (error) {
        throw toBiometricError(error);
    }

    await SecureStore.setItemAsync(registrationKeyFor(userId), deviceId, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    return { deviceId, unlockedSecret: Platform.OS === 'android' ? secret : null };
}

/**
 * Registers again even though this phone believes it already is: the server answered that it has no
 * key for this installation (409 from the challenge), so the local marker is stale — a restored or
 * reset backend. Same key handling as a first registration.
 */
export function reRegisterDevice(
    userId: string,
    prompts: DevicePrompts,
): Promise<{ deviceId: string; unlockedSecret: string | null }> {
    return registerDevice(userId, prompts);
}

/**
 * This phone's installation id for the account, registering first when it has no key yet. The
 * registration, when it happens, may itself have unlocked the key (see registerDevice).
 */
export async function ensureDeviceRegistered(
    userId: string,
    prompts: DevicePrompts,
): Promise<{ deviceId: string; unlockedSecret: string | null }> {
    const [deviceId, registeredFor] = await Promise.all([
        getStoredDeviceId(),
        SecureStore.getItemAsync(registrationKeyFor(userId)).catch(() => null),
    ]);

    if (deviceId && registeredFor === deviceId) {
        return { deviceId, unlockedSecret: null };
    }

    return registerDevice(userId, prompts);
}

/**
 * Unlocks the key with biometrics for one verification attempt.
 *
 * A key that reads back empty was invalidated by the OS — faces or fingers changed since it was
 * locked in, which is exactly what `biometryCurrentSet` and Android's enrolment binding are for. The
 * phone then registers again (the server re-issues the key on the same device row, and the organizer
 * sees the fresh key). The sheet uses it for the biometric proof and the recording upload.
 */
export async function unlockDeviceKey(
    userId: string,
    prompts: DevicePrompts,
    unlockedSecret: string | null = null,
): Promise<string> {
    if (unlockedSecret) return unlockedSecret;

    const secret = await readSecret(userId, prompts.unlock);
    if (secret) return secret;

    const reissued = await registerDevice(userId, prompts);
    const fresh = reissued.unlockedSecret ?? (await readSecret(userId, prompts.unlock));
    if (!fresh) throw new BiometricError('failed');

    return fresh;
}

async function readSecret(userId: string, prompt: string): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(secretKeyFor(userId), {
            keychainService: BIOMETRIC_SERVICE,
            requireAuthentication: true,
            authenticationPrompt: prompt,
        });
    } catch (error) {
        throw toBiometricError(error);
    }
}
