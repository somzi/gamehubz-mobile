/**
 * Runs `run` once per window, however many times it is asked for inside it: the first request
 * starts the window, the rest ride along, and the run at its end covers all of them. A busy chat
 * sends a badge push for every message and a read for every burst; each used to refetch the match
 * lists on its own. The window bounds how stale a list can be (`delayMs`), not how often signals come.
 */
export function createCoalescer(run: () => void, delayMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
        schedule() {
            if (timer !== undefined) return;
            timer = setTimeout(() => {
                timer = undefined;
                run();
            }, delayMs);
        },
        cancel() {
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
        },
    };
}
