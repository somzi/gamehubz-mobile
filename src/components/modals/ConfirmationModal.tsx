import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';

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
    /** Stack the actions full-width (primary on top) instead of side by side. The row layout
     *  gives each button half the width and Button truncates its label to one line, so any
     *  label longer than ~10 characters needs this. */
    stacked?: boolean;
    /** Render as a plain absolute-fill view instead of its own Modal, for callers that are
     *  already inside one. A Modal nested in a Modal is a second Android window: when both come
     *  down in the same frame the inner one is torn down mid-teardown of its parent and the
     *  window it leaves behind swallows every touch on the screen underneath. In overlay mode
     *  the whole sheet-plus-confirmation flow stays in a single window, so that cannot happen.
     *  The caller owns the hardware back key - route it to onClose while this is up. */
    overlay?: boolean;
}

export function ConfirmationModal({
    visible,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    isDestructive = true,
    isLoading = false,
    stacked = false,
    overlay = false,
}: ConfirmationModalProps) {
    // Resolved in the body rather than as default parameters: a default is evaluated
    // before hooks run, so it would capture whatever language was active at import.
    const { t } = useTranslation('common');
    const confirmLabel = confirmText ?? t('confirm');
    const cancelLabel = cancelText ?? t('cancel');

    const body = (
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

                        {stacked ? (
                            // Primary first: the affirmative answer is the one the prompt is asking for,
                            // and full width leaves room for a label the row layout would clip.
                            <View className="w-full gap-3">
                                <Button
                                    variant={isDestructive ? 'destructive' : 'default'}
                                    onPress={onConfirm}
                                    loading={isLoading}
                                    className="w-full h-14 rounded-2xl"
                                >
                                    {confirmLabel}
                                </Button>
                                <Button
                                    variant="outline"
                                    onPress={onClose}
                                    disabled={isLoading}
                                    className="w-full h-14 rounded-2xl"
                                >
                                    {cancelLabel}
                                </Button>
                            </View>
                        ) : (
                            <View className="flex-row gap-3 w-full">
                                <View className="flex-1">
                                    <Button
                                        variant="outline"
                                        onPress={onClose}
                                        disabled={isLoading}
                                        className="w-full h-14 rounded-2xl"
                                    >
                                        {cancelLabel}
                                    </Button>
                                </View>
                                <View className="flex-1">
                                    <Button
                                        variant={isDestructive ? 'destructive' : 'default'}
                                        onPress={onConfirm}
                                        loading={isLoading}
                                        className="w-full h-14 rounded-2xl"
                                    >
                                        {confirmLabel}
                                    </Button>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </View>
    );

    if (overlay) {
        return visible ? <View className="absolute inset-0" style={{ elevation: 24 }}>{body}</View> : null;
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            {body}
        </Modal>
    );
}
