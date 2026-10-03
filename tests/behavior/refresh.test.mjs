import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFetcher, loadJsxProp } from './loadFetcher.mjs';
import { load } from './loadModules.mjs';
import { deferred } from './loadApi.mjs';
const { createRequestGate } = await load('requestGate');
const { NO_REFRESH_FAILURES, withRefreshResult, retryFailedRefreshes } = await load('refreshFailures');

const failure = { ok: false, status: 503 };
const shared = () => ({ requests: createRequestGate(), t: key => key, console: { error() {}, log() {} }, getErrorMessage: String,
    queryClient: {}, user: { id: 'viewer' }, tournamentResourceKey: (...parts) => parts,
    fetchTournamentResource: (_client, _key, loader) => loader(undefined),
});
function matchFetcher(responses, existing = null) {
    const state = { loading: false, error: null, settled: null };
    const fetch = loadFetcher('src/components/modals/MatchDetailsModal.tsx', 'fetchMatchDetails', {
        ...shared(), matchId: 'A', matchDetailsRef: { current: existing },
        ENDPOINTS: { GET_MATCH_DETAILS_FULL: id => id }, authenticatedFetch: () => responses.shift(),
        setIsLoadingDetails: value => { state.loading = value; }, setError: value => { state.error = value; },
        setDetailsSettledFor: value => { state.settled = value; }, setIsEditMode() {},
    });
    return { state, fetch };
}

test('a quiet match refresh replacing a normal load clears the loader and reports initial failure', async () => {
    const first = deferred(), second = deferred(), { state, fetch } = matchFetcher([first.promise, second.promise]);
    const initial = fetch(), quiet = fetch(true); second.resolve(failure); await quiet;
    first.resolve(failure); await initial;
    assert.equal(state.loading, false); assert.equal(state.settled, 'A'); assert.ok(state.error);
});

test('a quiet failed match refresh keeps the existing details without a blocking error', async () => {
    const { state, fetch } = matchFetcher([Promise.resolve(failure)], { id: 'A' });
    await fetch(true); assert.equal(state.loading, false); assert.equal(state.error, null);
});

test('a quiet bracket refresh replacing the initial load releases the loader and shows its failure', async () => {
    const first = deferred(), second = deferred(), state = { loading: false, error: null, loaded: false };
    const responses = [first.promise, second.promise];
    const run = loadFetcher('src/screens/TournamentDetailsScreen.tsx', 'fetchBracket', {
        ...shared(), id: 'A', bracketLoadedRef: { current: false },
        ENDPOINTS: { GET_TOURNAMENT_STRUCTURE_V3: id => id }, authenticatedFetch: () => responses.shift(),
        setLoadingBracket: value => { state.loading = value; }, setBracketError: value => { state.error = value; },
        setBracketLoaded: value => { state.loaded = value; }, setFailedRefreshes() {}, withRefreshResult,
    });
    const initial = run(), quiet = run(true); second.resolve(failure); await quiet; first.resolve(failure); await initial;
    assert.equal(state.loading, false); assert.equal(state.loaded, true); assert.ok(state.error);
});

// The bracket fetcher with every state setter it commits through, and the banner's failure set.
function bracketFetcher(responses, loaded = true) {
    const state = { error: null, failures: NO_REFRESH_FAILURES, stages: null };
    const ok = { ok: true, status: 200, json: async () => ({ stages: [{ type: 3, rounds: [] }] }) };
    const run = loadFetcher('src/screens/TournamentDetailsScreen.tsx', 'fetchBracket', {
        ...shared(), id: 'A', bracketLoadedRef: { current: loaded },
        ENDPOINTS: { GET_TOURNAMENT_STRUCTURE_V3: id => id },
        authenticatedFetch: async () => (responses.shift() === 'ok' ? ok : failure),
        setLoadingBracket() {}, setBracketError: value => { state.error = value; }, setBracketLoaded() {},
        setFailedRefreshes: update => { state.failures = update(state.failures); }, withRefreshResult,
        setStages: value => { state.stages = value; }, setTournamentBestOf() {}, setTournamentHasKnockout() {},
        normalizeBestOf: v => v, autoSelectedStageForId: { current: 'A' }, pickDefaultStageIndex: () => 0,
        setSelectedStageIndex() {}, setSelectedGroupIndex() {}, setHubOwnerId() {}, setBracketCanManage() {},
        setBracketRequireResultApproval() {},
    });
    return { state, run };
}

test('a quiet bracket failure over loaded content requests a banner rather than replacing the bracket', async () => {
    const { state, run } = bracketFetcher(['fail']);
    await run(true);
    assert.equal(state.error, null);
    assert.deepEqual([...state.failures], ['bracket']);
});

