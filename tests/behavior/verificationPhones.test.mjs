import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDeclaredFunction, loadFetcher } from './loadFetcher.mjs';

const devices = 'src/lib/deviceIdentity.ts';
const phones = 'src/lib/tournamentVerificationPhones.ts';
const recordings = 'src/lib/resultVerification.ts';
const sheet = 'src/components/match/VerifyResultSheet.tsx';
const pick = (raw, key) => raw?.[key] ?? raw?.[key[0].toUpperCase() + key.slice(1)];
class RequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('an already unlocked registration key is reused without a second biometric prompt', async () => {
    const unlock = loadDeclaredFunction(devices, 'unlockDeviceKey', {
        readSecret: () => assert.fail('second biometric prompt'),
        registerDevice: () => assert.fail('re-registration'),
    });
    assert.equal(await unlock('user', {}, 'fresh-key'), 'fresh-key');
});

test('a stored key is unlocked once and returned for the current attempt', async () => {
    let reads = 0;
    const unlock = loadDeclaredFunction(devices, 'unlockDeviceKey', {
        readSecret: async () => { reads++; return 'stored-key'; },
        registerDevice: () => assert.fail('re-registration'),
    });
    assert.equal(await unlock('user', { unlock: 'prompt' }), 'stored-key');
    assert.equal(reads, 1);
});

test('phone enrollment does not run when biometrics are unavailable', async () => {
    const enroll = loadDeclaredFunction(phones, 'enrollVerificationPhone', {
        isBiometricAvailable: () => false, getDeviceRegistrationBody: () => assert.fail('device read'),
    });
    assert.equal(await enroll('tournament'), null);
});

test('the registration body reads the phone without any biometric-locked item', async () => {
    // Only the plain installation id and the phone description are in scope: touching the locked key
    // here would throw instead of raising a prompt nobody asked for.
    const body = loadDeclaredFunction(devices, 'getDeviceRegistrationBody', {
        getDeviceSnapshot: async () => ({ platform: 'android', deviceModel: 'Pixel 8', deviceBrand: 'Google', osVersion: '15',
            appVersion: '4.0.0', isPhysicalDevice: true, platformDeviceId: 'android-id', appInstalledOn: null }),
        getStoredDeviceId: async () => 'installation',
    });
    assert.deepEqual(await body(), { deviceId: 'installation', platform: 'android', deviceModel: 'Pixel 8', deviceBrand: 'Google',
        osVersion: '15', appVersion: '4.0.0', isPhysicalDevice: true, platformDeviceId: 'android-id', appInstalledOn: null });
});

test('joining records the phone without a biometric prompt and keeps the pending response', async () => {
    const requests = [];
    const enroll = loadDeclaredFunction(phones, 'enrollVerificationPhone', {
        isBiometricAvailable: () => true, pick,
        getDeviceRegistrationBody: async () => ({ deviceId: 'phone', platform: 'ios' }),
        rememberDeviceId: () => assert.fail('the phone already holds its installation id'),
        ENDPOINTS: { VERIFICATION_PHONE: id => `phone/${id}` },
        authenticatedFetch: async (url, init) => {
            requests.push([url, init.method, JSON.parse(init.body)]);
            return { ok: true, json: async () => ({ DeviceId: 'phone', Status: 2 }) };
        },
    });
    assert.equal(await enroll('tournament'), 'pending');
    assert.deepEqual(requests, [['phone/tournament', 'POST', { deviceId: 'phone', platform: 'ios' }]]);
});

test('a phone that never verified keeps the installation id issued at join', async () => {
    const remembered = [];
    const enroll = loadDeclaredFunction(phones, 'enrollVerificationPhone', {
        isBiometricAvailable: () => true, pick,
        getDeviceRegistrationBody: async () => ({ deviceId: null, platform: 'android' }),
        rememberDeviceId: async id => { remembered.push(id); },
        ENDPOINTS: { VERIFICATION_PHONE: () => 'phone' },
        authenticatedFetch: async () => ({ ok: true, json: async () => ({ deviceId: 'issued', status: 'Active' }) }),
    });
    assert.equal(await enroll('tournament'), 'active');
    assert.deepEqual(remembered, ['issued']);
});

