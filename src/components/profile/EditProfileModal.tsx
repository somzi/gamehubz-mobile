import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

interface SocialLink {
    platform: "discord" | "tiktok" | "instagram" | "twitter" | "youtube";
    username: string;
    url?: string;
}

interface EditProfileModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (data: { discord: string; tiktok: string; instagram: string }) => void;
    initialData: {
        discord: string;
        tiktok: string;
        instagram: string;
    };
}

export function EditProfileModal({ visible, onClose, onSave, initialData }: EditProfileModalProps) {
    const { t } = useTranslation('profile');
    const [discord, setDiscord] = useState(initialData.discord);
    const [tiktok, setTiktok] = useState(initialData.tiktok);
    const [instagram, setInstagram] = useState(initialData.instagram);

    useEffect(() => {
        if (visible) {
            setDiscord(initialData.discord);
            setTiktok(initialData.tiktok);
            setInstagram(initialData.instagram);
        }
    }, [visible, initialData]);

    const handleSave = () => {
        onSave({ discord, tiktok, instagram });
        onClose();
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    className="w-full"
                >
                    <View className="bg-card rounded-t-3xl border-t border-border/30 p-6 h-[70%]">
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className="text-xl font-bold text-foreground">{t('socialModal.title')}</Text>
                            <Pressable onPress={onClose} className="p-2 -mr-2">
                                <Ionicons name="close" size={24} color="#71717A" />
                            </Pressable>
                        </View>

                        <ScrollView className="flex-1">
                            <Text className="text-sm font-medium text-muted-foreground mb-4">{t('socialModal.socialLinks')}</Text>

                            <View className="gap-4">
                                <View className="gap-2">
                                    <Text className="text-sm font-medium text-foreground">{t('socialModal.discordUsername')}</Text>
                                    <View className="flex-row items-center gap-3 bg-secondary/30 border border-border/50 rounded-xl px-4 h-12">
                                        <Ionicons name="logo-discord" size={20} color="#5865F2" />
                                        <TextInput
                                            className="flex-1 text-foreground text-base"
                                            value={discord}
                                            onChangeText={setDiscord}
                                            placeholder={t('socialModal.discordPlaceholder')}
                                            placeholderTextColor="#71717A"
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>

                                <View className="gap-2">
                                    <Text className="text-sm font-medium text-foreground">{t('socialModal.tiktokUsername')}</Text>
                                    <View className="flex-row items-center gap-3 bg-secondary/30 border border-border/50 rounded-xl px-4 h-12">
                                        <Ionicons name="logo-tiktok" size={20} color="#FAFAFA" />
                                        <TextInput
                                            className="flex-1 text-foreground text-base"
                                            value={tiktok}
                                            onChangeText={setTiktok}
                                            placeholder={t('socialModal.handlePlaceholder')}
                                            placeholderTextColor="#71717A"
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>

                                <View className="gap-2">
                                    <Text className="text-sm font-medium text-foreground">{t('socialModal.instagramUsername')}</Text>
                                    <View className="flex-row items-center gap-3 bg-secondary/30 border border-border/50 rounded-xl px-4 h-12">
                                        <Ionicons name="logo-instagram" size={20} color="#E4405F" />
                                        <TextInput
                                            className="flex-1 text-foreground text-base"
                                            value={instagram}
                                            onChangeText={setInstagram}
                                            placeholder={t('socialModal.handlePlaceholder')}
                                            placeholderTextColor="#71717A"
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>
                            </View>
                        </ScrollView>

                        <View className="pt-4 border-t border-border/30 gap-3">
                            <Button onPress={handleSave} size="lg">{t('edit.saveChanges')}</Button>
                            <Button onPress={onClose} variant="ghost" size="lg" className="text-muted-foreground">{t('common:cancel')}</Button>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
