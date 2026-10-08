import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFetcher } from './loadFetcher.mjs';
import { load } from './loadModules.mjs';
import { deferred } from './loadApi.mjs';
const { createSingleFlight } = await load('singleFlight');
const { createRequestGate } = await load('requestGate');

function details(responses) {
    const state = { requests: 0, home: null, loaded: false };
    const bindings = {
        detailsRead: createSingleFlight(), requests: createRequestGate(), matchId: 'match',
        authenticatedFetch: () => { state.requests++; return responses.shift().promise; },
        ENDPOINTS: { GET_MATCH_DETAILS: id => id }, normalizeEvidenceItems: () => [],
        normalizeCondition: v => v, seriesGamesFrom: () => [], normalizeBestOf: v => v,
        setDbHomeUserId: id => { state.home = id; }, setDetailsLoaded: v => { state.loaded = v; },
    };
    for (const name of ['AllowScheduleOutsideApp', 'RequireAvailabilityForChat', 'SeriesFormat', 'ReportedGames', 'ProposedGames', 'AllowsTiebreak',
        'CheckInEnabled', 'CheckInGraceMinutes', 'RequireResultVerification', 'HasResultVerifications', 'CheckInState',
        'DbAwayUserId', 'DbHomeUsername', 'DbAwayUsername', 'RequireResultApproval', 'ProposedHomeScore', 'ProposedAwayScore',
        'ProposedByUserId', 'HubOwnerUserId', 'ExistingEvidences', 'AdminHelpRequested', 'AdminHelpRequestedByUserId']) {
        bindings['set' + name] = () => {};
    }
    return { state, read: loadFetcher('src/components/match/MatchScheduleCard.tsx', 'fetchDbHomeUserId', bindings) };
}
const success = homeUserId => ({ ok: true, json: async () => ({ homeUserId, awayUserId: 'away' }) });

test('polling joins the home-player lookup used for submitting a result instead of cancelling it', async () => {
    const response = deferred(), { read, state } = details([response]);
    const submit = read(), poll = read();
    assert.equal(submit, poll); assert.equal(state.requests, 1);
    response.resolve(success('home'));
    assert.equal(await submit, 'home'); assert.equal(await poll, 'home');
    assert.equal(state.home, 'home'); assert.equal(state.loaded, true);
});

test('a successful mutation forces a fresh lookup; an older reply cannot overwrite it', async () => {
    const old = deferred(), fresh = deferred(), { read, state } = details([old, fresh]);
    const before = read(), after = read(true), poll = read();
    assert.notEqual(before, after); assert.equal(after, poll); assert.equal(state.requests, 2);
    fresh.resolve(success('new-home')); assert.equal(await after, 'new-home');
    old.resolve(success('old-home')); assert.equal(await before, null);
    assert.equal(state.home, 'new-home');
});