test('an old backend without phone binding is skipped and the registration stands', async () => {
    const enroll = loadDeclaredFunction(phones, 'enrollVerificationPhone', {
        isBiometricAvailable: () => true, pick,
        getDeviceRegistrationBody: async () => ({ deviceId: null, platform: 'ios' }),
        rememberDeviceId: () => assert.fail('nothing was issued'),
        ENDPOINTS: { VERIFICATION_PHONE: () => 'phone' },
        authenticatedFetch: async () => ({ ok: false, status: 404 }),
    });
    assert.equal(await enroll('tournament'), null);
});

test('a failing enrollment never rejects the tournament registration', async () => {
    const enroll = loadDeclaredFunction(phones, 'enrollVerificationPhone', {
        isBiometricAvailable: () => true, pick,
        getDeviceRegistrationBody: async () => ({ deviceId: 'phone', platform: 'ios' }),
        ENDPOINTS: { VERIFICATION_PHONE: () => 'phone' },
        authenticatedFetch: async () => { throw new Error('offline'); },
    });
    assert.equal(await enroll('tournament'), null);
});

for (const deviceId of ['approved-phone', 'pending-phone', null]) {
    test(`panel fetch sends its local installation (${deviceId}) without biometric access`, async () => {
        let requested;
        const fetchPanel = loadDeclaredFunction(recordings, 'fetchVerificationPanel', {
            getStoredDeviceId: async () => deviceId,
            ENDPOINTS: { VERIFICATION_PANEL: id => `panel/${id}` },
            normalizePanel: x => x,
            authenticatedFetch: async url => { requested = url; return { ok: true, json: async () => ({}) }; },
        });
        await fetchPanel('match');
        assert.equal(requested, deviceId ? `panel/match?deviceId=${deviceId}` : 'panel/match');
    });
}

test('start over discards the failed attempt and key, then waits for a new recording before biometrics', () => {
    const state = { phase: 'readyForRecording',
        busyRef: { current: false }, sessionRef: { current: 1 },
        verificationIdRef: { current: 'old-attempt' }, recordingRef: { current: 'old-clip' },
        unlockedKeyRef: { current: 'old-key' }, evidenceMessageRef: { current: 'old-message' } };
    const restart = loadFetcher(sheet, 'restartRecording', {
        ...state, useCallback: fn => fn, setRecord() {}, setRecordingMessage() {}, setUploadMessage() {},
        setPhase: phase => { state.phase = phase; },
    });
    restart();
    assert.equal(state.phase, 'recordingInstructions');
    assert.equal(state.sessionRef.current, 2);
    for (const ref of ['verificationIdRef', 'recordingRef', 'unlockedKeyRef', 'evidenceMessageRef']) assert.equal(state[ref].current, null);
});

test('the next game waits for its own recording before opening biometrics', () => {
    const nextGameNeedsRecordingRef = { current: false };
    let continued;
    const upcoming = { gameNumber: 2, seriesNumber: 1 };
    const primary = loadFetcher(sheet, 'primary', {
        phase: 'verified', upcoming, upcomingLabel: 'Game 2', nextGameNeedsRecordingRef,
        t: key => key, onContinue: target => { continued = target; },
    });
    primary.onPress();
    assert.equal(nextGameNeedsRecordingRef.current, true);
    assert.deepEqual(continued, upcoming);
});

test('organizer decisions include the exact reviewed phone to refuse a replaced pending request', async () => {
    let body;
    const decide = loadDeclaredFunction(phones, 'decideVerificationPhone', {
        ENDPOINTS: { VERIFICATION_PHONE_DECISION: (...args) => args.join('/') },
        authenticatedFetch: async (url, init) => { body = [url, JSON.parse(init.body)]; return { ok: true }; },
    });
    await decide('t', { id: 'request', requestedPhone: { userDeviceId: 'reviewed-phone' } }, true);
    assert.deepEqual(body, ['t/request/approve', { userDeviceId: 'reviewed-phone' }]);
});

