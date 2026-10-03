// Root stack router (src/navigation/stackRouter.ts) against React Navigation's own StackRouter.
// Run: npm run test:nav
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStackRouter } from './loadStackRouter.mjs';
import { loadDirectChatTarget } from './loadStackRouter.mjs';

const { singleCopyStackRouter, isRouteFor, StackRouter, CommonActions, StackActions, getChatWorkspace, getRouteOpenVersion } = await loadStackRouter();
const { prepareDirectChatTarget } = await loadDirectChatTarget();

const ROUTES = [
    'MainTabs', 'TournamentDetails', 'HubProfile', 'PlayerProfile', 'Settings', 'Notifications', 'MyMatches',
    'ManageHub', 'ManageTournament', 'DirectChat', 'Team', 'TeamDashboard',
    'Login', 'Register', 'ForgotPassword', 'ResetPassword', 'NotFound',
];
const options = { routeNames: ROUTES, routeParamList: {}, routeGetIdList: {} };
const base = StackRouter({});
const router = { ...base, ...singleCopyStackRouter(base) };

// The tab navigator's state lives on the MainTabs route, as it does in the app: its screens are
// where most taps come from, and their actions carry the tab route's key as `source`.
function start(first = 'MainTabs') {
    const state = router.getInitialState({ ...options, routeNames: [first, ...ROUTES.filter((n) => n !== first)] });
    if (first !== 'MainTabs') return state;
    return {
        ...state,
        routes: [{
            ...state.routes[0],
            state: { key: 'tabs', index: 0, routes: [{ key: 'home', name: 'Home' }, { key: 'social', name: 'Social' }] },
        }],
    };
}
const act = (state, action) => router.getStateForAction(state, action, options);
const nav = (state, name, params, source) => act(state, { ...CommonActions.navigate(name, params), ...(source ? { source } : {}) });
const top = (state) => state.routes[state.index];
const fromTop = (state) => top(state).key;

test('a repeated explicit nested tab instruction gets fresh params after a manual tab switch', () => {
    let s = nav(start(), 'MainTabs', { screen: 'Hubs' });
    const firstParams = top(s).params, key = top(s).key;
    // The child navigator switched manually; the parent still holds { screen: Hubs }.
    s = nav(s, 'ManageHub', { hubId: 'H' });
    s = nav(s, 'MainTabs', { screen: 'Hubs' });
    assert.equal(top(s).key, key);
    assert.notEqual(top(s).params, firstParams);
    assert.equal(top(s).params.screen, 'Hubs');
    assert.equal(s.routes.length, 1);
});
const stack = (state) => state.routes.map((r) => {
    const p = r.params ?? {};
    const id = p.id ?? p.chatId ?? p.otherUserId ?? p.hubId ?? p.teamId ?? p.screen;
    return id ? `${r.name}:${id}` : r.name;
});

test('double tap on the same card opens one screen', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    const again = nav(s, 'TournamentDetails', { id: 'A' }, fromTop(s));
    assert.equal(again, s);
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A']);
});

test('second card tapped from the covered list is ignored', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'TournamentDetails', { id: 'B' }, 'home');
    s = nav(s, 'HubProfile', { id: 'h' }, 'home');
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A']);
});

test('the screen just opened can open the next one at once (match modal → profile)', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'PlayerProfile', { id: 'x' }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A', 'PlayerProfile:x']);
});

test('a push tap right after opening a tournament is never held back', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'TournamentDetails', { id: 'B', focusMatchId: 'm' });
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A', 'TournamentDetails:B']);
    assert.equal(isRouteFor(top(s), 'TournamentDetails', { id: 'B' }), true);
});

test('the screen right below is gone back to, keeping the id as it was opened', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'PlayerProfile', { id: 'x' }, fromTop(s));
    s = nav(s, 'TournamentDetails', { id: 'a' }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A']);
});

