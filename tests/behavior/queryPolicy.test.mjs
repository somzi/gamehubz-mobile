import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { load } from './loadModules.mjs';
import { loadFetcher } from './loadFetcher.mjs';
import { deferred } from './loadApi.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { QueryClient, InfiniteQueryObserver, QueryObserver, hashKey, dehydrate } = require('@tanstack/react-query');
const ts = require('typescript');
const policy = await load('queryPolicy');
const { createRequestGate } = await load('requestGate');
const { withRefreshResult } = await load('refreshFailures');
const { DETAIL_STALE_MS, LIST_STALE_MS, shouldRefreshOnFocus, fetchTournamentResource,
    tournamentResourceKey, invalidateHubData, invalidateTournamentData, refreshVisibleList } = policy;
const clientFor = t => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    t.after(() => client.clear());
    return client;
};

test('focus shares a running or paused load; fresh and explicitly invalidated data have distinct behavior', () => {
    assert.equal(shouldRefreshOnFocus({ dataUpdatedAt: 0, fetchStatus: 'fetching' }, DETAIL_STALE_MS), false);
    assert.equal(shouldRefreshOnFocus({ dataUpdatedAt: 0, fetchStatus: 'paused' }, DETAIL_STALE_MS), false);
    assert.equal(shouldRefreshOnFocus({ dataUpdatedAt: 10_000 }, DETAIL_STALE_MS, 39_999), false);
    assert.equal(shouldRefreshOnFocus({ dataUpdatedAt: 10_000 }, DETAIL_STALE_MS, 40_000), true);
    assert.equal(shouldRefreshOnFocus({ dataUpdatedAt: 10_000, isInvalidated: true }, DETAIL_STALE_MS, 10_001), true);
});

test('two tournament readers and a quick Back share one request and one cached response', async t => {
    const client = clientFor(t), response = deferred(), key = tournamentResourceKey('A', 'viewer', 'overview');
    let calls = 0;
    const loader = () => { calls++; return response.promise; };
    const first = fetchTournamentResource(client, key, loader);
    const second = fetchTournamentResource(client, key, loader);
    assert.equal(calls, 1);
    response.resolve({ id: 'A', status: 3 });
    assert.deepEqual(await first, await second);
    await fetchTournamentResource(client, key, loader);
    assert.equal(calls, 1);
});

test('the real tournament overview reader reuses fresh data but confirms a local change immediately', async t => {
    const client = clientFor(t), state = { tournament: null, failures: new Set(), error: null };
    let calls = 0;
    const run = loadFetcher('src/screens/TournamentDetailsScreen.tsx', 'fetchTournamentDetails', {
        queryClient: client, id: 'A', user: { id: 'viewer' }, requests: createRequestGate(),
        tournamentResourceKey, fetchTournamentResource, withRefreshResult,
        ENDPOINTS: { GET_TOURNAMENT_OVERVIEW_V3: id => id },
        authenticatedFetch: async () => ({ ok: true, json: async () => ({ id: 'A', status: 3, name: `Version ${++calls}` }) }),
        setIsLoading() {}, setError: error => { state.error = error; },
        setTournament: value => { state.tournament = value; },
        setFailedRefreshes: update => { state.failures = update(state.failures); },
        rememberSnapshot() {}, tournamentRef: { current: {} }, getErrorMessage: String,
        t: key => key, console: { error() {} }, setIsUserRegistered() {}, fetchTournamentTeams() {},
    });
    await run(true, false); await run(true, false);
    assert.equal(calls, 1);
    assert.equal(state.tournament.name, 'Version 1');
    await run(true); // Existing mutation/retry callers force a confirmation.
    assert.equal(calls, 2);
    assert.equal(state.tournament.name, 'Version 2');
    assert.equal(state.error, null);
});

test('stale tournament data refetches, while different viewers and resources have separate caches', async t => {
    const client = clientFor(t), key = tournamentResourceKey('A', 'viewer', 'overview');
    client.setQueryData(key, { old: true }, { updatedAt: Date.now() - DETAIL_STALE_MS - 1 });
    let calls = 0;
    const loader = async () => ({ call: ++calls });
    await fetchTournamentResource(client, key, loader);
    await fetchTournamentResource(client, tournamentResourceKey('A', 'other-viewer', 'overview'), loader);
    await fetchTournamentResource(client, tournamentResourceKey('A', 'viewer', 'participants'), loader);
    assert.equal(calls, 3);
});

