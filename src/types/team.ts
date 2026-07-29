export interface TeamMemberDto {
    userId: string;
    UserId?: string;
    username: string;
    Username?: string;
    isCaptain: boolean;
    IsCaptain?: boolean;
    avatarUrl?: string;
    AvatarUrl?: string;
    /** On the roster but out of the lineup — plays no sub-match. Absent/false without reserves. */
    isReserve?: boolean;
    IsReserve?: boolean;
}

export interface TeamMatchTeamInfoDto {
    teamId: string;
    TeamId?: string;
    teamName: string;
    TeamName?: string;
    members: TeamMemberDto[];
    Members?: TeamMemberDto[];
    captainUserId?: string;
    CaptainUserId?: string;
    avatarUrl?: string;
    AvatarUrl?: string;
}

export interface SubMatchDto {
    matchId: string;
    MatchId?: string;
    homePlayer: TeamMemberDto | null;
    HomePlayer?: TeamMemberDto | null;
    awayPlayer: TeamMemberDto | null;
    AwayPlayer?: TeamMemberDto | null;
    homeScore: number | null;
    HomeScore?: number | null;
    awayScore: number | null;
    AwayScore?: number | null;
    // 'NoShow' (MatchStatus 5) = double walkover — the game is closed and counts for neither team.
    status: 'Pending' | 'Completed' | 'NoShow' | number;
    Status?: 'Pending' | 'Completed' | 'NoShow' | number;
    winnerUserId: string | null;
    WinnerUserId?: string | null;
    isTieBreakMatch: boolean;
    IsTieBreakMatch?: boolean;
    evidences?: string[];
    Evidences?: string[];
    proposedHomeScore?: number | null;
    ProposedHomeScore?: number | null;
    proposedAwayScore?: number | null;
    ProposedAwayScore?: number | null;
    proposedByUserId?: string | null;
    ProposedByUserId?: string | null;
}

export interface AggregateScoreDto {
    homeTeamWins: number;
    HomeTeamWins?: number;
    awayTeamWins: number;
    AwayTeamWins?: number;
    homeTeamTotalScore: number;
    HomeTeamTotalScore?: number;
    awayTeamTotalScore: number;
    AwayTeamTotalScore?: number;
}

export interface TieBreakStatusDto {
    isRequired: boolean;
    IsRequired?: boolean;
    homeRepresentative: TeamMemberDto | null;
    HomeRepresentative?: TeamMemberDto | null;
    awayRepresentative: TeamMemberDto | null;
    AwayRepresentative?: TeamMemberDto | null;
}

export interface TeamMatchDetailsDto {
    teamMatchId: string;
    TeamMatchId?: string;
    status: 'Pending' | 'Completed' | 'TieBreakRequired' | 'Processing' | number;
    Status?: 'Pending' | 'Completed' | 'TieBreakRequired' | 'Processing' | number;
    winnerTeamParticipantId: string | null;
    WinnerTeamParticipantId?: string | null;
    homeTeamParticipantId?: string | null;
    HomeTeamParticipantId?: string | null;
    awayTeamParticipantId?: string | null;
    AwayTeamParticipantId?: string | null;
    // Tournament's TeamWinCondition: MatchWins=0, AggregateScore=1.
    // Normalized to the string form on fetch; null when an older backend omits it.
    winCondition?: 'MatchWins' | 'AggregateScore' | number | null;
    WinCondition?: 'MatchWins' | 'AggregateScore' | number | null;
    homeTeam: TeamMatchTeamInfoDto | null;
    HomeTeam?: TeamMatchTeamInfoDto | null;
    awayTeam: TeamMatchTeamInfoDto | null;
    AwayTeam?: TeamMatchTeamInfoDto | null;
    subMatches: SubMatchDto[];
    SubMatches?: SubMatchDto[];
    aggregateScore: AggregateScoreDto | null;
    AggregateScore?: AggregateScoreDto | null;
    tieBreak: TieBreakStatusDto | null;
    TieBreak?: TieBreakStatusDto | null;
    evidences?: string[];
    Evidences?: string[];
    requireResultApproval?: boolean;
    RequireResultApproval?: boolean;
}

// Aliases for user's specific backend naming if they prefer
export type TeamSubMatchDto = SubMatchDto;
export type TeamAggregateScoreDto = AggregateScoreDto;
export type TeamTieBreakInfoDto = TieBreakStatusDto;

export interface TeamDto {
    teamId: string;
    TeamId?: string;
    teamName: string;
    TeamName?: string;
    captainUserId: string;
    CaptainUserId?: string;
    memberCount: number;
    MemberCount?: number;
    /** The lineup size — how many players the team fields. Reserves sit on top of this. */
    teamSize: number;
    TeamSize?: number;
    /** Whether the tournament lets rosters carry bench players at all. */
    allowReserves?: boolean;
    AllowReserves?: boolean;
    /** Bench slots granted per team; a team may fill 0..N of them. */
    maxReserves?: number | null;
    MaxReserves?: number | null;
    /** Members currently in the lineup. */
    starterCount?: number;
    StarterCount?: number;
    /** Members currently on the bench. */
    reserveCount?: number;
    ReserveCount?: number;
    members: TeamMemberDto[];
    Members?: TeamMemberDto[];
    isAlreadyRegistered?: boolean;
    IsAlreadyRegistered?: boolean;
    isAlreadyRegistred?: boolean;
    IsAlreadyRegistred?: boolean;
    isRegistrationAccepted?: boolean;
    IsRegistrationAccepted?: boolean;
    requiresApproval?: boolean;
    RequiresApproval?: boolean;
    userRequestStatus?: 'Pending' | 'Approved' | 'Rejected' | null;
    UserRequestStatus?: 'Pending' | 'Approved' | 'Rejected' | null;
}

export interface TeamJoinRequestDto {
    requestId: string;
    RequestId?: string;
    userId: string;
    UserId?: string;
    username: string;
    Username?: string;
    avatarUrl?: string;
    AvatarUrl?: string;
    requestedAt: string;
    RequestedAt?: string;
}
