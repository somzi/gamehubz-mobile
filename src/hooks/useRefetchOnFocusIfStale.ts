import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { hashKey, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { DETAIL_STALE_MS, shouldRefreshOnFocus } from '../lib/queryPolicy';

interface Options {
    /** How long a snapshot stays "fresh" before focus triggers a refetch. Default 30s. */
    staleMs?: number;
    /** Skip the refetch entirely — useful when the underlying query has `enabled: false`. */
    enabled?: boolean;
    queryKey?: QueryKey;
    isFetching?: boolean;
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
    refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown> | void,
    dataUpdatedAt: number,
    options: Options = {},
) {
    const client = useQueryClient();
    const { staleMs = DETAIL_STALE_MS, enabled = true, queryKey } = options;
    const current = useRef({ refetch, dataUpdatedAt, options });
    current.current = { refetch, dataUpdatedAt, options };
    const scope = queryKey ? hashKey(queryKey) : '';
    useFocusEffect(
        useCallback(() => {
            if (!enabled) return;
            const latest = current.current;
            const state = latest.options.queryKey
                ? client.getQueryState(latest.options.queryKey)
                : { dataUpdatedAt: latest.dataUpdatedAt, fetchStatus: latest.options.isFetching ? 'fetching' : 'idle' };
            if (shouldRefreshOnFocus(state, staleMs)) {
                latest.refetch({ cancelRefetch: false });
            }
            // Cache updates are not another focus event. A failed refresh must not restart
            // itself when fetching state changes, and a mount load is shared.
        }, [client, scope, staleMs, enabled]),
    );
}
