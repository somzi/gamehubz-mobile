import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useBadges } from '../context/BadgesContext';

/**
 * Per-thread mute for a match chat. Kept as a hook rather than living inside MatchChatPanel so
 * the control can sit in the surrounding chrome (the match modal's header) instead of stealing a
 * row from the message list — mute belongs next to the conversation's title, not inside it.
 *
 * `isMuted` stays null until the server answers, so the caller can render nothing rather than
 * flash the wrong state and read as if the app changed the setting by itself.
 */
export function useMatchChatMute(matchId: string, active: boolean) {
    const { refresh: refreshBadges } = useBadges();
    const [isMuted, setIsMuted] = useState<boolean | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!active || !matchId) {
            setIsMuted(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const response = await authenticatedFetch(ENDPOINTS.MATCH_CHAT_MUTED(matchId));
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled) setIsMuted(!!(data?.muted ?? data?.Muted));
            } catch {
                /* best-effort — the control just stays hidden */
            }
        })();

        return () => { cancelled = true; };
    }, [matchId, active]);

    // Optimistic with rollback: the round-trip is the only thing between "this chat is noisy"
    // and silence, so the control must move on the tap.
    const toggle = useCallback(async () => {
        if (isSaving || isMuted === null || !matchId) return;

        const next = !isMuted;
        setIsMuted(next);
        setIsSaving(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.MATCH_CHAT_MUTED(matchId), {
                method: 'PUT',
                body: JSON.stringify({ muted: next }),
            });
            if (!response.ok) throw new Error(`MATCH_CHAT_MUTED failed: ${response.status}`);
            // Muting drops this thread out of the aggregate badge server-side; pull the new count.
            refreshBadges();
        } catch (error) {
            console.error('[useMatchChatMute] Error toggling mute:', error);
            setIsMuted(!next);
        } finally {
            setIsSaving(false);
        }
    }, [matchId, isMuted, isSaving, refreshBadges]);

    return { isMuted, isSaving, toggle };
}
