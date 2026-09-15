import type { QueryClient } from '@tanstack/react-query';
import { authenticatedFetch, ENDPOINTS } from './api';
import type { NotificationFilter, NotificationPage, NotificationSummary } from '../types/notifications';

/** Prefix of every inbox page query — the full key is `[...NOTIFICATIONS_KEY, filter]`. */
export const NOTIFICATIONS_KEY = ['notifications'] as const;

/** The server's inbox counters. Written by the query, by every inbox write, and by the user hub. */
export const NOTIFICATION_SUMMARY_KEY = ['notifications-summary'] as const;

export const EMPTY_NOTIFICATION_SUMMARY: NotificationSummary = {
    unseen: 0,
    unreadActions: 0,
    unreadUpdates: 0,
    unread: 0,
};

export async function fetchNotificationPage(filter: NotificationFilter, cursor: string | null): Promise<NotificationPage> {
    const res = await authenticatedFetch(ENDPOINTS.GET_NOTIFICATIONS(filter, cursor));
    if (!res.ok) throw new Error(`GET_NOTIFICATIONS failed: ${res.status}`);
    return (await res.json()) as NotificationPage;
}

export async function fetchNotificationSummary(): Promise<NotificationSummary> {
    const res = await authenticatedFetch(ENDPOINTS.GET_NOTIFICATION_SUMMARY);
    if (!res.ok) throw new Error(`GET_NOTIFICATION_SUMMARY failed: ${res.status}`);
    return (await res.json()) as NotificationSummary;
}

/** Seen / read / read-all — every inbox write answers with the fresh counters. */
export async function postNotificationWrite(url: string): Promise<NotificationSummary> {
    const res = await authenticatedFetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(`Notification write failed: ${res.status}`);
    return (await res.json()) as NotificationSummary;
}

// ─── Ordering of this device's own counter writes ───────────────────────────────────────────────
// Every write answers with the counters as they stood right after IT ran, and each one also makes the
// server push the same counters over the user hub. Two quick taps are two requests whose answers can
// come back in either order: applied blindly, the older answer landing last puts a row that was just
// read back on the badge. So only the newest write's answer is applied, a hub push that arrives while
// a write is in flight is held, and once the last write settles the held push is compared with what
// was applied — only a real difference (a new notification, a read on another device) asks the server
// again, so the push each write triggers for itself costs nothing.
let latestWriteSeq = 0;
let pendingWrites = 0;
let heldHubSummary: NotificationSummary | null = null;

const sameSummary = (a?: NotificationSummary | null, b?: NotificationSummary | null) =>
    !!a && !!b
    && a.unseen === b.unseen
    && a.unreadActions === b.unreadActions
    && a.unreadUpdates === b.unreadUpdates;

/** Call before sending a write; pass the returned number to {@link settleSummaryWrite}. */
export function beginSummaryWrite(): number {
    pendingWrites += 1;
    latestWriteSeq += 1;
    return latestWriteSeq;
}

/**
 * Settles one write: applies the server's `answer` only when it belongs to the newest write, and once
 * nothing is in flight reconciles a hub push held in the meantime. Omit `answer` for a failed write —
 * the caller keeps its own rollback.
 */
export function settleSummaryWrite(queryClient: QueryClient, seq: number, answer?: NotificationSummary): void {
    pendingWrites = Math.max(0, pendingWrites - 1);

    if (answer && seq === latestWriteSeq) {
        queryClient.setQueryData(NOTIFICATION_SUMMARY_KEY, answer);
    }

    if (pendingWrites > 0) return;

    const held = heldHubSummary;
    heldHubSummary = null;
    if (held && !sameSummary(held, queryClient.getQueryData<NotificationSummary>(NOTIFICATION_SUMMARY_KEY))) {
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_SUMMARY_KEY });
        queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
}

/**
 * For the hub's "NotificationsUpdated": false while a write from this device is in flight — the push
 * may be older than that write's answer, so it is held and reconciled when the write settles.
 */
export function acceptHubSummary(next: NotificationSummary): boolean {
    if (pendingWrites === 0) return true;
    heldHubSummary = next;
    return false;
}
