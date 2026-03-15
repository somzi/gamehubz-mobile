import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { StatusModal } from '../components/modals/StatusModal';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';

type ResetPasswordRouteProp = RouteProp<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen() {
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
    }>({ type: 'error', title: 'Error', message: '' });

    const validate = () => {
        const newErrors: typeof errors = {};
        
        if (!otpCode) {
            newErrors.otpCode = 'Code is required';
        } else if (otpCode.length !== 6) {
            newErrors.otpCode = 'Code must be exactly 6 digits';
        }

        if (!password) {
            newErrors.password = 'Password is required';
        } else if (password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        } else if (!/(?=.*[a-z])/.test(password)) {
            newErrors.password = 'Password requires lowercase letter';
        } else if (!/(?=.*[A-Z])/.test(password)) {
            newErrors.password = 'Password requires uppercase letter';
        } else if (!/(?=.*\d)/.test(password)) {
            newErrors.password = 'Password requires number';
        }

        if (password !== confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
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
                    title: 'Password Reset',
                    message: 'Your password has been successfully reset. You can now log in with your new password.',
                    onClose: () => {
                        setShowStatusModal(false);
                        navigation.navigate('Login');
                    }
                });
                setShowStatusModal(true);
            } else {
                const text = await response.text();
                setStatusModalConfig({
                    type: 'error',
                    title: 'Reset Failed',
                    message: text || 'Failed to reset password. The code might be invalid or expired.'
                });
                setShowStatusModal(true);
            }
        } catch (err: any) {
            setStatusModalConfig({
                type: 'error',
                title: 'Network Error',
                message: 'Failed to connect to the server. Please try again later.'
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <StatusBar style="light" />
            
            <View className="px-6 pt-4 pb-2">
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    className="w-10 h-10 bg-secondary rounded-full items-center justify-center border border-border"
                >
                    <Ionicons name="arrow-back" size={20} color="#FAFAFA" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingTop: 20 }}
                    className="px-6"
                >
                    <View className="items-center mb-8">
                        <View className="w-20 h-20 bg-primary/20 rounded-2xl items-center justify-center mb-6">
                            <Ionicons name="key-outline" size={40} color="hsl(185, 75%, 45%)" />
                        </View>

                        <Text className="text-3xl font-bold text-foreground mb-2 text-center">New Password</Text>
                        <Text className="text-muted-foreground text-center px-4">
                            Enter the 6-digit code sent to <Text className="text-white font-bold">{email}</Text> and your new password.
                        </Text>
                    </View>

                    <View className="gap-4 w-full max-w-sm self-center">
                        <Input
                            label="6-Digit Code"
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
                            label="New Password"
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
                            label="Confirm New Password"
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
                            className="mt-6"
                            size="lg"
                        >
                            Reset Password
                        </Button>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

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
