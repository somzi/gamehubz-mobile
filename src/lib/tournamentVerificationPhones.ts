import { authenticatedFetch, ENDPOINTS } from './api';
import { getDeviceRegistrationBody, isBiometricAvailable, rememberDeviceId } from './deviceIdentity';
import { VerificationDeviceAccount, VerificationRequestError } from './resultVerification';

export interface TournamentPhone {
    userDeviceId: string;
    platform: string;
    deviceModel: string | null;
}

export interface TournamentPhoneRequest {
    id: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    activePhone: TournamentPhone | null;
    requestedPhone: TournamentPhone;
    requestedOn: string | null;
    otherAccounts: VerificationDeviceAccount[];
}

const pick = (raw: any, key: string) => raw?.[key] ?? raw?.[key[0].toUpperCase() + key.slice(1)];
const normalizePhone = (raw: any): TournamentPhone => ({
    userDeviceId: pick(raw, 'userDeviceId') ?? '',
    platform: pick(raw, 'platform') ?? '',
    deviceModel: pick(raw, 'deviceModel') ?? null,
});

export function normalizePhoneRequest(raw: any): TournamentPhoneRequest {
    return {
        id: pick(raw, 'id') ?? '',
        userId: pick(raw, 'userId') ?? '',
        username: pick(raw, 'username') ?? '',
        avatarUrl: pick(raw, 'avatarUrl') ?? null,
        activePhone: pick(raw, 'activePhone') ? normalizePhone(pick(raw, 'activePhone')) : null,
        requestedPhone: normalizePhone(pick(raw, 'requestedPhone')),
        requestedOn: pick(raw, 'requestedOn') ?? null,
        otherAccounts: (pick(raw, 'otherAccounts') ?? []).map((account: any) => ({
            userId: pick(account, 'userId') ?? '',
            username: pick(account, 'username') ?? '',
            avatarUrl: pick(account, 'avatarUrl') ?? null,
            firstSeenOn: pick(account, 'firstSeenOn') ?? null,
            cameFirst: Boolean(pick(account, 'cameFirst')),
        })),
    };
}

export async function fetchPendingVerificationPhones(tournamentId: string): Promise<TournamentPhoneRequest[]> {
    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_PHONES_PENDING(tournamentId));
    // During rollout the preceding backend version has no phone inbox yet.
    if (response.status === 404) return [];
    if (!response.ok) throw new VerificationRequestError(await response.text(), response.status);
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map(normalizePhoneRequest);
}

export async function decideVerificationPhone(tournamentId: string, request: TournamentPhoneRequest, approve: boolean): Promise<void> {
    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_PHONE_DECISION(tournamentId, request.id, approve ? 'approve' : 'reject'), {
        method: 'POST',
        // Refuse a stale decision if the player replaced the requested phone while this card was open.
        body: JSON.stringify({ userDeviceId: request.requestedPhone.userDeviceId }),
    });
    if (!response.ok) throw new VerificationRequestError(await response.text(), response.status);
}

/**
 * Records which phone registered, AFTER a successful join. No Face ID / fingerprint here: that is asked
 * only when a match result is verified. Best effort: a failure never undoes the registration, and the
 * first verification runs the same server rule.
 */
export async function enrollVerificationPhone(tournamentId: string): Promise<'active' | 'pending' | null> {
    // A phone that cannot unlock a verification key could never verify. Binding it would only make the
    // phone the player does verify from wait for organizer approval.
    if (!isBiometricAvailable()) return null;
    try {
        const body = await getDeviceRegistrationBody();
        const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_PHONE(tournamentId), {
            method: 'POST', body: JSON.stringify(body),
        });
        // Older servers have no phone binding. The first verification binds the phone when supported.
        if (!response.ok) return null;
        const data = await response.json();
        // A phone that never verified gets its installation id here. Its first verification registers
        // with it, and the server issues the key on the same row this binding points at.
        const deviceId = pick(data, 'deviceId');
        if (!body.deviceId && typeof deviceId === 'string' && deviceId) await rememberDeviceId(deviceId);
        const status = pick(data, 'status');
        return status === 2 || status === 'Pending' ? 'pending' : status === 1 || status === 'Active' ? 'active' : null;
    } catch {
        return null;
    }
}
