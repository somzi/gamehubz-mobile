const { spawnSync } = require('node:child_process');
const { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const USAGE = 'npm run update:ota -- --channel production --message "Quick fix" [--dry-run]';

function publishOta({
    root = path.resolve(__dirname, '..'),
    args = process.argv.slice(2),
    env = process.env,
    run = spawnSync,
    log = console.log,
} = {}) {
    const { values } = parseArgs({
        args,
        options: {
            channel: { type: 'string' },
            message: { type: 'string', short: 'm' },
            environment: { type: 'string' },
            platform: { type: 'string', default: 'all', short: 'p' },
            'non-interactive': { type: 'boolean' },
            'dry-run': { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (values.help) {
        log(USAGE);
        return 0;
    }
    const environments = ['production', 'preview', 'development'];
    if (!environments.includes(values.channel) || !values.message?.trim()) {
        throw new Error(`Choose production, preview or development and provide a message.\n${USAGE}`);
    }
    const environment = values.environment ?? values.channel;
    if (!environments.includes(environment) || !['all', 'ios', 'android'].includes(values.platform)) {
        throw new Error('Invalid environment or platform (use all, ios or android).');
    }
    if (!values['dry-run'] && !env.npm_execpath) {
        throw new Error(`Run through npm so the EAS CLI can be launched on Windows and macOS.\n${USAGE}`);
    }

    // Hold the lock through export/publish so another local run cannot change its metadata.
    const lockPath = path.join(root, '.ota-publish.lock');
    let lock;
    if (!values['dry-run']) {
        try {
            lock = openSync(lockPath, 'wx');
        } catch (error) {
            if (error.code === 'EEXIST') {
                throw new Error('An OTA publish is already running. If a previous process was killed, remove .ota-publish.lock after confirming it has stopped.');
            }
            throw error;
        }
    }

    try {
        const { expo } = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
        if (!/^\d+\.\d+\.\d+$/.test(expo.version) || expo.runtimeVersion?.policy !== 'appVersion') {
            throw new Error('Expected an x.y.z app version and runtimeVersion.policy = appVersion.');
        }
        const revisionsPath = path.join(root, 'ota-revisions.json');
        const revisions = JSON.parse(readFileSync(revisionsPath, 'utf8'));
        if (!revisions || Array.isArray(revisions) || typeof revisions !== 'object') {
            throw new Error('Invalid ota-revisions.json; expected a map of app versions to revision numbers.');
        }
        const previous = revisions[expo.version] ?? 0;
        if (!Number.isSafeInteger(previous) || previous < 0 || previous >= Number.MAX_SAFE_INTEGER) {
            throw new Error('Invalid OTA revision counter.');
        }
        const revision = previous + 1;
        const label = `${expo.version}-r${revision}`;
        log(`${values['dry-run'] ? 'Would publish' : 'Publishing'} ${label} to ${values.channel} (${values.platform}, environment: ${environment}).`);
        if (values['dry-run']) return 0;

        // Reserve before publishing. Never reuse a number after a failure: a network error
        // can happen after EAS accepted the update, or after only one platform succeeded.
        writeFileSync(revisionsPath, `${JSON.stringify({ ...revisions, [expo.version]: revision }, null, 2)}\n`);
        log('Revision reserved. Commit ota-revisions.json after this run, including after a failed publish.');
        const cliArgs = [
            env.npm_execpath, 'exec', '--yes', '--package=eas-cli', '--', 'eas', 'update',
            '--channel', values.channel,
            '--environment', environment,
            '--platform', values.platform,
            '--message', `${label}: ${values.message}`,
        ];
        if (values['non-interactive']) cliArgs.push('--non-interactive');

        // Invoke npm through Node (no shell command interpolation or Windows .cmd issues).
        // Every run exports fresh bundles; accepting --skip-bundler could ship stale metadata.
        const result = run(process.execPath, cliArgs, {
            cwd: root,
            stdio: 'inherit',
            env: { ...env, APP_VARIANT: values.channel === 'development' ? 'development' : 'production' },
        });
        if (result.error) throw result.error;
        return result.status ?? 1;
    } finally {
        if (lock !== undefined) {
            closeSync(lock);
            unlinkSync(lockPath);
        }
    }
}

if (require.main === module) {
    try {
        process.exitCode = publishOta();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { publishOta };