test('the banner stays while the bracket is stale, even when the overview refreshes fine', async () => {
    const { state, run } = bracketFetcher(['fail', 'ok']);
    await run(true);
    state.failures = withRefreshResult(state.failures, 'overview', true); // overview refresh went through
    assert.deepEqual([...state.failures], ['bracket']);
    // The banner's retry repeats the bracket request — not the overview — and that clears it.
    const repeated = [];
    await retryFailedRefreshes(state.failures, {
        overview: async () => { repeated.push('overview'); },
        bracket: async () => { repeated.push('bracket'); await run(true); },
    });
    assert.deepEqual(repeated, ['bracket']);
    assert.equal(state.failures.size, 0);
    assert.ok(state.stages);
});

test('a later successful bracket refresh clears its own failure', async () => {
    const { state, run } = bracketFetcher(['fail', 'ok']);
    await run(true); await run(true);
    assert.equal(state.failures.size, 0);
});

test('a failed ordinary post-action refresh retains a loaded bracket and exposes its retry banner', async () => {
    const { state, run } = bracketFetcher(['fail']);
    const stages = [{ id: 'loaded' }]; state.stages = stages;
    await run();
    assert.equal(state.stages, stages);
    assert.deepEqual([...state.failures], ['bracket']);
});

for (const resource of ['participants', 'pending', 'teams', 'pending-teams']) {
    test(`${resource}: a failed refresh preserves loaded rows and its own retry clears the failure`, async () => {
        const state = { rows: [{ id: 'existing' }], failures: new Set(['bracket']) };
        const original = state.rows;
        let fail = true;
        const answer = () => fail ? failure : { ok: true, json: async () => [{ id: 'new' }] };
        const bindings = {
            ...shared(), id: 'A', withRefreshResult, rememberSnapshot() {},
            setFailedRefreshes: update => { state.failures = update(state.failures); },
            authenticatedFetch: async () => answer(),
            ENDPOINTS: { GET_PENDING_REGISTRATIONS: id => id, GET_TOURNAMENT_PARTICIPANTS: id => id },
            setParticipants: rows => { state.rows = rows; }, setParticipantsError() {}, setParticipantsLoaded() {},
            setPendingRegistrations: rows => { state.rows = rows; }, setPendingError() {}, setIsLoadingPending() {}, setPendingLoaded() {},
            setTournamentTeams: rows => { if (resource === 'teams') state.rows = rows; }, setTeamsError() {}, setTeamsLoaded() {},
            setUserTeam: row => { if (resource === 'pending-teams') state.rows = [row]; },
            getTournamentTeams: async () => { if (fail && resource === 'teams') throw Error('503'); return [{ id: 'new' }]; },
            getPendingTournamentTeams: async () => {
                if (fail && resource === 'pending-teams') throw Error('503');
                return [{ id: 'new', members: [{ userId: 'viewer' }] }];
            },
        };
        const name = resource === 'participants' ? 'fetchParticipants' : resource === 'pending' ? 'fetchPendingRegistrations' : 'fetchTournamentTeams';
        const run = loadFetcher('src/screens/TournamentDetailsScreen.tsx', name, bindings);
        await run(resource.includes('teams') ? 'A' : undefined);
        assert.equal(state.rows, original); assert.ok(state.failures.has(resource));
        fail = false; await run(resource.includes('teams') ? 'A' : undefined);
        assert.equal(state.rows[0].id, 'new'); assert.deepEqual([...state.failures], ['bracket']);
    });
}

test('inline bracket results supersede a pending GET, release its spinner, and clear only bracket errors', async () => {
    const response = deferred(), state = { loading: false, loaded: false, error: 'old-error',
        failures: new Set(['bracket', 'participants']), stages: [] };
    const bindings = {
        ...shared(), id: 'A', bracketLoadedRef: { current: true }, withRefreshResult,
        ENDPOINTS: { GET_TOURNAMENT_STRUCTURE_V3: id => id }, authenticatedFetch: () => response.promise,
        setLoadingBracket: v => { state.loading = v; }, setBracketLoaded: v => { state.loaded = v; },
        setBracketError: v => { state.error = v; }, setFailedRefreshes: fn => { state.failures = fn(state.failures); },
        setStages: v => { state.stages = v; }, setBracketCanManage() {}, setBracketRequireResultApproval() {},
        queryClient: { cancelQueries: async () => {}, setQueryData() {} }, invalidateTournamentLists() {},
        refreshBadges() {}, canManage: false,
    };
    const fetch = loadFetcher('src/screens/TournamentDetailsScreen.tsx', 'fetchBracket', bindings);
    const update = loadJsxProp('src/screens/TournamentDetailsScreen.tsx', 'MatchDetailsModal', 'onMatchUpdate', bindings);
    const waiting = fetch(); assert.equal(state.loading, true);
    const stages = [{ id: 'fresh' }]; update({ stages });
    assert.equal(state.loading, false); assert.equal(state.loaded, true); assert.equal(state.error, null);
    assert.deepEqual([...state.failures], ['participants']); assert.equal(state.stages, stages);
    response.resolve(failure); await waiting;
    assert.equal(state.stages, stages); assert.equal(state.error, null); assert.equal(state.loading, false);
});
