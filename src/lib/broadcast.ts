import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import i18n from '../i18n';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from './api';
import {
    addBroadcastStatusListener,
    BroadcastStatus,
    getBroadcastStatus,
    isBroadcastAvailable,
    startBroadcast,
    stopBroadcast,
} from '../../modules/gamehubz-broadcast';
import type { StreamAccountPlatform } from './streamAccounts';

/**
 * Streaming the phone's own screen to the player's linked Twitch / Kick channel.
 *
 * Start: the backend hands out the stream key + a session token (prepare), the native broadcaster
 * captures the screen and reports started / heartbeats / stopped to the backend by itself — the JS
 * side is asleep while the player is in the game. Stop: the native side stops sending, and the app
 * also closes the stream on the backend right away (the capture process may not get the chance).
 */

export { isBroadcastAvailable };
export type { BroadcastStatus };

// 720p30 at 2.5 Mbps: a clean picture for a phone game, and light enough that the upload doesn't
// crowd out the match itself on the same connection. The iOS extension also has a hard memory cap.
const VIDEO = { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 };

export interface GoLiveOptions {
    matchId: string;
    platform: StreamAccountPlatform;
    gameAudio: boolean;
    microphone: boolean;
}

interface BroadcastSessionResponse {
    sessionToken: string;
    platform: number;
    channelHandle: string;
    ingestUrl: string;
    streamKey: string;
    heartbeatIntervalSeconds: number;
    overlay: {
        tournamentName: string;
        homeName: string;
        awayName: string;
        roundNumber?: number | null;
        streamerIsHome: boolean;
    };
}

export async function goLive({ matchId, platform, gameAudio, microphone }: GoLiveOptions): Promise<void> {
    const response = await authenticatedFetch(ENDPOINTS.BROADCAST_PREPARE(matchId), {
        method: 'POST',
        body: JSON.stringify({ Platform: platform }),
    });
    if (!response.ok) throw new Error(getErrorMessage(await response.text()));

    const data = await response.json();
    const session: BroadcastSessionResponse = data.result || data;

    await startBroadcast({
        matchId,
        platform,
        ingestUrl: session.ingestUrl,
        streamKey: session.streamKey,
        sessionToken: session.sessionToken,
        apiBaseUrl: ENDPOINTS.BROADCAST_SESSION_BASE,
        heartbeatIntervalSeconds: session.heartbeatIntervalSeconds || 30,
        gameAudio,
        microphone,
        overlay: {
            tournamentName: session.overlay?.tournamentName ?? '',
            homeName: session.overlay?.homeName ?? '',
            awayName: session.overlay?.awayName ?? '',
            roundLabel: session.overlay?.roundNumber
                ? i18n.t('match:broadcast.overlayRound', { n: session.overlay.roundNumber })
                : null,
        },
        notification: {
            title: i18n.t('match:broadcast.notificationTitle'),
            text: i18n.t('match:broadcast.notificationText'),
            stopLabel: i18n.t('match:broadcast.stop'),
            endedText: i18n.t('match:broadcast.endedText'),
        },
        video: VIDEO,
    });
}

export async function endLive(matchId: string): Promise<void> {
    try {
        await stopBroadcast();
    } finally {
        // Closes the card for viewers immediately; the native "stopped" report may never arrive
        // (process killed, no network). Idempotent on the backend.
        await authenticatedFetch(ENDPOINTS.BROADCAST_STOP(matchId), { method: 'POST' }).catch(() => undefined);
    }
}

// While a stream is running the status is also re-read on this cadence: an iOS broadcast extension
// the system kills sends no final event, and only a fresh read applies the stale-status check.
const ACTIVE_STATUS_POLL_MS = 20_000;

/** Live status of the native broadcaster, kept in sync with its events. */
export function useBroadcastStatus(): BroadcastStatus {
    const [status, setStatus] = useState<BroadcastStatus>({ state: 'idle' });
    const isActive = status.state === 'starting' || status.state === 'live';

    useEffect(() => {
        let mounted = true;
        const refresh = () => {
            getBroadcastStatus()
                .then((s) => { if (mounted) setStatus(s); })
                .catch(() => undefined);
        };

        refresh();
        const subscription = addBroadcastStatusListener((s) => { if (mounted) setStatus(s); });
        // Back from the game: whatever happened meanwhile may have come with no event.
        const appState = AppState.addEventListener('change', (next) => {
            if (next === 'active') refresh();
        });
        return () => {
            mounted = false;
            subscription.remove();
            appState.remove();
        };
    }, []);

    useEffect(() => {
        if (!isActive) return;
        let mounted = true;
        const timer = setInterval(() => {
            getBroadcastStatus()
                .then((s) => { if (mounted) setStatus(s); })
                .catch(() => undefined);
        }, ACTIVE_STATUS_POLL_MS);
        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, [isActive]);

    return status;
}

/** Turns a native error code into something the player can act on. */
export function broadcastErrorMessage(code: string | null | undefined): string {
    switch (code) {
        case 'permission_denied':
            return i18n.t('match:broadcast.errorPermission');
        case 'connection_failed':
        case 'auth_failed':
            return i18n.t('match:broadcast.errorConnection');
        case 'disconnected':
            return i18n.t('match:broadcast.errorDisconnected');
        default:
            return i18n.t('match:broadcast.errorGeneric');
    }
}
