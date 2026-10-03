import { useCallback, useEffect, useRef } from 'react';
import { hashKey, type QueryKey } from '@tanstack/react-query';

type PageQuery = {
    hasNextPage: boolean;
    isFetching: boolean;
    isFetchingNextPage: boolean;
    isPlaceholderData: boolean;
    isError: boolean;
    fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>;
};

/** Keep a single end-of-list request while a refresh owns the query. Never cancel that refresh. */
export function useQueuedPagination(query: PageQuery, queryKey: QueryKey, enabled: boolean) {
    const scope = hashKey(queryKey);
    const pending = useRef<string | null>(null);
    const inFlight = useRef<string | null>(null);
    const latest = useRef({ query, scope, enabled });
    latest.current = { query, scope, enabled };
    const loadMore = useCallback(() => {
        const { query: current, scope: key, enabled: active } = latest.current;
        if (!active || !current.hasNextPage || current.isPlaceholderData || current.isError) return;
        if (inFlight.current === key || current.isFetchingNextPage) return;
        if (current.isFetching) { pending.current = key; return; }
        pending.current = null;
        inFlight.current = key;
        void current.fetchNextPage({ cancelRefetch: false }).catch(() => {}).finally(() => {
            if (inFlight.current === key) inFlight.current = null;
        });
    }, []);
    useEffect(() => {
        if (!enabled || pending.current !== scope || query.isError || !query.hasNextPage) {
            pending.current = null;
            return;
        }
        if (!query.isFetching) loadMore();
    }, [scope, enabled, query.isFetching, query.isError, query.hasNextPage, loadMore]);
    return loadMore;
}
