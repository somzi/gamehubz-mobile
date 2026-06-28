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
    /** Results an opponent proposed that this user must confirm/dispute (approval mode). */
    resultsToConfirm: number;
    /** Pending team join requests on teams where the user is captain. */
    teamJoinRequests: number;
    /** Pending hub join requests in hubs the user owns or admins. */
    hubJoinRequests: number;
    /** Open match "admin help" requests in tournaments the user manages. */
    adminHelpRequests: number;
    /** Pending tournament registrations awaiting approval in the user's hubs. */
    pendingRegistrations: number;
    /** Matches with a proposed result awaiting the organizer's approval in the user's hubs. */
    pendingResultApprovals: number;
    socialTotal: number;
    /** unreadMatchMessages + matchesToSchedule + resultsToConfirm */
    matchesTotal: number;
    /** teamJoinRequests + hubJoinRequests + adminHelpRequests + pendingRegistrations + pendingResultApprovals */
    organizerTotal: number;
    /** hubJoinRequests + adminHelpRequests + pendingRegistrations + pendingResultApprovals (drives the
     *  Hubs-tab dot; equals the sum of the per-hub counts in ApprovalsBreakdown). */
    hubManageTotal: number;
}

/** Per-hub total pending approvals (hub joins + its tournaments' items). */
export interface HubApprovalCount {
    hubId: string;
    count: number;
    /** Hub-level join requests only (the Members-tab portion); Tournaments tab = count - joinRequests. */
    joinRequests: number;
}

/** Per-tournament pending approvals, split so the Requests/Registrations tab can show just registrations. */
export interface TournamentApprovalCount {
    tournamentId: string;
    hubId: string;
    /** Raw TournamentStatus int — 3 = Live, 4 = Past/Completed, else Upcoming. */
    status: number;
    registrations: number;
    adminHelp: number;
    /** Matches with a proposed result awaiting the organizer's approval (approval-mode tournaments). */
    resultApprovals: number;
    /** registrations + adminHelp + resultApprovals — the tournament's full pending-approval count. */
    total: number;
}

/**
 * Drives the cascade badges: which hub card / tournament / Requests tab has items waiting.
 * Mirrors backend ApprovalsBreakdownDto. Fetched from GET /api/v2/badges/approvals.
 */
export interface ApprovalsBreakdown {
    hubs: HubApprovalCount[];
    tournaments: TournamentApprovalCount[];
}