test('a mutation cancels a pre-edit read and its forced confirmation cannot cache the old response', async t => {
    const client = clientFor(t), key = tournamentResourceKey('A', 'viewer', 'bracket'), old = deferred();
    let oldSignal;
    const pending = fetchTournamentResource(client, key, signal => { oldSignal = signal; return old.promise; });
    const settled = pending.catch(() => 'cancelled');
    const fresh = await fetchTournamentResource(client, key, async () => ({ score: 2 }), true);
    assert.equal(oldSignal.aborted, true);
    assert.deepEqual(fresh, { score: 2 });
    old.resolve({ score: 0 });
    assert.equal(await settled, 'cancelled');
    assert.deepEqual(client.getQueryData(key), { score: 2 });
});

test('a failed forced refresh preserves content and remains eligible for retry', async t => {
    const client = clientFor(t), key = tournamentResourceKey('A', 'viewer', 'overview');
    client.setQueryData(key, { name: 'Visible tournament' });
    await assert.rejects(fetchTournamentResource(client, key, async () => { throw Error('offline'); }, true));
    assert.deepEqual(client.getQueryData(key), { name: 'Visible tournament' });
    assert.equal(shouldRefreshOnFocus(client.getQueryState(key), DETAIL_STALE_MS), true);
    assert.deepEqual(await fetchTournamentResource(client, key, async () => ({ name: 'Updated' })), { name: 'Updated' });
});

test('management invalidates the changed hub/tournament immediately without invalidating another detail', async t => {
    const client = clientFor(t);
    const keys = [['hub', 'H'], ['hub', 'other'], ['hubs', 'joined'], ['tournaments', 'live'],
        tournamentResourceKey('A', 'viewer', 'overview'), tournamentResourceKey('B', 'viewer', 'overview')];
    keys.forEach(key => client.setQueryData(key, { value: true }));
    await invalidateHubData(client, 'H');
    await invalidateTournamentData(client, 'A');
    for (const index of [0, 2, 3, 4]) assert.equal(client.getQueryState(keys[index]).isInvalidated, true);
    for (const index of [1, 5]) assert.equal(client.getQueryState(keys[index]).isInvalidated, false);
});

test('tournament resource cache stays in memory and is excluded from the persisted snapshot', async t => {
    const client = clientFor(t);
    await fetchTournamentResource(client, tournamentResourceKey('A', 'viewer', 'overview'), async () => ({ id: 'A' }));
    client.setQueryData(['hubs', 'joined'], { rows: [] });
    const persisted = dehydrate(client, { shouldDehydrateQuery: query => query.state.status === 'success' && query.meta?.persist !== false });
    assert.deepEqual(persisted.queries.map(query => query.queryKey), [['hubs', 'joined']]);
});

