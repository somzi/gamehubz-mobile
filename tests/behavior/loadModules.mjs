import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');
const dir = mkdtempSync(join(tmpdir(), 'gamehubz-behavior-'));
for (const name of ['mergeMessages', 'chatHistory', 'chatOutbox', 'chatWorkspace', 'modalReturn', 'matchPresentation', 'queryPolicy', 'requestGate', 'fetchWithTimeout', 'signalR', 'refreshFailures', 'coalesce', 'delayedNotice']) {
    let { outputText } = ts.transpileModule(readFileSync(join(root, `src/lib/${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });
    outputText = outputText.replaceAll("'./mergeMessages'", "'./mergeMessages.mjs'")
        .replaceAll("'./chatOutbox'", "'./chatOutbox.mjs'")
        .replaceAll("'@microsoft/signalr'", JSON.stringify(pathToFileURL(require.resolve('@microsoft/signalr')).href));
    writeFileSync(join(dir, `${name}.mjs`), outputText);
}
export const load = (name) => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
