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
    Twitch = 8,
    Kick = 9,
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

export interface Country {
    code: string;       // ISO 3166-1 alpha-2, e.g. "RS"
    name: string;       // e.g. "Serbia"
    flag: string;       // emoji, e.g. "🇷🇸"
    region: RegionType; // region the country belongs to
}

export interface UserInfo {
    id: string;
    username: string;
    nickName?: string;
    region: RegionType;
    country?: string | null;     // ISO code, null when not set
    countryName?: string | null; // display name (from backend catalog)
    countryFlag?: string | null; // flag emoji (from backend catalog)
    userSocials: UserSocial[];
    avatarUrl?: string;
    // Discord bot link (only present on the caller's OWN profile; stripped for others)
    discordUsername?: string | null;
    discordDmEnabled?: boolean;
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
    country?: string | null;     // ISO code, null when not set
    countryName?: string | null; // display name (from backend catalog)
    countryFlag?: string | null; // flag emoji (from backend catalog)
    userHubs: any[];
    tournamentRegistrations: any[];
    matches: any[];
    userSocials: UserSocial[];
    tournamentParticipants: any[];
    // Discord bot link (populated from GET_USER_INFO for the logged-in user)
    discordUsername?: string | null;
    discordDmEnabled?: boolean;
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
