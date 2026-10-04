import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDeclaredFunction, loadFetcher } from './loadFetcher.mjs';
import { deferred, flush } from './loadApi.mjs';

const path = 'src/lib/notificationSettings.ts';
const setSourceNotifications = loadDeclaredFunction(path, 'setSourceNotifications', {});
const sourceNotificationState = loadDeclaredFunction(path, 'sourceNotificationState', {});
const supportsSourceMuting = loadDeclaredFunction(path, 'supportsSourceMuting', {});
const defaults = () => ({ moderatedChatNotifications: true, mutedHubIds: [], mutedTournamentIds: [] });
const tournament = { id: 't1', name: 'Cup', hubId: 'h1', hubName: 'Hub' };

test('muting a hub disables its tournaments without changing their individual preferences', () => {
    const settings = setSourceNotifications(defaults(), 'hubs', 'h1', false);
    assert.deepEqual(sourceNotificationState(settings, 'tournaments', tournament), { enabled: false, inheritedMute: true });
    assert.deepEqual(settings.mutedTournamentIds, []);
    assert.equal(sourceNotificationState(settings, 'tournaments', { ...tournament, hubId: 'h2' }).enabled, true);
});

test('unmuting a hub preserves a tournament that was explicitly muted', () => {
    let settings = setSourceNotifications(defaults(), 'tournaments', 't1', false);
    settings = setSourceNotifications(settings, 'hubs', 'h1', false);
    settings = setSourceNotifications(settings, 'hubs', 'h1', true);
    assert.deepEqual(sourceNotificationState(settings, 'tournaments', tournament), { enabled: false, inheritedMute: false });
    assert.equal(sourceNotificationState(settings, 'tournaments', { ...tournament, id: 't2' }).enabled, true);
});

test('turning notifications back on removes only the selected source', () => {
    const before = { ...defaults(), moderatedChatNotifications: false, mutedHubIds: ['h1', 'h2'], mutedTournamentIds: ['t1'] };
    const after = setSourceNotifications(before, 'hubs', 'h1', true);
    assert.deepEqual(after, { ...before, mutedHubIds: ['h2'] });
    assert.deepEqual(before.mutedHubIds, ['h1', 'h2']);
});

test('old backend is not treated as supporting source muting', () => {
    assert.equal(supportsSourceMuting({ moderatedChatNotifications: true }), false);
    assert.equal(supportsSourceMuting({ ...defaults(), mutedTournamentIds: null }), false);
    assert.equal(supportsSourceMuting(defaults()), true);
});

function saveHarness(request) {
    const settings = defaults();
    const state = { data: settings, saving: false, error: false, calls: [] };
    const savingRef = { current: false };
    const save = loadFetcher('src/screens/NotificationSettingsScreen.tsx', 'saveSettings', {
        settings, savingRef, supportsSourceMuting, settingsKey: ['notification-settings', 'user-a'],
        setIsSaving: value => { state.saving = value; },
        setShowSaveFailed: value => { state.error = value; },
        queryClient: { cancelQueries: async () => {}, setQueryData: (key, value) => { state.data = value; } },
        authenticatedFetch: async (url, options) => { state.calls.push({ url, ...options }); return request(); },
        ENDPOINTS: { NOTIFICATION_SETTINGS: '/settings' }, console: { error() {} },
    });
    return { save, state, settings };
}

test('a failed save rolls back the visible switches and releases the saving lock', async () => {
    const pending = deferred();
    const { save, state, settings } = saveHarness(() => pending.promise);
    const next = setSourceNotifications(settings, 'hubs', 'h1', false);
    const saving = save(next);
    await flush();
    assert.deepEqual(state.data, next);
    assert.equal(state.saving, true);
    pending.resolve({ ok: false, status: 500 });
    await saving;
    assert.deepEqual(state.data, settings);
    assert.equal(state.error, true);
    assert.equal(state.saving, false);
});

test('rapid switches cannot send overlapping requests with stale exclusion lists', async () => {
    const pending = deferred();
    const { save, state, settings } = saveHarness(() => pending.promise);
    const next = setSourceNotifications(settings, 'tournaments', 't1', false);
    const a = save(next);
    const b = save(setSourceNotifications(settings, 'hubs', 'h1', false));
    await flush();
    assert.equal(state.calls.length, 1);
    assert.deepEqual(JSON.parse(state.calls[0].body), next);
    pending.resolve({ ok: true, json: async () => next });
    await Promise.all([a, b]);
    assert.deepEqual(state.data, next);
    assert.equal(state.error, false);
});

test('a 200 response from an older server cannot falsely confirm a mute', async () => {
    const { save, state, settings } = saveHarness(async () => ({ ok: true, json: async () => ({ moderatedChatNotifications: true }) }));
    await save(setSourceNotifications(settings, 'hubs', 'h1', false));
    assert.equal(state.error, true);
    assert.deepEqual(state.data, settings);
});

test('network errors roll back and allow another save', async () => {
    const { save, state, settings } = saveHarness(async () => { throw new Error('offline'); });
    const next = setSourceNotifications(settings, 'tournaments', 't1', false);
    await save(next);
    await save(next);
    assert.equal(state.calls.length, 2);
    assert.deepEqual(state.data, settings);
    assert.equal(state.saving, false);
});
