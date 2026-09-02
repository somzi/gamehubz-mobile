import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { StatusModal } from '../components/modals/StatusModal';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { COLORS } from '../lib/theme';

const friendlyResetError = (raw: string, t: (k: string) => string): string => {
    const msg = raw.toLowerCase();

    if (msg.includes('forgot password token') || msg.includes('not found')) {
        return t('reset.codeInvalid');
    }
    if (msg.includes('expired') || msg.includes('invalidforgotpassword')) {
        return t('reset.codeExpired');
    }
    if (msg.includes('password') && msg.includes('match')) {
        return t('reset.passwordsMismatchRetry');
    }
    if (msg.includes('password')) {
        return t('reset.passwordRequirements');
    }

    return t('reset.genericFailure');
};

type ResetPasswordRouteProp = RouteProp<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen() {
    const { t } = useTranslation('auth');
    const friendlyResetError2 = (raw: string) => friendlyResetError(raw, t);
    const route = useRoute<ResetPasswordRouteProp>();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { email } = route.params;

    const [otpCode, setOtpCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [errors, setErrors] = useState<{
        otpCode?: string;
        password?: string;
        confirmPassword?: string;
    }>({});

    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
        onClose?: () => void;
    }>({ type: 'error' as const, title: '', message: '' });

    const validate = () => {
        const newErrors: typeof errors = {};
        
        if (!otpCode) {
            newErrors.otpCode = t('reset.codeRequired');
        } else if (otpCode.length !== 6) {
            newErrors.otpCode = t('reset.codeSixDigits');
        }

        if (!password) {
            newErrors.password = t('reset.passwordRequired');
        } else if (password.length < 6) {
            newErrors.password = t('reset.passwordMinLength');
        } else if (!/(?=.*[a-z])/.test(password)) {
            newErrors.password = t('reset.passwordNeedsLowercase');
        } else if (!/(?=.*[A-Z])/.test(password)) {
            newErrors.password = t('reset.passwordNeedsUppercase');
        } else if (!/(?=.*\d)/.test(password)) {
            newErrors.password = t('reset.passwordNeedsNumber');
        }

        if (password !== confirmPassword) {
            newErrors.confirmPassword = t('reset.passwordsDoNotMatch');
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleResetPassword = async () => {
        if (!validate()) return;

        setIsLoading(true);

        try {
            const payload = {
                Email: email,
                OtpCode: otpCode,
                Password: password,
                ConfirmPassword: confirmPassword
            };

            const response = await authenticatedFetch(ENDPOINTS.RESET_PASSWORD, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setStatusModalConfig({
                    type: 'success',
                    title: t('reset.successTitle'),
                    message: t('reset.successMessage'),
                    onClose: () => {
                        setShowStatusModal(false);
                        navigation.navigate('Login');
                    }
                });
                setShowStatusModal(true);
            } else {
                const text = await response.text();
                const parsed = getErrorMessage(text);
                setStatusModalConfig({
                    type: 'error',
                    title: t('reset.failedTitle'),
                    message: friendlyResetError2(parsed)
                });
                setShowStatusModal(true);
            }
        } catch (err: any) {
            setStatusModalConfig({
                type: 'error',
                title: t('networkError'),
                message: t('networkErrorMessage')
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <StatusBar style="light" />
            {/* Ambient emerald glow behind the hero — decoration only */}
            <LinearGradient
                colors={['rgba(16, 185, 129, 0.12)', 'rgba(15, 23, 42, 0)']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280 }}
                pointerEvents="none"
            />

            <View className="px-6 pt-4 pb-2">
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 items-center justify-center"
                >
                    <Ionicons name="arrow-back" size={20} color={COLORS.foreground} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoider>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingTop: 20 }}
                    className="px-6"
                >
                    <View className="items-center mb-8">
                        <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-5">
                            <Ionicons name="key-outline" size={30} color={COLORS.primary} />
                        </View>

                        <Text className="text-3xl font-black text-white mb-2 text-center tracking-tight">{t('reset.title')}</Text>
                        <Text className="text-slate-400 text-center px-6 text-[13px] leading-5">
                            Enter the 6-digit code sent to <Text className="text-white font-bold">{email}</Text> and your new password.
                        </Text>
                    </View>

                    <View className="w-full max-w-sm self-center bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5 gap-4">
                        <Input
                            label={t('reset.codeLabel')}
                            placeholder="000000"
                            value={otpCode}
                            onChangeText={(text) => {
                                setOtpCode(text.replace(/[^0-9]/g, ''));
                                setErrors(prev => ({ ...prev, otpCode: undefined }));
                            }}
                            keyboardType="numeric"
                            maxLength={6}
                            leftIcon="keypad-outline"
                            error={errors.otpCode}
                        />

                        <Input
                            label={t('reset.newPasswordLabel')}
                            placeholder="••••••••"
                            value={password}
                            onChangeText={(text) => {
                                setPassword(text);
                                setErrors(prev => ({ ...prev, password: undefined }));
                            }}
                            secureTextEntry={!showPassword}
                            leftIcon="lock-closed-outline"
                            rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                            onRightIconPress={() => setShowPassword(!showPassword)}
                            error={errors.password}
                        />

                        <Input
                            label={t('reset.confirmNewPasswordLabel')}
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChangeText={(text) => {
                                setConfirmPassword(text);
                                setErrors(prev => ({ ...prev, confirmPassword: undefined }));
                            }}
                            secureTextEntry={!showConfirmPassword}
                            leftIcon="checkmark-circle-outline"
                            rightIcon={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                            onRightIconPress={() => setShowConfirmPassword(!showConfirmPassword)}
                            error={errors.confirmPassword}
                        />

                        <Button
                            onPress={handleResetPassword}
                            loading={isLoading}
                            className="mt-1 h-14 rounded-2xl shadow-lg shadow-primary/30"
                            size="lg"
                        >
                            <View className="flex-row items-center justify-center gap-2">
                                <Text className="text-primary-foreground font-black text-base">{t('reset.resetPassword')}</Text>
                                <Ionicons name="chevron-forward" size={16} color={COLORS.primaryForeground} />
                            </View>
                        </Button>
                    </View>
                </ScrollView>
            </KeyboardAvoider>

            <StatusModal
                visible={showStatusModal}
                onClose={() => {
                    if (statusModalConfig.onClose) {
                        statusModalConfig.onClose();
                    } else {
                        setShowStatusModal(false);
                    }
                }}
                type={statusModalConfig.type}
                title={statusModalConfig.title}
                message={statusModalConfig.message}
            />
        </SafeAreaView>
    );
}
