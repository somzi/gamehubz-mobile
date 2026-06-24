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

export const TOURNAMENT_FORMAT_OPTIONS = [
    { value: String(TournamentFormat.League), label: 'League' },
    { value: String(TournamentFormat.SingleElimination), label: 'Single Bracket' },
    { value: String(TournamentFormat.DoubleElimination), label: 'Double Bracket' },
    { value: String(TournamentFormat.GroupStageWithKnockout), label: 'Groups + Bracket' },
    { value: String(TournamentFormat.Swiss), label: 'Swiss' },
] as const;

// Knockout bracket sizes selectable after the Swiss rounds. 'None' = pure Swiss
// (the standings leader wins the tournament outright).
export const SWISS_KNOCKOUT_OPTIONS = [
    { value: '0', label: 'None (winner by standings)' },
    { value: '2', label: 'Top 2 (final)' },
    { value: '4', label: 'Top 4' },
    { value: '8', label: 'Top 8' },
    { value: '16', label: 'Top 16' },
    { value: '32', label: 'Top 32' },
] as const;

export function getTournamentFormatLabel(format?: number | null) {
    switch (format) {
        case TournamentFormat.League:
            return 'League';
        case TournamentFormat.GroupsThenSingleElimination:
            return 'Groups + Single Elimination';
        case TournamentFormat.GroupsThenDoubleElimination:
            return 'Groups + Double Elimination';
        case TournamentFormat.SingleElimination:
            return 'Single Bracket';
        case TournamentFormat.DoubleElimination:
            return 'Double Elimination';
        case TournamentFormat.GroupStageWithKnockout:
            return 'Groups + Bracket';
        case TournamentFormat.Swiss:
            return 'Swiss';
        default:
            return 'Unknown';
    }
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
