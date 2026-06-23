export enum FriendRequestStatus {
    Pending = 0,
    Accepted = 1,
    Rejected = 2,
    Cancelled = 3,
}

export enum FriendRelationStatus {
    None = 0,
    Friends = 1,
    OutgoingRequest = 2,
    IncomingRequest = 3,
    BlockedByMe = 4,
    BlockedByOther = 5,
    Self = 6,
}

export interface Friend {
    userId: string;
    username: string;
    nickname?: string | null;
    avatarUrl?: string | null;
    friendsSince: string;
}

export interface FriendRequest {
    id: string;
    fromUserId: string;
    fromUsername: string;
    fromNickname?: string | null;
    fromAvatarUrl?: string | null;
    toUserId: string;
    toUsername: string;
    toNickname?: string | null;
    toAvatarUrl?: string | null;
    status: FriendRequestStatus;
    createdOn: string;
}

export interface FriendRelationStatusInfo {
    otherUserId: string;
    status: FriendRelationStatus;
    requestId?: string | null;
}

export interface BlockedUser {
    userId: string;
    username: string;
    avatarUrl?: string | null;
    blockedAt: string;
}

export interface DirectChat {
    id: string;
    otherUserId: string;
    otherUsername: string;
    otherNickname?: string | null;
    otherAvatarUrl?: string | null;
    lastMessage?: string | null;
    lastMessageAt?: string | null;
    lastMessageSenderId?: string | null;
    unreadCount: number;
}

export interface DirectMessage {
    id: string;
    chatId: string;
    senderId: string;
    senderUsername: string;
    senderAvatarUrl?: string | null;
    content: string;
    sentAt: string;
    isRead: boolean;
}

/**
 * Aggregate unread / pending counters driving the notification badges
 * (bottom tabs + Social sub-tabs). Mirrors backend BadgeCountsDto.
 */
export interface BadgeCounts {
    friendRequests: number;
    unreadDirectMessages: number;
    unreadMatchMessages: number;
    matchesWithUnreadChat: number;
    matchesToSchedule: number;
    socialTotal: number;
    matchesTotal: number;
}
