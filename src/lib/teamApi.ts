import { apiClient, API_BASE_URL, authenticatedFetch } from './api';
import type {
    TeamDto,
    TeamMatchDetailsDto,
    TieBreakStatusDto,
} from '../types/team';

// --- Team CRUD ---

export async function createTeam(tournamentId: string, teamName: string, requiresApproval: boolean = false): Promise<TeamDto> {
    const response = await apiClient.post<TeamDto>(`/api/teams`, {
        tournamentId,
        teamName,
        requiresApproval,
    });
    return response.data;
}

export interface TeamShareSummary {
    teamId: string;
    tournamentId: string;
    teamName: string;
    requiresApproval: boolean;
    memberCount: number;
    teamSize: number | null;
}

/** Resolves a shared /team/{id} link to the team's tournament + basic info. */
export async function getTeamShareSummary(teamId: string): Promise<TeamShareSummary> {
    const response = await apiClient.get(`/api/teams/${teamId}`);
    const d: any = response.data;
    return {
        teamId: d.teamId ?? d.TeamId,
        tournamentId: d.tournamentId ?? d.TournamentId,
        teamName: d.teamName ?? d.TeamName ?? '',
        requiresApproval: d.requiresApproval ?? d.RequiresApproval ?? false,
        memberCount: d.memberCount ?? d.MemberCount ?? 0,
        teamSize: d.teamSize ?? d.TeamSize ?? null,
    };
}

export async function joinTeam(teamId: string): Promise<TeamDto> {
    const response = await apiClient.post<TeamDto>(`/api/teams/${teamId}/join`);
    return response.data;
}

export async function requestJoinTeam(teamId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/teams/${teamId}/request-join`, {
        method: 'POST'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => 'Failed to request join');
        throw new Error(text);
    }
}

export async function getTeamJoinRequests(teamId: string): Promise<import('../types/team').TeamJoinRequestDto[]> {
    const response = await apiClient.get<import('../types/team').TeamJoinRequestDto[]>(`/api/teams/${teamId}/requests`);
    const data = response.data;
    return Array.isArray(data) ? data : (data as unknown as { items: import('../types/team').TeamJoinRequestDto[] }).items || [];
}

export async function approveJoinRequest(requestId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/teams/requests/${requestId}/approve`, {
        method: 'PUT'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => 'Failed to approve request');
        throw new Error(text);
    }
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/teams/requests/${requestId}/reject`, {
        method: 'PUT'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => 'Failed to reject request');
        throw new Error(text);
    }
}

export async function renameTeam(teamId: string, teamName: string): Promise<TeamDto> {
    const response = await apiClient.put<TeamDto>(`/api/teams/${teamId}/name`, {
        teamName,
    });
    return response.data;
}

export async function deleteTeam(teamId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/teams/${teamId}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => 'Failed to delete team');
        throw new Error(text);
    }
}

// --- Members ---

export async function kickMember(teamId: string, userId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/teams/${teamId}/members/${userId}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => 'Failed to kick member');
        throw new Error(text);
    }
}

export async function leaveTeam(teamId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/teams/${teamId}/leave`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => 'Failed to leave team');
        throw new Error(text);
    }
}

// --- Tournament Teams ---

export async function getTournamentTeams(tournamentId: string): Promise<TeamDto[]> {
    try {
        const response = await apiClient.get<TeamDto[]>(
            `/api/tournament/${tournamentId}/finalTeams`
        );
        const data = response.data;
        return Array.isArray(data) ? data : (data as unknown as { items: TeamDto[] }).items || [];
    } catch {
        return [];
    }
}

export async function getPendingTournamentTeams(tournamentId: string): Promise<TeamDto[]> {
    const response = await apiClient.get<TeamDto[]>(
        `/api/tournament/${tournamentId}/teams`
    );
    const data = response.data;
    return Array.isArray(data) ? data : (data as unknown as { items: TeamDto[] }).items || [];
}

export async function getTeamsToJoin(tournamentId: string): Promise<TeamDto[]> {
    const response = await apiClient.get<TeamDto[]>(
        `/api/tournament/${tournamentId}/teams/me`
    );
    const data = response.data;
    return Array.isArray(data) ? data : (data as unknown as { items: TeamDto[] }).items || [];
}

// --- Match Details ---

export async function getMatchDetails(
    matchId: string
): Promise<TeamMatchDetailsDto> {
    const url = `/api/match/${matchId}/team/details`;
    const response = await apiClient.get<TeamMatchDetailsDto>(url);
    return response.data;
}

// --- Tie-Break ---

// Both tie-break endpoints answer with the team-match Status string and no IsRequired flag,
// while the UI keys its tie-break banner off isRequired — so derive it here. Without this a
// single poll tick (or a submitted nomination) blanks the banner out mid-flow.
function normalizeTieBreakStatus(raw: any): TieBreakStatusDto {
    const status = raw?.status ?? raw?.Status;
    return {
        ...raw,
        isRequired: raw?.isRequired ?? raw?.IsRequired ?? status === 'TieBreakRequired',
        homeRepresentative: raw?.homeRepresentative ?? raw?.HomeRepresentative ?? null,
        awayRepresentative: raw?.awayRepresentative ?? raw?.AwayRepresentative ?? null,
    };
}

export async function submitTieBreakRepresentative(
    teamMatchId: string,
    userId: string
): Promise<TieBreakStatusDto> {
    const response = await apiClient.post<TieBreakStatusDto>(
        `/api/team-matches/${teamMatchId}/tiebreak/representative`,
        { userId }
    );
    return normalizeTieBreakStatus(response.data);
}

export async function getTieBreakStatus(
    teamMatchId: string
): Promise<TieBreakStatusDto> {
    const response = await apiClient.get<TieBreakStatusDto>(
        `/api/team-matches/${teamMatchId}/tiebreak/status`
    );
    return normalizeTieBreakStatus(response.data);
}
