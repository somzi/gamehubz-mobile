import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the OS is asking for reduced motion ("Remove animations" on Android, "Reduce Motion"
 * on iOS). Read once on mount and then kept live, because the user can flip it in system
 * settings without the app restarting.
 *
 * Use it to skip *decorative* motion — a bell that rings, a celebratory flourish. Press feedback
 * and transitions that communicate state are not what this setting is about, so leave those on.
 */
export function useReduceMotion(): boolean {
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        let active = true;

        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => { if (active) setReduceMotion(enabled); })
            // Older Androids can reject this; motion stays on, which is the pre-existing behaviour.
            .catch(() => { /* ignore */ });

        const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

        return () => {
            active = false;
            subscription.remove();
        };
    }, []);

    return reduceMotion;
}
