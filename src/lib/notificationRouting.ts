import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './theme';

/**
 * Anything that can dispatch a navigate: the container ref (a push tapped in the OS tray) or a
 * screen's navigation prop (a row tapped in the inbox). Both go through the same router below, so a
 * notification opens the same screen however the user reaches it.
 */
export interface NotificationNavigator {
    navigate(...args: any[]): void;
}

// Announcement pushes carry an http(s) url instead of an in-app screen: the tap belongs to
// the OS (browser / Discord app), not to the navigator. Kept out of routeFromNotification
// because the router verifies a *route* landed and re-dispatches until it does — running an
// openURL through that loop would reopen the link every 150ms.
export function externalLinkFromNotification(rawData: unknown): string | null {
    if (!rawData || typeof rawData !== 'object') return null;
    const data = rawData as Record<string, any>;

    const type = typeof data.type === 'string' ? data.type.toLowerCase() : undefined;
    if (type !== 'link') return null;

    const url = typeof data.url === 'string' ? data.url.trim() : '';

    // http(s) only — the backend enforces the same. A stray custom scheme here would hand an
    // arbitrary intent to the OS, and a payload without a usable url falls through to the
    // normal router (which lands on the hub profile via hubId).
    return /^https?:\/\//i.test(url) ? url : null;
}

// Dispatches the deep link for a notification payload and returns the top-level stack
// route it navigated to (`null` when the payload carries nothing routable). The caller
// uses that name to confirm the navigation actually took — see NotificationRouter.
export function routeFromNotification(
    nav: NotificationNavigator,
    rawData: unknown,
): string | null {
    if (!rawData || typeof rawData !== 'object') return null;
    const data = rawData as Record<string, any>;

    const go = (name: string, params?: object): string => {
        // The union of every screen's params is too wide for navigate()'s overloads to narrow
        // behind this indirection; each call site below still mirrors the shape
        // RootStackParamList declares for the screen it targets.
        (nav as { navigate: (screen: string, params?: object) => void }).navigate(name, params);
        return name;
    };

    const type = typeof data.type === 'string' ? data.type.toLowerCase() : undefined;
    const chatId = data.chatId ? String(data.chatId) : undefined;
    const tournamentId = data.tournamentId ? String(data.tournamentId) : undefined;
    const matchId = data.matchId ? String(data.matchId) : undefined;
    // Set for team-tournament sub-matches — routes to the team-match modal so the
    // payload isn't lost in the solo modal that can't render a sub-match id.
    const teamMatchId = data.teamMatchId ? String(data.teamMatchId) : undefined;
    const userId = data.userId ? String(data.userId) : undefined;
    const hubId = data.hubId ? String(data.hubId) : undefined;

    // Explicit type wins
    switch (type) {
        case 'direct_message':
            if (chatId) {
                return go('DirectChat', { chatId });
            }
            break;
        case 'friend_request':
            return go('MainTabs' as any, {
                screen: 'Social',
                params: { initialTab: 'requests' },
            });
        case 'friend_accepted':
            if (userId) {
                return go('PlayerProfile', { id: userId });
            }
            break;
        // A player requested admin help in their match — drop the admin into the
        // tournament and pop the help-requests inbox so every pending request is one
        // tap away (and the requesting match's chat from there).
        case 'adminhelp':
            if (tournamentId) {
                return go('TournamentDetails', { id: tournamentId, openAdminHelp: true });
            }
            break;
        // A new match-chat message — open the tournament and jump straight into that
        // match's chat tab.
        case 'matchmessage':
            if (tournamentId && matchId) {
                return go('TournamentDetails', {
                    id: tournamentId,
                    focusMatchId: matchId,
                    focusTeamMatchId: teamMatchId,
                    focusMatchTab: 'chat',
                });
            }
            break;
        // A result was reported and is waiting for this user to confirm/dispute it.
        case 'resultproposed':
            return go('MyMatches' as any);
        // A team tie ended level — this captain must pick a tie-break representative.
        // focusTeamMatchId (without focusMatchId) opens the team-match modal, where the
        // "Choose Representative" picker lives.
        case 'teamtiebreak':
            if (tournamentId && teamMatchId) {
                return go('TournamentDetails', {
                    id: tournamentId,
                    focusTeamMatchId: teamMatchId,
                });
            }
            break;
        // Tournament finished — open it so the winner / final standings are visible.
        case 'tournamentwon':
            if (tournamentId) {
                return go('TournamentDetails', { id: tournamentId });
            }
            break;
        // Admin promo blast ("this tournament is open, come register") — open the tournament so the
        // register button is one tap away.
        case 'promo':
            if (tournamentId) {
                return go('TournamentDetails', { id: tournamentId });
            }
            break;
        // A tournament was announced with a scheduled opening — open it so the exact local
        // opening time (and the rules/prize) are right there.
        case 'registrationscheduled':
        // Registration closing soon — open the tournament so the user can still register.
        case 'registrationdeadline':
            if (tournamentId) {
                return go('TournamentDetails', { id: tournamentId });
            }
            break;
        // A match's deadline is approaching — open the tournament and land straight on the
        // match modal's 'match' tab, where the result is reported.
        case 'rounddeadline':
        // The ready check: the opponent confirmed and a clock is running, or the check just
        // decided the match. Same destination — the match modal, where the Ready button and the
        // countdown live.
        case 'checkin':
        // The fixture that was waiting on somebody else's result now has an opponent in it — a
        // knockout drawn out of the group stage, the next round of a bracket, a fresh Swiss
        // pairing. Straight to the match, which is where the time gets agreed.
        case 'opponentready':
            if (tournamentId && matchId) {
                return go('TournamentDetails', {
                    id: tournamentId,
                    focusMatchId: matchId,
                    focusTeamMatchId: teamMatchId,
                    focusMatchTab: 'match',
                });
            }
            break;
        // The organizer handed someone's spot to another member — open the tournament so the
        // incoming player sees their fixtures and the outgoing one sees they're no longer in it.
        case 'participantswappedin':
        case 'participantswappedout':
            if (tournamentId) {
                return go('TournamentDetails', { id: tournamentId });
            }
            break;
        // Team join / lineup lifecycle — open the tournament where the roster is managed. A lineup
        // change means the player either picked up the outgoing starter's fixtures or lost their own.
        case 'teamjoinrequest':
        case 'teamjoinapproved':
        case 'teamjoinrejected':
        case 'teamlineupin':
        case 'teamlineupout':
            if (tournamentId) {
                return go('TournamentDetails', { id: tournamentId });
            }
            break;
        // Hub join lifecycle — open the hub (managers review requests there).
        case 'hubjoinrequest':
        case 'hubjoinapproved':
        case 'hubjoinrejected':
            if (hubId) {
                return go('HubProfile', { id: hubId });
            }
            break;
    }

    // Fallback by id field (backend tournament/match pushes omit `type`)
    if (chatId) {
        return go('DirectChat', { chatId });
    }
    if (matchId) {
        return go('MyMatches' as any);
    }
    if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId });
    }
    if (hubId) {
        return go('HubProfile', { id: hubId });
    }

    return null;
}

