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

// Platforms temporarily disabled for starting NEW streams (e.g. while waiting on app credentials
// or 2FA). Existing/live streams on these platforms keep playing — only starting a new one is
// blocked. Add a SocialType here to flip a platform off; clear to re-enable.
export const DISABLED_STREAMING_PLATFORMS: SocialType[] = [];

// Platforms a user can currently start a stream on (used to build pickers / quick-pick).
export const ACTIVE_STREAMING_PLATFORMS: SocialType[] = STREAMING_PLATFORMS.filter(
    p => !DISABLED_STREAMING_PLATFORMS.includes(p)
);

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
