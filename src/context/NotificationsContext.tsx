import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { InfiniteData, QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { ENDPOINTS } from '../lib/api';
import { useAuth } from './AuthContext';
import {
    EMPTY_NOTIFICATION_SUMMARY,
    NOTIFICATIONS_KEY,
    NOTIFICATION_SUMMARY_KEY,
    beginSummaryWrite,
    fetchNotificationSummary,
    postNotificationWrite,
    settleSummaryWrite,
} from '../lib/notificationsApi';
import {
    NotificationCategory,
    NotificationFilter,
    NotificationItem,
    NotificationPage,
    NotificationSummary,
} from '../types/notifications';

interface NotificationsContextType {
    /** The server's counters: the bell reads `unseen`, the inbox tabs read the unread split. */
    summary: NotificationSummary;
    /** Refetch the counters and every cached inbox page. */
    refresh: () => void;
    /** Optimistic — never holds up the navigation that usually follows it. */
    markRead: (id: string) => void;
    /** Optimistic; one tab's rows, or everything for `all`. */
    markAllRead: (filter?: NotificationFilter) => void;
    /** The inbox is on screen — clears the bell. */
    markSeen: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

type InboxPages = InfiniteData<NotificationPage, string | null>;

// Applies `update` to every matching row across all cached inbox tabs — a row lives in `all` and in
// its own category tab at once. Untouched pages and rows keep their identity, so memoized rows that
// did not change do not re-render.
function patchRows(
    queryClient: QueryClient,
    match: (item: NotificationItem) => boolean,
    update: (item: NotificationItem) => NotificationItem,
) {
    queryClient.setQueriesData<InboxPages>({ queryKey: NOTIFICATIONS_KEY }, (data) => {
        if (!data) return data;
        let changed = false;
        const pages = data.pages.map((page) => {
            if (!page.items.some(match)) return page;
            changed = true;
            return { ...page, items: page.items.map((item) => (match(item) ? update(item) : item)) };
        });
        return changed ? { ...data, pages } : data;
    });
}

function findRow(queryClient: QueryClient, id: string): NotificationItem | undefined {
    for (const [, data] of queryClient.getQueriesData<InboxPages>({ queryKey: NOTIFICATIONS_KEY })) {
        for (const page of data?.pages ?? []) {
            const row = page.items.find((item) => item.id === id);
            if (row) return row;
        }
    }
    return undefined;
}

function withUnread(summary: NotificationSummary, unreadActions: number, unreadUpdates: number): NotificationSummary {
    const unread = unreadActions + unreadUpdates;
    // Unseen is a subset of unread, so it can never be the larger number.
    return { unseen: Math.min(summary.unseen, unread), unreadActions, unreadUpdates, unread };
}

/**
 * The notification inbox's client state. Same shape as BadgesProvider: the server is the source of
 * truth (a react-query summary), kept live by the per-user hub — BadgesProvider owns that connection
 * and writes its "NotificationsUpdated" pushes into the same query. Nothing is counted client-side;
 * the optimistic updates here only bridge the moment until the server's answer lands.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data } = useQuery({
        queryKey: NOTIFICATION_SUMMARY_KEY,
        queryFn: fetchNotificationSummary,
        enabled: isAuthenticated,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
    });

    const refresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_SUMMARY_KEY });
        queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }, [queryClient]);

    const setSummary = useCallback((next: NotificationSummary) => {
        queryClient.setQueryData(NOTIFICATION_SUMMARY_KEY, next);
    }, [queryClient]);

    const markRead = useCallback((id: string) => {
        const row = findRow(queryClient, id);
        if (row?.readOn) return;

        const previous = queryClient.getQueryData<NotificationSummary>(NOTIFICATION_SUMMARY_KEY);
        const readOn = new Date().toISOString();

        // A push tapped from the tray can point at a row that was never loaded: then only the server
        // knows its category, and its response brings the counters.
        if (row) {
            patchRows(queryClient, (item) => item.id === id, (item) => ({ ...item, readOn }));
            if (previous) {
                const isAction = row.category === NotificationCategory.Action;
                setSummary(withUnread(
                    previous,
                    Math.max(0, previous.unreadActions - (isAction ? 1 : 0)),
                    Math.max(0, previous.unreadUpdates - (isAction ? 0 : 1)),
                ));
            }
        }

        // Two-callback then, not then/catch: a throw inside the success path must not settle twice.
        const seq = beginSummaryWrite();
        postNotificationWrite(ENDPOINTS.MARK_NOTIFICATION_READ(id))
            .then((next) => settleSummaryWrite(queryClient, seq, next), (error) => {
                settleSummaryWrite(queryClient, seq);
                console.warn('[Notifications] mark read failed:', error);
                // Undo only what this call did — restoring a whole snapshot could clobber a refetch
                // that landed in the meantime.
                patchRows(queryClient, (item) => item.id === id && item.readOn === readOn, (item) => ({ ...item, readOn: null }));
                queryClient.invalidateQueries({ queryKey: NOTIFICATION_SUMMARY_KEY });
            });
    }, [queryClient, setSummary]);

    const markAllRead = useCallback((filter: NotificationFilter = 'all') => {
        const previous = queryClient.getQueryData<NotificationSummary>(NOTIFICATION_SUMMARY_KEY);
        const readOn = new Date().toISOString();
        const inScope = (item: NotificationItem) =>
            !item.readOn
            && (filter === 'all'
                || item.category === (filter === 'action' ? NotificationCategory.Action : NotificationCategory.Update));

        patchRows(queryClient, inScope, (item) => ({ ...item, readOn }));
        if (previous) {
            setSummary(withUnread(
                previous,
                filter === 'update' ? previous.unreadActions : 0,
                filter === 'action' ? previous.unreadUpdates : 0,
            ));
        }

        const seq = beginSummaryWrite();
        postNotificationWrite(ENDPOINTS.MARK_ALL_NOTIFICATIONS_READ(filter))
            .then((next) => settleSummaryWrite(queryClient, seq, next), (error) => {
                settleSummaryWrite(queryClient, seq);
                console.warn('[Notifications] mark all read failed:', error);
                patchRows(queryClient, (item) => item.readOn === readOn, (item) => ({ ...item, readOn: null }));
                queryClient.invalidateQueries({ queryKey: NOTIFICATION_SUMMARY_KEY });
            });
    }, [queryClient, setSummary]);

    const seenInFlight = useRef(false);
    const markSeen = useCallback(() => {
        const current = queryClient.getQueryData<NotificationSummary>(NOTIFICATION_SUMMARY_KEY);
        if (!current || current.unseen === 0 || seenInFlight.current) return;

        seenInFlight.current = true;
        setSummary({ ...current, unseen: 0 });

        const seq = beginSummaryWrite();
        postNotificationWrite(ENDPOINTS.MARK_NOTIFICATIONS_SEEN)
            .then((next) => settleSummaryWrite(queryClient, seq, next), (error) => {
                settleSummaryWrite(queryClient, seq);
                // No rollback: the bell would light straight back up while the user is looking at the
                // inbox. The next server summary (live push, foreground, reconnect) settles it either way.
                console.warn('[Notifications] mark seen failed:', error);
            })
            .finally(() => { seenInFlight.current = false; });
    }, [queryClient, setSummary]);

    // Pushes that arrive while the app is in the background never reach JS, so the counters (and an
    // inbox left open) catch up when the app comes back to the foreground.
    const appStateRef = useRef(AppState.currentState);
    useEffect(() => {
        if (!isAuthenticated) return;
        const subscription = AppState.addEventListener('change', (next) => {
            if (appStateRef.current.match(/inactive|background/) && next === 'active') {
                refresh();
            }
            appStateRef.current = next;
        });
        return () => subscription.remove();
    }, [isAuthenticated, refresh]);

    // A push that lands while the app is open. The server writes the inbox row before it sends, so a
    // refetch finds it; normally the hub's "NotificationsUpdated" already delivered the same news and
    // the row is in the cache, and this is a no-op. Registered once, here — a listener per screen would
    // refetch once per mounted screen.
    useEffect(() => {
        if (!isAuthenticated) return;
        const subscription = Notifications.addNotificationReceivedListener((notification) => {
            const payload = notification.request.content.data as Record<string, unknown> | undefined;
            const notificationId = payload?.notificationId;
            // Chat pushes carry no id — they are not in the inbox.
            if (typeof notificationId !== 'string') return;
            if (findRow(queryClient, notificationId)) return;
            refresh();
        });
        return () => subscription.remove();
    }, [isAuthenticated, queryClient, refresh]);

    const value = useMemo<NotificationsContextType>(
        () => ({ summary: data ?? EMPTY_NOTIFICATION_SUMMARY, refresh, markRead, markAllRead, markSeen }),
        [data, refresh, markRead, markAllRead, markSeen],
    );

    return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextType {
    const ctx = useContext(NotificationsContext);
    if (ctx === undefined) {
        // Safe fallback so a component rendered outside the provider shows "nothing new" instead of crashing.
        return {
            summary: EMPTY_NOTIFICATION_SUMMARY,
            refresh: () => { },
            markRead: () => { },
            markAllRead: () => { },
            markSeen: () => { },
        };
    }
    return ctx;
}
