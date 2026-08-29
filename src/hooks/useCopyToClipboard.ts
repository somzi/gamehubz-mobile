import { useCallback, useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';

/**
 * Copy-to-clipboard plus a short-lived `copied` flag for inline feedback.
 *
 * Shared by the chat bubbles (match chat + DMs): both copy on long press and
 * flash a <CopiedOverlay /> pill rather than popping a native Alert (iOS) or a
 * ToastAndroid, so the confirmation stays inside the bubble and identical on
 * both platforms.
 *
 * The reset timer is cleared on unmount — a bubble can scroll out of the
 * virtualized DM list mid-flash, and that would otherwise set state on a
 * torn-down component.
 */
export function useCopyToClipboard(resetDelay = 1200) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    const copy = useCallback(
        (text: string): void => {
            void (async () => {
                try {
                    await Clipboard.setStringAsync(text);
                    setCopied(true);
                    if (timerRef.current) {
                        clearTimeout(timerRef.current);
                    }
                    timerRef.current = setTimeout(() => setCopied(false), resetDelay);
                } catch (err) {
                    console.warn('Copy failed', err);
                }
            })();
        },
        [resetDelay],
    );

    return { copied, copy };
}
