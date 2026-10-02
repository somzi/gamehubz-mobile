import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFetcher } from './loadFetcher.mjs';
import { load } from './loadModules.mjs';
import { deferred } from './loadApi.mjs';
const { createRequestGate } = await load('requestGate');
const { NO_REFRESH_FAILURES, withRefreshResult, retryFailedRefreshes } = await load('refreshFailures');

const failure = { ok: false, status: 503 };
const shared = () => ({ requests: createRequestGate(), t: key => key, console: { error() {}, log() {} }, getErrorMessage: String });
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
