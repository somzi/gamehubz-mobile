/**
 * The last navigation events of this session: what the root router decided (opened, went back to
 * an open screen, ignored a stale tap), which screen ended up in focus, and where a push tap was
 * sent. It is what explains a report like "it opened the wrong screen" — the console is silenced in
 * release builds, so the log is printed in dev and shared from Settings (long-press the version).
 *
 * Memory only, capped, and screens are named with a shortened id — no params, no names.
 */
export interface NavigationLogEntry {
    at: number;
    event: string;
    detail?: string;
}

const LIMIT = 100;
const entries: NavigationLogEntry[] = [];

declare const __DEV__: boolean | undefined;
const isDev = typeof __DEV__ !== 'undefined' && !!__DEV__;

export function logNavigation(event: string, detail?: string) {
    entries.push({ at: Date.now(), event, detail });
    if (entries.length > LIMIT) entries.shift();
    // eslint-disable-next-line no-console
    if (isDev) console.log(`[nav] ${event}${detail ? ` ${detail}` : ''}`);
}

/** "TournamentDetails:3fa85f64" — the screen and the start of the id it is about. */
export function describeRoute(name: string, params?: Record<string, any>): string {
    const id = params?.id ?? params?.hubId ?? params?.teamId ?? params?.chatId ?? params?.otherUserId ?? params?.screen;
    return typeof id === 'string' && id ? `${name}:${id.slice(0, 8)}` : name;
}

export function getNavigationLog(): readonly NavigationLogEntry[] {
    return entries;
}

export function formatNavigationLog(): string {
    return entries
        .map((e) => {
            const time = new Date(e.at).toISOString().slice(11, 23);
            return `${time} ${e.event}${e.detail ? ` ${e.detail}` : ''}`;
        })
        .join('\n');
}
