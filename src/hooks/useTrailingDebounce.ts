import { useCallback, useEffect, useRef } from 'react';

/**
 * Trailing debounce that ALSO flushes on unmount. Purpose-built for the
 * mark-read-on-chat-message pattern where:
 *   - a burst of incoming messages should coalesce into a single POST
 *   - closing the chat within the debounce window must still fire the read
 *     (naive `clearTimeout` in the unmount cleanup was silently dropping the
 *     last read POST, leaving the unread badge sticky).
 *
 * The callback is captured via ref, so mid-flight arg identity changes don't
 * lock the stale closure. Callers get back a `debounced` fn to call from
 * event handlers plus an imperative `flush` for explicit force-send paths.
 *
 * Extracted from two inline copies (MatchChatPanel + DirectChatScreen) that
 * were byte-identical apart from the endpoint URL, and starting to diverge.
 */
export function useTrailingDebounce<Args extends unknown[]>(
    fn: (...args: Args) => void,
    delay = 600,
) {
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastArgsRef = useRef<Args | null>(null);

    const flush = useCallback(() => {
        if (!timerRef.current) return;
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const stored = lastArgsRef.current;
        if (stored) fnRef.current(...stored);
    }, []);

    const debounced = useCallback((...args: Args) => {
        lastArgsRef.current = args;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            const stored = lastArgsRef.current;
            if (stored) fnRef.current(...stored);
        }, delay);
    }, [delay]);

    // Flush on unmount so a pending read isn't silently dropped.
    useEffect(() => () => flush(), [flush]);

    return { debounced, flush };
}
