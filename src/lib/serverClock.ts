/**
 * Process-wide offset between the device wall clock and the API server clock.
 *
 * HTTP `Date` has one-second precision, so offsets are rounded to the nearest
 * second. Besides avoiding meaningless millisecond churn, this keeps every
 * countdown subscribed to this store from re-rendering after every API call.
 */
let serverClockOffsetMs = 0;
let hasServerClockSample = false;
const listeners = new Set<() => void>();

export function updateServerClockFromDateHeader(
    dateHeader: string | null | undefined,
    requestStartedAt?: number,
    receivedAt = Date.now(),
): void {
    if (!dateHeader) return;

    const serverTime = Date.parse(dateHeader);
    if (!Number.isFinite(serverTime)) return;

    // Approximate the instant at which the server produced its response by the
    // midpoint of the request. This removes most network round-trip latency from
    // the clock comparison without requiring a dedicated time endpoint.
    const clientSampleTime = requestStartedAt != null && Number.isFinite(requestStartedAt)
        ? requestStartedAt + (receivedAt - requestStartedAt) / 2
        : receivedAt;
    // A Date header identifies a whole second, not a millisecond within it. Treat
    // it as the middle of that second before rounding so a correctly set device
    // does not oscillate between 0 and -1000 ms as responses arrive.
    const nextOffset = Math.round((serverTime + 500 - clientSampleTime) / 1000) * 1000;

    if (hasServerClockSample && nextOffset === serverClockOffsetMs) return;

    serverClockOffsetMs = nextOffset;
    hasServerClockSample = true;
    listeners.forEach((listener) => listener());
}

export const getServerClockOffset = (): number => serverClockOffsetMs;

export const getServerNow = (): number => Date.now() + serverClockOffsetMs;

export function subscribeToServerClock(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
