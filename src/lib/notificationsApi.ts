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