test('a screen further down is brought forward, history kept', () => {
    let s = nav(start(), 'PlayerProfile', { id: 'x' }, 'home');
    s = nav(s, 'TournamentDetails', { id: 'A' }, fromTop(s));
    s = nav(s, 'PlayerProfile', { id: 'y' }, fromTop(s));
    s = nav(s, 'PlayerProfile', { id: 'x' }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A', 'PlayerProfile:y', 'PlayerProfile:x']);
});

test('another player from a profile is pushed, not swapped in', () => {
    let s = nav(start(), 'PlayerProfile', { id: 'x' }, 'home');
    s = nav(s, 'PlayerProfile', { id: 'y' }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs', 'PlayerProfile:x', 'PlayerProfile:y']);
});

test('push for the open tournament delivers its params to it', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'TournamentDetails', { id: 'A', focusMatchId: 'm1' });
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A']);
    assert.equal(top(s).params.focusMatchId, 'm1');
});

test('deleting a hub returns to the one tab bar, on Hubs', () => {
    let s = nav(start(), 'HubProfile', { id: 'h' }, 'home');
    s = nav(s, 'ManageHub', { hubId: 'h' }, fromTop(s));
    s = nav(s, 'MainTabs', { screen: 'Hubs' }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs:Hubs']);
});

test('friend-request push lands on the one tab bar', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'PlayerProfile', { id: 'x' }, fromTop(s));
    s = nav(s, 'MainTabs', { screen: 'Social', params: { initialTab: 'requests' } });
    assert.deepEqual(stack(s), ['MainTabs:Social']);
});

test('a repeated tab deep link still re-targets the tab', () => {
    let s = nav(start(), 'MainTabs', { screen: 'Social', params: { initialTab: 'requests' } });
    const first = s.routes[0].params;
    s = nav(s, 'MainTabs', { screen: 'Social', params: { initialTab: 'requests' } });
    assert.notEqual(s.routes[0].params, first);
});

test('reset password returns to the one Login', () => {
    let s = start('Login');
    s = nav(s, 'ForgotPassword', undefined, fromTop(s));
    s = nav(s, 'ResetPassword', { email: 'a@b.c' }, fromTop(s));
    s = nav(s, 'Login', undefined, fromTop(s));
    assert.deepEqual(stack(s), ['Login']);
});

test('chat → profile → Message returns to the chat, params untouched', () => {
    let s = nav(start(), 'DirectChat', { chatId: 'c1', header: { otherUserId: 'U1', otherUsername: 'u' } }, 'home');
    s = nav(s, 'PlayerProfile', { id: 'u1' }, fromTop(s));
    s = nav(s, 'DirectChat', { otherUserId: 'u1', header: { otherUserId: 'u1', otherUsername: 'u' } }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs', 'DirectChat:c1']);
    assert.equal(top(s).params.chatId, 'c1');
});

test('chat opened from a profile is the one a push opens, once it wrote its chat id back', () => {
    let s = nav(start(), 'PlayerProfile', { id: 'u1' }, 'home');
    s = nav(s, 'DirectChat', { otherUserId: 'u1', header: { otherUserId: 'u1', otherUsername: 'u' } }, fromTop(s));
    s = act(s, { ...CommonActions.setParams({ chatId: 'c1' }), source: fromTop(s) });
    s = nav(s, 'DirectChat', { chatId: 'C1' });
    assert.deepEqual(stack(s), ['MainTabs', 'PlayerProfile:u1', 'DirectChat:c1']);
    assert.equal(isRouteFor(top(s), 'DirectChat', { chatId: 'c1' }), true);
});

test('chat opened from a push is the one a profile opens, once it wrote its partner back', () => {
    let s = nav(start(), 'DirectChat', { chatId: 'c1' });
    s = act(s, { ...CommonActions.setParams({ header: { otherUserId: 'u1', otherUsername: 'u' } }), source: fromTop(s) });
    s = nav(s, 'PlayerProfile', { id: 'u1' }, fromTop(s));
    s = nav(s, 'DirectChat', { otherUserId: 'u1', header: { otherUserId: 'u1', otherUsername: 'u' } }, fromTop(s));
    assert.deepEqual(stack(s), ['MainTabs', 'DirectChat:c1']);
});

test('team link redirect lands on the tournament already open underneath', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'Team', { teamId: 't' });
    s = act(s, { ...StackActions.replace('TournamentDetails', { id: 'a', focusTeamId: 't' }), source: fromTop(s) });
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A']);
    assert.equal(top(s).params.focusTeamId, 't');
});

