import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApi, deferred, reply, unauthorized, flush } from './loadApi.mjs';

test('an old account 401 cannot replay its mutation under the newly logged-in account', async () => {
    const api = loadApi(), waiting = deferred(); let calls = 0, firstConfig;
    api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = async config => {
        calls++; if (calls === 1) { firstConfig = config; return waiting.promise; }
        return reply(config);
    };
    const request = api.authenticatedFetch('/account-action', { method: 'POST', body: '{}' });
    await flush(); api.setAuthToken(null); api.setAuthToken('access-B');
    waiting.reject(unauthorized(firstConfig));
    assert.equal((await request).ok, false); assert.equal(calls, 1); assert.equal(api.refreshCalls(), 0);
});

test('a successful response from the previous session cannot update the current session', async () => {
    const api = loadApi(), waiting = deferred(); let config;
    api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = next => { config = next; return waiting.promise; };
    const request = api.authenticatedFetch('/profile'); await flush();
    api.setAuthToken(null); api.setAuthToken('access-B'); waiting.resolve(reply(config, { owner: 'A' }));
    assert.equal((await request).ok, false);
});

test('a response body cannot be consumed after its session has ended', async () => {
    const api = loadApi(); api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = async config => reply(config, { owner: 'A' });
    const response = await api.authenticatedFetch('/profile'); assert.equal(response.ok, true);
    api.setAuthToken(null); api.setAuthToken('access-B');
    await assert.rejects(response.json(), /Session ended/);
    await assert.rejects(response.text(), /Session ended/);
});

test('a delayed cold-start storage read cannot restore credentials after logout', async () => {
    const waiting = deferred(); let reads = 0, calls = 0;
    const api = loadApi({ get: () => { reads++; return waiting.promise; } });
    api.apiClient.defaults.adapter = async config => { calls++; return reply(config); };
    const request = api.authenticatedFetch('/profile'); await flush();
    api.setAuthToken(null); waiting.resolve('access-A');
    assert.equal((await request).ok, false); assert.equal(calls, 0);
    await api.authenticatedFetch('/public'); assert.equal(reads, 1);
});

test('concurrent expired-token requests still share one refresh in the same session', async () => {
    const waiting = deferred(), api = loadApi({ refresh: () => waiting.promise });
    api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = async config => {
        if (config.headers.Authorization === 'Bearer access-A') throw unauthorized(config);
        return reply(config, { refreshed: true });
    };
    const a = api.authenticatedFetch('/a'), b = api.authenticatedFetch('/b'); await flush();
    assert.equal(api.refreshCalls(), 1);
    waiting.resolve({ data: { accessToken: 'access-A2', refreshToken: 'refresh-A2' }, headers: {} });
    assert.equal((await a).ok, true); assert.equal((await b).ok, true);
});

test('a late failed refresh cannot log out a newer session', async () => {
    const waiting = deferred(), api = loadApi({ refresh: () => waiting.promise }); let logouts = 0;
    api.subscribeToLogout(() => { logouts++; }); api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = async config => { throw unauthorized(config); };
    const request = api.authenticatedFetch('/old'); await flush();
    api.setAuthToken(null); api.setAuthToken('access-B'); waiting.reject(Error('refresh failed'));
    assert.equal((await request).ok, false); assert.equal(logouts, 0);
});

test('logout and a new login follow any token write already in progress', async () => {
    const stored = new Map([['access_token', 'access-A'], ['refresh_token', 'refresh-A']]);
    const write = deferred(); let writing = false;
    const api = loadApi({ get: async key => stored.get(key), set: async (key, value) => {
        if (value === 'access-A2') { writing = true; await write.promise; }
        stored.set(key, value);
    } });
    api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = async config => { throw unauthorized(config); };
    const request = api.authenticatedFetch('/old'); await flush(); assert.equal(writing, true);
    api.setAuthToken(null);
    const logout = api.queueAuthStorage(async () => { stored.clear(); });
    const login = api.queueAuthStorage(async () => {
        stored.set('access_token', 'access-B'); stored.set('refresh_token', 'refresh-B');
    }).then(() => api.setAuthToken('access-B'));
    await flush(); write.resolve(); await request; await logout; await login;
    assert.equal(stored.get('access_token'), 'access-B'); assert.equal(stored.get('refresh_token'), 'refresh-B');
});

test('an upload cannot retry with another account after a late 401', async () => {
    const original = globalThis.fetch, waiting = deferred(), api = loadApi(); let uploads = 0;
    api.setAuthToken('access-A');
    globalThis.fetch = async () => { uploads++; return waiting.promise; };
    try {
        const request = api.authenticatedFetch('https://test.invalid/evidence', { method: 'POST', body: new FormData() });
        await flush(); api.setAuthToken(null); api.setAuthToken('access-B');
        waiting.resolve({ ok: false, status: 401, headers: new Headers(), text: async () => 'Unauthorized' });
        assert.equal((await request).ok, false); assert.equal(uploads, 1); assert.equal(api.refreshCalls(), 0);
    } finally { globalThis.fetch = original; }
});
