import React from 'react';
import { KeyboardAvoidingView, StyleSheet, type KeyboardAvoidingViewProps } from 'react-native';

const styles = StyleSheet.create({
    fill: { flex: 1 },
});

/**
 * Keyboard avoidance that survives edge-to-edge.
 *
 * With `android.edgeToEdgeEnabled` (app.json) the window is no longer resized for
 * the IME — Android 15+ enforces this — so the old
 * `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` left composers and
 * inputs sitting underneath the keyboard on those devices (Poco X7 Pro / HyperOS 2
 * was the first report). `softwareKeyboardLayoutMode: 'resize'` does not help; it
 * is ignored in edge-to-edge.
 *
 * 'padding' is correct on both platforms now: KeyboardAvoidingView derives its
 * inset by measuring its own frame against the keyboard, so on older devices that
 * still get a legacy window resize it measures 0 and adds nothing — no double
 * compensation, which is what made the composer jumpy back when Android did resize.
 *
 * Single choke point on purpose: moving to react-native-keyboard-controller is a
 * change to this file only.
 */
export function KeyboardAvoider({
    style,
    behavior = 'padding',
    ...rest
}: KeyboardAvoidingViewProps) {
    return <KeyboardAvoidingView style={style ?? styles.fill} behavior={behavior} {...rest} />;
}
