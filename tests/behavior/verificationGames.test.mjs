import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
import { loadDeclaredFunction, loadFetcher } from './loadFetcher.mjs';

const {
    buildVerificationSlots, verificationBlocksReport, nextVerificationTarget, gameIsVerified,
    gamesToProve, shortestNextSeries, numberGames, verificationGameKey, WHOLE_MATCH, VERIFICATION_FAILED,
} = await load('verificationGames');

const proof = (gameNumber, { userId = 'me', seriesNumber = 1, status = 2 } = {}) =>
    ({ id: `${userId}-${seriesNumber}-${gameNumber}`, seriesNumber, gameNumber, userId, status });
const game = (gameNumber, { verified = false, seriesNumber = 1, records = [] } = {}) => ({
    seriesNumber, gameNumber, canVerify: !verified,
    mine: verified ? proof(gameNumber, { seriesNumber }) : null, records,
});
const panel = (games = [], extra = {}) => ({
    matchId: 'a', required: true, canVerify: true, isManager: false, reportBlocked: false,
    mine: games[0]?.mine ?? null, records: games[0]?.records ?? [], games, ...extra,
});
const bo = (bestOf, condition = 0, tiebreakBestOf = null) => ({ bestOf, tiebreakBestOf, condition });
const win = (seriesNumber = 1) => ({ seriesNumber, homeScore: 1, awayScore: 0 });
const loss = (seriesNumber = 1) => ({ seriesNumber, homeScore: 0, awayScore: 1 });
const roles = slots => slots.map(slot => slot.role);

test('before any score a Bo3 asks for the two games every result needs; the third waits', () => {
    const slots = buildVerificationSlots(panel([game(1), game(2), game(3)]), bo(3), [], false);
    assert.deepEqual(roles(slots), ['required', 'required', 'optional']);
    assert.deepEqual(nextVerificationTarget(slots), { seriesNumber: 1, gameNumber: 1 });
});

test('total score plays every game, so a Bo2 or Bo3 under it needs them all from the start', () => {
    assert.deepEqual(roles(buildVerificationSlots(panel([game(1), game(2)]), bo(2, 1), [], false)), ['required', 'required']);
    assert.deepEqual(roles(buildVerificationSlots(panel([game(1), game(2), game(3)]), bo(3, 1), [], false)), ['required', 'required', 'required']);
});

test('with two games verified the card moves on to nothing — the third is only played at 1:1', () => {
    const slots = buildVerificationSlots(panel([game(1, { verified: true }), game(2, { verified: true }), game(3)]), bo(3), [], false);
    assert.equal(nextVerificationTarget(slots), null);
    assert.equal(slots[2].role, 'optional');
});

test('a closed match with no games — a no-show — asks for nothing', () => {
    const slots = buildVerificationSlots(panel([game(1), game(2), game(3)]), bo(3), [], true);
    assert.deepEqual(roles(slots), ['notPlayed', 'notPlayed', 'notPlayed']);
    assert.equal(nextVerificationTarget(slots), null);
});

test('a 2:0 result leaves the third game unplayed, even when a stray proof landed on it', () => {
    const stray = game(3, { verified: true, records: [proof(3), { ...proof(3, { userId: 'opponent' }), status: VERIFICATION_FAILED }] });
    const slots = buildVerificationSlots(panel([game(1), game(2), stray]), bo(3), [win(), win()], true);
    assert.deepEqual(roles(slots), ['required', 'required', 'notPlayed']);
    assert.deepEqual(slots.map(slot => slot.score?.homeScore ?? null), [1, 1, null]);
});

test('a series still being typed needs its next game: 1:1 in a Bo3 makes the third certain', () => {
    const slots = buildVerificationSlots(panel([game(1), game(2), game(3)]), bo(3), [win(), loss()], false);
    assert.deepEqual(roles(slots), ['required', 'required', 'required']);
    const bo5 = buildVerificationSlots(panel([1, 2, 3, 4, 5].map(n => game(n))), bo(5), [win()], false);
    assert.deepEqual(roles(bo5), ['required', 'required', 'required', 'optional', 'optional']);
});

test('a parked tiebreak only asks for the tiebreak — the level series is on record', () => {
    const level = [{ seriesNumber: 1, homeScore: 1, awayScore: 1 }];
    const p = panel([game(1), game(1, { seriesNumber: 2 })]);
    const slots = buildVerificationSlots(p, bo(1), level, true, level);
    assert.deepEqual(slots.map(slot => [slot.seriesNumber, slot.gameNumber, slot.role]), [[1, 1, 'recorded'], [2, 1, 'required']]);
    assert.deepEqual(nextVerificationTarget(slots), { seriesNumber: 2, gameNumber: 1 });

    assert.equal(verificationBlocksReport(p, bo(1), [...level, loss(2)], level), true, 'the tiebreak is not proven yet');
    p.games[1] = game(1, { seriesNumber: 2, verified: true });
    assert.equal(verificationBlocksReport(p, bo(1), [...level, loss(2)], level), false);
    assert.equal(verificationBlocksReport(p, bo(1), [{ seriesNumber: 1, homeScore: 2, awayScore: 2 }, loss(2)], level), true,
        'a rewritten main series is a new claim, and needs its own proof');
});

