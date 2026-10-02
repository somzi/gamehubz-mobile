import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch, ENDPOINTS } from './api';

/**
 * The viewer's open matches, shared by Home and My Matches. Both read the same endpoint, so "See
 * all" opens on the cards Home already holds instead of a blank list, and a match updated on one
 * screen is updated on the other.
 */
export interface MatchOverviewDto {
    id?: string;
    matchId?: string;
    tournamentId?: string;
    tournamentName: string;
    hubName: string;
    scheduledTime: string | null;
    roundDeadline?: string | null;
    opponentName: string;
    opponentAvatarUrl?: string;
    opponentNickname?: string;
    userNickname?: string;
    status: number;
    isRoundLocked?: boolean;
    unreadMessages?: number;
    /** Games this match is played over — 1 (or absent) is a plain single game. */
    bestOf?: number;
    /**
     * Ready check, shaped for the card and built ONCE in the normalizer. The card is memoized on
     * its props, so a fresh object literal in the JSX would re-render every card on every parent
     * render — this way the identity is as stable as the match row it came from.
     */
    checkIn?: {
        enabled: boolean;
        graceMinutes: number | null;
        isHome: boolean | null;
        homeCheckedInOn: string | null;
        awayCheckedInOn: string | null;
        checkInOpensAt: string | null;
        checkInDeadline: string | null;
    };
}

export const HOME_MATCHES_KEY = (userId: string | undefined) => ['home-matches', userId] as const;

export async function fetchHomeMatches(userId: string): Promise<MatchOverviewDto[]> {
    const response = await authenticatedFetch(ENDPOINTS.GET_USER_HOME_MATCHES(userId));
    if (!response.ok) throw new Error(`GET_USER_HOME_MATCHES failed: ${response.status}`);
    const data: any[] = await response.json();
    return data.map((m) => ({
        id: m.id || m.Id,
        matchId: m.matchId || m.MatchId,
        tournamentId: m.tournamentId || m.TournamentId,
        tournamentName: m.tournamentName || m.TournamentName,
        hubName: m.hubName || m.HubName,
        scheduledTime: m.scheduledTime || m.ScheduledTime || null,
        // Both of these are read by the cards (deadline strip, Bo label) and were being dropped
        // here, so every card rendered "no round deadline" no matter what the round actually had —
        // the API has been sending it all along.
        roundDeadline: m.roundDeadline ?? m.RoundDeadline ?? null,
        bestOf: m.bestOf ?? m.BestOf ?? 1,
        // Ready check — the card face renders the countdown and the button from this.
        checkIn: {
            enabled: m.requireMatchCheckIn ?? m.RequireMatchCheckIn ?? false,
            graceMinutes: m.checkInGraceMinutes ?? m.CheckInGraceMinutes ?? null,
            isHome: m.isHome ?? m.IsHome ?? null,
            homeCheckedInOn: m.homeCheckedInOn ?? m.HomeCheckedInOn ?? null,
            awayCheckedInOn: m.awayCheckedInOn ?? m.AwayCheckedInOn ?? null,
            checkInOpensAt: m.checkInOpensAt ?? m.CheckInOpensAt ?? null,
            checkInDeadline: m.checkInDeadline ?? m.CheckInDeadline ?? null,
        },
        opponentName: m.opponentName || m.OpponentName,
        opponentAvatarUrl: m.opponentAvatarUrl || m.OpponentAvatarUrl,
        opponentNickname: m.opponentNickname || m.OpponentNickname,
        userNickname: m.userNickname || m.UserNickname,
        status: m.status !== undefined ? m.status : m.Status,
        isRoundLocked: m.isRoundLocked !== undefined ? m.isRoundLocked : m.IsRoundLocked,
        unreadMessages: m.unreadMessages !== undefined ? m.unreadMessages : m.UnreadMessages,
    }));
}

export function useHomeMatches(userId: string | undefined) {
    return useQuery<MatchOverviewDto[]>({
        queryKey: HOME_MATCHES_KEY(userId),
        queryFn: () => fetchHomeMatches(userId!),
        enabled: !!userId,
        staleTime: 30_000,
        // Respect staleTime — 'always' would ignore it and re-hit the API on every remount,
        // defeating the instant tab swap.
        refetchOnMount: true,
    });
}
