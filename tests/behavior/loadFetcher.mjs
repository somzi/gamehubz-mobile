import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');

// Exercise the actual async fetcher inside a screen with controlled request completion.
// Rendering/native layout still needs device coverage; these tests cover state commits.
function loadFunction(path, select, bindings) {
    const source = ts.createSourceFile(path, readFileSync(new URL('../../' + path, import.meta.url), 'utf8'),
        ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer;
    const visit = node => {
        const selected = select(node, source);
        if (selected) initializer = selected;
        ts.forEachChild(node, visit);
    };
    visit(source);
    if (!initializer) throw Error('Missing callback in: ' + path);
    const { outputText } = ts.transpileModule('const run = ' + initializer.getText(source) + ';', {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    });
    return new Function(...Object.keys(bindings), outputText + ';return run;')(...Object.values(bindings));
}

export const loadFetcher = (path, name, bindings) => loadFunction(path, (node, source) =>
    ts.isVariableDeclaration(node) && node.name.getText(source) === name ? node.initializer : null, bindings);

export const loadConversationCallback = (path, name, bindings) => loadFunction(path, (node, source) => {
    if (!ts.isCallExpression(node) || node.expression.getText(source) !== 'useChatConversation') return null;
    return node.arguments[0]?.properties?.find(property => property.name?.getText(source) === name)?.initializer;
}, bindings);
