import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVerificationPanel, VerificationPanel } from '../lib/resultVerification';

/**
 * The verification panel of one match, for the two match sheets (bracket MatchDetailsModal and the
 * Home / My Matches MatchScheduleCard). Only fetched while `enabled`: the match is scheduled and
 * requires verification, or already carries records to review. Unscheduled matches without records
 * cost nothing extra, even when the tournament enables verification.
 */
export function useResultVerification(matchId: string | undefined, enabled: boolean) {
    const [panel, setPanel] = useState<VerificationPanel | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // The sheets are reused across matches; an answer for the match the viewer just left must not
    // land on the one they opened next.
    const currentMatchRef = useRef(matchId);
    currentMatchRef.current = matchId;

    const refresh = useCallback(async () => {
        if (!matchId || !enabled) return;
        const requestedFor = matchId;

        setIsLoading(true);
        try {
            const next = await fetchVerificationPanel(requestedFor);
            if (currentMatchRef.current === requestedFor && next) setPanel(next);
        } catch {
            // Best-effort: the result gate is the server's, and it answers for itself on submit.
        } finally {
            if (currentMatchRef.current === requestedFor) setIsLoading(false);
        }
    }, [matchId, enabled]);

    useEffect(() => {
        setPanel(null);
        if (enabled && matchId) refresh();
    }, [matchId, enabled, refresh]);

    return { panel, isLoading, refresh };
}
