import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Native screen broadcaster. The phone captures its own screen (Android MediaProjection in a
 * foreground service, iOS ReplayKit broadcast upload extension) and sends it over RTMP(S) to the
 * player's Twitch / Kick channel. The native side also reports to the backend on its own
 * (started / heartbeat / stopped with the session token), because the JS runtime is suspended while
 * the player is in the game.
 *
 * Optional: builds from before this module (and Expo Go) have no native half, so every caller checks
 * `isBroadcastAvailable()` first.
 */

export type BroadcastState = 'idle' | 'starting' | 'live' | 'stopping' | 'error';

export interface BroadcastStatus {
    state: BroadcastState;
    matchId?: string | null;
    /** SocialType of the destination (Twitch = 8, Kick = 9). */
    platform?: number | null;
    /** Epoch ms when the stream connected. */
    startedAt?: number | null;
    /** Machine-readable reason when state is 'error' (permission_denied, connection_failed …). */
    error?: string | null;
}

export interface BroadcastConfig {
    matchId: string;
    platform: number;
    /** rtmp(s)://host[:port]/app — the key is appended by the encoder. */
    ingestUrl: string;
    streamKey: string;
    sessionToken: string;
    /** …/api/Broadcast — the native side posts started / heartbeat / stopped under it. */
    apiBaseUrl: string;
    heartbeatIntervalSeconds: number;
    gameAudio: boolean;
    microphone: boolean;
    overlay: {
        tournamentName: string;
        homeName: string;
        awayName: string;
        roundLabel?: string | null;
    };
    /** Localized strings: the Android foreground notification, and the reason iOS shows when it ends. */
    notification: {
        title: string;
        text: string;
        stopLabel: string;
        endedText: string;
    };
    video: {
        width: number;
        height: number;
        fps: number;
        bitrate: number;
    };
}

interface GameHubzBroadcastNative {
    isSupported(): boolean;
    start(config: BroadcastConfig): Promise<void>;
    stop(): Promise<void>;
    getStatus(): Promise<BroadcastStatus>;
    addListener(event: 'onStatusChange', listener: (status: BroadcastStatus) => void): { remove(): void };
}

const native = requireOptionalNativeModule<GameHubzBroadcastNative>('GameHubzBroadcast');

/** True when this build carries the native broadcaster and the OS version can run it. */
export function isBroadcastAvailable(): boolean {
    try {
        return !!native && native.isSupported();
    } catch {
        return false;
    }
}

export function startBroadcast(config: BroadcastConfig): Promise<void> {
    if (!native) return Promise.reject(new Error('broadcast_unavailable'));
    return native.start(config);
}

export function stopBroadcast(): Promise<void> {
    if (!native) return Promise.resolve();
    return native.stop();
}

export async function getBroadcastStatus(): Promise<BroadcastStatus> {
    if (!native) return { state: 'idle' };
    return native.getStatus();
}

export function addBroadcastStatusListener(listener: (status: BroadcastStatus) => void): { remove(): void } {
    if (!native) return { remove: () => {} };
    return native.addListener('onStatusChange', listener);
}