test('team link for another tournament replaces the redirect normally', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    s = nav(s, 'Team', { teamId: 't' });
    s = act(s, { ...StackActions.replace('TournamentDetails', { id: 'B' }), source: fromTop(s) });
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A', 'TournamentDetails:B']);
});

test('a navigate a closed screen scheduled before back was pressed opens nothing', () => {
    let s = nav(start(), 'TournamentDetails', { id: 'A' }, 'home');
    const tournamentKey = fromTop(s);
    s = act(s, { ...CommonActions.goBack(), source: tournamentKey });
    const after = nav(s, 'PlayerProfile', { id: 'x' }, tournamentKey);
    assert.equal(after, s);
    assert.deepEqual(stack(after), ['MainTabs']);
});

test('a tap from a tab that is not on screen opens nothing', () => {
    const s = start();
    assert.equal(nav(s, 'DirectChat', { chatId: 'c1' }, 'social'), s);
});

test('a tab name is left to the tab navigator', () => {
    assert.equal(nav(start(), 'Hubs', undefined, 'home'), null);
});

test('isRouteFor compares the subject, not just the screen', () => {
    const route = { name: 'TournamentDetails', params: { id: 'A' } };
    assert.equal(isRouteFor(route, 'TournamentDetails', { id: 'a' }), true);
    assert.equal(isRouteFor(route, 'TournamentDetails', { id: 'B' }), false);
    assert.equal(isRouteFor({ name: 'MainTabs' }, 'MainTabs', { screen: 'Social' }), true);
});

test('a late tap cannot pop to an existing screen from behind the visible one', () => {
    let s = nav(start(), 'TournamentDetails', {id:'A'}, 'home');
    s = nav(s, 'PlayerProfile', {id:'x'}, fromTop(s));
    assert.equal(nav(s, 'MainTabs', undefined, 'home'), s);
    assert.equal(nav(s, 'TournamentDetails', {id:'A'}, 'removed-route'), s);
});

test('unresolved profile chat is recognised before a notification is dispatched', async () => {
    let s = nav(start(), 'DirectChat', {otherUserId:'u1'}, 'home');
    const key = fromTop(s);
    const params = await prepareDirectChatTarget('c1', s.routes, async () => ({id:'c1',otherUserId:'u1',otherUsername:'u'}));
    s = nav(s, 'DirectChat', params);
    assert.equal(fromTop(s), key);
    assert.equal(s.routes.filter(r => r.name === 'DirectChat').length, 1);
});

test('metadata failure still allows the destination to show its load error', async () => {
    const params = await prepareDirectChatTarget('c1', [{name:'DirectChat',params:{otherUserId:'u1'}}], async () => {throw Error('offline');});
    assert.deepEqual(params, {chatId:'c1'});
});

test('late identity resolution keeps the visible chat and both drafts', () => {
    let s = nav(start(), 'DirectChat', {otherUserId:'u1'}, 'home');
    const original = fromTop(s);
    s = nav(s, 'PlayerProfile', {id:'x'}, original);
    s = nav(s, 'DirectChat', {chatId:'c1'});
    const duplicate = fromTop(s);
    getChatWorkspace(original).setDraft('hidden draft');
    getChatWorkspace(duplicate).setDraft('visible draft');
    s = act(s, {...CommonActions.setParams({header:{otherUserId:'u1',otherUsername:'u'}}),source:duplicate});
    assert.equal(fromTop(s), duplicate);
    assert.equal(getChatWorkspace(duplicate).getSnapshot().draft, 'visible draft');
    assert.equal(getChatWorkspace(duplicate).getSnapshot().drafts[0].content, 'hidden draft');
    assert.equal(top(s).params.chatId, 'c1');
    assert.deepEqual(stack(s), ['MainTabs','PlayerProfile:x','DirectChat:c1']);
});

