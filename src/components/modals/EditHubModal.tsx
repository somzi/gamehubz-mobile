import React, { useState } from 'react';
import { View, Text, Modal, Pressable, TextInput } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';

interface EditHubModalProps {
    visible: boolean;
    hubId: string;
    initialName: string;
    initialDescription: string;
    onClose: () => void;
    onSave: (name: string, description: string) => Promise<void>;
}

export function EditHubModal({
    visible,
    hubId,
    initialName,
    initialDescription,
    onClose,
    onSave,
}: EditHubModalProps) {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            await onSave(name, description);
            onClose();
        } catch (error) {
            console.error('Error saving hub:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable
                className="flex-1 bg-black/50 justify-center items-center px-6"
                onPress={onClose}
            >
                <Pressable
                    className="bg-card rounded-2xl p-6 w-full max-w-md border border-border/30"
                    onPress={(e) => e.stopPropagation()}
                >
                    <View className="flex-row justify-between items-center mb-6">
                        <Text className="text-xl font-bold text-foreground">Edit Hub</Text>
                        <Pressable onPress={onClose}>
                            <Ionicons name="close" size={24} color="#94A3B8" />
                        </Pressable>
                    </View>

                    <View className="space-y-4">
                        <View>
                            <Text className="text-sm font-medium text-foreground mb-2">Hub Name</Text>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                placeholder="Enter hub name"
                                placeholderTextColor="#64748B"
                                className="bg-background border border-border rounded-xl px-4 py-3 text-foreground"
                            />
                        </View>

                        <View>
                            <Text className="text-sm font-medium text-foreground mb-2">Description</Text>
                            <TextInput
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Enter hub description"
                                placeholderTextColor="#64748B"
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                className="bg-background border border-border rounded-xl px-4 py-3 text-foreground min-h-[100px]"
                            />
                        </View>
                    </View>

                    <View className="flex-row gap-3 mt-6">
                        <Button
                            onPress={onClose}
                            variant="secondary"
                            className="flex-1"
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            onPress={handleSave}
                            className="flex-1"
                            disabled={isSaving || !name.trim()}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
