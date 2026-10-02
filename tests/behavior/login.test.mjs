import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFetcher } from './loadFetcher.mjs';
import { loadApi, deferred, flush } from './loadApi.mjs';
import { load } from './loadModules.mjs';
const { transportErrorKey, RequestTimeoutError } = await load('fetchWithTimeout');

const response = data => ({ text: async () => JSON.stringify(data) });
function loginWith(transport, storage) {
    const state = { loading: false, user: null };
    const { queueAuthStorage } = loadApi();
    const login = loadFetcher('src/context/AuthContext.tsx', 'login', {
        useCallback: fn => fn, sessionVersion: { current: 0 },
        setIsLoading: value => { state.loading = value; }, fetchTextWithTimeout: transport,
        SecureStore: storage, queueAuthStorage, API_BASE_URL: 'https://test.invalid',
        getRequestLanguage: () => 'en', i18n: { t: key => key }, console: { error() {} },
        setToken() {}, setAuthToken() {}, setRefreshToken() {}, normalizeUser: user => user,
        setUser: user => { state.user = user; }, transportErrorKey,
    });
    return { login, state };
}

test('a superseded login cannot leave restorable credentials when the newer login fails', async () => {
    const stored = new Map(), writing = deferred();
    const storage = {
        setItemAsync: async (key, value) => { if (key === 'access_token') await writing.promise; stored.set(key, value); },
        deleteItemAsync: async key => { stored.delete(key); },
    };
    let attempts = 0;
    const { login, state } = loginWith(async () => response(++attempts === 1
        ? { isSuccessful: true, accessToken: { token: 'access-A' }, refreshToken: 'refresh-A', user: { id: 'A' } }
        : { isSuccessful: false, messages: ['invalid'] }), storage);
    const first = login('A', 'password'); await flush();
    assert.equal((await login('B', 'wrong')).success, false);
    writing.resolve(); assert.equal((await first).success, false);
    assert.equal(state.user, null); assert.equal(stored.size, 0);
});

test('an older failed login cannot clear the loader of a newer pending attempt', async () => {
    const first = deferred(), second = deferred(); const responses = [first.promise, second.promise];
    const { login, state } = loginWith(() => responses.shift(), {});
    const a = login('A', 'wrong'), b = login('B', 'wrong');
    first.resolve(response({ isSuccessful: false })); await a;
    assert.equal(state.loading, true);
    second.resolve(response({ isSuccessful: false })); await b; assert.equal(state.loading, false);
});

test('a login with no answer before the deadline says so in the player’s language', async () => {
    const { login } = loginWith(async () => { throw new RequestTimeoutError('Request timed out'); }, {});
    assert.deepEqual(await login('A', 'password'), { success: false, message: 'common:app.requestTimedOut' });
});

test('a login that cannot reach the server shows the translated network error, not the raw transport text', async () => {
    const { login } = loginWith(async () => { throw new TypeError('Network request failed'); }, {});
    assert.deepEqual(await login('A', 'password'), { success: false, message: 'common:app.networkError' });
});

test('registration that times out reports the deadline too', async () => {
    const register = loadFetcher('src/context/AuthContext.tsx', 'register', {
        useCallback: fn => fn, setIsLoading() {}, getRequestLanguage: () => 'en',
        fetchTextWithTimeout: async () => { throw new RequestTimeoutError('Request timed out'); },
        API_BASE_URL: 'https://test.invalid', i18n: { t: key => key }, console: { error() {} }, transportErrorKey,
    });
    assert.deepEqual(await register({}), { success: false, message: 'common:app.requestTimedOut' });
});
