import { ScrollView, View } from 'react-native';

/**
 * Scrolls a row inside a ScrollView clear of the keyboard.
 *
 * `scrollToEnd` is the usual shortcut and is wrong whenever the field being typed into is not the
 * last thing on the page — the series form keeps a summary, a submit button and an evidence panel
 * below its game rows, so scrolling to the end pushes the focused row off the top of the screen.
 *
 * Positions are read with `measureInWindow` on both the row and the scroll viewport, then turned
 * into an absolute offset using the caller's tracked scroll position. `measureLayout` would be the
 * shorter route, but under the New Architecture it demands a ref to a native component and the only
 * handle a ScrollView offers for its content is a legacy numeric node — which fails outright.
 *
 * The delay lets the keyboard's own layout pass settle first, otherwise the viewport is measured
 * just before it shrinks.
 */
export function scrollRowIntoView(
    scrollView: ScrollView | null,
    row: View | null,
    /** Current scroll offset, tracked by the caller via onScroll. */
    currentOffsetY: number,
    /** Space to leave above the row, so it doesn't land flush against the header. */
    topPadding = 100,
) {
    if (!scrollView || !row) return;

    // ScrollView itself carries no measure methods; its underlying host view does.
    const viewport = scrollView.getNativeScrollRef?.() as unknown as View | null;
    if (!viewport) return;

    setTimeout(() => {
        row.measureInWindow((_rowX, rowScreenY) => {
            viewport.measureInWindow((_svX, viewportScreenY) => {
                const delta = rowScreenY - (viewportScreenY + topPadding);

                // Already sitting where we want it — moving would just look like a twitch.
                if (Math.abs(delta) < 8) return;

                scrollView.scrollTo({ y: Math.max(0, currentOffsetY + delta), animated: true });
            });
        });
    }, 150);
}
