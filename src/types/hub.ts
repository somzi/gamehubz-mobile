export enum HubRole {
    HubOwner = 1,
    HubAdmin = 2,
    HubMember = 3,
    // Privilege sits between Admin and Member: can join exclusive-only tournaments.
    // Mirrors GameHubz.DataModels.Enums.HubRole — keep in sync.
    HubExclusive = 4,
}

export interface HubMember {
    userId: string;
    username: string;
    pushToken?: string;
    avatarUrl?: string;
    hubRole: HubRole;
}
