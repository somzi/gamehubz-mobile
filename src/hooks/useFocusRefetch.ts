import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Re-runs `load` when the screen regains focus, but skips the call when the same
 * `key` was already loaded within `ttlMs`. This kills the redundant network
 * refetches that fire every time you bounce between bottom tabs (the old
 * `useFocusEffect(() => load())` pattern hit the API on *every* focus).
 *
 * - Changing `key` (e.g. the active sub-tab or the logged-in user) always reloads.
 * - The freshness stamp is written only after a successful load, so a failed
 *   request still retries on the next focus.
 * - Pull-to-refresh and post-mutation refreshes should call their fetch function
 *   directly, bypassing this guard, so the user always gets fresh data on demand.
 *
 * @param load   The fetch to run on focus. May be sync or return a Promise.
 * @param key    Identity of the data being loaded; a change forces a reload.
 * @param ttlMs  How long a load stays "fresh" before focus will reload it.
 */
export function useFocusRefetch(
    load: () => void | Promise<unknown>,
    key: string,
    ttlMs = 30_000,
) {
    const last = useRef<{ key: string; at: number }>({ key: '', at: 0 });
    // Keep the latest closure without making it a hook dependency, so we don't
    // re-subscribe (and accidentally reload) on every parent render.
    const loadRef = useRef(load);
    loadRef.current = load;

    useFocusEffect(
        useCallback(() => {
            if (last.current.key === key && Date.now() - last.current.at < ttlMs) {
                return;
            }
            const result = loadRef.current();
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                (result as Promise<unknown>)
                    .then(() => { last.current = { key, at: Date.now() }; })
                    .catch(() => { /* leave stamp unset so the next focus retries */ });
            } else {
                last.current = { key, at: Date.now() };
            }
        }, [key, ttlMs]),
    );
}
