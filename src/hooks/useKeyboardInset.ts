import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        // iOS fires will* ahead of the keyboard animation so the lift travels with it;
        // Android only emits the did* pair.
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
        const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
        return () => {
            show.remove();
            hide.remove();
        };
    }, [enabled]);

    if (!enabled || height <= 0) return 0;

    const fromScreenBottom = Platform.OS === 'ios' ? height : height + insets.bottom;
    return Math.max(fromScreenBottom - consumedBottomInset, 0);
}