test('the report gate follows the typed score, and before one the shortest series', () => {
    const p = panel([game(1, { verified: true }), game(2, { verified: true }), game(3)], { reportBlocked: true });
    assert.equal(verificationBlocksReport(p, bo(3), [win(), win()]), false);
    assert.equal(verificationBlocksReport(p, bo(3), [win(), loss(), win()]), true, 'a deciding third game cannot borrow the first two proofs');
    assert.equal(verificationBlocksReport(p, bo(3), []), false, 'two proofs cover the shortest Bo3, whatever the stale flag says');
});

test('a Bo1 unlocks the moment its proof lands, without waiting for the panel to come back', () => {
    const p = panel([game(1)], { reportBlocked: true });
    assert.equal(verificationBlocksReport(p, bo(1), []), true);
    p.games[0] = game(1, { verified: true });
    assert.equal(verificationBlocksReport(p, bo(1), []), false);
});

test('a whole-match proof from an older app covers every game, a typed tiebreak included', () => {
    const whole = { ...proof(WHOLE_MATCH, { seriesNumber: WHOLE_MATCH }), seriesNumber: WHOLE_MATCH, gameNumber: WHOLE_MATCH };
    const p = panel([1, 2, 3].map(n => ({ ...game(n), canVerify: false, mine: whole })));
    assert.equal(verificationBlocksReport(p, bo(3), [win(), loss(), { seriesNumber: 1, homeScore: 1, awayScore: 1 }, win(2)]), false);
    const slots = buildVerificationSlots(p, bo(3), [], false);
    assert.equal(nextVerificationTarget(slots), null);
});

test('a server from before per-game proofs is left to judge its own one proof per match', () => {
    const legacy = { ...panel(), mine: proof(1), records: [proof(1)], canVerify: false, games: [] };
    assert.equal(verificationBlocksReport({ ...legacy, reportBlocked: false }, bo(3), [win(), win()]), false);
    assert.equal(verificationBlocksReport({ ...legacy, reportBlocked: true }, bo(3), [win(), win()]), true);
});

test('organizers and tournaments without verification keep their exemption', () => {
    assert.equal(verificationBlocksReport(panel([game(1)], { isManager: true, isParticipant: false }), bo(3), [win(), win()]), false);
    assert.equal(verificationBlocksReport(panel([game(1)], { isManager: true, isParticipant: null }), bo(3), [win(), win()]), false,
        'an older server exempts every organizer, so the app does not stand in its way');
    assert.equal(verificationBlocksReport(panel([game(1)], { required: false }), bo(3), [win(), win()]), false);
    assert.equal(verificationBlocksReport(null, bo(3), [win(), win()]), false);
});

test('an organizer who plays the match reports it as a player, with proofs', () => {
    const p = panel([game(1), game(2), game(3)], { isManager: true, isParticipant: true });
    assert.equal(verificationBlocksReport(p, bo(3), [win(), win()]), true);
    p.games[0] = game(1, { verified: true });
    p.games[1] = game(2, { verified: true });
    assert.equal(verificationBlocksReport(p, bo(3), [win(), win()]), false);
});

test('a report that drops a recorded game rewrites the result, so every game it keeps is proven again', () => {
    const level = [win(), loss()];
    const recorded = [...level, win(2)];
    // Taking the won tiebreak back off adds no game, but it is not standing on the old proofs either.
    assert.deepEqual(gamesToProve(level, recorded).map(verificationGameKey), ['1:1', '1:2']);
    const p = panel([game(1), game(2, { verified: true }), game(1, { seriesNumber: 2, verified: true })]);
    assert.equal(verificationBlocksReport(p, bo(2, 0, 1), level, recorded), true, 'game 1 was never proven by this player');
    assert.equal(verificationBlocksReport(p, bo(2, 0, 1), recorded, recorded), false, 'resending the result as it stands asks for nothing new');
});

test('an organizer only sees a game complete when both players proved it', () => {
    const g = { ...game(1, { verified: true }), records: [proof(1), { ...proof(1, { userId: 'opponent' }), status: 0 }] };
    assert.equal(gameIsVerified(g, false), true);
    assert.equal(gameIsVerified(g, true), false);
    g.records[1].status = 2;
    assert.equal(gameIsVerified(g, true), true);
    g.records = [{ ...proof(1), status: VERIFICATION_FAILED }];
    assert.equal(gameIsVerified(g, true), false);
});

