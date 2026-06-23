import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useAuth } from './AuthContext';
import { BadgeCounts } from '../types/social';

const EMPTY_BADGES: BadgeCounts = {
    friendRequests: 0,
    unreadDirectMessages: 0,
    unreadMatchMessages: 0,
    matchesWithUnreadChat: 0,
    matchesToSchedule: 0,
    socialTotal: 0,
    matchesTotal: 0,
};

const BADGES_QUERY_KEY = ['me-badges'] as const;

interface BadgesContextType {
    badges: BadgeCounts;
    /** Force an immediate re-fetch (e.g. right after accepting a request or reading a chat). */
    refresh: () => void;
}

const BadgesContext = createContext<BadgesContextType | undefined>(undefined);

async function fetchBadges(): Promise<BadgeCounts> {
    const res = await authenticatedFetch(ENDPOINTS.GET_BADGES);
    if (!res.ok) throw new Error('Failed to load badges');
    return (await res.json()) as BadgeCounts;
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

    const refresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: BADGES_QUERY_KEY });
    }, [queryClient]);

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
        () => ({ badges: data ?? EMPTY_BADGES, refresh }),
        [data, refresh],
    );

    return <BadgesContext.Provider value={value}>{children}</BadgesContext.Provider>;
}

export function useBadges(): BadgesContextType {
    const ctx = useContext(BadgesContext);
    if (ctx === undefined) {
        // Safe fallback so components don't crash if rendered outside the provider.
        return { badges: EMPTY_BADGES, refresh: () => { } };
    }
    return ctx;
}
