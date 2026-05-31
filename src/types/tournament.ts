export enum TournamentFormat {
    League = 0,
    GroupsThenSingleElimination = 1,
    GroupsThenDoubleElimination = 2,
    SingleElimination = 3,
    DoubleElimination = 4,
    GroupStageWithKnockout = 5
}

export const TEAM_TOURNAMENT_FORMATS = [
    TournamentFormat.SingleElimination,
    TournamentFormat.League,
    TournamentFormat.GroupStageWithKnockout,
] as const;

export const TOURNAMENT_FORMAT_OPTIONS = [
    { value: String(TournamentFormat.League), label: 'League' },
    { value: String(TournamentFormat.SingleElimination), label: 'Single Bracket' },
    { value: String(TournamentFormat.GroupStageWithKnockout), label: 'Groups + Bracket' },
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
    RoundOf128 = 12,
    RoundOf256 = 13,
    RoundOf512 = 14,
    RoundOf1024 = 15,
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
