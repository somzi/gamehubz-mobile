// Explicit navigation is different from Back even when both reveal the same existing route.
const openings = new Map<string, number>();
let revision = 0;
export function noteRouteOpen(key: string) {
    openings.delete(key);
    openings.set(key, ++revision);
    if (openings.size > 200) openings.delete(openings.keys().next().value!);
}
export const getRouteOpenVersion = (key: string) => openings.get(key) ?? 0;

export function createModalReturn<T>() {
    let pending: { value: T; version: number } | undefined;
    return {
        remember(value: T, version: number) { pending = { value, version }; },
        peek(version: number): T | undefined {
            if (pending?.version !== version) pending = undefined;
            return pending?.value;
        },
        take(version: number): T | undefined {
            const value = this.peek(version);
            pending = undefined;
            return value;
        },
        clear() { pending = undefined; },
    };
}