test('games are numbered inside their series, and only new or changed games need a proof', () => {
    const result = [win(), loss(), { seriesNumber: 2, homeScore: 2, awayScore: 0 }];
    assert.deepEqual(numberGames(result).map(verificationGameKey), ['1:1', '1:2', '2:1']);
    assert.deepEqual(gamesToProve(result, result.slice(0, 2)).map(verificationGameKey), ['2:1']);
    assert.deepEqual(gamesToProve(result, [loss(), loss()]).map(verificationGameKey), ['1:1', '2:1']);
    assert.deepEqual(shortestNextSeries(bo(5), []).map(verificationGameKey), ['1:1', '1:2', '1:3']);
    assert.deepEqual(shortestNextSeries(bo(3, 0, 1), [win(), loss()]).map(verificationGameKey), ['2:1']);
});

test('a tiebreak typed into the same report gets its own slots, open to the player', () => {
    const p = panel([game(1, { verified: true }), game(2, { verified: true })], { canVerify: false });
    const result = [win(), loss(), win(2)];
    const slots = buildVerificationSlots(p, bo(2, 0, 1), result, true);
    assert.deepEqual(slots.map(slot => [slot.seriesNumber, slot.gameNumber, slot.role, slot.canVerify]),
        [[1, 1, 'required', false], [1, 2, 'required', false], [2, 1, 'required', true]]);
    assert.equal(verificationBlocksReport(p, bo(2, 0, 1), result), true);
});

const source = 'src/lib/resultVerification.ts';
const pick = loadFetcher(source, 'pick', {});
const normalizeRecord = loadDeclaredFunction(source, 'normalizeRecord', {
    pick, normalizeDevice: () => null, VERIFICATION_STARTED: 0, EVIDENCE_VIDEO: 1, EVIDENCE_IMAGE: 0,
});
const normalizePanel = loadDeclaredFunction(source, 'normalizePanel', { pick, normalizeRecord });

test('PascalCase API responses preserve game identity and independent records', () => {
    const raw = { MatchId: 'a', Games: [
        { SeriesNumber: 1, GameNumber: 2, CanVerify: false, Mine: { Id: 'proof-2', SeriesNumber: 1, GameNumber: 2, Status: 2 }, Records: [] },
        { SeriesNumber: 2, GameNumber: 1, CanVerify: true, Records: [] },
    ] };
    const result = normalizePanel(raw);
    assert.equal(result.games[0].mine.gameNumber, 2);
    assert.equal(result.games[1].seriesNumber, 2);
    assert.equal(result.games[1].mine, null);
    assert.equal(normalizeRecord({ Status: 2 }).gameNumber, 1);
    assert.equal(normalizeRecord({ Status: 2, SeriesNumber: 0, GameNumber: 0 }).gameNumber, WHOLE_MATCH, 'a whole-match proof keeps its 0');
});

test('starting a verification sends the selected game to the server', async () => {
    let body;
    const start = loadDeclaredFunction(source, 'startVerification', {
        authenticatedFetch: async (_, options) => {
            body = JSON.parse(options.body);
            return { ok: true, json: async () => ({ verificationId: 'v', message: 'signed game challenge' }) };
        },
        ENDPOINTS: { VERIFICATION_START: id => id }, pick,
    });
    await start('match', 'phone', {}, { seriesNumber: 2, gameNumber: 3 });
    assert.deepEqual(body, { deviceId: 'phone', seriesNumber: 2, gameNumber: 3 });
});

const loadHook = (state, fetchPanel) => {
    let index = 0;
    return loadDeclaredFunction('src/hooks/useResultVerification.ts', 'useResultVerification', {
        useState: () => {
            const slot = index++;
            return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
        },
        useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: () => {},
        fetchVerificationPanel: fetchPanel,
        verificationGameKey, normalizeRecord, VERIFICATION_FAILED,
        sameId: (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase(),
    });
};

test('a proof on a server from before per-game proofs keeps its panel whole-match, refresh or not', async () => {
    const state = [{ ...panel(), mine: null, records: [{ ...proof(1), id: null, status: 0 }], reportBlocked: true, games: [] }, false];
    const verification = loadHook(state, async () => { throw Error('offline'); })('a', true);
    verification.recordVerified(proof(1));
    await verification.refresh();
    assert.equal(state[0].games.length, 0, 'no per-game panel is made up for it');
    assert.equal(state[0].mine.id, 'me-1-1');
    assert.equal(verificationBlocksReport(state[0], bo(3), [win(), loss(), win()]), false, 'its one proof covers the match');
});

test('a successful upload appears immediately and a stale fetch cannot erase it', async () => {
    let resolveFetch;
    const state = [{ ...panel([game(1), game(2)]), matchId: 'a' }, false];
    const hook = loadHook(state, () => new Promise(resolve => { resolveFetch = resolve; }));
    const verification = hook('a', true);
    const pending = verification.refresh();
    verification.recordVerified(proof(2));
    assert.equal(state[0].games[1].mine.id, 'me-1-2');
    assert.equal(state[0].games[0].mine, null);
    resolveFetch({ ...panel([game(1), game(2)]), matchId: 'a' });
    await pending;
    assert.equal(state[0].games[1].mine.id, 'me-1-2');
    assert.equal(state[1], false);
});
