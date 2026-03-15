import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FloatingActionButtonProps {
    onClick: () => void;
}

export function FloatingActionButton({ onClick }: FloatingActionButtonProps) {
    return (
        <Pressable
            onPress={onClick}
            style={({ pressed }) => [
                styles.fab,
                pressed && styles.pressed
            ]}
        >
            <Ionicons name="add" size={28} color="#FAFAFA" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#8B5CF6',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    pressed: {
        opacity: 0.8,
        transform: [{ scale: 0.95 }],
    },
});
