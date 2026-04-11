import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NotificationPermissionModalProps {
    visible: boolean;
    onAllow: () => void;
    onDismiss: () => void;
}

export function NotificationPermissionModal({
    visible,
    onAllow,
    onDismiss,
}: NotificationPermissionModalProps) {
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onDismiss}
        >
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

                <View
                    style={[
                        styles.container,
                        {
                            paddingTop: Math.max(insets.top, 16) + 16,
                            paddingBottom: Math.max(insets.bottom, 16) + 16,
                        },
                    ]}
                >
                    {/* Icon */}
                    <View style={styles.iconWrap}>
                        <Text style={styles.iconEmoji}>🔔</Text>
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>Stay in the Game!</Text>

                    {/* Description */}
                    <Text style={styles.description}>
                        Get instant updates about upcoming tournaments, match results, and activity
                        in your hubs. Don't miss a beat!
                    </Text>

                    {/* Allow button */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.allowButton,
                            pressed && styles.pressed,
                        ]}
                        onPress={onAllow}
                    >
                        <Text style={styles.allowText}>Allow</Text>
                    </Pressable>

                    {/* Maybe Later */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.laterButton,
                            pressed && styles.pressed,
                        ]}
                        onPress={onDismiss}
                    >
                        <Text style={styles.laterText}>Maybe Later</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    container: {
        backgroundColor: '#111827',
        width: '100%',
        maxWidth: 380,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#10B981',
        paddingHorizontal: 28,
        alignItems: 'center',

        // Subtle glow
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 12,
    },
    iconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(16, 185, 129, 0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    iconEmoji: {
        fontSize: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#F9FAFB',
        textAlign: 'center',
        marginBottom: 10,
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        color: '#9CA3AF',
        textAlign: 'center',
        marginBottom: 28,
    },
    allowButton: {
        width: '100%',
        backgroundColor: '#10B981',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    allowText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    laterButton: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.10)',
        backgroundColor: 'transparent',
    },
    laterText: {
        color: '#6B7280',
        fontSize: 15,
        fontWeight: '500',
    },
    pressed: {
        opacity: 0.7,
    },
});
