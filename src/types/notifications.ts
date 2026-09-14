/** Mirrors backend GameHubz.DataModels.Enums.NotificationCategory by value. */
export enum NotificationCategory {
    Update = 0,
    Action = 1,
}

/** Inbox tab. `all` sends no category filter. */
export type NotificationFilter = 'all' | 'action' | 'update';

/** One inbox row. Mirrors backend NotificationDto. */
export interface NotificationItem {
    id: string;
    type: string | null;
    category: NotificationCategory;
    /** Worded in the user's language at send time — exactly the push they got. */
    title: string;
    body: string;
    /** The push payload, handed to the same router a push tap uses. */
    data: Record<string, unknown> | null;
    createdOn: string;
    readOn: string | null;
}

/** Mirrors backend NotificationPageDto. */
export interface NotificationPage {
    items: NotificationItem[];
    /** Pass back as `before` for the next (older) page; null at the end. */
    nextCursor: string | null;
}

/** Mirrors backend NotificationSummaryDto. */
export interface NotificationSummary {
    /** Unread notifications that arrived since the inbox was last opened — the bell badge. */
    unseen: number;
    unreadActions: number;
    unreadUpdates: number;
    unread: number;
}
