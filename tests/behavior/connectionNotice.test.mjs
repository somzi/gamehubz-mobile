// The chat's connection notice (src/lib/delayedNotice.ts, ChatConnectionStatus): an ordinary
// connect or a short reconnect shows nothing; a long wait is announced. Run: npm run test:frontend
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
const { createDelayedNotice } = await load('delayedNotice');

function notice() {
    const changes = [];
    return { changes, notice: createDelayedNotice((shown) => changes.push(shown), 1200) };
}

test('a connection that comes up quickly never shows the notice', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const { changes, notice: n } = notice();
        n.set(true); mock.timers.tick(800); n.set(false); mock.timers.tick(2000);
        assert.deepEqual(changes, []);
    } finally { mock.timers.reset(); }
});

test('a wait the player would notice is announced, and cleared the moment it connects', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const { changes, notice: n } = notice();
        n.set(true); mock.timers.tick(1200);
        assert.deepEqual(changes, [true]);
        n.set(true); mock.timers.tick(5000); // still waiting: no second announcement
        n.set(false);
        assert.deepEqual(changes, [true, false]);
    } finally { mock.timers.reset(); }
});

test('disposing drops a pending announcement', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const { changes, notice: n } = notice();
        n.set(true); n.dispose(); mock.timers.tick(5000);
        assert.deepEqual(changes, []);
    } finally { mock.timers.reset(); }
});
