import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

export interface StatusModalProps {
    visible: boolean;
    onClose: () => void;
    type?: 'success' | 'error' | 'info';
    title: string;
    message: string;
    buttonText?: string;
}

export function StatusModal({
    visible,
    onClose,
    type = 'success',
    title,
    message,
    buttonText = 'Okay'
}: StatusModalProps) {
    const getIcon = () => {
        switch (type) {
            case 'success':
                return { name: 'checkmark-circle' as const, color: '#10B981' };
            case 'error':
                return { name: 'alert-circle' as const, color: '#EF4444' };
            case 'info':
                return { name: 'information-circle' as const, color: '#3B82F6' };
            default:
                return { name: 'checkmark-circle' as const, color: '#10B981' };
        }
    };

    const icon = getIcon();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/60 items-center justify-center p-6">
                <Pressable className="absolute inset-0" onPress={onClose} />

                <View className="bg-card w-full max-w-sm rounded-[32px] overflow-hidden border border-border/10 shadow-2xl">
                    <View className="p-8 items-center">
                        <View
                            className="w-20 h-20 rounded-full items-center justify-center mb-6"
                            style={{ backgroundColor: `${icon.color}15` }}
                        >
                            <Ionicons name={icon.name} size={48} color={icon.color} />
                        </View>

                        <Text className="text-2xl font-bold text-foreground mb-2 text-center">
                            {title}
                        </Text>

                        <Text className="text-muted-foreground text-center leading-6 mb-8 text-base px-2">
                            {message}
                        </Text>

                        <Button
                            className="w-full"
                            onPress={onClose}
                            variant={type === 'error' ? 'destructive' : 'default'}
                        >
                            {buttonText}
                        </Button>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
