import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { StatusModal } from '../components/modals/StatusModal';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';

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
                    contentContainerStyle={{ flexGrow: 1, paddingTop: 40 }}
                    className="px-6"
                >
                    <View className="items-center mb-10">
                        <View className="w-20 h-20 bg-primary/20 rounded-2xl items-center justify-center mb-6">
                            <Ionicons name="mail-unread-outline" size={40} color="hsl(185, 75%, 45%)" />
                        </View>

                        <Text className="text-3xl font-bold text-foreground mb-2 text-center">Reset Password</Text>
                        <Text className="text-muted-foreground text-center px-4">
                            Enter your email address and we'll send you a 6-digit code to reset your password.
                        </Text>
                    </View>

                    <View className="gap-4 w-full max-w-sm self-center">
                        <Input
                            label="Email Address"
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
                            className="mt-6"
                            size="lg"
                        >
                            Send Reset Code
                        </Button>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

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
