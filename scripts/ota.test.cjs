const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, rmdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { publishOta } = require('./publish-ota.cjs');

const projectRoot = path.resolve(__dirname, '..');
const baseConfig = JSON.parse(readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
const args = ['--channel', 'production', '--message', 'Fix "score" & notifications'];

function fixture(t) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gamehubz-ota-'));
    const appPath = path.join(root, 'app.json');
    const revisionsPath = path.join(root, 'ota-revisions.json');
    writeFileSync(appPath, JSON.stringify({ expo: baseConfig }));
    writeFileSync(revisionsPath, JSON.stringify({ [baseConfig.version]: 0 }));
    copyFileSync(path.join(projectRoot, 'app.config.js'), path.join(root, 'app.config.js'));
    t.after(() => {
        // Only remove the known fixture files; do not recursively delete a computed path.
        for (const name of ['app.json', 'ota-revisions.json', 'app.config.js', '.ota-publish.lock']) {
            const file = path.join(root, name);
            if (existsSync(file)) unlinkSync(file);
        }
        rmdirSync(root);
    });
    const options = {
        root, args, env: { npm_execpath: '/npm/npm-cli.js' }, log() {},
        run() { return { status: 0 }; },
    };
    return {
        root, appPath, revisionsPath, options,
        counters: () => JSON.parse(readFileSync(revisionsPath, 'utf8')),
        config: () => require(path.join(root, 'app.config.js'))({ config: baseConfig }),
    };
}

test('publishes r1 then r2 with unchanged native config and the same revision in metadata/message', (t) => {
    const f = fixture(t);
    const originalApp = readFileSync(f.appPath, 'utf8');
    for (const revision of [1, 2]) {
        const status = publishOta({ ...f.options, run(command, cliArgs, options) {
            assert.equal(command, process.execPath);
            assert.deepEqual(cliArgs.slice(0, 7), ['/npm/npm-cli.js', 'exec', '--yes', '--package=eas-cli', '--', 'eas', 'update']);
            assert.equal(cliArgs[cliArgs.indexOf('--message') + 1], `${baseConfig.version}-r${revision}: ${args[3]}`);
            assert.equal(cliArgs[cliArgs.indexOf('--platform') + 1], 'all');
            assert.equal(cliArgs[cliArgs.indexOf('--environment') + 1], 'production');
            assert.equal(options.env.APP_VARIANT, 'production');
            assert.equal(options.shell, undefined);
            const { extra, ...nativeConfig } = f.config();
            const { extra: originalExtra, ...originalNative } = baseConfig;
            assert.deepEqual(nativeConfig, originalNative);
            assert.deepEqual(extra, { ...originalExtra, otaRelease: { baseVersion: baseConfig.version, revision } });
            assert.equal(readFileSync(f.appPath, 'utf8'), originalApp);
            return { status: 0 };
        } });
        assert.equal(status, 0);
        assert.equal(f.counters()[baseConfig.version], revision);
        assert.equal(existsSync(path.join(f.root, '.ota-publish.lock')), false);
    }
});

test('dry-run neither reserves a number nor invokes EAS', (t) => {
    const f = fixture(t);
    const before = readFileSync(f.revisionsPath, 'utf8');
    assert.equal(publishOta({ ...f.options, args: [...args, '--dry-run'], run() { assert.fail('Must not publish'); } }), 0);
    assert.equal(readFileSync(f.revisionsPath, 'utf8'), before);
    assert.equal(existsSync(path.join(f.root, '.ota-publish.lock')), false);
});

test('failed or interrupted publishes never reuse a revision and release the lock', (t) => {
    const f = fixture(t);
    assert.equal(publishOta({ ...f.options, run: () => ({ status: 7 }) }), 7);
    assert.equal(publishOta({ ...f.options, run: () => ({ status: null, signal: 'SIGINT' }) }), 1);
    assert.throws(() => publishOta({ ...f.options, run: () => ({ error: new Error('CLI failed') }) }), /CLI failed/);
    assert.equal(f.counters()[baseConfig.version], 3);
    assert.equal(publishOta(f.options), 0);
    assert.equal(f.counters()[baseConfig.version], 4);
});

