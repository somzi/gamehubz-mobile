import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const DETAIL_STALE_MS = 30_000;
export const LIST_STALE_MS = 120_000;

export async function refreshVisibleList(client: QueryClient, queryKey: QueryKey) {
    // A next-page fetch cannot stand in for refreshing the existing pages. Stop it before
    // pulling; an existing refresh, on the other hand, can be shared without restarting it.
    if (client.getQueryState(queryKey)?.fetchMeta?.fetchMore) {
        await client.cancelQueries({ queryKey, exact: true });
    }
    await client.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
}

type FocusState = {
    dataUpdatedAt: number;
    fetchStatus?: string;
    isInvalidated?: boolean;
};

export function shouldRefreshOnFocus(state: FocusState | undefined, staleMs: number, now = Date.now()) {
    if (state?.fetchStatus && state.fetchStatus !== 'idle') return false;
    return !state?.dataUpdatedAt || state.isInvalidated || now - state.dataUpdatedAt >= staleMs;
}

/** Cancel an older read before marking a successfully changed resource stale. */
export async function invalidateHubData(client: QueryClient, hubId: string) {
    const queryKey = ['hub', hubId];
    await client.cancelQueries({ queryKey, exact: true });
    await Promise.all([
        client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' }),
        client.invalidateQueries({ queryKey: ['hubs'] }),
    ]);
}

export const tournamentResourceKey = (id: string, userId?: string, resource?: string): QueryKey =>
    resource ? ['tournament-resource', id, userId, resource] : ['tournament-resource', id];

/** A successful mutation affects every status filter. An older hidden read must not mark it fresh. */
export async function invalidateTournamentLists(client: QueryClient) {
    const queryKey = ['tournaments'];
    await client.cancelQueries({ queryKey });
    await client.invalidateQueries({ queryKey });
}

export async function invalidateTournamentData(client: QueryClient, id: string) {
    const queryKey = tournamentResourceKey(id);
    await client.cancelQueries({ queryKey });
    await Promise.all([
        client.invalidateQueries({ queryKey, refetchType: 'none' }),
        invalidateTournamentLists(client),
    ]);
}

/** All tournament readers share the same request and freshness clock, including separate routes. */
export async function fetchTournamentResource<T>(
    client: QueryClient,
    queryKey: QueryKey,
    loader: (signal: AbortSignal) => Promise<T>,
    force = false,
) {
    if (force) {
        // A read started before a successful edit must not satisfy its confirmation request.
        await client.cancelQueries({ queryKey, exact: true });
        await client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
    }
    return client.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => loader(signal),
        staleTime: DETAIL_STALE_MS,
        gcTime: 5 * 60_000,
        retry: false,
        // Keep the existing memory-only contract for tournament snapshots on cold start.
        meta: { persist: false },
    });
}
