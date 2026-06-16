import { SocialType } from './auth';

// Mirrors the backend MatchStreamStatus enum.
export enum MatchStreamStatus {
    Live = 1,
    Ended = 2,
}

// The streaming-capable subset of SocialType. Platform values on the wire are SocialType ints
// (YouTube = 5, Twitch = 8, Kick = 9).
export const STREAMING_PLATFORMS: SocialType[] = [
    SocialType.Twitch,
    SocialType.YouTube,
    SocialType.Kick,
];

export interface MatchStream {
    id: string;
    matchId: string;
    streamerUserId: string;
    streamerUsername?: string | null;
    streamerNickname?: string | null;
    streamerAvatarUrl?: string | null;
    platform: SocialType;          // 5 / 8 / 9
    channelHandle: string;
    channelUrl?: string | null;
    status: MatchStreamStatus;
    vodUrl?: string | null;
    vodPending: boolean;           // Ended but no VOD link yet → offer manual entry (mainly Kick)
    startedAt?: string | null;
    endedAt?: string | null;
}
