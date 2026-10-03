/**
 * Whether the root stack is mid-transition, from its own transitionStart / transitionEnd events
 * (subscribed by each mounted scene), and a way to wait for the end of one.
 *
 * InteractionManager can't be used for this: React Native 0.81 ships it disabled behind
 * `disableInteractionManager`, and the stub that replaces it runs every task on the next tick,
 * mid-animation. The stack's events are the only reliable "the screen is fully in view" signal.
 */

type TransitionEvent = { target?: string; data?: { closing: boolean } };

/** Route-scoped emitter listeners still receive POP events after the route leaves navigation state.
 * Navigator screenListeners do not: useNavigationBuilder filters those against the new state. */
export function observeStackTransitions(navigation: {
    addListener(type: 'transitionStart' | 'transitionEnd', listener: (event: TransitionEvent) => void): () => void;
}) {
    const start = navigation.addListener('transitionStart', noteStackTransitionStart);
    const end = navigation.addListener('transitionEnd', noteStackTransitionEnd);
    return () => { start(); end(); };
}
// An interrupted animation may emit two starts and only one end for the same route.
// Track the latest transition per route, rather than accumulating an unmatched counter.
const running = new Map<string, { closing?: boolean; at: number }>();
const waiters = new Set<() => void>();

// A start whose end never arrived (a route removed mid-animation) must not hold every later wait.
const STUCK_AFTER_MS = 2_000;
// Waits never outlast a slow transition by much; with animations off there are no events at all.
const FALLBACK_MS = 2_000;

export function noteStackTransitionStart(event: TransitionEvent = {}) {
    running.set(event.target ?? 'stack', { closing: event.data?.closing, at: Date.now() });
}

export function noteStackTransitionEnd(event: TransitionEvent = {}) {
    const key = event.target ?? 'stack';
    const active = running.get(key);
    if (active?.closing !== undefined && event.data?.closing !== undefined
        && active.closing !== event.data.closing) return;
    running.delete(key);
    if (running.size > 0) return;
    for (const check of [...waiters]) check();
}

export function resetStackTransitions() {
    running.clear();
}

/**
 * Run `run` once no stack transition is in progress. Called from a focus effect, where the pop that
 * brought the screen back has only just started; the check waits one frame so the transition that
 * belongs to this navigation (a pop animates from an effect, a push a tick after mount) has
 * registered first. Returns a cancel for the effect's cleanup.
 */
export function afterStackTransition(run: () => void): () => void {
    let done = false;
    let frame: ReturnType<typeof requestAnimationFrame>;
    const finish = () => {
        if (done) return;
        done = true;
        waiters.delete(check);
        clearTimeout(fallback);
        cancelAnimationFrame(frame);
        run();
    };
    const check = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (done) return;
            for (const [key, transition] of running) {
                if (Date.now() - transition.at >= STUCK_AFTER_MS) running.delete(key);
            }
            if (running.size === 0) finish();
        });
    };
    // A subsequent animation can start while an earlier waiter is pending. The timeout
    // checks its age as well, rather than opening a modal in the middle of that animation.
    let fallback = setTimeout(function retry() {
        if (done) return;
        check();
        fallback = setTimeout(retry, FALLBACK_MS);
    }, FALLBACK_MS);
    waiters.add(check);
    // Stack's initial push starts in a setTimeout from an effect. Give that timer a turn
    // before checking on the next frame (rAF can precede timers in React Native).
    const start = setTimeout(check, 0);
    return () => {
        done = true;
        waiters.delete(check);
        clearTimeout(start);
        clearTimeout(fallback);
        cancelAnimationFrame(frame);
    };
}
