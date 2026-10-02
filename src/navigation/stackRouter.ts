import {
    StackActions,
    type NavigationAction,
    type Router,
    type StackNavigationState,
} from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { describeRoute, logNavigation } from '../lib/navigationLog';

type StackState = StackNavigationState<RootStackParamList>;
type Params = Record<string, any> | undefined;

// GUIDs reach the app in both casings depending on the endpoint, so ids compare case-blind.
const sameId = (a: unknown, b: unknown) =>
    typeof a === 'string' && typeof b === 'string' && a !== '' && a.toLowerCase() === b.toLowerCase();

// A conversation is opened by chat id from the chat list and push, but by the other player's id
// from a profile's Message button, so either one identifies it.
const chatPartner = (p: Params): unknown => p?.otherUserId ?? p?.header?.otherUserId;

/**
 * Screens about one tournament / player / hub / team / chat, and whether two of their routes show
 * the same one. Every other screen is a singleton: the tabs, Settings, the inbox, My Matches and the
 * auth screens exist at most once in the stack.
 */
const SUBJECT: Record<string, (a: Params, b: Params) => boolean> = {
    TournamentDetails: (a, b) => sameId(a?.id, b?.id),
    ManageTournament: (a, b) => sameId(a?.id, b?.id),
    HubProfile: (a, b) => sameId(a?.id, b?.id),
    PlayerProfile: (a, b) => sameId(a?.id, b?.id),
    ManageHub: (a, b) => sameId(a?.hubId, b?.hubId),
    HubMembers: (a, b) => sameId(a?.hubId, b?.hubId),
    ManageHubSocials: (a, b) => sameId(a?.hubId, b?.hubId),
    ManageHubDiscord: (a, b) => sameId(a?.hubId, b?.hubId),
    TeamDashboard: (a, b) => sameId(a?.teamId, b?.teamId),
    Team: (a, b) => sameId(a?.teamId, b?.teamId),
    DirectChat: (a, b) => sameId(a?.chatId, b?.chatId) || sameId(chatPartner(a), chatPartner(b)),
};

// The chat screen reloads the conversation, and drops the unsent draft, whenever its params
// change. Going back to it is not a reason to do either, so it keeps the params it was opened with.
const KEEPS_PARAMS_ON_RETURN = new Set(['DirectChat']);

type NestedState = { index?: number; stale?: boolean; routes: { key?: string; name?: string; state?: NestedState }[] };

/**
 * Where the screen that sent an action sits: on the focused path, under another screen, or not in
 * the tree at all (a container-ref navigate from a push or a link carries no source). A screen
 * that is covered can only be talking because of a tap that landed before the new screen took over
 * the touch: the second tap of a double tap, or a second row tapped during the transition.
 */
function placeOf(state: NestedState | undefined, key: string, onFocusedPath = true): 'focused' | 'covered' | null {
    if (!state?.routes) return null;
    const focusedIndex = state.index ?? state.routes.length - 1;
    for (let i = 0; i < state.routes.length; i++) {
        const route = state.routes[i];
        const focused = onFocusedPath && i === focusedIndex;
        if (route.key === key) return focused ? 'focused' : 'covered';
        const nested = placeOf(route.state, key, focused);
        if (nested) return nested;
    }
    return null;
}

// Root screens that host a navigator of their own. React Navigation hands a nested navigator's
// state to its parent only on that navigator's first navigation event ("undefined or stale until
// the first navigation event happens", useNavigationBuilder), so after a cold start or a login the
// tab screens' keys are in no state the router is given until the first tab switch.
const HOSTS_NAVIGATOR = new Set(['MainTabs']);

// Root screens taken off the stack recently. A callback such a screen scheduled before it closed
// (a profile opened once a sheet is down) must not navigate on its behalf.
const REMOVED_LIMIT = 100;
const removedKeys = new Set<string>();

function rememberRemoved(before: StackState, after: { routes: { key?: string }[] }) {
    const kept = new Set(after.routes.map((r) => r.key));
    for (const route of before.routes) {
        if (kept.has(route.key)) continue;
        removedKeys.add(route.key);
        if (removedKeys.size > REMOVED_LIMIT) {
            const oldest = removedKeys.values().next().value;
            if (oldest !== undefined) removedKeys.delete(oldest);
        }
    }
}

