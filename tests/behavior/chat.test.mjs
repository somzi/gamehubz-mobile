import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
const { loadChatHistory } = await load('chatHistory');
const { createChatOutbox } = await load('chatOutbox');
const { createRequestGate } = await load('requestGate');
const { mergeMessagesById } = await load('mergeMessages');
const message = n => ({ id: String(n), sentAt: new Date(n * 1000).toISOString() });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject}; };

test('a fresh chat loads exactly one page', async () => {
    let calls = 0;
    const result = await loadChatHistory({ isCurrent: () => true, loadPage: async () => {calls++; return [message(1),message(2)];}, pageSize: 2 });
    assert.equal(calls, 1); assert.equal(result.hasMore, true);
});
test('reconnect fills the entire gap and tolerates overlapping pages', async () => {
    const pages = [[8,7,6],[6,5,4],[4,3,2]];
    const cursors = [];
    const result = await loadChatHistory({anchor: message(3),pageSize:3,isCurrent:()=>true,loadPage:async before => {
        cursors.push(before); return pages.shift().map(message);
    }});
    assert.deepEqual(result.messages.map(m => m.id), ['2','3','4','5','6','7','8']);
    assert.deepEqual(cursors, [undefined,message(6).sentAt,message(4).sentAt]);
});
test('leaving a chat discards the response and stops backfill', async () => {
    let active = true, calls = 0;
    const wait = deferred();
    const result = loadChatHistory({anchor:message(1),pageSize:1,isCurrent:()=>active,loadPage:async()=>{calls++;await wait.promise;return [message(5)];}});
    active = false; wait.resolve();
    assert.equal(await result, null); assert.equal(calls,1);
});
test('failed history does not turn into an empty result', async () => {
    await assert.rejects(loadChatHistory({isCurrent:()=>true,loadPage:async()=>{throw Error('offline');}}), /offline/);
});
test('duplicate messages in one response and SignalR echo produce one row', () => {
    assert.deepEqual(mergeMessagesById([message(1)], [message(1),message(2),message(2)]).map(m=>m.id),['1','2']);
});
test('a later request invalidates the previous one without cancelling other resources', () => {
    const gate=createRequestGate(), first=gate.begin('details'), list=gate.begin('list');
    const next=gate.begin('details'); assert.equal(first(),false); assert.equal(next(),true); assert.equal(list(),true);
    gate.clear(); assert.equal(next(),false); assert.equal(list(),false);
});
test('failed outgoing text stays separate from the next draft and retries exactly once', async () => {
    let rows = [], calls = [];
    const first = deferred(), retry = deferred();
    const outbox = createChatOutbox(async content => {calls.push(content); await (calls.length===1?first.promise:retry.promise);}, value=>{rows=value;});
    const sending = outbox.send('first message');
    const id=rows[0].id; assert.equal(rows[0].state,'sending');
    first.reject(Error('offline')); assert.equal(await sending,false); assert.equal(rows[0].state,'failed');
    const attempt=outbox.retry(id); assert.equal(await outbox.retry(id),false);
    assert.deepEqual(calls,['first message','first message']);
    retry.resolve(); assert.equal(await attempt,true); assert.deepEqual(rows,[]);
});
test('failure of an earlier message cannot overwrite a newer pending message', async () => {
    const a=deferred(), b=deferred();let rows=[];
    const outbox=createChatOutbox(content=>content==='A'?a.promise:b.promise, value=>{rows=value;});
    const first=outbox.send('A'),second=outbox.send('B');a.reject(Error('offline'));await first;
    assert.deepEqual(rows.map(m=>[m.content,m.state]),[['A','failed'],['B','sending']]);
    b.resolve();await second;assert.deepEqual(rows.map(m=>m.content),['A']);
});
test('a failed message can be removed; one still on its way cannot', async () => {
    const sending = deferred(); let rows = [];
    const outbox = createChatOutbox(content => content === 'stuck' ? sending.promise : Promise.reject(Error('blocked')), value => { rows = value; });
    await outbox.send('refused');
    const pending = outbox.send('stuck');
    const [refused, stuck] = rows;
    assert.equal(outbox.discard(stuck.id), false);
    assert.equal(outbox.discard(refused.id), true);
    assert.deepEqual(rows.map(m => m.content), ['stuck']);
    // Gone for good: a retry of it is a no-op, and removing it twice changes nothing.
    assert.equal(await outbox.retry(refused.id), false);
    assert.equal(outbox.discard(refused.id), false);
    sending.resolve(); await pending; assert.deepEqual(rows, []);
});
test('a message being retried cannot be removed until that attempt ends', async () => {
    const retry = deferred(); let rows = [], attempts = 0;
    const outbox = createChatOutbox(() => (++attempts === 1 ? Promise.reject(Error('offline')) : retry.promise), value => { rows = value; });
    await outbox.send('hello');
    const id = rows[0].id, attempt = outbox.retry(id);
    assert.equal(outbox.discard(id), false);
    retry.reject(Error('offline')); await attempt;
    assert.equal(outbox.discard(id), true); assert.deepEqual(rows, []);
});