test('new store versions start at r1 while older runtime counters remain available', (t) => {
    const f = fixture(t);
    publishOta(f.options);
    writeFileSync(f.appPath, JSON.stringify({ expo: { ...baseConfig, version: '99.0.0' } }));
    publishOta(f.options);
    writeFileSync(f.appPath, JSON.stringify({ expo: baseConfig }));
    publishOta(f.options);
    assert.deepEqual(f.counters(), { [baseConfig.version]: 2, '99.0.0': 1 });
});

test('invalid options and stale bundle flags cannot reserve or publish a revision', (t) => {
    const f = fixture(t);
    for (const invalid of [[], [...args, '--skip-bundler'], [...args, '--platform', 'web']]) {
        assert.throws(() => publishOta({ ...f.options, args: invalid, run() { assert.fail('Must not publish'); } }));
    }
    assert.equal(f.counters()[baseConfig.version], 0);
    writeFileSync(f.revisionsPath, JSON.stringify({ [baseConfig.version]: -1 }));
    assert.throws(() => publishOta(f.options), /Invalid OTA revision/);
    assert.equal(existsSync(path.join(f.root, '.ota-publish.lock')), false);
});

test('overlapping publishes cannot change the revision during export', (t) => {
    const f = fixture(t);
    publishOta({ ...f.options, run() {
        assert.throws(() => publishOta(f.options), /already running/);
        assert.equal(f.counters()[baseConfig.version], 1);
        return { status: 0 };
    } });
});

test('development publishes choose the development variant and honor platform/CI flags', (t) => {
    const f = fixture(t);
    publishOta({ ...f.options,
        args: ['--channel', 'development', '-m', 'Dev fix', '-p', 'ios', '--non-interactive'],
        run(command, cliArgs, options) {
            assert.equal(options.env.APP_VARIANT, 'development');
            assert.equal(cliArgs[cliArgs.indexOf('--environment') + 1], 'development');
            assert.equal(cliArgs[cliArgs.indexOf('--platform') + 1], 'ios');
            assert.ok(cliArgs.includes('--non-interactive'));
            return { status: 0 };
        },
    });
});

const releaseCode = ts.transpileModule(readFileSync(path.join(projectRoot, 'src/lib/appRelease.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function releaseLabel(release, updates = {}) {
    const exports = {};
    vm.runInNewContext(releaseCode, { exports, require(name) {
        if (name === 'expo-constants') return { expoConfig: { version: baseConfig.version, extra: { otaRelease: release } } };
        if (name === 'expo-updates') return {
            isEnabled: true, isEmbeddedLaunch: false, updateId: 'a1b2c3d4-0000-0000-0000-000000000000', ...updates,
        };
        throw new Error(`Unexpected module: ${name}`);
    } });
    return exports.getAppReleaseLabel();
}

test('the displayed revision is from the running update, including when a newer one is downloaded', () => {
    const release = { baseVersion: baseConfig.version, revision: 1 };
    assert.equal(releaseLabel(release, { downloadedUpdate: { extra: { otaRelease: { ...release, revision: 2 } } } }), `${baseConfig.version}-r1`);
    assert.equal(releaseLabel({ ...release, revision: 2 }), `${baseConfig.version}-r2`);
    assert.equal(releaseLabel(release), `${baseConfig.version}-r1`); // rollback
    assert.equal(releaseLabel(release, { isEmbeddedLaunch: true }), baseConfig.version);
    assert.equal(releaseLabel(release, { isEnabled: false }), baseConfig.version);
    assert.equal(releaseLabel(release, { updateId: null }), baseConfig.version);
});

test('missing, malformed or mismatched metadata falls back to the actual update ID', () => {
    for (const release of [undefined, null, { baseVersion: 'other', revision: 1 },
        ...[0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map(revision => ({ baseVersion: baseConfig.version, revision }))]) {
        assert.equal(releaseLabel(release), `${baseConfig.version} · OTA a1b2c3d4`);
    }
});