function focusHarness(client) {
    let cursor = 0, focused = true, effect, previousEffect;
    const slots = [];
    const fakeReact = {
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useCallback(fn, deps) {
            const i = cursor++, previous = slots[i];
            if (!previous || deps.some((v, index) => v !== previous.deps[index])) slots[i] = { fn, deps };
            return slots[i].fn;
        },
    };
    const source = readFileSync(new URL('../../src/hooks/useRefetchOnFocusIfStale.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    const exports = {};
    new Function('require', 'exports', outputText)(name => {
        if (name === 'react') return fakeReact;
        if (name === '@react-navigation/native') return { useFocusEffect(fn) {
            effect = fn;
            if (focused && fn !== previousEffect) fn();
            previousEffect = fn;
        } };
        if (name === '@tanstack/react-query') return { useQueryClient: () => client, hashKey };
        if (name === '../lib/queryPolicy') return policy;
        throw Error(name);
    }, exports);
    return {
        render(refetch, updatedAt, options) { cursor = 0; exports.useRefetchOnFocusIfStale(refetch, updatedAt, options); },
        blur() { focused = false; },
        focus() { focused = true; effect(); },
    };
}

test('the actual focus hook does not retry on cache/render changes and uses the latest callback on Back', t => {
    const client = clientFor(t), key = ['hubs', 'joined'], harness = focusHarness(client), calls = [];
    client.setQueryData(key, {}, { updatedAt: Date.now() - LIST_STALE_MS - 1 });
    const options = { queryKey: key, staleMs: LIST_STALE_MS };
    harness.render(arg => calls.push(['initial', arg]), 1, options);
    harness.render(arg => calls.push(['new render', arg]), 2, options);
    assert.equal(calls.length, 1);
    harness.blur(); harness.focus();
    assert.deepEqual(calls, [['initial', { cancelRefetch: false }], ['new render', { cancelRefetch: false }]]);
    client.setQueryData(key, {});
    harness.render(() => calls.push(['fresh']), Date.now(), options);
    harness.blur(); harness.focus();
    assert.equal(calls.length, 2);
});

test('the actual focus hook recognizes a new search key and skips an initial load already in flight', async t => {
    const client = clientFor(t), key = ['hubs', 'first'], pending = deferred(), harness = focusHarness(client);
    let calls = 0;
    const request = client.fetchQuery({ queryKey: key, queryFn: () => pending.promise });
    harness.render(() => calls++, 0, { queryKey: key });
    assert.equal(calls, 0);
    pending.resolve([]); await request;
    harness.render(() => calls++, 0, { queryKey: ['hubs', 'second'] });
    assert.equal(calls, 1);
});

function listOptions(kind, isFocused, requests) {
    const isHub = kind === 'hubs', queryKey = [kind, isHub ? 'joined' : 'live', ...(isHub ? [''] : []), 'viewer'];
    const config = loadFetcher(`src/screens/${isHub ? 'Hubs' : 'Tournaments'}Screen.tsx`, `${isHub ? 'hubs' : 'tournaments'}Query`, {
        useInfiniteQuery: config => config, queryKey, user: { id: 'viewer' }, activeTab: isHub ? 'joined' : 'live',
        debouncedSearch: '', isFocused, PAGE_SIZE: 10, LIST_STALE_MS, keepPreviousData: value => value,
        TAB_TO_STATUS: { live: 2 }, t: key => key,
        ENDPOINTS: { GET_USER_HUBS: (_id, page) => page, GET_DISCOVERY_HUBS: (_id, page) => page,
            GET_USER_TOURNAMENTS_V2: (_id, _status, page) => page },
        authenticatedFetch: async (page, { signal }) => {
            requests.push({ page, signal });
            return { ok: true, json: async () => ({ items: Array.from({ length: 10 }, (_, i) => ({ id: page * 10 + i })) }) };
        },
    });
    return { ...config, retry: false, gcTime: Infinity };
}

for (const kind of ['hubs', 'tournaments']) {
    test(`${kind}: real screen query keeps loaded pages on quick return and suspends hidden refetches`, async t => {
        const client = clientFor(t), requests = [], options = listOptions(kind, true, requests);
        const observer = new InfiniteQueryObserver(client, options);
        const unsubscribe = observer.subscribe(() => {}); t.after(unsubscribe);
        await observer.refetch({ cancelRefetch: false });
        await observer.fetchNextPage(); await observer.fetchNextPage();
        assert.deepEqual(requests.map(r => r.page), [0, 1, 2]);
        // This used to replay all three pages after 30s, even during ordinary tab hopping.
        client.setQueryData(options.queryKey, client.getQueryData(options.queryKey), { updatedAt: Date.now() - 90_000 });
        observer.setOptions({ ...options, enabled: false });
        observer.setOptions(options);
        assert.equal(shouldRefreshOnFocus(client.getQueryState(options.queryKey), LIST_STALE_MS), false);
        assert.equal(requests.length, 3);
        assert.equal(observer.getCurrentResult().data.pages.length, 3);
        observer.setOptions({ ...options, enabled: false });
        await client.invalidateQueries({ queryKey: [kind] });
        assert.equal(requests.length, 3);
        observer.setOptions(options);
        await observer.refetch({ cancelRefetch: false });
        assert.deepEqual(requests.map(r => r.page), [0, 1, 2, 0, 1, 2]);
        assert.equal(observer.getCurrentResult().data.pages.flatMap(p => p.items).length, 30);
    });

    test(`${kind}: actual pull refresh affects only the visible filter`, async t => {
        const client = clientFor(t), requests = [], options = listOptions(kind, true, requests);
        const observer = new InfiniteQueryObserver(client, options);
        const unsubscribe = observer.subscribe(() => {}); t.after(unsubscribe);
        await observer.refetch({ cancelRefetch: false });
        const otherKey = [kind, 'other-filter'];
        client.setQueryData(otherKey, { pages: [{ items: ['other'], nextPage: undefined }], pageParams: [0] });
        const run = loadFetcher(`src/screens/${kind === 'hubs' ? 'Hubs' : 'Tournaments'}Screen.tsx`, 'onRefresh', {
            useCallback: fn => fn, queryClient: client, queryKey: options.queryKey, refreshVisibleList,
            setIsPulling() {}, activeTab: kind === 'hubs' ? 'joined' : 'live', user: { id: 'viewer' }, debouncedSearch: '',
        });
        await run();
        assert.equal(requests.length, 2);
        assert.equal(client.getQueryState(otherKey).isInvalidated, false);
    });
}

test('pull during next-page loading aborts that page and actually refreshes the loaded list', async t => {
    const client = clientFor(t), key = ['hubs', 'joined'], pending = deferred(), calls = [];
    let pageSignal;
    const observer = new InfiniteQueryObserver(client, {
        queryKey: key, initialPageParam: 0, getNextPageParam: page => page.nextPage,
        queryFn: async ({ pageParam, signal }) => {
            calls.push(pageParam);
            if (pageParam === 1) { pageSignal = signal; return pending.promise; }
            return { items: [{ id: 'fresh-head' }], nextPage: 1 };
        },
    });
    const unsubscribe = observer.subscribe(() => {}); t.after(unsubscribe);
    await observer.refetch({ cancelRefetch: false });
    const next = observer.fetchNextPage();
    await refreshVisibleList(client, key);
    assert.equal(pageSignal.aborted, true);
    pending.resolve({ items: [{ id: 'old-tail' }], nextPage: 2 }); await next;
    assert.deepEqual(calls, [0, 1, 0]);
    assert.deepEqual(client.getQueryData(key).pages.flatMap(p => p.items), [{ id: 'fresh-head' }]);
});

test('a hidden hub observer picks up an edit immediately on return, even inside the freshness window', async t => {
    const client = clientFor(t), key = ['hub', 'H'];
    client.setQueryData(key, { name: 'Before' });
    let calls = 0;
    const options = { queryKey: key, staleTime: DETAIL_STALE_MS, queryFn: async () => { calls++; return { name: 'After' }; }, enabled: false };
    const observer = new QueryObserver(client, options), unsubscribe = observer.subscribe(() => {}); t.after(unsubscribe);
    await invalidateHubData(client, 'H');
    assert.equal(calls, 0);
    observer.setOptions({ ...options, enabled: true });
    await observer.refetch({ cancelRefetch: false });
    assert.equal(calls, 1);
    assert.deepEqual(client.getQueryData(key), { name: 'After' });
});

test('the actual team rename marks cached tournament data stale before the user returns', async t => {
    const client = clientFor(t), key = tournamentResourceKey('A', 'viewer', 'teams');
    client.setQueryData(key, [{ name: 'Old name' }]);
    let displayed;
    const save = loadFetcher('src/screens/TeamDashboardScreen.tsx', 'handleSaveName', {
        team: { teamId: 'team' }, editedName: 'New name', tournamentId: 'A', queryClient: client,
        invalidateTournamentData, renameTeam: async () => ({ name: 'New name' }),
        setIsSavingName() {}, setTeam: value => { displayed = value; }, setIsEditingName() {},
        setStatusModalConfig() {}, setShowStatusModal() {}, t: key => key, getErrorMessage: String,
    });
    await save();
    assert.equal(displayed.name, 'New name');
    assert.equal(client.getQueryState(key).isInvalidated, true);
});

test('the actual hub edit invalidates its cached header and list, then reloads management data', async t => {
    const client = clientFor(t), key = ['hub', 'H'];
    client.setQueryData(key, { name: 'Before' }); client.setQueryData(['hubs', 'joined'], []);
    let reloads = 0;
    const save = loadFetcher('src/screens/ManageHubScreen.tsx', 'handleUpdateHub', {
        hubId: 'H', queryClient: client, invalidateHubData,
        ENDPOINTS: { UPDATE_HUB: 'update' }, authenticatedFetch: async () => ({ ok: true }),
        fetchHubDetails: () => { reloads++; }, Alert: { alert: () => assert.fail('Unexpected error') },
        t: key => key, tCommon: key => key, console,
    });
    await save('After', 'description', true);
    assert.equal(reloads, 1);
    assert.equal(client.getQueryState(key).isInvalidated, true);
    assert.equal(client.getQueryState(['hubs', 'joined']).isInvalidated, true);
});