export interface NotificationMeta {
    icon: keyof typeof Ionicons.glyphMap;
    /** Theme colour of the row's icon chip. */
    accent: string;
    /** A `link` announcement — the tap leaves the app, so the row says so. */
    external: boolean;
}

type MetaEntry = Pick<NotificationMeta, 'icon' | 'accent'>;

// Keyed by the lowercased payload type — the same normalisation routeFromNotification switches on.
// "Out" / "rejected" outcomes are deliberately muted: a no reads as a no before the text is read.
const META_BY_TYPE: Record<string, MetaEntry> = {
    // Asks the user to do something
    checkin: { icon: 'flash', accent: COLORS.primary },
    rounddeadline: { icon: 'hourglass', accent: COLORS.warning },
    opponentready: { icon: 'game-controller', accent: COLORS.primary },
    resultproposed: { icon: 'checkmark-circle', accent: COLORS.warning },
    teamtiebreak: { icon: 'people', accent: COLORS.team },
    adminhelp: { icon: 'help-buoy', accent: COLORS.live },
    hubjoinrequest: { icon: 'person-add', accent: COLORS.info },
    teamjoinrequest: { icon: 'person-add', accent: COLORS.team },
    friend_request: { icon: 'person-add', accent: COLORS.primary },
    schedulecleared: { icon: 'calendar-clear', accent: COLORS.warning },
    matchavailability: { icon: 'time', accent: COLORS.primary },
    direct_message: { icon: 'chatbubble', accent: COLORS.primary },
    matchmessage: { icon: 'chatbubbles', accent: COLORS.primary },

    // For information
    tournamentwon: { icon: 'trophy', accent: COLORS.warning },
    tournamentlive: { icon: 'play-circle', accent: COLORS.primary },
    registrationopen: { icon: 'ticket', accent: COLORS.info },
    registrationscheduled: { icon: 'calendar', accent: COLORS.info },
    registrationdeadline: { icon: 'time', accent: COLORS.warning },
    matchscheduled: { icon: 'calendar', accent: COLORS.primary },
    promo: { icon: 'megaphone', accent: COLORS.highlight },
    participantswappedin: { icon: 'swap-horizontal', accent: COLORS.info },
    participantswappedout: { icon: 'swap-horizontal', accent: COLORS.slate400 },
    teamlineupin: { icon: 'swap-horizontal', accent: COLORS.team },
    teamlineupout: { icon: 'swap-horizontal', accent: COLORS.slate400 },
    teamjoinapproved: { icon: 'people', accent: COLORS.team },
    teamjoinrejected: { icon: 'person-remove', accent: COLORS.slate400 },
    hubjoinapproved: { icon: 'people', accent: COLORS.info },
    hubjoinrejected: { icon: 'person-remove', accent: COLORS.slate400 },
    friend_accepted: { icon: 'people', accent: COLORS.primary },
    adminhelpresolved: { icon: 'shield-checkmark', accent: COLORS.primary },
    link: { icon: 'open-outline', accent: COLORS.highlight },
};

/**
 * Icon and accent for an inbox row. Same ladder as the router: the explicit type first, then the
 * id fields for pushes that carry no type (or a type this build does not know yet), so no row ever
 * renders as a blank generic entry while the router still knows where it goes.
 */
export function notificationMeta(rawData: unknown): NotificationMeta {
    const data = rawData && typeof rawData === 'object' ? (rawData as Record<string, any>) : {};
    const type = typeof data.type === 'string' ? data.type.toLowerCase() : undefined;

    const known = type ? META_BY_TYPE[type] : undefined;
    if (known) {
        return { ...known, external: externalLinkFromNotification(data) !== null };
    }

    if (data.chatId) return { icon: 'chatbubble', accent: COLORS.primary, external: false };
    if (data.matchId) return { icon: 'game-controller', accent: COLORS.primary, external: false };
    if (data.tournamentId) return { icon: 'trophy', accent: COLORS.info, external: false };
    if (data.hubId) return { icon: 'planet', accent: COLORS.info, external: false };

    return { icon: 'notifications', accent: COLORS.slate400, external: false };
}
