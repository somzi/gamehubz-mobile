/**
 * Status enums, mirrored from the backend **by value**. Changing a number here silently changes
 * what the UI thinks a match is — these must track `GameHubz.DataModels/Enums/*.cs` exactly.
 *
 * There are two of them and their numbers overlap, which is the whole reason this file exists:
 * a bare `status === 3` means "live" on a solo match and "tie-break required" on a team match, and
 * nothing in a 1500-line modal tells you which one you are looking at.
 */

/** `GameHubz.DataModels.Enums.MatchStatus` — a single (solo or team sub-) match. */
export enum MatchStatus {
    Pending = 1,
    Scheduled = 2,
    /**
     * Reserved. Nothing in the backend assigns this today — every reference to it is a comparison
     * (`DeadlineNotificationRunner`, `MatchService`, `TournamentExportService`), never an
     * assignment — so no row carries it. Kept because the value is spoken for, and because UI that
     * lumps it in with `Completed` is the bug this enum exists to prevent.
     */
    Live = 3,
    Completed = 4,
    /** Both sides forfeited: terminal, but nobody won and no points were awarded. */
    NoShow = 5,
    /** The series was reported but finished level — played, undecided, still owes a tie-break. */
    TieBreakRequired = 6,
}

/**
 * `GameHubz.DataModels.Enums.TeamMatchStatus` — the parent fixture of a team tie, NOT its
 * sub-matches. Sub-matches use {@link MatchStatus}. The numbering is genuinely different: 2 is
 * Completed here and Scheduled there; 3 is TieBreakRequired here and Live there; 4 is Processing
 * here and Completed there.
 */
export enum TeamMatchStatus {
    Pending = 1,
    Completed = 2,
    TieBreakRequired = 3,
    /** Sub-match results are landing; the tie is under way but not settled. */
    Processing = 4,
}

/** Terminal for a single match: no further play is expected. Live is deliberately absent. */
export const isTerminalMatchStatus = (status: number | null | undefined): boolean =>
    status === MatchStatus.Completed || status === MatchStatus.NoShow;

/** The match is still to be played — the states in which a result may be reported. */
export const isPlayableMatchStatus = (status: number | null | undefined): boolean =>
    status === MatchStatus.Pending || status === MatchStatus.Scheduled;
