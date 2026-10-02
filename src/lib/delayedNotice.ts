/**
 * A notice that appears only once its condition has held for `delayMs`, and goes the moment it
 * stops. A chat connection normally comes up well inside a second: showing "Connecting…" on every
 * open pushed the messages down and back up. Only a wait the player would notice is announced.
 */
export function createDelayedNotice(onChange: (shown: boolean) => void, delayMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown = false;
    const clear = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };
    return {
        set(active: boolean) {
            if (!active) {
                clear();
                if (shown) {
                    shown = false;
                    onChange(false);
                }
                return;
            }
            if (shown || timer !== undefined) return;
            timer = setTimeout(() => {
                timer = undefined;
                shown = true;
                onChange(true);
            }, delayMs);
        },
        dispose: clear,
    };
}
