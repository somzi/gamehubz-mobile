/** Stable shell from the current fixture; actions only render after that fixture's details arrive. */
export function matchPresentation(options: {
    seeded: boolean; hasDetails: boolean; settled: boolean; loading: boolean; contextReady: boolean;
}) {
    const waiting = !options.settled || (options.loading && !options.hasDetails);
    return {
        holding: !options.seeded && (waiting || !options.contextReady),
        preview: !options.hasDetails || !options.contextReady,
    };
}

/** Newly discovered tabs append; existing tabs keep their position and width. */
export function appendMatchTabs<T extends string>(previous: T[], available: T[]): T[] {
    const added = available.filter(tab => !previous.includes(tab));
    return added.length ? [...previous, ...added] : previous;
}