test('hidden chat reconciliation does not change the focused screen', () => {
    let s = nav(start(), 'DirectChat', {otherUserId:'u1'}, 'home');
    const original = fromTop(s);
    s = nav(s, 'DirectChat', {chatId:'c1'});
    s = nav(s, 'PlayerProfile', {id:'x'}, fromTop(s));
    const focused = fromTop(s);
    s = act(s, {...CommonActions.setParams({chatId:'c1'}),source:original});
    assert.equal(fromTop(s), focused);
    assert.equal(s.routes.filter(r => r.name === 'DirectChat').length, 1);
});

test('Back preserves a tournament modal return, whereas explicit navigation to that same route replaces it', () => {
    let s = nav(start(), 'TournamentDetails', {id:'A'}, 'home');
    const tournament = fromTop(s), version = getRouteOpenVersion(tournament);
    s = nav(s, 'PlayerProfile', {id:'x'}, tournament);
    s = act(s, CommonActions.goBack());
    assert.equal(fromTop(s),tournament);
    assert.equal(getRouteOpenVersion(tournament),version);
    s = nav(s,'PlayerProfile',{id:'x'},tournament);
    s = nav(s,'TournamentDetails',{id:'A',focusMatchId:'B'});
    assert.equal(fromTop(s),tournament);
    assert.notEqual(getRouteOpenVersion(tournament),version);
});

// Cold start and login: React Navigation writes the tab navigator's state into the root only on
// its first navigation event, so the tab screens' keys are in no state the router is given.
const coldStart = () => router.getInitialState(options);

test('cold start: taps from the first tab open their screens before any tab switch', () => {
    for (const [name, params] of [['TournamentDetails', { id: 'A' }], ['Notifications'], ['MyMatches']]) {
        const s = nav(coldStart(), name, params, 'home');
        assert.equal(top(s).name, name);
        assert.deepEqual(stack(s).slice(0, 1), ['MainTabs']);
    }
});

test('cold start: a second tap from the first tab, once a screen covers it, is still ignored', () => {
    let s = nav(coldStart(), 'TournamentDetails', { id: 'A' }, 'home');
    const covered = nav(s, 'TournamentDetails', { id: 'B' }, 'home');
    assert.equal(covered, s);
    assert.equal(nav(s, 'Notifications', undefined, 'home'), s);
    assert.deepEqual(stack(s), ['MainTabs', 'TournamentDetails:A']);
});

test('deep-link start: the tab state is still a keyless partial, taps from it open', () => {
    const base = coldStart();
    const s = { ...base, routes: [{ ...base.routes[0], state: { stale: true, routes: [{ name: 'Home' }] } }] };
    assert.equal(top(nav(s, 'TournamentDetails', { id: 'A' }, 'home')).name, 'TournamentDetails');
});

test('back on the first tab after a cold start, its taps open again', () => {
    let s = nav(coldStart(), 'TournamentDetails', { id: 'A' }, 'home');
    s = act(s, { ...CommonActions.goBack(), source: fromTop(s) });
    assert.equal(top(nav(s, 'MyMatches', undefined, 'home')).name, 'MyMatches');
});

test('cold start: a closed screen still cannot navigate, though its tab bar is back in focus', () => {
    let s = nav(coldStart(), 'TournamentDetails', { id: 'A' }, 'home');
    const closed = fromTop(s);
    s = act(s, { ...CommonActions.goBack(), source: closed });
    assert.equal(nav(s, 'PlayerProfile', { id: 'x' }, closed), s);
});
