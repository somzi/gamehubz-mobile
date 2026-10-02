import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
const { ChatWorkspace } = await load('chatWorkspace');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; };

test('merging keeps the visible draft and restores the other without overwriting either', () => {
    const visible = new ChatWorkspace(), hidden = new ChatWorkspace();
    visible.setDraft('new text'); hidden.setDraft('older text'); visible.absorb(hidden);
    assert.equal(visible.getSnapshot().draft, 'new text');
    visible.restoreDraft(visible.getSnapshot().drafts[0].id);
    assert.equal(visible.getSnapshot().draft, 'older text');
    assert.equal(visible.getSnapshot().drafts[0].content, 'new text');
    visible.absorb(hidden); assert.equal(visible.getSnapshot().drafts.length, 1);
});

test('an in-flight send survives merging without a second POST and delivers into the surviving chat', async () => {
    const hidden = new ChatWorkspace(), visible = new ChatWorkspace(), request = deferred(); let posts = 0;
    const unbind = hidden.bindSender(async content => { posts++; await request.promise; hidden.recordSent({ id:'m1',content,sentAt:'2026-10-02T10:00:00Z' }); });
    const sending = hidden.send('hello'); visible.absorb(hidden);
    assert.equal(visible.getSnapshot().pending[0].state, 'sending');
    assert.equal(await visible.retry(visible.getSnapshot().pending[0]), false);
    assert.equal(visible.discard(visible.getSnapshot().pending[0]), false);
    visible.bindSender(async () => { posts++; }); unbind();
    request.resolve(); assert.equal(await sending, true);
    assert.equal(posts, 1); assert.equal(visible.getSnapshot().pending.length, 0);
    assert.equal(visible.getSnapshot().sent[0].content, 'hello');
});

test('a merged send that fails later can be retried by the visible screen once', async () => {
    const hidden = new ChatWorkspace(), visible = new ChatWorkspace(), request = deferred(); let attempts = 0;
    const unbind = hidden.bindSender(() => request.promise);
    const sending = hidden.send('original'); visible.absorb(hidden);
    visible.bindSender(async content => { attempts++; assert.equal(content,'original'); }); unbind();
    request.reject(Error('offline')); await sending;
    const failed = visible.getSnapshot().pending[0]; assert.equal(failed.state,'failed');
    await Promise.all([visible.retry(failed),visible.retry(failed)]);
    assert.equal(attempts,1); assert.equal(visible.getSnapshot().pending.length,0);
});

test('native subtree unmount can release its sender without dropping draft or failed messages', async () => {
    const work = new ChatWorkspace(); work.setDraft('typing');
    const unbind = work.bindSender(async () => { throw Error('offline'); });
    await work.send('failed'); unbind();
    let snapshot; const unsubscribe = work.subscribe(() => { snapshot=work.getSnapshot(); });
    work.bindSender(async () => {});
    await work.retry(work.getSnapshot().pending[0]);
    assert.equal(snapshot.draft,'typing'); assert.equal(snapshot.pending.length,0); unsubscribe();
});
