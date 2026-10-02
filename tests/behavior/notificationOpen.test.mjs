// Opening a notification from the inbox (NotificationsScreen handlePress): while a DM's target is
// looked up, its row shows a spinner; the spinner goes once the navigation went, or when another
// tap supersedes the first. Run: npm run test:frontend
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFetcher } from './loadFetcher.mjs';
import { deferred, flush } from './loadApi.mjs';

function inbox(route) {
    const state = { opening: null, alerts: 0 };
    const handlePress = loadFetcher('src/screens/NotificationsScreen.tsx', 'handlePress', {
        useCallback: fn => fn, openRequest: { current: 0 }, markRead() {},
        externalLinkFromNotification: () => null, Linking: {}, routeFromNotification: route,
        navigation: { isFocused: () => true }, Alert: { alert() { state.alerts++; } }, t: key => key,
        setOpeningId: value => { state.opening = value; }, console: { warn() {} },
    });
    return { state, handlePress };
}

test('a DM row shows its spinner while the chat is looked up, and drops it once opened', async () => {
    const lookup = deferred();
    const { state, handlePress } = inbox(() => lookup.promise);
    const pending = handlePress({ id: 'n1', readOn: 'x', data: { type: 'direct_message', chatId: 'c1' } });
    await flush();
    assert.equal(state.opening, 'n1');
    lookup.resolve({ name: 'DirectChat', params: { chatId: 'c1' } }); await pending;
    assert.equal(state.opening, null);
});

test('a second tap supersedes the first: the first lookup cannot clear the new spinner', async () => {
    const first = deferred(), second = deferred(), lookups = [first.promise, second.promise];
    const { state, handlePress } = inbox(() => lookups.shift());
    const a = handlePress({ id: 'n1', readOn: 'x', data: {} });
    const b = handlePress({ id: 'n2', readOn: 'x', data: {} });
    await flush();
    first.resolve(null); await a;
    assert.equal(state.opening, 'n2');
    assert.equal(state.alerts, 0); // the superseded tap says nothing
    second.resolve({ name: 'TournamentDetails', params: { id: 'A' } }); await b;
    assert.equal(state.opening, null);
});

test('a failed lookup still drops the spinner', async () => {
    const { state, handlePress } = inbox(async () => { throw new Error('offline'); });
    await assert.rejects(handlePress({ id: 'n1', readOn: 'x', data: {} }));
    assert.equal(state.opening, null);
});

test('a link notification tapped while a DM is opening clears that DM row’s spinner', async () => {
    const lookup = deferred(); const opened = [];
    const state = { opening: null };
    const handlePress = loadFetcher('src/screens/NotificationsScreen.tsx', 'handlePress', {
        useCallback: fn => fn, openRequest: { current: 0 }, markRead() {},
        externalLinkFromNotification: data => data.url ?? null,
        Linking: { openURL: async url => { opened.push(url); } },
        routeFromNotification: () => lookup.promise,
        navigation: { isFocused: () => true }, Alert: { alert() {} }, t: key => key,
        setOpeningId: value => { state.opening = value; }, console: { warn() {} },
    });
    const dm = handlePress({ id: 'n1', readOn: 'x', data: { type: 'direct_message', chatId: 'c1' } });
    await flush();
    assert.equal(state.opening, 'n1');
    await handlePress({ id: 'n2', readOn: 'x', data: { type: 'link', url: 'https://example.test' } });
    assert.equal(state.opening, null);
    assert.deepEqual(opened, ['https://example.test']);
    // The superseded DM lookup finishing later does not bring a spinner back.
    lookup.resolve({ name: 'DirectChat', params: { chatId: 'c1' } }); await dm;
    assert.equal(state.opening, null);
});