test('upload carries its signature, server clock correction, and timezone in multipart fields', async () => {
    const fields = new Map();
    const upload = loadDeclaredFunction(recordings, 'uploadVerificationRecording', {
        FormData: class { append(key, value) { fields.set(key, value); } },
        ENDPOINTS: { VERIFICATION_EVIDENCE: id => id },
        authenticatedFetch: async () => ({ ok: true, json: async () => ({ id: 'verified' }) }),
        normalizeRecord: x => x,
    });
    const result = await upload('attempt', { file: { uri: 'video', name: 'result.mp4', type: 'video/mp4' }, durationMs: 30000, recordedOn: '2026-10-05T10:00:00Z', fileName: 'original.mp4' },
        { signature: 'evidence-signature', clockOffsetMs: 125.7, timeZoneOffsetMinutes: 120 });
    assert.equal(result.id, 'verified');
    assert.equal(fields.get('Signature'), 'evidence-signature');
    assert.equal(fields.get('ClockOffsetMs'), '126');
    assert.equal(fields.get('TimeZoneOffsetMinutes'), '120');
    assert.equal(fields.get('RecordedOn'), '2026-10-05T10:00:00Z');
});

function uploadHarness(transport) {
    const state = { phase: null, message: null, verified: [],
        verificationIdRef: { current: 'attempt' }, recordingRef: { current: { fileName: 'clip' } },
        unlockedKeyRef: { current: 'key' }, evidenceMessageRef: { current: 'gamehubz.evidence.v1|attempt' },
        sessionRef: { current: 1 }, busyRef: { current: false } };
    state.run = loadFetcher(sheet, 'upload', {
        ...state, useCallback: fn => fn, t: key => key,
        setPhase: phase => { state.phase = phase; }, setUploadMessage() {},
        setRecordingMessage: message => { state.message = message; }, setRecord() {},
        hapticError() {}, hapticSuccess() {},
        uploadVerificationRecording: transport, signHex: (key, message) => `${key}:${message}`,
        getServerClockOffset: () => 1000, VerificationRequestError: RequestError,
        onVerified: record => state.verified.push(record),
    });
    return state;
}

test('409 asks for another clip on the same attempt and retains the unlocked key for retry', async () => {
    const state = uploadHarness(async () => { throw new RequestError('Record during biometrics', 409); });
    await state.run();
    assert.equal(state.phase, 'readyForRecording');
    assert.equal(state.message, 'Record during biometrics');
    assert.equal(state.recordingRef.current, null);
    assert.equal(state.verificationIdRef.current, 'attempt');
    assert.equal(state.unlockedKeyRef.current, 'key');
    assert.equal(state.busyRef.current, false);
});

test('a successful upload clears the key and signs the evidence message without another biometric prompt', async () => {
    let proof;
    const state = uploadHarness(async (_id, _recording, signed) => { proof = signed; return { id: 'verified' }; });
    await state.run();
    assert.equal(proof.signature, 'key:gamehubz.evidence.v1|attempt');
    assert.equal(proof.clockOffsetMs, 1000);
    assert.equal(state.unlockedKeyRef.current, null);
    assert.equal(state.evidenceMessageRef.current, null);
    assert.equal(state.phase, 'verified');
    assert.deepEqual(state.verified, [{ id: 'verified' }]);
});

test('a late upload response cannot clear the next attempt key or change its screen', async () => {
    const pending = deferred(), state = uploadHarness(() => pending.promise);
    const operation = state.run();
    state.sessionRef.current++;
    state.unlockedKeyRef.current = 'next-attempt-key';
    state.phase = 'authenticating';
    pending.resolve({ id: 'old-proof' });
    await operation;
    assert.equal(state.unlockedKeyRef.current, 'next-attempt-key');
    assert.equal(state.phase, 'authenticating');
    assert.deepEqual(state.verified, [{ id: 'old-proof' }]);
});

