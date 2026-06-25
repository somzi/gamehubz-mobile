import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useAuth } from './AuthContext';
import { BadgeCounts, ApprovalsBreakdown, TournamentApprovalCount, HubApprovalCount } from '../types/social';

const EMPTY_BADGES: BadgeCounts = {
    friendRequests: 0,
    unreadDirectMessages: 0,
    unreadMatchMessages: 0,
    matchesWithUnreadChat: 0,
    matchesToSchedule: 0,
    resultsToConfirm: 0,
    teamJoinRequests: 0,
    hubJoinRequests: 0,
    adminHelpRequests: 0,
    pendingRegistrations: 0,
    socialTotal: 0,
    matchesTotal: 0,
    organizerTotal: 0,
    hubManageTotal: 0,
};

const EMPTY_APPROVALS: ApprovalsBreakdown = { hubs: [], tournaments: [] };

const BADGES_QUERY_KEY = ['me-badges'] as const;
const APPROVALS_QUERY_KEY = ['me-approvals'] as const;

interface BadgesContextType {
    badges: BadgeCounts;
    /** Force an immediate re-fetch (e.g. right after accepting a request or reading a chat). */
    refresh: () => void;
    /** Total pending approvals on a specific hub (0 if none) — drives the hub-card dot. */
    hubApprovals: (hubId: string) => number;
    /** Full per-hub breakdown (count + joinRequests) — lets the hub split its tab dots. */
    hubApprovalDetail: (hubId: string) => HubApprovalCount | undefined;
    /** Pending approvals on a specific tournament — drives the tournament / Requests-tab dot. */
    tournamentApprovals: (tournamentId: string) => TournamentApprovalCount | undefined;
    /** Every tournament with pending approvals in a hub — lets a hub bucket them by status
     *  (Live / Upcoming / Past) to badge its filter tabs. */
    tournamentsForHub: (hubId: string) => TournamentApprovalCount[];
}

const BadgesContext = createContext<BadgesContextType | undefined>(undefined);

async function fetchBadges(): Promise<BadgeCounts> {
    const res = await authenticatedFetch(ENDPOINTS.GET_BADGES);
    if (!res.ok) throw new Error('Failed to load badges');
    return (await res.json()) as BadgeCounts;
}

async function fetchApprovals(): Promise<ApprovalsBreakdown> {
    const res = await authenticatedFetch(ENDPOINTS.GET_BADGE_APPROVALS);
    if (!res.ok) throw new Error('Failed to load approvals');
    return (await res.json()) as ApprovalsBreakdown;
}

export function BadgesProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useAuth();
    const queryClient = useQueryClient();

    const { data } = useQuery({
        queryKey: BADGES_QUERY_KEY,
        queryFn: fetchBadges,
        enabled: isAuthenticated,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
    });

    // Per-hub / per-tournament breakdown that lets the aggregate Hubs-tab dot cascade down to the
    // specific hub card / tournament / Requests tab. Only relevant for users who manage a hub.
    const { data: approvalsData } = useQuery({
        queryKey: APPROVALS_QUERY_KEY,
        queryFn: fetchApprovals,
        enabled: isAuthenticated,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
    });

    const refresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: BADGES_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
    }, [queryClient]);

    // GUID lookups keyed lowercase so client-side ids match the server's casing.
    const approvals = approvalsData ?? EMPTY_APPROVALS;
    const hubApprovalMap = useMemo(() => {
        const m = new Map<string, HubApprovalCount>();
        for (const h of approvals.hubs) m.set(h.hubId.toLowerCase(), h);
        return m;
    }, [approvals]);
    const tournamentApprovalMap = useMemo(() => {
        const m = new Map<string, TournamentApprovalCount>();
        for (const t of approvals.tournaments) m.set(t.tournamentId.toLowerCase(), t);
        return m;
    }, [approvals]);
    const tournamentsByHubMap = useMemo(() => {
        const m = new Map<string, TournamentApprovalCount[]>();
        for (const t of approvals.tournaments) {
            const key = t.hubId.toLowerCase();
            (m.get(key) ?? m.set(key, []).get(key)!).push(t);
        }
        return m;
    }, [approvals]);

    const hubApprovals = useCallback(
        (hubId: string) => hubApprovalMap.get(hubId?.toLowerCase())?.count ?? 0,
        [hubApprovalMap],
    );
    const hubApprovalDetail = useCallback(
        (hubId: string) => hubApprovalMap.get(hubId?.toLowerCase()),
        [hubApprovalMap],
    );
    const tournamentApprovals = useCallback(
        (tournamentId: string) => tournamentApprovalMap.get(tournamentId?.toLowerCase()),
        [tournamentApprovalMap],
    );
    const tournamentsForHub = useCallback(
        (hubId: string) => tournamentsByHubMap.get(hubId?.toLowerCase()) ?? [],
        [tournamentsByHubMap],
    );

    // ─── Refetch when the app returns to the foreground ──────────────
    const appStateRef = useRef(AppState.currentState);
    useEffect(() => {
        if (!isAuthenticated) return;
        const sub = AppState.addEventListener('change', (next) => {
            if (appStateRef.current.match(/inactive|background/) && next === 'active') {
                refresh();
            }
            appStateRef.current = next;
        });
        return () => sub.remove();
    }, [isAuthenticated, refresh]);

    // ─── Live updates via the per-user SignalR hub ───────────────────
    // The server pushes a fresh BadgeCounts whenever an underlying count changes
    // (new DM / match message / friend request, or a read that clears one).
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;

        let active = true;
        const connection: HubConnection = new HubConnectionBuilder()
            .withUrl(ENDPOINTS.SIGNALR_USER_HUB, {
                accessTokenFactory: async () =>
                    (await SecureStore.getItemAsync('access_token').catch(() => null)) ?? '',
            })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connection.on('BadgesUpdated', (dto: BadgeCounts) => {
            if (!active || !dto) return;
            queryClient.setQueryData(BADGES_QUERY_KEY, dto);
            // The flat counts arrive live; refetch the per-entity breakdown so the cascade
            // dots (hub card / tournament / Requests tab) stay in sync with the new totals.
            queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
        });

        // Whenever the connection (re)establishes, pull a fresh snapshot so we
        // never miss a push that happened while we were offline.
        connection.onreconnected(() => { if (active) refresh(); });

        connection.start()
            .then(() => { if (active) refresh(); })
            .catch((err) => console.warn('[Badges] user hub connect error:', err));

        return () => {
            active = false;
            connection.off('BadgesUpdated');
            connection.stop().catch(() => { /* ignore */ });
        };
    }, [isAuthenticated, user?.id, queryClient, refresh]);

    const value = useMemo<BadgesContextType>(
        () => ({ badges: data ?? EMPTY_BADGES, refresh, hubApprovals, hubApprovalDetail, tournamentApprovals, tournamentsForHub }),
        [data, refresh, hubApprovals, hubApprovalDetail, tournamentApprovals, tournamentsForHub],
    );

    return <BadgesContext.Provider value={value}>{children}</BadgesContext.Provider>;
}

export function useBadges(): BadgesContextType {
    const ctx = useContext(BadgesContext);
    if (ctx === undefined) {
        // Safe fallback so components don't crash if rendered outside the provider.
        return {
            badges: EMPTY_BADGES,
            refresh: () => { },
            hubApprovals: () => 0,
            hubApprovalDetail: () => undefined,
            tournamentApprovals: () => undefined,
            tournamentsForHub: () => [],
        };
    }
    return ctx;
}
