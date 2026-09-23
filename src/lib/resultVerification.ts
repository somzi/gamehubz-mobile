import * as ImagePicker from 'expo-image-picker';
import { authenticatedFetch, ENDPOINTS } from './api';
import {
    EvidenceItem,
    EVIDENCE_IMAGE,
    EVIDENCE_VIDEO,
    MAX_VIDEO_DURATION_SECONDS,
    PreparedEvidence,
    EvidenceRejectionReason,
    isVideoEvidenceSupported,
    prepareEvidenceForUpload,
} from './evidence';
import { readVideoRecordedAt } from './videoMetadata';

/**
 * "Verify Result" — the client half of the server's MatchVerificationService.
 *
 *   register phone (once) → start (server challenge) → biometric unlock signs it → recording uploads
 *
 * Each step is a separate request on purpose: the server stamps each one with its own clock, and the
 * record it builds is only complete — only counts for the result gate — once all of them landed on the
 * same attempt, in that order.
 */

/** Mirrors the server's MatchVerificationStatus. */
export const VERIFICATION_STARTED = 0;
export const VERIFICATION_BIOMETRIC_OK = 1;
export const VERIFICATION_VERIFIED = 2;
export const VERIFICATION_FAILED = 3;

export type VerificationFlag = 'newDevice' | 'freshKey' | 'sharedDevice' | 'emulator' | 'oldRecording';

/** Another account registered on the phone a verification came from. Organizer view only. */
export interface VerificationDeviceAccount {
    userId: string;
    username: string;
    avatarUrl: string | null;
    /** When that account first registered on this phone. */
    firstSeenOn: string | null;
    /** It was on this phone before the account that verified — the phone is more likely theirs. */
    cameFirst: boolean;
}

export interface VerificationDevice {
    deviceId: string;
    platform: string;
    deviceModel: string | null;
    osVersion: string | null;
    appVersion: string | null;
    isPhysicalDevice: boolean;
    firstSeenOn: string | null;
    keyIssuedOn: string | null;
    otherAccountsOnDevice: number;
    /** Those accounts by name, earliest on the phone first. Empty outside the organizer view. */
    otherAccounts: VerificationDeviceAccount[];
    accountDeviceCount: number;
}

export interface VerificationRecord {
    /** Null for a player who has not verified — the row is still drawn, with their name. */
    id: string | null;
    userId: string;
    username: string;
    avatarUrl: string | null;
    status: number;
    biometricVerified: boolean;
    startedOn: string | null;
    biometricVerifiedOn: string | null;
    verifiedOn: string | null;
    evidence: EvidenceItem | null;
    evidenceExpired: boolean;
    evidenceDurationMs: number | null;
    recordedOn: string | null;
    failureReason: string | null;
    /** The organizer's view, and the player's own record. */
    device: VerificationDevice | null;
    /** Organizer view only. */
    flags: VerificationFlag[];
}

export interface VerificationPanel {
    matchId: string;
    required: boolean;
    canVerify: boolean;
    /** The server would refuse this viewer's report right now. Never re-derived on the client. */
    reportBlocked: boolean;
    isManager: boolean;
    mine: VerificationRecord | null;
    records: VerificationRecord[];
}

/** A step the server refused, carrying its (localized) reason. */
export class VerificationRequestError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
        this.name = 'VerificationRequestError';
    }
}

const pick = (source: any, camel: string) =>
    source?.[camel] ?? source?.[camel.charAt(0).toUpperCase() + camel.slice(1)];

function normalizeDevice(raw: any): VerificationDevice | null {
    if (!raw) return null;
    return {
        deviceId: pick(raw, 'deviceId') ?? '',
        platform: pick(raw, 'platform') ?? '',
        deviceModel: pick(raw, 'deviceModel') ?? null,
        osVersion: pick(raw, 'osVersion') ?? null,
        appVersion: pick(raw, 'appVersion') ?? null,
        isPhysicalDevice: pick(raw, 'isPhysicalDevice') ?? true,
        firstSeenOn: pick(raw, 'firstSeenOn') ?? null,
        keyIssuedOn: pick(raw, 'keyIssuedOn') ?? null,
        otherAccountsOnDevice: pick(raw, 'otherAccountsOnDevice') ?? 0,
        otherAccounts: ((pick(raw, 'otherAccounts') ?? []) as any[]).map(account => ({
            userId: pick(account, 'userId') ?? '',
            username: pick(account, 'username') ?? '',
            avatarUrl: pick(account, 'avatarUrl') ?? null,
            firstSeenOn: pick(account, 'firstSeenOn') ?? null,
            cameFirst: Boolean(pick(account, 'cameFirst')),
        })),
        accountDeviceCount: pick(raw, 'accountDeviceCount') ?? 0,
    };
}

export function normalizeRecord(raw: any): VerificationRecord {
    const evidence = pick(raw, 'evidence');
    return {
        id: pick(raw, 'id') ?? null,
        userId: pick(raw, 'userId') ?? '',
        username: pick(raw, 'username') ?? '',
        avatarUrl: pick(raw, 'avatarUrl') ?? null,
        status: Number(pick(raw, 'status') ?? VERIFICATION_STARTED),
        biometricVerified: Boolean(pick(raw, 'biometricVerified')),
        startedOn: pick(raw, 'startedOn') ?? null,
        biometricVerifiedOn: pick(raw, 'biometricVerifiedOn') ?? null,
        verifiedOn: pick(raw, 'verifiedOn') ?? null,
        evidence: evidence && pick(evidence, 'url')
            ? {
                url: pick(evidence, 'url'),
                mediaType: Number(pick(evidence, 'mediaType')) === EVIDENCE_VIDEO ? EVIDENCE_VIDEO : EVIDENCE_IMAGE,
            }
            : null,
        evidenceExpired: Boolean(pick(raw, 'evidenceExpired')),
        evidenceDurationMs: pick(raw, 'evidenceDurationMs') ?? null,
        recordedOn: pick(raw, 'recordedOn') ?? null,
        failureReason: pick(raw, 'failureReason') ?? null,
        device: normalizeDevice(pick(raw, 'device')),
        flags: (pick(raw, 'flags') ?? []) as VerificationFlag[],
    };
}

