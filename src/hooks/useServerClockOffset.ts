import { useSyncExternalStore } from 'react';
import { getServerClockOffset, subscribeToServerClock } from '../lib/serverClock';

/** Re-renders clock-driven UI as soon as a fresh API response calibrates server time. */
export function useServerClockOffset(): number {
    return useSyncExternalStore(
        subscribeToServerClock,
        getServerClockOffset,
        getServerClockOffset,
    );
}
