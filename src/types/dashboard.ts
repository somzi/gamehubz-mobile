/** Mirrors the backend HubActivityType (GameHubz.DataModels.Enums), sent as its number. */
export enum HubActivityType {
    TournamentAnnounced = 1,
    RegistrationOpen = 2,
    TournamentLive = 3,
    TournamentCompleted = 4,
    TournamentCanceled = 5,
    TournamentDeleted = 6,
}

export interface DashboardActivityDto {
    hubName: string;
    message: string;
    tournamentId?: string;
    tournamentName: string;
    timeAgo: string;
    createdOn: string; // ISO Date string
    type: HubActivityType;
    hubAvatar?: string; // Legacy/Fallback
    hubAvatarUrl?: string; // New direct URL from backend
}
