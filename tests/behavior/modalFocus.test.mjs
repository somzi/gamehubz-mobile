import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
import { loadFetcher } from './loadFetcher.mjs';
const { createModalReturn } = await load('modalReturn');

function screen(kind = 'match') {
    const view = { showReportModal: kind === 'match', showTeamMatchDetail: kind === 'team', selectedMatch:{id:'m1'}, selectedTeamMatchId:'team1' };
    const state = { version:1, tab:'chat', focused:true, cancelled:false, finish:undefined };
    const modalReturn = createModalReturn();
    const focus = loadFetcher('src/screens/TournamentDetailsScreen.tsx','handleModalFocus',{
        useCallback:fn=>fn, route:{key:'tournament'}, navigation:{isFocused:()=>state.focused},
        modalReturn, getRouteOpenVersion:()=>state.version, modalViewRef:{current:view}, matchActiveTabRef:{current:'chat'},
        afterScreenTransition:fn=>{ state.finish=fn; state.cancelled=false; return ()=>{state.cancelled=true;}; },
        setMatchModalDefaultTab:tab=>{state.tab=tab;},
        setShowReportModal:value=>{view.showReportModal=value;}, setShowTeamMatchDetail:value=>{view.showTeamMatchDetail=value;},
    });
    return { view,state,focus };
}

test('a notification covering an open match hides it and Back restores it only after the transition', () => {
    const {view,state,focus} = screen(); const blur=focus();
    state.focused=false; blur(); assert.equal(view.showReportModal,false);
    state.focused=true; focus(); assert.equal(view.showReportModal,false);
    state.finish(); assert.equal(view.showReportModal,true); assert.equal(view.showTeamMatchDetail,false); assert.equal(state.tab,'chat');
});

test('new navigation arriving while the return animation runs cancels the old modal', () => {
    const {view,state,focus} = screen(); const blur=focus(); blur(); focus();
    state.version++; state.finish(); assert.equal(view.showReportModal,false);
});

test('a team overview returns alone, and a second blur cancels its scheduled return', () => {
    const {view,state,focus} = screen('team'); focus()();
    const blur=focus(); state.focused=false; blur();
    assert.equal(state.cancelled,true); state.finish(); assert.equal(view.showTeamMatchDetail,false);
    state.focused=true; focus(); state.finish();
    assert.equal(view.showTeamMatchDetail,true); assert.equal(view.showReportModal,false);
});
