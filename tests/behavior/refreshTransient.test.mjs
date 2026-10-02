// Token refresh failures (src/lib/api.ts): only the server refusing the refresh ends the session.
// No network, a timeout or a 5xx keep it, and the next request refreshes again. Run: npm run test:frontend
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApi, reply, unauthorized } from './loadApi.mjs';

const networkDown = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const timedOut = () => Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' });
const status = (code) => Object.assign(new Error(`Request failed with status code ${code}`), { response: { status: code, headers: {} } });

function expiredSession(refresh) {
    let logouts = 0;
    const api = loadApi({ refresh });
    api.subscribeToLogout(() => { logouts++; });
    api.setAuthToken('access-A');
    api.apiClient.defaults.adapter = async (config) => {
        if (config.headers.Authorization === 'Bearer access-A') throw unauthorized(config);
        return reply(config, { refreshed: true });
    };
    return { api, logouts: () => logouts };
}

for (const [label, failure] of [['no network', networkDown], ['a timeout', timedOut], ['a 503', () => status(503)], ['a 500', () => status(500)]]) {
    test(`a refresh that fails with ${label} keeps the session`, async () => {
        const { api, logouts } = expiredSession(async () => { throw failure(); });
        const response = await api.authenticatedFetch('/profile');
        assert.equal(response.ok, false);
        assert.equal(logouts(), 0);
        assert.equal(api.stored.get('access_token'), 'access-A');
        assert.equal(api.stored.get('refresh_token'), 'refresh-A');
    });
}

test('after a transient refresh failure the next request refreshes and goes through', async () => {
    let attempts = 0;
    const { api, logouts } = expiredSession(async () => {
        attempts++;
        if (attempts === 1) throw networkDown();
        return { data: { accessToken: 'access-A2', refreshToken: 'refresh-A2' }, headers: {} };
    });
    assert.equal((await api.authenticatedFetch('/a')).ok, false);
    assert.equal((await api.authenticatedFetch('/b')).ok, true);
    assert.equal(logouts(), 0);
    assert.equal(api.stored.get('access_token'), 'access-A2');
});

for (const code of [400, 401, 403]) {
    test(`a refresh the server rejects with ${code} ends the session`, async () => {
        const { api, logouts } = expiredSession(async () => { throw status(code); });
        assert.equal((await api.authenticatedFetch('/profile')).ok, false);
        assert.equal(logouts(), 1);
        assert.equal(api.stored.has('access_token'), false);
        assert.equal(api.stored.has('refresh_token'), false);
    });
}

test('a refresh answer without tokens ends the session', async () => {
    const { api, logouts } = expiredSession(async () => ({ data: {}, headers: {} }));
    assert.equal((await api.authenticatedFetch('/profile')).ok, false);
    assert.equal(logouts(), 1);
});
