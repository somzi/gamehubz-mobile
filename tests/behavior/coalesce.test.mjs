// Shared match-list refetch (src/lib/coalesce.ts): badge pushes and chat reads in one window
// cost one request. Run: npm run test:frontend
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
const { createCoalescer } = await load('coalesce');

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a burst of requests inside one window runs once, at its end', async () => {
    let runs = 0;
    const refresh = createCoalescer(() => { runs++; }, 30);
    for (let i = 0; i < 5; i++) refresh.schedule();
    assert.equal(runs, 0);
    await later(45);
    assert.equal(runs, 1);
});

test('a request after the window closed starts a new one, so a later change is never lost', async () => {
    let runs = 0;
    const refresh = createCoalescer(() => { runs++; }, 20);
    refresh.schedule(); await later(30);
    refresh.schedule(); await later(30);
    assert.equal(runs, 2);
});

test('cancel drops a pending run', async () => {
    let runs = 0;
    const refresh = createCoalescer(() => { runs++; }, 20);
    refresh.schedule(); refresh.cancel(); await later(30);
    assert.equal(runs, 0);
});
