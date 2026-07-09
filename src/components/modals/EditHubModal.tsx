import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { Toggle } from '../ui/Toggle';
import { cn } from '../../lib/utils';

// Discord webhook + notification settings moved to their own screen
// (ManageHubDiscordScreen) — this modal only edits the hub's identity.
interface EditHubModalProps {
    visible: boolean;
    hubId: string;
    initialName: string;
    initialDescription: string;
    initialIsPublic?: boolean;
    onClose: () => void;
    onSave: (
        name: string,
        description: string,
        isPublic: boolean,
    ) => Promise<void>;
}

export function EditHubModal({
    visible,
    hubId,
    initialName,
    initialDescription,
    initialIsPublic = true,
    onClose,
    onSave,
}: EditHubModalProps) {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [isPublic, setIsPublic] = useState(initialIsPublic);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setName(initialName);
            setDescription(initialDescription);
            setIsPublic(initialIsPublic);
        }
    }, [visible, initialName, initialDescription, initialIsPublic]);

    const handleSave = async () => {
        if (!name.trim() || isSaving) return;

        setIsSaving(true);
        try {
            await onSave(name, description, isPublic);
        } catch (error) {
            console.error('Error saving hub:', error);
        } finally {
            setIsSaving(false);
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1">
                {/* Backdrop as an absolute sibling so it never competes with the ScrollView for touches */}
                <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />
                <KeyboardAvoidingView
                    behavior="padding"
                    style={{ pointerEvents: 'box-none' }}
                    className="flex-1 justify-center items-center px-5"
                >
                    <View
                        className="bg-[#0D1525] rounded-3xl p-6 w-full max-w-md max-h-[88%] border border-white/[0.06]"
                    >
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-xl font-black text-white">Edit Hub</Text>
                            <Pressable onPress={onClose} className="w-8 h-8 rounded-xl bg-white/[0.05] items-center justify-center">
                                <Ionicons name="close" size={18} color="#64748B" />
                            </Pressable>
                        </View>

                        <ScrollView
                            className="grow-0 shrink"
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                            alwaysBounceVertical={false}
                        >
                            <View className="mb-4">
                                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Hub Name</Text>
                                <TextInput
                                    value={name}
                                    onChangeText={setName}
                                    placeholder="Enter hub name"
                                    placeholderTextColor="#334155"
                                    className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm"
                                />
                            </View>

                            <View className="mb-5">
                                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Description</Text>
                                <TextInput
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder="Enter hub description"
                                    placeholderTextColor="#334155"
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                    className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm h-24"
                                />
                            </View>

                            <View className="h-[1px] bg-white/5 mb-5" />

                            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Privacy</Text>
                            <View className="bg-white/[0.03] p-4 rounded-2xl border border-white/[0.06]">
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-row items-center gap-3 flex-1">
                                        <View className={cn(
                                            "w-10 h-10 rounded-2xl items-center justify-center",
                                            isPublic ? "bg-emerald-500/10" : "bg-amber-500/10"
                                        )}>
                                            <Ionicons
                                                name={isPublic ? "globe-outline" : "lock-closed-outline"}
                                                size={18}
                                                color={isPublic ? "#10B981" : "#F59E0B"}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white font-bold text-sm">
                                                {isPublic ? "Public Hub" : "Private Hub"}
                                            </Text>
                                            <Text className="text-slate-500 text-xs mt-0.5">
                                                {isPublic
                                                    ? "Anyone can follow this hub"
                                                    : "Members need approval to join"}
                                            </Text>
                                        </View>
                                    </View>
                                    <Toggle
                                        value={isPublic}
                                        onValueChange={setIsPublic}
                                        activeColor="#10B981"
                                        inactiveColor="#F59E0B"
                                    />
                                </View>
                            </View>

                        </ScrollView>

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
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
