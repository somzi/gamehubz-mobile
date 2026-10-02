import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
const { createModalReturn, getRouteOpenVersion, noteRouteOpen } = await load('modalReturn');
const { matchPresentation, appendMatchTabs } = await load('matchPresentation');

test('Back restores the selected game and tab exactly once; an interrupted transition keeps them pending', () => {
    const pending = createModalReturn(); noteRouteOpen('tournament-A');
    const version = getRouteOpenVersion('tournament-A');
    pending.remember({kind:'match',id:'game-1',tab:'chat'},version);
    // Focus during a pop only peeks. If another screen covers it before transitionEnd nothing is consumed.
    assert.equal(pending.peek(version).tab,'chat');
    assert.equal(pending.peek(version).tab,'chat');
    assert.deepEqual(pending.take(version),{kind:'match',id:'game-1',tab:'chat'});
    assert.equal(pending.take(version),undefined);
});

test('an explicit new navigation overrides a suspended modal, including a notification for another match', () => {
    const pending = createModalReturn(); noteRouteOpen('tournament-B');
    pending.remember({kind:'team',id:'team-1'},getRouteOpenVersion('tournament-B'));
    noteRouteOpen('tournament-B');
    assert.equal(pending.take(getRouteOpenVersion('tournament-B')),undefined);
});

test('a genuine close clears a remembered modal instead of reopening it on the next focus', () => {
    const pending = createModalReturn(); pending.remember({kind:'match',id:'m'},0); pending.clear();
    assert.equal(pending.take(0),undefined);
});

test('a seeded fixture shows its shell but no actions while loading or after a failed first request', () => {
    for (const [settled,loading] of [[false,true],[true,false]]) {
        assert.deepEqual(matchPresentation({seeded:true,hasDetails:false,settled,loading,contextReady:true}),{holding:false,preview:true});
    }
});

test('a push with just an ID has one loader until match and tournament are ready; failure releases it', () => {
    assert.equal(matchPresentation({seeded:false,hasDetails:false,settled:false,loading:true,contextReady:true}).holding,true);
    assert.equal(matchPresentation({seeded:false,hasDetails:true,settled:true,loading:false,contextReady:false}).holding,true);
    assert.deepEqual(matchPresentation({seeded:false,hasDetails:false,settled:true,loading:false,contextReady:true}),{holding:false,preview:true});
    assert.deepEqual(matchPresentation({seeded:false,hasDetails:true,settled:true,loading:true,contextReady:true}),{holding:false,preview:false});
});

test('a late organizer tab appends without moving the existing chat or stream tabs', () => {
    const initial = appendMatchTabs(['match'],['match','chat','stream']);
    const complete = appendMatchTabs(initial,['match','insights','chat','stream','schedule']);
    assert.deepEqual(complete,['match','chat','stream','insights','schedule']);
    assert.equal(appendMatchTabs(complete,['match','chat']),complete);
});
