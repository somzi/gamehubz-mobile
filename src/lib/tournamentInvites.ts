import { ENDPOINTS, authenticatedFetch, getErrorMessage } from './api';

// Mirrors GameHubz.DataModels.Enums.TournamentInviteKind / TournamentInviteStatus (by value).
export enum TournamentInviteKind {
    Entry = 1,
    Swap = 2,
}

export enum TournamentInviteStatus {
    Pending = 1,
    Accepted = 2,
    Declined = 3,
    Cancelled = 4,
    Expired = 5,
}

/** A player the organizer can invite, as the picker lists them. */
export interface InviteCandidate {
    userId: string;
    username: string;
    nickname?: string | null;
    avatarUrl?: string | null;
    country?: string | null;
    /** Inside the tournament's country / region / exclusive scope. False = only as a guest. */
    meetsRequirements: boolean;
    /** A declined player can't be invited into the same tournament again. */
    inviteState: 'none' | 'pending' | 'declined';
}

/** One invite in the organizer's list (status as it stands now — a closed tournament's open invite reads Expired). */
export interface TournamentInvite {
    id: string;
    tournamentId: string;
    userId: string;
    username: string;
    avatarUrl?: string | null;
    kind: TournamentInviteKind;
    status: TournamentInviteStatus;
    isGuest: boolean;
    swapOutgoingUserId?: string | null;
    swapOutgoingUsername?: string | null;
    createdOn: string;
    respondedOn?: string | null;
}

/** The signed-in player's invite to one tournament — what the banner on the tournament screen renders. */
export interface MyTournamentInvite {
    id: string;
    kind: TournamentInviteKind;
    status: TournamentInviteStatus;
    isGuest: boolean;
    invitedByUsername?: string | null;
    swapOutgoingUsername?: string | null;
    swapPlayedMatches: number;
    isTournamentFull: boolean;
    registrationNotOpenYet: boolean;
}

export type InviteSendOutcome =
    | 'sent'
    | 'alreadyInvited'
    | 'alreadyIn'
    | 'declinedBefore'
    | 'banned'
    | 'needsGuest'
    | 'notFound';

export interface InviteSendItem {
    userId: string;
    username: string;
    outcome: InviteSendOutcome;
}

const unwrap = <T,>(data: any): T => (data?.result ?? data) as T;

async function failure(response: Response): Promise<Error> {
    const text = await response.text().catch(() => '');
    return new Error(getErrorMessage(text || undefined));
}

export async function fetchInviteCandidates(
    tournamentId: string,
    search: string,
    onlyEligible: boolean,
    pageNumber: number,
): Promise<InviteCandidate[]> {
    const response = await authenticatedFetch(ENDPOINTS.TOURNAMENT_INVITE_CANDIDATES(tournamentId, search, onlyEligible, pageNumber));
    if (!response.ok) throw await failure(response);
    return unwrap<InviteCandidate[]>(await response.json()) ?? [];
}

export async function fetchTournamentInvites(tournamentId: string): Promise<TournamentInvite[]> {
    const response = await authenticatedFetch(ENDPOINTS.TOURNAMENT_INVITES(tournamentId));
    if (!response.ok) throw await failure(response);
    return unwrap<TournamentInvite[]>(await response.json()) ?? [];
}

export async function sendTournamentInvites(
    tournamentId: string,
    invites: { userId: string; asGuest: boolean }[],
): Promise<InviteSendItem[]> {
    const response = await authenticatedFetch(ENDPOINTS.TOURNAMENT_INVITES(tournamentId), {
        method: 'POST',
        body: JSON.stringify({ invites }),
    });
    if (!response.ok) throw await failure(response);
    return unwrap<{ items: InviteSendItem[] }>(await response.json())?.items ?? [];
}

/** Null when the player was never invited (the server answers 204 / null). */
export async function fetchMyTournamentInvite(tournamentId: string): Promise<MyTournamentInvite | null> {
    const response = await authenticatedFetch(ENDPOINTS.MY_TOURNAMENT_INVITE(tournamentId));
    if (response.status === 204) return null;
    if (!response.ok) throw await failure(response);

    const text = await response.text();
    if (!text || text === 'null') return null;
    return unwrap<MyTournamentInvite | null>(JSON.parse(text));
}

async function postInviteAction(url: string): Promise<void> {
    const response = await authenticatedFetch(url, { method: 'POST' });
    if (!response.ok) throw await failure(response);
}

export const acceptTournamentInvite = (inviteId: string) => postInviteAction(ENDPOINTS.ACCEPT_TOURNAMENT_INVITE(inviteId));
export const declineTournamentInvite = (inviteId: string) => postInviteAction(ENDPOINTS.DECLINE_TOURNAMENT_INVITE(inviteId));
export const cancelTournamentInvite = (inviteId: string) => postInviteAction(ENDPOINTS.CANCEL_TOURNAMENT_INVITE(inviteId));
