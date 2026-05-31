export enum HubRole {
    HubOwner = 1,
    HubAdmin = 2,
    HubMember = 3,
}

export interface HubMember {
    userId: string;
    username: string;
    pushToken?: string;
    hubRole: HubRole;
}
