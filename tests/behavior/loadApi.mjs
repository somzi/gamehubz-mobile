import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const axios = require('axios');
const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/api.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
});

// Run the real API module and Axios interceptors, with native storage and transport replaced.
export function loadApi({ get, set, remove, refresh } = {}) {
    const storageModule = { exports: {} };
    const storageCode = ts.transpileModule(readFileSync(new URL('../../src/lib/authStorage.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('exports', storageCode)(storageModule.exports);
    const stored = new Map([['access_token', 'access-A'], ['refresh_token', 'refresh-A']]);
    const native = {
        getItemAsync: get ?? (async key => stored.get(key) ?? null),
        setItemAsync: set ?? (async (key, value) => { stored.set(key, value); }),
        deleteItemAsync: remove ?? (async key => { stored.delete(key); }),
    };
    let refreshCalls = 0;
    const client = axios.create();
    const imports = {
        // isAxiosError is real: without it getErrorMessage throws on every JSON error body and hands the
        // raw body back, which no device ever shows.
        axios: { create: options => { Object.assign(client.defaults, options); return client; },
            isAxiosError: axios.isAxiosError,
            post: async (...args) => { refreshCalls++; return refresh?.(...args) ?? { data: { accessToken: 'access-A2', refreshToken: 'refresh-A2' }, headers: {} }; } },
        'expo-secure-store': native,
        'react-native': { Platform: { OS: 'test' } },
        'expo-constants': { expoConfig: { version: 'test' } },
        '../i18n': { __esModule: true, default: { t: key => key }, getRequestLanguage: () => 'en' },
        './serverClock': { updateServerClockFromDateHeader() {} },
        './authStorage': storageModule.exports,
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', '__DEV__', outputText + '\n//# sourceURL=' + fileURLToPath(new URL('../../src/lib/api.ts', import.meta.url)))(
        name => { if (!(name in imports)) throw Error(`Unexpected import: ${name}`); return imports[name]; },
        module, module.exports, false,
    );
    return { ...module.exports, ...storageModule.exports, stored, refreshCalls: () => refreshCalls };
}

export const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
export const reply = (config, data = {}) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
export const unauthorized = config => Object.assign(Error('Unauthorized'), { config, response: { status: 401, headers: {}, config } });
export const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