/**
 * Whether the screen that sent an action is the one on screen. A key the state does not contain
 * is either a closed screen (refused) or a tab screen whose navigator has not reported its state
 * yet — on screen only if the focused root screen is that navigator, with its state still unwritten.
 */
function isActiveSource(state: StackState, source: string): boolean {
    const place = placeOf(state as NestedState, source);
    if (place) return place === 'focused';
    if (removedKeys.has(source)) return false;
    const focused = (state as NestedState).routes[state.index ?? state.routes.length - 1];
    return !!focused?.name && HOSTS_NAVIGATOR.has(focused.name)
        && (!focused.state || focused.state.stale !== false);
}

// A link can arrive before a profile-opened chat has resolved its id. Once either bootstrap
// learns both identities, keep the original screen (including its draft) and remove its copies.
function reconcileChats(state: StackState, source?: string): StackState {
    const resolved = state.routes.find((r) => r.key === source && r.name === 'DirectChat');
    if (!resolved) return state;
    const copies = state.routes.filter((r) => r.name === 'DirectChat' && SUBJECT.DirectChat(r.params, resolved.params));
    if (copies.length < 2) return state;
    const original = copies[0];
    const duplicateKeys = new Set(copies.slice(1).map((r) => r.key));
    const params = { ...resolved.params, ...original.params } as Record<string, any>;
    for (const copy of copies) {
        for (const [key, value] of Object.entries(copy.params ?? {})) {
            if (params[key] == null) params[key] = value;
        }
    }
    const current = state.routes[state.index];
    let routes = state.routes.filter((r) => !duplicateKeys.has(r.key))
        .map((r) => r.key === original.key ? { ...r, params } : r);
    // If a duplicate is visible, restore the original at that position without opening an
    // unrelated screen in between. A hidden resolution must never steal focus.
    if (duplicateKeys.has(current.key)) {
        const restored = routes.find((r) => r.key === original.key)!;
        routes = routes.filter((r) => r.key !== original.key);
        const index = state.routes.slice(0, state.index).filter((r) => !duplicateKeys.has(r.key) && r.key !== original.key).length;
        routes.splice(index, 0, restored);
    }
    logNavigation('merged duplicate chat', describeRoute('DirectChat', params));
    return { ...state, routes, index: routes.findIndex((r) => r.key === (duplicateKeys.has(current.key) ? original.key : current.key)) };
}

/** Whether a route shows the screen and subject a navigate asked for — the router's own test. */
export function isRouteFor(route: { name: string; params?: object } | undefined, name: string, params?: object): boolean {
    if (!route || route.name !== name) return false;
    const same = SUBJECT[name];
    return !same || same(route.params as Params, params as Params);
}

function findExisting(state: StackState, name: string, params: Params): number {
    const same = SUBJECT[name];
    for (let i = state.routes.length - 1; i >= 0; i--) {
        const route = state.routes[i];
        if (route.name === name && (!same || same(route.params as Params, params))) return i;
    }
    return -1;
}

function shallowEqual(a: Params, b: Params): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

// What the navigate asked for, except that ids keep the spelling the screen was opened with: the
// screen's effects key on the raw id, and a re-cased GUID would read to them as another subject.
function returnParams(previous: Params, requested: Params): Params {
    if (!previous || !requested) return requested;
    let merged: Record<string, any> | null = null;
    for (const key of Object.keys(requested)) {
        if (requested[key] !== previous[key] && sameId(requested[key], previous[key])) {
            merged = merged ?? { ...requested };
            merged[key] = previous[key];
        }
    }
    return merged ?? requested;
}

function goToExisting(state: StackState, index: number, params: Params): StackState {
    const target = state.routes[index];
    const previous = target.params as Params;
    const nextParams = KEEPS_PARAMS_ON_RETURN.has(target.name) ? previous : returnParams(previous, params);
    const updated = shallowEqual(previous, nextParams)
        ? target
        : ({ ...target, params: nextParams } as typeof target);

    if (index === state.index) {
        return updated === target ? state : { ...state, routes: state.routes.map((r, i) => (i === index ? updated : r)) };
    }

    // The screen right below, or one there is only ever one of: going there is going back.
    if (index === state.index - 1 || !SUBJECT[target.name]) {
        const routes = state.routes.slice(0, index + 1);
        routes[index] = updated;
        return { ...state, index, routes };
    }

    // Further down: bring that screen forward, so back still walks through what was opened since.
    const routes = [...state.routes.filter((_, i) => i !== index), updated];
    return { ...state, index: routes.length - 1, routes };
}

