import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDeclaredFunction, loadFetcher, loadJsxProp } from './loadFetcher.mjs';
import { deferred, flush } from './loadApi.mjs';

// Retain refs/callbacks between renders and commit effects when their dependencies change.
function pagination() {
    let cursor = 0, effects = [];
    const slots = [];
    const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    const hook = loadDeclaredFunction('src/hooks/useQueuedPagination.ts', 'useQueuedPagination', {
        hashKey: JSON.stringify,
        useRef: value => slots[cursor++] ??= { current: value },
        useCallback: (fn, deps) => {
            const i = cursor++, old = slots[i];
            if (!old || !same(old.deps, deps)) slots[i] = { fn, deps };
            return slots[i].fn;
        },
        useEffect: (fn, deps) => {
            const i = cursor++, old = slots[i];
            if (!old || !same(old.deps, deps)) { slots[i] = { deps }; effects.push(fn); }
        },
    });
    return (query, key = ['tournaments', 'live'], active = true) => {
        cursor = 0; effects = [];
        const more = hook(query, key, active);
        effects.forEach(fn => fn());
        return more;
    };
}
const ready = { hasNextPage: true, isFetching: false, isFetchingNextPage: false, isPlaceholderData: false, isError: false };

test('end reached during refresh queues exactly one page and does not cancel the refresh', async () => {
    const render = pagination(), response = deferred(), options = [];
    const query = { ...ready, fetchNextPage: opts => { options.push(opts); return response.promise; } };
    let more = render({ ...query, isFetching: true });
    more(); more(); assert.equal(options.length, 0);
    more = render(query); more(); more();
    assert.deepEqual(options, [{ cancelRefetch: false }]);
    response.resolve(); await flush();
    more(); assert.equal(options.length, 2);
});

for (const reason of ['blur', 'filter', 'error', 'last-page']) {
    test(`queued pagination is dropped after ${reason}, and does not retry itself`, async () => {
        const render = pagination(); let calls = 0;
        const query = { ...ready, fetchNextPage: async () => { calls++; } };
        const more = render({ ...query, isFetching: true }); more();
        const key = ['tournaments', reason === 'filter' ? 'finished' : 'live'];
        const changed = { ...query, isFetching: true, isError: reason === 'error', hasNextPage: reason !== 'last-page' };
        render(changed, key, reason !== 'blur');
        render(query, key); await flush();
        assert.equal(calls, 0);
    });
}

const bottom = { nativeEvent: { layoutMeasurement: { height: 700 }, contentOffset: { y: 400 }, contentSize: { height: 1100 } } };
for (const screen of ['Profile', 'PlayerProfile', 'HubProfile']) {
    test(`${screen}: scrolling a failed page cannot issue retries; scrolling resumes after recovery`, () => {
        for (const tab of screen === 'HubProfile' ? ['tournaments', 'members'] : ['tournaments', 'matches']) {
            let calls = 0;
            const make = error => {
                const bindings = { activeTab: tab, hubTab: tab, hasMoreTournaments: true, hasMoreMatches: true,
                    isLoadingMoreTournaments: false, isLoadingMoreMatches: false,
                    tournamentsError: error, matchesError: error, membersError: error,
                    loadMoreTournaments: () => calls++, loadMoreMatches: () => calls++, loadMoreMembers: () => calls++ };
                const path = `src/screens/${screen}Screen.tsx`;
                return screen === 'HubProfile' ? loadJsxProp(path, 'ScrollView', 'onScroll', bindings) : loadFetcher(path, 'handleScroll', bindings);
            };
            const failed = make(true); failed(bottom); failed(bottom);
            assert.equal(calls, 0);
            make(false)(bottom); assert.equal(calls, 1);
        }
    });
}
