import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { StatusModal } from '../components/modals/StatusModal';
import { SectionLabel } from '../components/ui/SectionLabel';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../lib/theme';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

import { authenticatedFetch, ENDPOINTS } from '../lib/api';

export default function ChangePasswordScreen() {
    const { t } = useTranslation('auth');
    const navigation = useNavigation();
    const { user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
        onClose?: () => void;
    }>({ type: 'success', title: '', message: '' });

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            setStatusModalConfig({
                type: 'error',
                title: t('change.missingFields'),
                message: t('change.missingFieldsMessage')
            });
            setShowStatusModal(true);
            return;
        }

        if (newPassword !== confirmPassword) {
            setStatusModalConfig({
                type: 'error',
                title: t('change.mismatch'),
                message: t('change.mismatchMessage')
            });
            setShowStatusModal(true);
            return;
        }

        if (newPassword.length < 6) {
            setStatusModalConfig({
                type: 'error',
                title: t('change.weakPassword'),
                message: t('change.weakPasswordMessage')
            });
            setShowStatusModal(true);
            return;
        }

        setIsProcessing(true);
        try {
            const body = {
                newPassword: newPassword,
                oldPassword: currentPassword
            };

            const response = await authenticatedFetch(ENDPOINTS.SET_PASSWORD, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            if (response.ok) {
                setStatusModalConfig({
                    type: 'success',
                    title: t('change.changedTitle'),
                    message: t('change.changedMessage'),
                    onClose: () => navigation.goBack()
                });
                setShowStatusModal(true);
            } else {
                const responseText = await response.text();

                let errorMsg = t('change.checkCurrentPassword');
                try {
                    const errorData = JSON.parse(responseText);
                    if (errorData.message) errorMsg = errorData.message;
                    else if (typeof errorData === 'string') errorMsg = errorData;
                } catch (e) {
                    if (responseText) errorMsg = responseText;
                }

                setStatusModalConfig({
                    type: 'error',
                    title: t('change.updateFailed'),
                    message: errorMsg
                });
                setShowStatusModal(true);
            }
        } catch (error) {
            console.error('Password change error:', error);
            setStatusModalConfig({
                type: 'error',
                title: t('networkError'),
                message: t('change.networkErrorMessage')
            });
            setShowStatusModal(true);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('change.title')} showBack />
            <KeyboardAvoider>
                <ScrollView className="flex-1 px-5 py-6" keyboardShouldPersistTaps="handled">
                    <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5">
                        <SectionLabel icon="lock-closed" title={t('change.sectionSecurity')} />
                        <View className="gap-4">
                            <Input
                                label={t('change.currentPasswordLabel')}
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder={t('change.currentPasswordPlaceholder')}
                                secureTextEntry={!showPasswords}
                                leftIcon="lock-closed-outline"
                                rightIcon={showPasswords ? "eye-off-outline" : "eye-outline"}
                                onRightIconPress={() => setShowPasswords(!showPasswords)}
                            />

                            <Input
                                label={t('change.newPasswordLabel')}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder={t('change.newPasswordPlaceholder')}
                                secureTextEntry={!showPasswords}
                                leftIcon="key-outline"
                            />

                            <Input
                                label={t('change.retypePasswordLabel')}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder={t('change.retypePasswordPlaceholder')}
                                secureTextEntry={!showPasswords}
                                leftIcon="checkmark-circle-outline"
                            />

                            <View className="flex-row items-center gap-1.5 mt-1">
                                <Ionicons name="information-circle-outline" size={13} color={COLORS.slate500} />
                                <Text className="text-slate-500 text-xs">
                                    {t('change.minLengthHint')}
                                </Text>
                            </View>
                        </View>
                    </View>
                </ScrollView>

                <View className="p-5 border-t border-white/5">
                    <Button
                        onPress={handleChangePassword}
                        loading={isProcessing}
                        size="lg"
                        className="h-14 rounded-2xl shadow-lg shadow-primary/30"
                    >
                        <View className="flex-row items-center justify-center gap-2">
                            <Text className="text-primary-foreground font-black text-base">{t('change.updatePassword')}</Text>
                            <Ionicons name="chevron-forward" size={16} color={COLORS.primaryForeground} />
                        </View>
                    </Button>
                </View>
            </KeyboardAvoider>

            <StatusModal
                visible={showStatusModal}
                onClose={() => {
                    setShowStatusModal(false);
                    if (statusModalConfig.onClose) statusModalConfig.onClose();
                }}
                type={statusModalConfig.type}
                title={statusModalConfig.title}
                message={statusModalConfig.message}
            />
        </SafeAreaView>
    );
}
