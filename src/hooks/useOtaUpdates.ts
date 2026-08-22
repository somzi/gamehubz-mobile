import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';

import { ENDPOINTS, authenticatedFetch } from '../lib/api';

/**
 * How long the app must have been in the background before we're willing to restart it into
 * a downloaded update. Short trips out of the app (checking a score, answering a message)
 * must never cost the user their place, so the update just keeps waiting.
 */
const MIN_BACKGROUND_MS = 10 * 60_000;

/**
 * Breathing room after the app comes back before we decide anything. A notification tap
 * foregrounds the app and delivers its response at roughly the same moment; waiting a beat
 * means `lastTapAtRef` is already set by the time we're weighing a reload.
 */
const RESUME_SETTLE_MS = 2_000;

/**
 * A reload this soon after a notification tap would throw away the tap. `reloadAsync`
 * restarts the JS runtime, native modules are rebuilt, and the pending notification
 * response — which lives on the native emitter instance — goes with them, so the deep link
 * silently turns into "app opened on Home".
 */
const NOTIFICATION_WAKE_WINDOW_MS = 20_000;

/**
 * Module scope on purpose: these must survive the component remounting, and must NOT survive
 * the process. `reloadAsync` starts a fresh process, which resets them — exactly right, since
 * a new process is a new chance to update.
 */
let reloadedThisProcess = false;
let reportedEmergencyLaunch = false;

/**
 * Applies OTA updates at a moment when restarting the app costs the user nothing.
 *
 * The shape of the problem: `expo-updates` downloads a new bundle in the background but only
 * ever swaps it in at process start, so without this hook an update reaches a user only when
 * they happen to fully kill and reopen the app — which most people never deliberately do.
 * Blocking the splash screen on the download instead (`fallbackToCacheTimeout`) trades that
 * for a slow launch on every cold start, on every network, forever. So we leave startup
 * untouched and take the other opening: the app is already being resumed from a long absence,
 * the user has no place to lose, and a restart there is indistinguishable from a normal open.
 *
 * Everything here is best effort. A failed check, a dead network, a rate-limited server —
 * all of it is swallowed, because none of it is a reason to disturb a working app.
 *
 * @param canReportDiagnostics whether the session is authenticated, so the emergency-launch
 *   report has a token to send. The update flow itself does not depend on it.
 */
export function useOtaUpdates(canReportDiagnostics: boolean) {
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const backgroundedAtRef = useRef<number>(0);
    const updateReadyRef = useRef(false);
    const busyRef = useRef(false);
    const lastTapAtRef = useRef(0);

    // ─── Emergency launch: a shipped update failed to boot ──────────────────────────
    // expo-updates recovered by falling back to the bundle baked into the build, which is
    // the only reason the app is running at all. Nothing about this ever reaches the server
    // on its own — the broken bundle never lives long enough to make a request — so report
    // it. Gated on auth because the endpoint is [Authorize]; the session restores from
    // SecureStore moments after launch, and an emergency launch doesn't interfere with that.
    useEffect(() => {
        if (__DEV__) return;
        if (Updates.isEnabled !== true) return;
        if (!Updates.isEmergencyLaunch) return;
        if (!canReportDiagnostics) return;
        if (reportedEmergencyLaunch) return;

        reportedEmergencyLaunch = true;

        authenticatedFetch(ENDPOINTS.REPORT_EMERGENCY_LAUNCH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reason: Updates.emergencyLaunchReason ?? null,
                // The id of what's running now — the embedded bundle, since that's what we
                // fell back to. The failing update's own id isn't exposed by the runtime,
                // but this plus runtimeVersion narrows it to the publish you need to pull.
                updateId: Updates.updateId ?? null,
                runtimeVersion: Updates.runtimeVersion ?? null,
                channel: Updates.channel ?? null,
            }),
        }).catch(() => { /* best effort — never let diagnostics break the app */ });
    }, [canReportDiagnostics]);

    // ─── Notification taps ──────────────────────────────────────────────────────────
    // Only used to know whether a resume was caused by a tap. Deliberately a listener of its
    // own: it reads nothing, consumes nothing, and leaves the routing in App.tsx untouched.
    useEffect(() => {
        if (__DEV__) return;
        if (Updates.isEnabled !== true) return;

        const sub = Notifications.addNotificationResponseReceivedListener(() => {
            lastTapAtRef.current = Date.now();
        });

        return () => sub.remove();
    }, []);

    // ─── Check, download, and apply when it's free to do so ─────────────────────────
    useEffect(() => {
        if (__DEV__) return;
        if (Updates.isEnabled !== true) return;

        // We are only running because the last update failed to boot. Checking again would
        // find that same update, download it, and restart into it — straight back to a failed
        // launch, on repeat. Sit this session out entirely and leave the user on a build that
        // works until a fixed update is published.
        if (Updates.isEmergencyLaunch) return;

        const syncAndMaybeReload = async (awayMs: number) => {
            try {
                if (!updateReadyRef.current) {
                    const check = await Updates.checkForUpdateAsync();

                    // `isRollBackToEmbedded` is the server telling us to abandon the current
                    // update and go back to the build's own bundle — that's how a bad publish
                    // gets pulled, so it has to travel the same path as a normal update.
                    if (!check.isAvailable && !check.isRollBackToEmbedded) return;

                    const fetched = await Updates.fetchUpdateAsync();
                    if (!fetched.isNew && !fetched.isRollBackToEmbedded) return;

                    updateReadyRef.current = true;
                }

                // Ready, but not at any price. Every one of these means "keep it and apply it
                // at a better moment" — the download is not lost either way.
                if (awayMs < MIN_BACKGROUND_MS) return;
                if (reloadedThisProcess) return;
                if (AppState.currentState !== 'active') return;
                if (Date.now() - lastTapAtRef.current < NOTIFICATION_WAKE_WINDOW_MS) return;

                // Claimed before the await, not after: if the reload throws we must not get a
                // second run at it. One restart per process, whatever happens.
                reloadedThisProcess = true;
                await Updates.reloadAsync();
            } catch {
                // Offline, rate limited, server hiccup. OTA is opportunistic by design.
            } finally {
                busyRef.current = false;
            }
        };

        const subscription = AppState.addEventListener('change', (nextAppState) => {
            const cameBack =
                appStateRef.current.match(/inactive|background/) && nextAppState === 'active';

            // Only stamp on the way OUT of active. iOS returns through
            // background → inactive → active, and stamping on every non-active state would
            // reset the clock during that hand-off — awayMs would read as ~0 and the reload
            // would never qualify.
            if (appStateRef.current === 'active' && nextAppState.match(/inactive|background/)) {
                backgroundedAtRef.current = Date.now();
            }

            appStateRef.current = nextAppState;

            if (!cameBack) return;
            if (busyRef.current) return;

            busyRef.current = true;
            const awayMs = backgroundedAtRef.current > 0
                ? Date.now() - backgroundedAtRef.current
                : 0;

            setTimeout(() => { syncAndMaybeReload(awayMs); }, RESUME_SETTLE_MS);
        });

        return () => subscription.remove();
    }, []);
}