export function normalizePanel(raw: any): VerificationPanel {
    const mine = pick(raw, 'mine');
    return {
        matchId: pick(raw, 'matchId') ?? '',
        required: Boolean(pick(raw, 'required')),
        canVerify: Boolean(pick(raw, 'canVerify')),
        reportBlocked: Boolean(pick(raw, 'reportBlocked')),
        isManager: Boolean(pick(raw, 'isManager')),
        mine: mine ? normalizeRecord(mine) : null,
        records: (pick(raw, 'records') ?? []).map(normalizeRecord),
    };
}

export const isVerified = (record: VerificationRecord | null | undefined) =>
    !!record && record.status === VERIFICATION_VERIFIED;

async function failWith(response: Response): Promise<never> {
    const text = await response.text().catch(() => '');
    throw new VerificationRequestError(text, response.status);
}

export async function fetchVerificationPanel(matchId: string): Promise<VerificationPanel | null> {
    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_PANEL(matchId));
    if (!response.ok) return null;
    return normalizePanel(await response.json());
}

export interface VerificationChallenge {
    verificationId: string;
    /** The exact string to sign — built by the server, never re-assembled here. */
    message: string;
    expiresOn: string | null;
}

export async function startVerification(
    matchId: string,
    deviceId: string,
    device: { deviceModel: string | null; osVersion: string | null; appVersion: string | null },
): Promise<VerificationChallenge> {
    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_START(matchId), {
        method: 'POST',
        // The phone's current description rides along, so the record says what it is today rather than
        // what it was when it registered.
        body: JSON.stringify({ deviceId, ...device }),
    });
    if (!response.ok) return failWith(response);

    const data = await response.json();
    const verificationId = pick(data, 'verificationId');
    const message = pick(data, 'message');
    if (!verificationId || !message) throw new VerificationRequestError('');

    return { verificationId, message, expiresOn: pick(data, 'expiresOn') ?? null };
}

export async function submitBiometricProof(verificationId: string, signature: string): Promise<VerificationRecord> {
    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_BIOMETRIC(verificationId), {
        method: 'POST',
        body: JSON.stringify({ signature }),
    });
    if (!response.ok) return failWith(response);
    return normalizeRecord(await response.json());
}

/** A recording picked, measured and compressed — ready to be sent, and re-sent on a retry. */
export interface PreparedRecording {
    file: PreparedEvidence;
    durationMs: number | null;
    /** From the clip's own metadata, read before compression rewrote the file. */
    recordedOn: string | null;
    fileName: string | null;
}

export type RecordingPickResult =
    | { kind: 'picked'; recording: PreparedRecording }
    | { kind: 'cancelled' }
    | { kind: 'permission' }
    | { kind: 'rejected'; reason: EvidenceRejectionReason };

/**
 * Library picker for the one clip that verifies the result: videos only, a single file. It is the
 * same compression path ordinary evidence goes through, so the server's per-file cap and the
 * organizer's player see exactly what they already know.
 */
export async function pickVerificationRecording(
    onPreparing: () => void,
    onProgress: (progress: number) => void,
): Promise<RecordingPickResult> {
    if (!isVideoEvidenceSupported()) return { kind: 'rejected', reason: 'unsupported' };

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') return { kind: 'permission' };

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        quality: 1,
        videoMaxDuration: MAX_VIDEO_DURATION_SECONDS,
    });

    if (result.canceled || !result.assets?.length) return { kind: 'cancelled' };

    const asset = result.assets[0];
    // Read from the original: compression writes a new file with a new creation time.
    const recordedAt = readVideoRecordedAt(asset.uri);

    onPreparing();
    const { prepared, rejected } = await prepareEvidenceForUpload([asset], (_index, progress) => onProgress(progress));

    if (prepared.length === 0) {
        return { kind: 'rejected', reason: rejected[0]?.reason ?? 'failed' };
    }

    return {
        kind: 'picked',
        recording: {
            file: prepared[0],
            durationMs: asset.duration ? Math.round(asset.duration) : null,
            recordedOn: recordedAt ? recordedAt.toISOString() : null,
            fileName: asset.fileName ?? null,
        },
    };
}

export async function uploadVerificationRecording(
    verificationId: string,
    recording: PreparedRecording,
): Promise<VerificationRecord> {
    const form = new FormData();
    // @ts-ignore React Native's FormData takes a { uri, name, type } file descriptor.
    form.append('file', { uri: recording.file.uri, name: recording.file.name, type: recording.file.type });
    if (recording.durationMs != null) form.append('DurationMs', String(recording.durationMs));
    if (recording.recordedOn) form.append('RecordedOn', recording.recordedOn);
    if (recording.fileName) form.append('FileName', recording.fileName);

    const response = await authenticatedFetch(ENDPOINTS.VERIFICATION_EVIDENCE(verificationId), {
        method: 'POST',
        body: form,
    });
    if (!response.ok) return failWith(response);
    return normalizeRecord(await response.json());
}
