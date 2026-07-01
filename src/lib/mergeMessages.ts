/**
 * Chat-history merge helper used on every SignalR reconnect backfill and every
 * live receive path. Callers previously inlined three near-identical copies of
 * this in DirectChatScreen, MatchChatPanel and MatchScheduleCard which had
 * already started to drift (different page sizes, different has-more updates),
 * so any future fix — e.g. tie-break for messages sharing a sentAt, optimistic
 * send reconciliation — would land on only one copy.
 *
 * Semantics:
 * - Dedup by id (backend guarantees id is stable across delivery paths).
 * - Sort by sentAt ascending so the render order is reading order regardless of
 *   whether the backend returned newest-first or oldest-first.
 * - Return the previous array by reference when there is nothing to add, so
 *   React and useMemo shallow-compares skip re-renders.
 */
export function mergeMessagesById<T extends { id: string; sentAt: string }>(
    prev: T[],
    incoming: T[],
): T[] {
    if (incoming.length === 0) return prev;
    const known = new Set(prev.map((p) => p.id));
    const added = incoming.filter((m) => !known.has(m.id));
    if (added.length === 0) return prev;
    const merged = [...prev, ...added];
    merged.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    return merged;
}
