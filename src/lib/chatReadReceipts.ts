/** History, group rejoin and live messages share one read queue for a visible conversation. */
export function createChatReadReceipts(send: () => void | Promise<void>, delayMs = 1_000) {
    let lastSent: string | undefined;
    let pending: string | undefined;
    let inFlight: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let started = false;
    const flush = async () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        if (inFlight !== undefined || pending === undefined) return;
        const key = pending;
        pending = undefined;
        inFlight = key;
        try { await send(); lastSent = key; } catch { /* A later history read/message can retry. */ }
        finally {
            inFlight = undefined;
            if (pending !== undefined) {
                if (closed) void flush(); // Report messages already seen before blur, never new ones.
                else scheduleTimer();
            }
        }
    };
    const scheduleTimer = () => {
        if (timer === undefined && !closed) timer = setTimeout(() => { void flush(); }, delayMs);
    };
    return {
        schedule(key: string) {
            if (closed || key === lastSent || key === inFlight || key === pending) return;
            pending = key;
            if (!started) {
                // A newly visible conversation clears its badge without the batching delay.
                // Later reads (including retries) retain the shared one-second window.
                started = true;
                void flush();
            } else scheduleTimer();
        },
        close() { closed = true; void flush(); },
    };
}
