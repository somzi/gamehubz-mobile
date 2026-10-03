import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
import { deferred, flush } from './loadApi.mjs';
const { createChatReadReceipts } = await load('chatReadReceipts');
const later = ms => new Promise(resolve => setTimeout(resolve, ms));

test('first read starts immediately; backfill shares it and subsequent new messages wait', async () => {
    const response = deferred(); let calls = 0;
    const queue = createChatReadReceipts(() => { calls++; return calls === 1 ? response.promise : undefined; }, 10);
    queue.schedule('m1');
    assert.equal(calls, 1);
    queue.schedule('m1'); assert.equal(calls, 1);
    response.resolve(); await flush();
    queue.schedule('m1'); assert.equal(calls, 1);
    queue.schedule('m2'); queue.schedule('m3');
    assert.equal(calls, 1);
    await later(25); assert.equal(calls, 2);
    queue.close();
});

test('history, join backfill and reconnect with the same tail cost one read', async () => {
    let calls = 0;
    const queue = createChatReadReceipts(() => { calls++; }, 10);
    queue.schedule('m1'); queue.schedule('m1');
    await later(25); assert.equal(calls, 1);
    queue.schedule('m1'); await later(25); assert.equal(calls, 1);
    queue.schedule('m2'); queue.schedule('m3'); await later(25); assert.equal(calls, 2);
    queue.close();
});

test('blur flushes seen messages once, and never accepts a hidden new message', async () => {
    let calls = 0;
    const queue = createChatReadReceipts(() => { calls++; }, 10);
    queue.schedule('m1'); await flush();
    queue.schedule('m2'); assert.equal(calls, 1);
    queue.close(); assert.equal(calls, 2);
    queue.schedule('hidden'); queue.close();
    await later(25); assert.equal(calls, 2);
});

test('reads do not overlap and a failed read can be retried by the next history refresh', async () => {
    const response = deferred(); let calls = 0;
    const queue = createChatReadReceipts(() => { calls++; return calls === 1 ? response.promise : undefined; }, 10);
    queue.schedule('m1'); await later(25);
    queue.schedule('m2'); await later(25); assert.equal(calls, 1);
    response.reject(Error('offline')); await flush(); await later(25); assert.equal(calls, 2);
    queue.schedule('m2'); await later(25); assert.equal(calls, 2);
    queue.close();
});

test('failure does not permanently suppress reading the same message', async () => {
    let calls = 0;
    const queue = createChatReadReceipts(async () => { if (++calls === 1) throw Error('offline'); }, 10);
    queue.schedule('m1'); await later(25); queue.schedule('m1'); await later(25);
    assert.equal(calls, 2); queue.close();
});
