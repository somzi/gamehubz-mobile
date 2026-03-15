export enum RegionType {
    NA = 1,
    EUROPE = 2,
    ASIA = 3,
    SA = 4,
    AFRICA = 5,
    OCEANIA = 6,
    ALL = 7
}

export enum SocialType {
    Instagram = 1,
    X = 2,
    Facebook = 3,
    TikTok = 4,
    YouTube = 5,
    Discord = 6,
    Telegram = 7,
}

export interface UserSocial {
    id?: string;
    socialType?: SocialType; // Keep for internal use/Edit
    type?: SocialType;       // Added for compatibility with info endpoint
    username: string;
}

export interface HubSocial {
    id?: string;
    socialType?: SocialType;
    type?: SocialType;
    username: string;
    hubId?: string;
}

export interface MatchComment {
    id: string;
    userId: string;
    userNickname: string;
    userAvatarUrl?: string;
    content: string;
    sentAt: string;
}

export interface UserInfo {
    id: string;
    username: string;
    nickName?: string;
    region: RegionType;
    userSocials: UserSocial[];
    avatarUrl?: string;
}

export interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userRoleId: string;
    userRoleDisplayName: string;
    userRoleSystemName: string;
    avatarUrl?: string;
    language: string | null;
    username: string;
    nickName?: string;
    region: RegionType;
    userHubs: any[];
    tournamentRegistrations: any[];
    matches: any[];
    userSocials: UserSocial[];
    tournamentParticipants: any[];
}

export interface AuthResponse {
    isSuccessful: boolean;
    messages: string[];
    accessToken: {
        token: string;
        expiresIn: number;
    };
    user: User;
    refreshToken: string;
    isUserVerified: boolean;
}

export interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}