/**
 * Root stack router with one copy of each screen.
 *
 * React Navigation 7's `navigate` no longer goes back to a screen already in the stack. So
 * `navigate('MainTabs')` after deleting a hub pushed a second tab bar over the dead hub,
 * `navigate('Login')` after a password reset pushed a second Login, and chat → profile → Message
 * opened the conversation again on top of itself. Here a navigate to a screen that is already in the
 * stack, for the same tournament/player/hub/chat, goes to that screen instead. The same screen for a
 * different subject (another player's profile from a push) is pushed over the current one rather
 * than swapping its params, so back returns to the first one. A tap that reaches a screen after it
 * was covered (a double tap) opens nothing; navigations from a push or a link are never held back.
 */
export function singleCopyStackRouter<Action extends NavigationAction>(
    original: Router<StackState, Action>,
): Partial<Router<StackState, Action>> {
    const resolve: Router<StackState, Action>['getStateForAction'] = (state, action, options) => {
        const navAction = action as unknown as NavigationAction;
        const opensScreen = navAction.type === 'NAVIGATE' || navAction.type === 'PUSH';
        let next: ReturnType<typeof original.getStateForAction> | undefined;

        // Container actions (push notifications / links) have no source. A screen action must
        // still belong to the focused path, even when its destination already exists below us.
        // This is state-derived: no timer, no global history shared between router instances.
        const name = (navAction.payload as { name?: string } | undefined)?.name;
        if (opensScreen && name && (state.routeNames as string[]).includes(name) && navAction.source
            && !isActiveSource(state, navAction.source)) {
            logNavigation('ignored navigate from inactive screen', name);
            return state;
        }

        if (navAction.type === 'NAVIGATE' && navAction.payload) {
            const { name, params } = navAction.payload as { name: string; params?: Params };
            if ((state.routeNames as string[]).includes(name)) {
                const existing = findExisting(state, name, params);
                if (existing !== -1) {
                    next = goToExisting(state, existing, params);
                } else if (state.routes[state.index]?.name === name) {
                    next = original.getStateForAction(
                        state,
                        StackActions.push(name, params) as unknown as Action,
                        options,
                    );
                }
            }
        } else if (navAction.type === 'REPLACE' && navAction.payload && state.index > 0) {
            // A redirect screen (a team share link) replacing itself with a tournament that is
            // already open underneath: drop the redirect and go to that one, not a second copy.
            const { name, params } = navAction.payload as { name: string; params?: Params };
            const replaced = state.routes[state.index];
            if (!navAction.source || navAction.source === replaced.key) {
                const below: StackState = { ...state, index: state.index - 1, routes: state.routes.slice(0, state.index) };
                const existing = findExisting(below, name, params);
                if (existing !== -1) next = goToExisting(below, existing, params);
            }
        }

        if (next === undefined) next = original.getStateForAction(state, action, options);
        if (!opensScreen || !next || next === state) return next;

        const current = state.routes[state.index];
        const top = next.routes[next.index ?? next.routes.length - 1];
        const label = top ? describeRoute(top.name, top.params as Params) : '?';

        // Only a move forward can be a stray tap: a new screen on top while the current one stays.
        const forward = !!top?.key && top.key !== current?.key && next.routes.some((r) => r.key === current?.key);
        if (!forward) {
            logNavigation(top?.key === current?.key ? 'updated' : 'back to', label);
            return next;
        }

        logNavigation(state.routes.some((r) => r.key === top!.key) ? 'brought forward' : 'opened', label);
        return next;
    };

    return {
        getStateForAction(state, action, options) {
            let next = resolve(state, action, options);
            if (next?.stale === false && action.type === 'SET_PARAMS') next = reconcileChats(next, action.source);
            if (next && next !== state && next.routes) rememberRemoved(state, next);
            return next;
        },
    };
}
