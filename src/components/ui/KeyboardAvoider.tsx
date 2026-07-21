import React, { useEffect, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    View,
    type KeyboardAvoidingViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const styles = StyleSheet.create({
    fill: { flex: 1 },
});

type Props = KeyboardAvoidingViewProps & {
    /**
     * Whether an ancestor already pads the bottom safe-area inset. 'consumed'
     * (default) matches a <SafeAreaView> with the 'bottom' edge — either explicit
     * or via the all-edges default. Pass 'none' when the screen uses
     * `edges={['top']}` and its content runs under the nav bar.
     */
    bottomInset?: 'consumed' | 'none';
};

/**
 * Keyboard avoidance that works under Expo SDK 54 edge-to-edge.
 *
 * `android.edgeToEdgeEnabled` (app.json) means the window is no longer resized
 * for the IME — Android 15+ enforces this — which breaks Android keyboard
 * avoidance in a way that is easy to misdiagnose:
 *
 *   1. `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` does nothing,
 *      because it relies on the window resize that no longer happens.
 *   2. Switching Android to `behavior="padding"` does not help either.
 *      KeyboardAvoidingView positions itself from `endCoordinates.screenY`, and
 *      RN computes that value wrong here. See ReactRootView.checkForKeyboardEvents:
 *      with `softwareKeyboardLayoutMode: 'resize'` the manifest says adjustResize,
 *      so RN takes the `screenY = mVisibleViewArea.bottom` branch — it assumes the
 *      visible frame already shrank for the keyboard. In edge-to-edge it did not,
 *      so screenY lands at the bottom of the screen and KAV computes ~0 inset.
 *
 * `endCoordinates.height` from the same event *is* correct: RN derives it as
 * `imeInsets.bottom - systemBarInsets.bottom`, read straight from
 * WindowInsets.Type.ime(), with no dependency on the window resizing. So on
 * Android we track that and pad ourselves. Because it excludes the nav bar, the
 * full lift off the window bottom is `height + insets.bottom` — hence the
 * `bottomInset` prop, so screens that already pad the nav bar don't double up.
 *
 * iOS is untouched and keeps the stock KeyboardAvoidingView, which works there.
 *
 * MatchDetailsModal and MatchScheduleCard reached the same conclusion earlier and
 * carry their own copy of this workaround, kept local because KAV also mismeasures
 * inside a statusBarTranslucent Modal.
 *
 * Single choke point on purpose: moving to react-native-keyboard-controller —
 * which reads the IME inset directly and animates with it — is a change to this
 * file only, but needs a native build, so it cannot ship over expo-updates.
 */
export function KeyboardAvoider({ bottomInset = 'consumed', ...rest }: Props) {
    // Platform.OS is fixed for the process, so this branch never flips and each
    // implementation can own its hooks.
    return Platform.OS === 'ios' ? (
        <IosAvoider {...rest} />
    ) : (
        <AndroidAvoider bottomInset={bottomInset} {...rest} />
    );
}

function IosAvoider({ style, behavior = 'padding', ...rest }: KeyboardAvoidingViewProps) {
    return <KeyboardAvoidingView style={style ?? styles.fill} behavior={behavior} {...rest} />;
}

function AndroidAvoider({
    style,
    bottomInset,
    // iOS-only knobs — they must not reach the View below.
    behavior: _behavior,
    keyboardVerticalOffset: _keyboardVerticalOffset,
    contentContainerStyle: _contentContainerStyle,
    enabled = true,
    ...rest
}: Props) {
    const insets = useSafeAreaInsets();
    const [imeHeight, setImeHeight] = useState(0);

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', (e) =>
            setImeHeight(e.endCoordinates.height),
        );
        const hide = Keyboard.addListener('keyboardDidHide', () => setImeHeight(0));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);

    const paddingBottom =
        enabled && imeHeight > 0
            ? imeHeight + (bottomInset === 'consumed' ? 0 : insets.bottom)
            : 0;

    return <View style={[style ?? styles.fill, { paddingBottom }]} {...rest} />;
}
