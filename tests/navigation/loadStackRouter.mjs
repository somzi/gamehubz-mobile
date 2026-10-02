// Loads src/navigation/stackRouter.ts into Node without a bundler: TypeScript (already a dev
// dependency) strips the types, and the one import that would pull in React Native,
// '@react-navigation/native', is pointed at '@react-navigation/routers', which is where the
// StackRouter and StackActions it re-exports come from.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

const routersUrl = pathToFileURL(
    join(root, 'node_modules', '@react-navigation', 'routers', 'lib', 'module', 'index.js'),
).href;

function transpile(relativePath, rewrite) {
    const source = readFileSync(join(root, relativePath), 'utf8');
    let { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });
    for (const [from, to] of rewrite) outputText = outputText.split(`'${from}'`).join(`'${to}'`);
    return outputText;
}

export async function loadStackRouter() {
    const dir = mkdtempSync(join(tmpdir(), 'gamehubz-nav-'));
    writeFileSync(join(dir, 'chatOutbox.mjs'), transpile('src/lib/chatOutbox.ts', []));
    writeFileSync(join(dir, 'chatWorkspace.mjs'), transpile('src/lib/chatWorkspace.ts', [['./chatOutbox', './chatOutbox.mjs']]));
    writeFileSync(join(dir, 'modalReturn.mjs'), transpile('src/lib/modalReturn.ts', []));
    writeFileSync(join(dir, 'navigationLog.mjs'), transpile('src/lib/navigationLog.ts', []));
    writeFileSync(
        join(dir, 'stackRouter.mjs'),
        transpile('src/navigation/stackRouter.ts', [
            ['@react-navigation/native', routersUrl],
            ['../lib/navigationLog', './navigationLog.mjs'],
            ['../lib/chatWorkspace', './chatWorkspace.mjs'],
            ['../lib/modalReturn', './modalReturn.mjs'],
        ]),
    );
    const [routerModule, routers, log] = await Promise.all([
        import(pathToFileURL(join(dir, 'stackRouter.mjs')).href),
        import(routersUrl),
        import(pathToFileURL(join(dir, 'navigationLog.mjs')).href),
    ]);
    return { ...routerModule, ...routers, log, ...(await import(pathToFileURL(join(dir, 'chatWorkspace.mjs')).href)), ...(await import(pathToFileURL(join(dir, 'modalReturn.mjs')).href)) };
}

export async function loadStackTransitions() {
    const dir = mkdtempSync(join(tmpdir(), 'gamehubz-nav-'));
    writeFileSync(join(dir, 'stackTransitions.mjs'), transpile('src/navigation/stackTransitions.ts', []));
    return import(pathToFileURL(join(dir, 'stackTransitions.mjs')).href);
}

export async function loadDirectChatTarget() {
    const dir = mkdtempSync(join(tmpdir(), 'gamehubz-nav-'));
    writeFileSync(join(dir, 'directChatTarget.mjs'), transpile('src/navigation/directChatTarget.ts', []));
    return import(pathToFileURL(join(dir, 'directChatTarget.mjs')).href);
}
