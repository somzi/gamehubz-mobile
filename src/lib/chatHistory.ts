import { mergeMessagesById } from './mergeMessages';

type Message = { id: string; sentAt: string };

/** Fetch only the first page on entry; on reconnect fill every page down to the known tail. */
export async function loadChatHistory<T extends Message>(options: {
    anchor?: T;
    loadPage: (before?: string) => Promise<T[]>;
    isCurrent: () => boolean;
    pageSize?: number;
}) {
    const { anchor, loadPage, isCurrent, pageSize = 30 } = options;
    let before: string | undefined;
    let messages: T[] = [];
    for (;;) {
        const page = await loadPage(before);
        if (!isCurrent()) return null;
        const sorted = mergeMessagesById<T>([], page);
        messages = mergeMessagesById(messages, sorted);
        if (!anchor) return { messages, hasMore: page.length >= pageSize };
        const oldest = sorted[0]?.sentAt;
        if (page.length < pageSize || page.some((m) => m.id === anchor.id)
            || !oldest || oldest === before || Date.parse(oldest) <= Date.parse(anchor.sentAt)) {
            return { messages };
        }
        before = oldest;
    }
}
