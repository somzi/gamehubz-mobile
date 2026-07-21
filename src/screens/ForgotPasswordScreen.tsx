import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { StatusModal } from '../components/modals/StatusModal';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { COLORS } from '../lib/theme';

const friendlyForgotError = (raw: string): string => {
    const msg = raw.toLowerCase();

    if (msg.includes('userentity') || msg.includes('not found') || msg.includes('does not exist')) {
        return 'We could not find an account with that email address.';
    }
    if (msg.includes('email') && msg.includes('empty')) {
        return 'Please enter your email address.';
    }

    return 'Could not send the reset code. Please check the email and try again.';
};

export default function ForgotPasswordScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'error', title: 'Error', message: '' });

    const handleSendCode = async () => {
        if (!email.trim()) {
            setError('Please enter your email address');
            return;
        }
        
        // Basic email regex
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setError(undefined);
        setIsLoading(true);

        // Backend stores email lowercased — canonicalize here so the OTP lookup matches.
        const normalizedEmail = email.trim().toLowerCase();

        try {
            const response = await authenticatedFetch(ENDPOINTS.FORGOT_PASSWORD_V2, {
                method: 'POST',
                body: JSON.stringify(normalizedEmail) // [FromBody] string — the email
            });

            if (response.ok) {
                // Navigate to ResetPassword Screen
                navigation.navigate('ResetPassword', { email: normalizedEmail });
            } else {
                const text = await response.text();
                const parsed = getErrorMessage(text);
                setStatusModalConfig({
                    type: 'error',
                    title: 'Request Failed',
                    message: friendlyForgotError(parsed)
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
                    contentContainerStyle={{ flexGrow: 1, paddingTop: 40 }}
                    className="px-6"
                >
                    <View className="items-center mb-8">
                        <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-5">
                            <Ionicons name="mail-unread-outline" size={30} color={COLORS.primary} />
                        </View>

                        <Text className="text-3xl font-black text-white mb-2 text-center tracking-tight">Reset password</Text>
                        <Text className="text-slate-400 text-center px-6 text-[13px] leading-5">
                            Enter your email address and we'll send you a 6-digit code to reset your password.
                        </Text>
                    </View>

                    <View className="w-full max-w-sm self-center bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5 gap-4">
                        <Input
                            label="EMAIL ADDRESS"
                            placeholder="your@email.com"
                            value={email}
                            onChangeText={(text) => { setEmail(text); setError(undefined); }}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            leftIcon="mail-outline"
                            error={error}
                        />

                        <Button
                            onPress={handleSendCode}
                            loading={isLoading}
                            className="mt-1 h-14 rounded-2xl shadow-lg shadow-primary/30"
                            size="lg"
                        >
                            <View className="flex-row items-center justify-center gap-2">
                                <Text className="text-primary-foreground font-black text-base">Send Reset Code</Text>
                                <Ionicons name="chevron-forward" size={16} color={COLORS.primaryForeground} />
                            </View>
                        </Button>
                    </View>
                </ScrollView>
            </KeyboardAvoider>

            <StatusModal
                visible={showStatusModal}
                onClose={() => setShowStatusModal(false)}
                type={statusModalConfig.type}
                title={statusModalConfig.title}
                message={statusModalConfig.message}
            />
        </SafeAreaView>
    );
}
