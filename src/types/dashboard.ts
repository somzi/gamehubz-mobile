export enum HubActivityType {
    TournamentCreated = 1,
    TournamentStarted = 2,
    RegistrationOpen = 3,
    // Add other types as needed based on the backend enum
}

export interface DashboardActivityDto {
    hubName: string;
    message: string;
    tournamentName: string;
    timeAgo: string;
    createdOn: string; // ISO Date string
    type: HubActivityType;
    hubAvatar?: string; // Legacy/Fallback
    hubAvatarUrl?: string; // New direct URL from backend
}
