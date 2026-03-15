import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { StatusModal } from '../components/modals/StatusModal';

export default function LoginScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { login, isLoading } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'error', title: 'Login Failed', message: '' });

    const validate = () => {
        const newErrors: { email?: string; password?: string } = {};
        if (!email) newErrors.email = 'Email is required';
        if (!password) newErrors.password = 'Password is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleLogin = async () => {
        if (!validate()) return;

        const success = await login(email, password);
        if (!success) {
            setStatusModalConfig({
                type: 'error',
                title: 'Login Failed',
                message: 'Please check your credentials and try again.'
            });
            setShowStatusModal(true);
        }
        // Navigation is handled by RootNavigator observing user state usually, 
        // or we can manually navigate if not using conditional rendering for stacks.
        // But with Context Auth, usually we rely on conditional rendering.
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <StatusBar style="light" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                    className="px-6"
                >
                    <View className="items-center mb-12 mt-10">
                        {/* Premium Logo Design */}
                        <View className="relative mb-8">
                            <View 
                                className="absolute -inset-4 bg-primary opacity-20 rounded-full" 
                                style={{ transform: [{ scale: 1.2 }] }}
                            />
                            <View className="w-24 h-24 bg-[#131B2E] rounded-[32px] items-center justify-center border border-white/10 shadow-2xl shadow-primary/40">
                                <View className="w-16 h-16 bg-primary/10 rounded-[24px] items-center justify-center">
                                    <Ionicons name="game-controller" size={42} color="#10B981" />
                                </View>
                            </View>
                        </View>

                        <Text className="text-3xl font-black text-white mb-2 tracking-tight">Welcome Back!</Text>
                        <Text className="text-slate-400 text-center px-8 text-sm leading-5">
                            Sign in to continue your gaming journey with{' '}
                            <Text className="text-primary font-bold">GameHubz</Text>
                        </Text>
                    </View>

                    <View className="gap-4 w-full max-w-sm self-center">
                        <Input
                            label="EMAIL ADDRESS"
                            placeholder="entered@email.com"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            leftIcon="mail-outline"
                            error={errors.email}
                        />

                        <Input
                            label="PASSWORD"
                            placeholder="••••••••"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            leftIcon="lock-closed-outline"
                            rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                            onRightIconPress={() => setShowPassword(!showPassword)}
                            error={errors.password}
                        />

                        <TouchableOpacity
                            className="self-end"
                            onPress={() => navigation.navigate('ForgotPassword' as any)}
                        >
                            <Text className="text-primary text-sm font-medium">Forgot Password?</Text>
                        </TouchableOpacity>

                        <Button
                            onPress={handleLogin}
                            loading={isLoading}
                            className="mt-2 h-16 rounded-2xl shadow-lg shadow-primary/30"
                            size="lg"
                        >
                            <View className="flex-row items-center justify-center gap-2">
                                <Text className="text-primary-foreground font-black text-lg">Log In</Text>
                                <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                            </View>
                        </Button>

                        <View className="flex-row items-center justify-center mt-6">
                            <Text className="text-muted-foreground">Don't have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Register' as any)}>
                                <Text className="text-primary font-bold">Sign Up</Text>
                            </TouchableOpacity>
                        </View>
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