test('a pending phone is rejected by Start before the sheet unlocks biometrics', async () => {
    let phase;
    const authenticate = loadFetcher(sheet, 'authenticate', {
        useCallback: fn => fn, busyRef: { current: false }, sessionRef: { current: 1 },
        verificationIdRef: { current: null }, recordingRef: { current: null }, unlockedKeyRef: { current: null }, evidenceMessageRef: { current: null },
        userId: 'user', matchId: 'match', target: { seriesNumber: 1, gameNumber: 1 }, prompts: {}, biometric: 'Face ID', t: key => key,
        setPhase: value => { phase = value; }, setAuthMessage() {}, setUploadMessage() {}, setRecordingMessage() {}, hapticError() {},
        ensureDeviceRegistered: async () => ({ deviceId: 'phone', unlockedSecret: null }), getDeviceDescription: () => ({}),
        startVerification: async () => { throw new RequestError('Needs approval', 400); },
        unlockDeviceKey: () => assert.fail('biometric prompt while pending'),
        VerificationRequestError: RequestError, BiometricError: class extends Error {},
    });
    await authenticate();
    assert.equal(phase, 'authFailed');
});

for (const type of ['verificationPhoneRequested', 'verificationPhoneApproved', 'verificationPhoneRejected']) {
    test(`${type} opens the tournament, with the organizer inbox only for a request`, async () => {
        const route = loadDeclaredFunction('src/lib/notificationRouting.ts', 'routeFromNotification', {
            notificationRefreshSequence: 0,
        });
        let destination;
        await route({ navigate: (name, params) => { destination = { name, params }; } }, { type, tournamentId: 'tournament' });
        assert.equal(destination.name, 'TournamentDetails');
        assert.equal(destination.params.id, 'tournament');
        assert.equal(destination.params.openAdminHelp, type === 'verificationPhoneRequested' ? true : undefined);
        assert.equal(destination.params.notificationRefreshKey, 1);
    });
}

test('the panel reads phone approval state in either API casing and defaults safely on old servers', () => {
    const normalize = loadDeclaredFunction(recordings, 'normalizePanel', { pick, normalizeRecord: x => x });
    assert.equal(normalize({ PhoneApprovalPending: true }).phoneApprovalPending, true);
    assert.equal(normalize({ phoneApprovalPending: false }).phoneApprovalPending, false);
    assert.equal(normalize({}).phoneApprovalPending, false);
});

test('the biometric response preserves the exact evidence message rather than rebuilding it', () => {
    const normalize = loadDeclaredFunction(recordings, 'normalizeRecord', {
        pick, VERIFICATION_STARTED: 0, normalizeDevice: () => null,
    });
    assert.equal(normalize({ EvidenceMessage: 'exact-server-message' }).evidenceMessage, 'exact-server-message');
    assert.equal(normalize({}).evidenceMessage, null);
});

test('the organizer inbox shows each list even when the other one fails to load', async () => {
    const state = {};
    const load = (helpOk, phonesOk) => loadFetcher('src/screens/TournamentDetailsScreen.tsx', 'fetchAdminHelpRequests', {
        requests: { begin: () => () => true }, id: 'T',
        setIsLoadingAdminHelp: value => { state.loading = value; },
        setAdminHelpError: value => { state.error = value; },
        setAdminHelpRequests: value => { state.help = value; },
        setPhoneRequests: value => { state.phones = value; },
        authenticatedFetch: async () => helpOk
            ? { ok: true, json: async () => [{ matchId: 'M1' }] }
            : { ok: false, text: async () => 'help down' },
        ENDPOINTS: { GET_ADMIN_HELP_REQUESTS: id => id },
        fetchPendingVerificationPhones: async () => { if (!phonesOk) throw new Error('phones down'); return [{ id: 'P1' }]; },
        getErrorMessage: error => error.message, t: key => key,
    });

    await load(true, false)();
    assert.deepEqual(state.help.map(item => item.matchId), ['M1'], 'help requests still show');
    assert.equal(state.error, 'phones down');
    assert.equal(state.loading, false);

    Object.keys(state).forEach(key => delete state[key]);
    await load(false, true)();
    assert.deepEqual(state.phones.map(item => item.id), ['P1'], 'phone requests still show');
    assert.equal(state.error, 'help down');
});
