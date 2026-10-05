import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVerificationPanel, normalizeRecord, VerificationPanel, VerificationRecord } from '../lib/resultVerification';
import { VERIFICATION_FAILED, verificationGameKey } from '../lib/verificationGames';
import { sameId } from '../lib/utils';

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
    const requestVersion = useRef(0);

    const refresh = useCallback(async () => {
        if (!matchId || !enabled) return;
        const requestedFor = matchId;
        const version = ++requestVersion.current;

        setIsLoading(true);
        try {
            const next = await fetchVerificationPanel(requestedFor);
            if (currentMatchRef.current === requestedFor && version === requestVersion.current && next) setPanel(next);
        } catch {
            // Best-effort: the result gate is the server's, and it answers for itself on submit.
        } finally {
            if (currentMatchRef.current === requestedFor && version === requestVersion.current) setIsLoading(false);
        }
    }, [matchId, enabled]);

    useEffect(() => {
        requestVersion.current += 1;
        setPanel(null);
        setIsLoading(false);
        if (enabled && matchId) refresh();
    }, [matchId, enabled, refresh]);

    // Approval can arrive while the player keeps the match open. Stop polling as soon as the
    // request is decided, so the Verify action returns without closing and reopening the match.
    useEffect(() => {
        if (!enabled || !panel?.phoneApprovalPending) return;
        const timer = setInterval(refresh, 15000);
        return () => clearInterval(timer);
    }, [enabled, panel?.phoneApprovalPending, refresh]);

    // The upload response is already authoritative. Show its proof immediately, even if the panel
    // refresh fails, and prevent an older panel request from erasing that success.
    const recordVerified = useCallback((record: VerificationRecord) => {
        if (currentMatchRef.current !== matchId) return;
        requestVersion.current += 1;
        setIsLoading(false);
        setPanel(current => {
            if (!current || current.matchId !== matchId) return current;
            const replaceOwnRecord = (records: VerificationRecord[]) => [
                ...records.filter(r => r.status === VERIFICATION_FAILED || !sameId(r.userId, record.userId)), record,
            ];
            // A server from before per-game proofs keeps its own shape: one proof, and it covers the match.
            // Growing games here would turn its panel into a per-game one that asks for proofs it never takes.
            if (current.games.length === 0) {
                return { ...current, mine: record, records: replaceOwnRecord(current.records), canVerify: false, reportBlocked: false };
            }
            const target = verificationGameKey(record);
            const games = current.games.map(game => verificationGameKey(game) === target
                ? { ...game, mine: record, canVerify: false, records: replaceOwnRecord(game.records) }
                : game);
            if (!games.some(game => verificationGameKey(game) === target)) {
                const placeholders = current.records.filter(r => r.status !== VERIFICATION_FAILED).map(r => normalizeRecord({
                    userId: r.userId, username: r.username, avatarUrl: r.avatarUrl,
                    seriesNumber: record.seriesNumber, gameNumber: record.gameNumber,
                }));
                games.push({ seriesNumber: record.seriesNumber, gameNumber: record.gameNumber, mine: record, canVerify: false, records: replaceOwnRecord(placeholders) });
            }
            return {
                ...current, games,
                ...(record.seriesNumber === 1 && record.gameNumber === 1
                    ? { mine: record, records: replaceOwnRecord(current.records) } : {}),
            };
        });
    }, [matchId]);

    return { panel, isLoading, refresh, recordVerified };
}
