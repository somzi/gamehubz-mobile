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

export async function submitTieBreakRepresentative(
    teamMatchId: string,
    userId: string
): Promise<TieBreakStatusDto> {
    const response = await apiClient.post<TieBreakStatusDto>(
        `/api/team-matches/${teamMatchId}/tiebreak/representative`,
        { userId }
    );
    return response.data;
}

export async function getTieBreakStatus(
    teamMatchId: string
): Promise<TieBreakStatusDto> {
    const response = await apiClient.get<TieBreakStatusDto>(
        `/api/team-matches/${teamMatchId}/tiebreak/status`
    );
    return response.data;
}
