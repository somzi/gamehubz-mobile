import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Breathing room between the lifted content and the top of the keyboard. */
const GAP = 8;

/**
 * Bottom padding that lifts a composer clear of the on-screen keyboard, derived
 * from the keyboard metrics instead of from a measured view frame.
 *
 * Why not KeyboardAvoidingView: it pads by `frame.y + frame.height - keyboardY`
 * (see RN's KeyboardAvoidingView._relativeKeyboardHeight) where `frame` comes from
 * its own onLayout — which is PARENT-relative. At the root of a screen that happens
 * to approximate the screen bottom, so it works. Nested below a modal's top padding,
 * header and tab bar it under-pads by exactly that offset, leaving the input behind
 * the keyboard; `keyboardVerticalOffset` only papers over it with a hand-tuned
 * constant that goes stale the moment the header changes.
 *
 * The keyboard metrics we do trust:
 *   iOS     — `endCoordinates.height` is the keyboard height measured from the
 *             screen bottom, home-indicator area included.
 *   Android — under Expo SDK 54 edge-to-edge it is the IME inset MINUS the
 *             navigation-bar inset, so the distance from the screen bottom is
 *             `height + insets.bottom` (see KeyboardAvoider for the long story).
 *
 * `consumedBottomInset` is how many px the container already pads at its bottom —
 * that much of the keyboard is cleared before this padding is applied. `enabled`
 * keeps list-mounted callers (a screen full of match cards, each carrying its own
 * modal) from subscribing until their modal is actually on screen.
 */
export function useKeyboardInset(consumedBottomInset = 0, enabled = true): number {
    const insets = useSafeAreaInsets();
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (!enabled) {
            setHeight(0);
            return;
        }

        // The keyboard can already be open when this turns on — switching from a tab with a
        // focused input straight into the chat tab never fires a show event, and without this
        // seed the composer would sit under a keyboard that is right there on screen.
        setHeight(Keyboard.metrics()?.height ?? 0);

        // iOS fires will* ahead of the keyboard animation so the lift travels with it;
        // Android only emits the did* pair.
        const ios = Platform.OS === 'ios';
        const showEvent = ios ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = ios ? 'keyboardWillHide' : 'keyboardDidHide';
        // A keyboard that changes height AFTER it is up — predictive bar toggling, switching to
        // the emoji keyboard or another language — fires only a frame-change event. Without it the
        // inset goes stale and the send button ends up a few px under the taller keyboard, which
        // reads as "tapping send does nothing until I dismiss the keyboard".
        const frameEvent = ios ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame';

        // iOS: derive the height from the keyboard's top edge rather than trusting
        // `height` — the frame-change event also fires while the keyboard is LEAVING, and it
        // still reports the full height then. Measuring the gap to the screen bottom reads 0
        // for that off-screen frame, so a dismiss can never leave a stale lift behind.
        // Android keeps `height`: under edge-to-edge its screenY is the value RN gets wrong.
        const apply = (e: KeyboardEvent) =>
            setHeight(
                ios
                    ? Math.max(Dimensions.get('window').height - e.endCoordinates.screenY, 0)
                    : e.endCoordinates.height,
            );
        const show = Keyboard.addListener(showEvent, apply);
        const frame = Keyboard.addListener(frameEvent, apply);
        const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
        return () => {
            show.remove();
            frame.remove();
            hide.remove();
        };
    }, [enabled]);

    if (!enabled || height <= 0) return 0;

    const fromScreenBottom = Platform.OS === 'ios' ? height : height + insets.bottom;
    // GAP keeps the composer off the keyboard's top edge instead of flush against it: any small
    // discrepancy in the reported height would otherwise leave the bottom of the send button
    // under the keyboard, where taps go to the keyboard and never reach the button.
    return Math.max(fromScreenBottom - consumedBottomInset + GAP, 0);
}
