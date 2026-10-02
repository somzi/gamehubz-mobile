import {
    StackActions,
    type NavigationAction,
    type Router,
    type StackNavigationState,
} from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';

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

// About one push transition. A second screen opened while the first is still sliding in is a
// double tap: the second tap lands on the new screen's content, or on another row of the list.
const PUSH_COOLDOWN_MS = 500;
let lastPush: { key: string; at: number } | null = null;

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
 * than swapping its params, so back returns to the first one.
 */
export function singleCopyStackRouter<Action extends NavigationAction>(
    original: Router<StackState, Action>,
): Partial<Router<StackState, Action>> {
    return {
        getStateForAction(state, action, options) {
            const navAction = action as unknown as NavigationAction;
            const opensScreen = navAction.type === 'NAVIGATE' || navAction.type === 'PUSH';
            let next: ReturnType<typeof original.getStateForAction> | undefined;

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

            // Only a move forward counts: a new screen on top while the current one stays below it.
            const current = state.routes[state.index];
            const top = next.routes[next.index ?? next.routes.length - 1];
            const forward = !!top?.key && top.key !== current?.key && next.routes.some((r) => r.key === current?.key);
            if (!forward) return next;

            const now = Date.now();
            if (lastPush && now - lastPush.at < PUSH_COOLDOWN_MS && current?.key === lastPush.key) return state;
            lastPush = { key: top.key!, at: now };
            return next;
        },
    };
}
