import { createContext, useCallback, useContext, useRef } from 'react';
import { ScrollView, View, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

/**
 * Keeps the field being typed in clear of the keyboard. RN's ScrollView does not move to a focused
 * input: the form shrinks above the keyboard, and a field low on the page — a description at the end of
 * a step — stays under it. A field calls `reveal` with its box on focus, and the form scrolls just
 * enough to show all of it.
 */
type Reveal = (field: View | null) => void;

const FormScrollContext = createContext<Reveal | null>(null);

export const FormScrollProvider = FormScrollContext.Provider;

/** The enclosing form's reveal, or null outside one. */
export function useRevealField(): Reveal | null {
    return useContext(FormScrollContext);
}

/** Space kept between a revealed field and the edge of the visible form. */
const MARGIN = 16;
/** Long enough for the keyboard to come up and the form to finish shrinking above it. */
const SETTLE_MS = 320;

export function useFormScroll() {
    const scrollRef = useRef<ScrollView>(null);
    const offset = useRef(0);

    const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.y;
    }, []);

    /** For a scroll view that starts over at the top (a new step). */
    const resetOffset = useCallback(() => {
        offset.current = 0;
    }, []);

    const reveal = useCallback<Reveal>((field) => {
        if (!field) return;
        setTimeout(() => {
            const scroll = scrollRef.current;
            // ScrollView itself carries no measure methods; its underlying host view does.
            const viewport = scroll?.getNativeScrollRef?.() as unknown as View | null;
            if (!scroll || !viewport) return;

            field.measureInWindow((_x, fieldY, _w, fieldHeight) => {
                viewport.measureInWindow((_vx, viewY, _vw, viewHeight) => {
                    const hiddenBelow = fieldY + fieldHeight + MARGIN - (viewY + viewHeight);
                    const hiddenAbove = viewY + MARGIN - fieldY;
                    if (hiddenBelow > 0) {
                        // A field taller than the space left shows its top, where the typing starts.
                        const room = viewHeight - 2 * MARGIN;
                        const move = fieldHeight > room ? fieldY - viewY - MARGIN : hiddenBelow;
                        scroll.scrollTo({ y: Math.max(0, offset.current + move), animated: true });
                    } else if (hiddenAbove > 0) {
                        scroll.scrollTo({ y: Math.max(0, offset.current - hiddenAbove), animated: true });
                    }
                });
            });
        }, SETTLE_MS);
    }, []);

    return { scrollRef, onScroll, resetOffset, reveal };
}
