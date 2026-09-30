import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FieldInput, GradientButton, GhostButton, FIELD_LABEL } from '../ui/FormField';
import { COLORS } from '../../lib/theme';

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
    const { t } = useTranslation('hub');
    const { t: tCommon } = useTranslation('common');
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
                        className="rounded-[28px] p-5 w-full max-w-md max-h-[88%] overflow-hidden"
                        style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.11)' }}
                    >
                        {/* The hub's emerald along the top edge */}
                        <LinearGradient
                            pointerEvents="none"
                            colors={['rgba(16,185,129,0)', 'rgba(52,211,153,0.6)', 'rgba(16,185,129,0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 1 }}
                        />

                        <View className="flex-row items-center mb-5" style={{ gap: 12 }}>
                            <View
                                className="w-10 h-10 rounded-xl items-center justify-center"
                                style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}
                            >
                                <Ionicons name="planet" size={19} color={COLORS.primaryBright} />
                            </View>
                            <Text className="flex-1 text-[19px] font-black text-white tracking-tight" numberOfLines={1}>{t('edit.title')}</Text>
                            <Pressable
                                onPress={onClose}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={tCommon('close')}
                                className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 items-center justify-center active:opacity-60"
                            >
                                <Ionicons name="close" size={18} color={COLORS.slate400} />
                            </Pressable>
                        </View>

                        <ScrollView
                            className="grow-0 shrink"
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                            alwaysBounceVertical={false}
                        >
                            <View style={{ gap: 16 }}>
                                <FieldInput
                                    label={t('edit.hubName')}
                                    icon="planet"
                                    value={name}
                                    onChangeText={setName}
                                    placeholder={t('edit.hubNamePlaceholder')}
                                />

                                <FieldInput
                                    label={t('edit.description')}
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder={t('edit.descriptionPlaceholder')}
                                    multiline
                                    numberOfLines={4}
                                />

                                {/* Who can find the hub: two cards, the chosen one lit in its colour */}
                                <View>
                                    <Text className={FIELD_LABEL}>{t('edit.privacy')}</Text>
                                    <View className="flex-row" style={{ gap: 10 }}>
                                        <PrivacyOption
                                            icon="globe-outline"
                                            color="#10B981"
                                            label={t('edit.publicHub')}
                                            selected={isPublic}
                                            onPress={() => setIsPublic(true)}
                                        />
                                        <PrivacyOption
                                            icon="lock-closed-outline"
                                            color="#F59E0B"
                                            label={t('edit.privateHub')}
                                            selected={!isPublic}
                                            onPress={() => setIsPublic(false)}
                                        />
                                    </View>
                                    <Text className="text-[12px] leading-[17px] text-slate-400 mt-2.5 ml-0.5">
                                        {isPublic ? t('edit.publicHint') : t('edit.privateHint')}
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>

                        <View className="flex-row mt-6" style={{ gap: 10 }}>
                            <GhostButton label={tCommon('cancel')} onPress={onClose} disabled={isSaving} style={{ flex: 1 }} />
                            <GradientButton
                                label={tCommon('save')}
                                onPress={handleSave}
                                loading={isSaving}
                                disabled={!name.trim()}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

function PrivacyOption({
    icon,
    color,
    label,
    selected,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className="flex-1 flex-row items-center rounded-2xl px-3 py-3 active:opacity-80"
            style={{
                gap: 9,
                backgroundColor: selected ? color + '14' : 'rgba(0,0,0,0.25)',
                borderWidth: 1,
                borderColor: selected ? color + '66' : 'rgba(255,255,255,0.08)',
            }}
        >
            <View
                className="w-8 h-8 rounded-xl items-center justify-center"
                style={{ backgroundColor: color + (selected ? '26' : '12') }}
            >
                <Ionicons name={icon} size={16} color={selected ? color : COLORS.slate500} />
            </View>
            <Text
                className="flex-1 text-[13.5px] font-black"
                style={{ color: selected ? COLORS.foreground : COLORS.slate400 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
            >
                {label}
            </Text>
            {selected && <Ionicons name="checkmark-circle" size={16} color={color} />}
        </Pressable>
    );
}
