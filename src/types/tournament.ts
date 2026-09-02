export enum TournamentFormat {
    League = 0,
    GroupsThenSingleElimination = 1,
    GroupsThenDoubleElimination = 2,
    SingleElimination = 3,
    DoubleElimination = 4,
    GroupStageWithKnockout = 5,
    Swiss = 6
}

export const TEAM_TOURNAMENT_FORMATS = [
    TournamentFormat.SingleElimination,
    TournamentFormat.DoubleElimination,
    TournamentFormat.League,
    TournamentFormat.GroupStageWithKnockout,
] as const;

// Values live here; labels are i18n keys resolved by the consuming component so a
// language switch re-renders them (see CreateTournamentModal for the useMemo pattern).
export const TOURNAMENT_FORMAT_OPTIONS = [
    { value: String(TournamentFormat.League), labelKey: 'format.league' },
    { value: String(TournamentFormat.SingleElimination), labelKey: 'format.singleBracket' },
    { value: String(TournamentFormat.DoubleElimination), labelKey: 'format.doubleBracket' },
    { value: String(TournamentFormat.GroupStageWithKnockout), labelKey: 'format.groupsBracket' },
    { value: String(TournamentFormat.Swiss), labelKey: 'format.swiss' },
] as const;

// Knockout bracket sizes selectable after the Swiss rounds. 'None' = pure Swiss
// (the standings leader wins the tournament outright).
export const SWISS_KNOCKOUT_OPTIONS = [
    { value: '0', labelKey: 'swissKnockout.none' },
    { value: '2', labelKey: 'swissKnockout.top2' },
    { value: '4', labelKey: 'swissKnockout.top4' },
    { value: '8', labelKey: 'swissKnockout.top8' },
    { value: '16', labelKey: 'swissKnockout.top16' },
    { value: '32', labelKey: 'swissKnockout.top32' },
] as const;

type TFn = (key: string) => string;

export function getTournamentFormatLabel(format?: number | null, t?: TFn) {
    const tr = t ?? ((k: string) => k);
    switch (format) {
        case TournamentFormat.League:
            return tr('format.league');
        case TournamentFormat.GroupsThenSingleElimination:
            return tr('format.groupsSingleElim');
        case TournamentFormat.GroupsThenDoubleElimination:
            return tr('format.groupsDoubleElim');
        case TournamentFormat.SingleElimination:
            return tr('format.singleBracket');
        case TournamentFormat.DoubleElimination:
            return tr('format.doubleElimination');
        case TournamentFormat.GroupStageWithKnockout:
            return tr('format.groupsBracket');
        case TournamentFormat.Swiss:
            return tr('format.swiss');
        default:
            return tr('format.unknown');
    }
}

// Mirrors GameHubz.DataModels.Enums.BracketSeedingMode — how a tournament's opening fixtures
// were decided. Null on tournaments generated before the draw picker shipped; those were random.
export enum BracketSeedingMode {
    Random = 1,
    Manual = 2,
    Seeded = 3,
    Pots = 4,
}

export function getBracketSeedingModeLabel(mode?: number | null, t?: TFn) {
    const tr = t ?? ((k: string) => k);
    switch (mode) {
        case BracketSeedingMode.Manual:
            return tr('seedingMode.manual');
        case BracketSeedingMode.Seeded:
            return tr('seedingMode.seeded');
        case BracketSeedingMode.Pots:
            return tr('seedingMode.pots');
        case BracketSeedingMode.Random:
        default:
            return tr('seedingMode.random');
    }
}

/** One placeable entrant — a player in a solo tournament, a team in a team tournament. */
export interface BracketDrawEntrant {
    participantId: string;
    userId?: string | null;
    teamId?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    seed?: number | null;
}

/** Payload of GET /api/tournament/{id}/draw/options — the shape the draw has to fill. */
export interface BracketDrawOptions {
    tournamentId: string;
    format: number;
    isTeamTournament: boolean;
    entrantCount: number;
    /** Elimination formats: entrant count rounded up to a power of two. */
    bracketSize?: number | null;
    byeCount?: number | null;
    groupsCount?: number | null;
    qualifiersPerGroup?: number | null;
    /** Group formats: how many pots a pot draw uses — ceil(entrants / groups). */
    potCount?: number | null;
    supportedModes: BracketSeedingMode[];
    entrants: BracketDrawEntrant[];
}

/** The organiser's arrangement, sent with createBracket. Exactly one shape is used per mode. */
export interface BracketDrawPlan {
    /** Elimination + Manual: one entry per bracket slot in bracket order; null = bye. */
    slots?: (string | null)[];
    /** Groups + Manual: group index (0 = Group A) → participant ids. */
    groups?: string[][];
    /** Groups + Pots: pot index (0 = pot 1) → participant ids. */
    pots?: string[][];
}

/**
 * Seed order of a standard bracket: index = slot, value = the seed that belongs there
 * (1 v N, 2 v N-1 …). Mirrors BracketService.GetStandardSeedOrder so the app can work out
 * which slots the byes belong in without a round-trip.
 */
export function getStandardSeedOrder(bracketSize: number): number[] {
    let order = [1];
    let count = 1;

    while (count < bracketSize) {
        const next: number[] = [];
        for (let i = 0; i < count; i++) {
            next.push(order[i]);
            next.push(count * 2 + 1 - order[i]);
        }
        order = next;
        count *= 2;
    }

    return order;
}

// Mirrors GameHubz.DataModels.Enums.MatchStage (backend). Only ThirdPlace is consumed by the app today.
export enum MatchStage {
    GroupStage = 1,
    RoundOf64 = 2,
    RoundOf32 = 3,
    RoundOf16 = 4,
    QuarterFinal = 5,
    SemiFinal = 6,
    ThirdPlace = 7,
    Final = 8,
    WinnersBracket = 9,
    LosersBracket = 10,
    GrandFinal = 11,
    // DE reset final (LB champion beat the WB champion in the Grand Final). Rendered after the GF.
    GrandFinalReset = 17,
    RoundOf128 = 12,
    RoundOf256 = 13,
    RoundOf512 = 14,
    RoundOf1024 = 15,
    PlayIn = 16,
}

export enum TournamentRegion {
    Global = 0,
    NorthAmerica = 1,
    Europe = 2,
    Asia = 3,
    SouthAmerica = 4,
    Africa = 5,
    Oceania = 6
}
