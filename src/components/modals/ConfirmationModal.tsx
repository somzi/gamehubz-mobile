import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { TEAM_LABELS } from '../../lib/teamConstants';

export interface ConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    isLoading?: boolean;
}

export function ConfirmationModal({
    visible,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = TEAM_LABELS.CONFIRM_BUTTON,
    cancelText = TEAM_LABELS.CANCEL_BUTTON,
    isDestructive = true,
    isLoading = false,
}: ConfirmationModalProps) {
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
                            style={{ backgroundColor: isDestructive ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' }}
                        >
                            <Ionicons
                                name={isDestructive ? 'warning' : 'help-circle'}
                                size={48}
                                color={isDestructive ? '#EF4444' : '#10B981'}
                            />
                        </View>

                        <Text className="text-2xl font-bold text-foreground mb-2 text-center">
                            {title}
                        </Text>

                        <Text className="text-muted-foreground text-center leading-6 mb-8 text-base px-2">
                            {message}
                        </Text>

                        <View className="flex-row gap-3 w-full">
                            <View className="flex-1">
                                <Button
                                    variant="outline"
                                    onPress={onClose}
                                    disabled={isLoading}
                                    className="w-full h-14 rounded-2xl"
                                >
                                    {cancelText}
                                </Button>
                            </View>
                            <View className="flex-1">
                                <Button
                                    variant={isDestructive ? 'destructive' : 'default'}
                                    onPress={onConfirm}
                                    loading={isLoading}
                                    className="w-full h-14 rounded-2xl"
                                >
                                    {confirmText}
                                </Button>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
