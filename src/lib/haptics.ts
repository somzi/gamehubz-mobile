import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback, deliberately rationed.
 *
 * The rule this file exists to enforce: a haptic marks an OUTCOME, never a navigation. Buzzing on
 * every tap is the fastest way to make an app feel cheap, and it trains people to ignore the one
 * buzz that mattered. So there are three calls here and no general-purpose "tap" helper — if a new
 * call site does not fit one of them, it probably should not vibrate at all.
 *
 * Every call is fire-and-forget and swallows its own failure: the motor is hardware that may be
 * absent, disabled in system settings, or busy, and none of that is worth an unhandled rejection in
 * the middle of submitting a result. iOS additionally honours the user's system haptics setting for
 * free; there is no cross-platform way to read it, so we do not try.
 */

const fire = (run: () => Promise<void>): void => {
    void run().catch(() => { /* no motor, disabled, or busy — never the caller's problem */ });
};

/** A light tick confirming a gesture registered — a long-press that copied, a value that latched. */
export const hapticSelection = (): void => fire(Haptics.selectionAsync);

/** Something irreversible landed: checked in, result submitted. */
export const hapticSuccess = (): void =>
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** The same action failed. Paired with hapticSuccess so the two are never used alone. */
export const hapticError = (): void =>
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
