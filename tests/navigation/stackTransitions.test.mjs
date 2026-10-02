// Waiting for the root stack's transitions (src/navigation/stackTransitions.ts) — what a modal
// reopened after a profile, or opened from a push, waits for. Run: npm run test:nav
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadStackTransitions } from './loadStackRouter.mjs';

// One manual clock for timers, animation frames and Date.now.
let now = 0;
let queue = [];
let seq = 0;
const schedule = (fn, delay) => { const id = ++seq; queue.push({ id, at: now + delay, fn }); return id; };
const unschedule = (id) => { queue = queue.filter((t) => t.id !== id); };
globalThis.setTimeout = (fn, delay = 0) => schedule(fn, delay);
globalThis.clearTimeout = unschedule;
globalThis.requestAnimationFrame = (fn) => schedule(fn, 16);
globalThis.cancelAnimationFrame = unschedule;
Date.now = () => now;
function advance(ms) {
    const until = now + ms;
    for (;;) {
        queue.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = queue[0];
        if (!next || next.at > until) break;
        queue.shift();
        now = next.at;
        next.fn();
    }
    now = until;
}

const { afterStackTransition, noteStackTransitionStart, noteStackTransitionEnd, resetStackTransitions } = await loadStackTransitions();

beforeEach(() => {
    // Leave no transition running between tests.
    resetStackTransitions();
    queue = [];
});

test('with no transition running it goes on the next frame', () => {
    let ran = false;
    afterStackTransition(() => { ran = true; });
    assert.equal(ran, false);
    advance(16);
    assert.equal(ran, true);
});

test('back from a profile: waits for the pop to end, not for the focus event', () => {
    let ran = false;
    afterStackTransition(() => { ran = true; });
    noteStackTransitionStart(); // the pop starts in the same commit as the focus
    advance(300);
    assert.equal(ran, false);
    noteStackTransitionEnd();
    advance(16);
    assert.equal(ran, true);
});

test('a push that starts a tick after mount is still waited for', () => {
    let ran = false;
    afterStackTransition(() => { ran = true; });
    setTimeout(noteStackTransitionStart, 0);
    advance(400);
    assert.equal(ran, false);
    noteStackTransitionEnd();
    advance(16);
    assert.equal(ran, true);
});

test('a transition that never reports its end does not hold it forever', () => {
    let ran = false;
    noteStackTransitionStart();
    afterStackTransition(() => { ran = true; });
    advance(1999);
    assert.equal(ran, false);
    advance(17);
    assert.equal(ran, true);
});

test('restarting the same route animation needs only its final end', () => {
    let ran = false;
    noteStackTransitionStart({target:'profile', data:{closing:false}});
    noteStackTransitionStart({target:'profile', data:{closing:true}});
    afterStackTransition(() => { ran = true; });
    advance(16);
    noteStackTransitionEnd({target:'profile', data:{closing:false}});
    advance(16);
    assert.equal(ran, false);
    noteStackTransitionEnd({target:'profile', data:{closing:true}});
    advance(16);
    assert.equal(ran, true);
});

test('an unrelated transition end cannot release a waiting modal', () => {
    let ran = false;
    noteStackTransitionStart({target:'profile'});
    afterStackTransition(() => { ran = true; });
    advance(16);
    noteStackTransitionEnd({target:'another'});
    advance(16);
    assert.equal(ran, false);
    noteStackTransitionEnd({target:'profile'});
    advance(16);
    assert.equal(ran, true);
});

test('a real slow transition is not cut off at 800ms', () => {
    let ran = false;
    noteStackTransitionStart();
    afterStackTransition(() => { ran = true; });
    advance(1200);
    assert.equal(ran, false);
    noteStackTransitionEnd();
    advance(16);
    assert.equal(ran, true);
});

test('cancelled when the screen loses focus first', () => {
    let ran = false;
    const cancel = afterStackTransition(() => { ran = true; });
    noteStackTransitionStart();
    advance(16);
    cancel();
    noteStackTransitionEnd();
    advance(1000);
    assert.equal(ran, false);
});
