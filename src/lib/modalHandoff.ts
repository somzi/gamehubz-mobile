import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { afterStackTransition } from '../navigation/stackTransitions';

/**
 * Hand-offs from a closing native Modal to whatever comes next — another modal, a pushed screen.
 *
 * The next step waits for the modal to be gone. Started together, the two animations overlap (a
 * sheet sliding down while a profile slides in), and iOS drops a Modal presented while another one
 * is still dismissing. iOS says when a dismissal is over (Modal's `onDismiss`, iOS-only in RN 0.81);
 * Android says nothing, but its modal animations all run for `config_shortAnimTime` (200ms).
 */
const ANDROID_MODAL_EXIT_MS = 220;
// iOS reports the end through onDismiss, but only to a Modal that is still mounted. One a parent
// unmounts on close never reports, so the hand-off still goes ahead after a dismissal's length.
const IOS_FALLBACK_MS = 500;

export interface ModalHandoff {
    /** Run `next` once the modal being closed has finished animating out. The last call wins. */
    after(next: () => void): void;
    /** Wire to the closing Modal's `onDismiss`. */
    onDismiss(): void;
}

export function createModalHandoff(): ModalHandoff {
    let pending: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onDismiss = () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        const next = pending;
        pending = null;
        next?.();
    };

    return {
        after(next) {
            pending = next;
            if (timer) clearTimeout(timer);
            // Deliberately not cancelled on unmount: closing a modal often unmounts its owner, and
            // the step after it (a parent's success sheet, a navigation) still has to happen.
            timer = setTimeout(onDismiss, Platform.OS === 'ios' ? IOS_FALLBACK_MS : ANDROID_MODAL_EXIT_MS);
        },
        onDismiss,
    };
}

/** A hand-off owned by a component, stable across its renders. */
export function useModalHandoff(): ModalHandoff {
    const [handoff] = useState(createModalHandoff);
    return handoff;
}

/**
 * Bring a modal back once the screen it sits on is fully in view again. Focus arrives as the pop
 * starts, so reopening right away slid the modal up over the profile still sliding away. Waits for
 * the stack's own transitionEnd (see navigation/stackTransitions). Cancelled if the screen loses
 * focus first.
 */
export function afterScreenTransition(run: () => void): () => void {
    return afterStackTransition(run);
}

/**
 * Keeps a hidden modal's native Modal mounted until it has animated out on iOS, so its `onDismiss`
 * can fire (an unmounted one never reports). Android has no dismiss callback and its Modal unmounts
 * the moment it is hidden anyway, so there the modal is released at once.
 *
 * Returns whether to render, and the handler to chain into the Modal's `onDismiss`.
 */
export function useModalPresence(visible: boolean, onDismissed?: () => void) {
    const [present, setPresent] = useState(visible);
    useEffect(() => {
        if (visible) setPresent(true);
        else if (Platform.OS !== 'ios') setPresent(false);
    }, [visible]);
    const onDismiss = () => {
        setPresent(false);
        onDismissed?.();
    };
    return { rendered: visible || present, onDismiss };
}
