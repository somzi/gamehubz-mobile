import { HubConnection, HubConnectionState } from '@microsoft/signalr';

const DEFAULT_INITIAL_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

interface InitialConnectionRetryOptions {
    onConnected?: () => void | Promise<void>;
    onError?: (error: unknown) => void;
    retryDelaysMs?: readonly number[];
}

export interface InitialConnectionRetryHandle {
    stop: () => Promise<void>;
}

/**
 * Starts a SignalR connection and retries only the initial connection. SignalR's
 * withAutomaticReconnect remains responsible for drops after the first successful start.
 */
export function startSignalRWithRetry(
    connection: HubConnection,
    options: InitialConnectionRetryOptions = {},
): InitialConnectionRetryHandle {
    const delays = options.retryDelaysMs?.length
        ? options.retryDelaysMs
        : DEFAULT_INITIAL_RETRY_DELAYS_MS;

    let cancelled = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;
    let stopPromise: Promise<void> | null = null;

    const scheduleRetry = () => {
        if (cancelled || retryTimer) return;
        const delay = delays[Math.min(retryAttempt, delays.length - 1)];
        retryAttempt += 1;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            void attemptStart();
        }, delay);
    };

    const attemptStart = async (): Promise<void> => {
        if (cancelled || inFlight || connection.state !== HubConnectionState.Disconnected) return;

        const operation = (async () => {
            try {
                await connection.start();
            } catch (error) {
                if (!cancelled) {
                    options.onError?.(error);
                    scheduleRetry();
                }
                return;
            }

            // A successful handshake resets the initial-connect backoff. Authentication is resolved
            // by each connection's accessTokenFactory on every attempt, so a token refreshed while
            // waiting is automatically used by the next start.
            retryAttempt = 0;
            if (cancelled) return;

            try {
                await options.onConnected?.();
            } catch (error) {
                // The socket is connected; a group-join failure must not call start() again on an
                // already-connected HubConnection. Existing reconnect handlers will rejoin later.
                options.onError?.(error);
            }
        })();

        inFlight = operation;
        try {
            await operation;
        } finally {
            if (inFlight === operation) inFlight = null;
        }
    };

    void attemptStart();

    return {
        stop: () => {
            if (stopPromise) return stopPromise;

            cancelled = true;
            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }

            stopPromise = (async () => {
                // SignalR explicitly supports stop() during Connecting: it aborts the handshake and
                // waits for start() to reject. Do that immediately rather than first awaiting a hung
                // handshake; the cancelled flag also prevents any retry or late group join.
                await connection.stop().catch(() => { });
                if (inFlight) await inFlight.catch(() => { });
            })();

            return stopPromise;
        },
    };
}
