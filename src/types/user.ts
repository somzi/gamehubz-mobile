export interface PlayerStatsDto {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    tournamentsWon: number;
    winRate: number; // Computed on backend
    // Undefined when the API predates them, so the profile shows a dash instead of a false 0.
    tournamentsPlayed?: number;
    longestWinStreak?: number;
}

export interface MatchListItemDto {
    tournamentName: string;
    hubName?: string;
    scheduledTime: string | null; // Generic datetime string
    isWin: boolean | null;
    opponentName: string;
    opponentScore: number | null;
    userScore: number | null;
}

export interface PlayerPerformanceDto {
    outcome: 'W' | 'L' | 'D';
}

export interface PlayerMatchesDto {
    stats: PlayerStatsDto | null;
    performance: PlayerPerformanceDto[];
}
