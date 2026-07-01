import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

interface Options {
    /** How long a snapshot stays "fresh" before focus triggers a refetch. Default 30s. */
    staleMs?: number;
    /** Skip the refetch entirely — useful when the underlying query has `enabled: false`. */
    enabled?: boolean;
}

/**
 * Fire the given query's `refetch` when the screen regains focus, but only if the
 * data is older than `staleMs`. Bottom-tab screens stay mounted across tab-swaps
 * so react-query's own `refetchOnMount: true` never fires; this bridges that gap
 * without hammering the API on every focus.
 *
 * Extracted from four inline copies (HomeScreen ×2 queries, TournamentsScreen,
 * HubsScreen, SocialScreen ChatsTab) that were already starting to drift.
 *
 * Usage:
 *   useRefetchOnFocusIfStale(query.refetch, query.dataUpdatedAt, { enabled: !!userId });
 */
export function useRefetchOnFocusIfStale(
    refetch: () => Promise<unknown> | void,
    dataUpdatedAt: number,
    options: Options = {},
) {
    const { staleMs = 30_000, enabled = true } = options;
    useFocusEffect(
        useCallback(() => {
            if (!enabled) return;
            if (!dataUpdatedAt || Date.now() - dataUpdatedAt > staleMs) {
                refetch();
            }
        }, [refetch, dataUpdatedAt, staleMs, enabled]),
    );
}
