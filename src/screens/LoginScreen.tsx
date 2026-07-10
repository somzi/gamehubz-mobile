import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../lib/theme';
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

        // Backend treats email as case-insensitive — canonicalize on the client too.
        const result = await login(email.trim().toLowerCase(), password);
        if (!result.success) {
            setStatusModalConfig({
                type: 'error',
                title: 'Login Failed',
                message: result.message || 'Please check your credentials and try again.'
            });
            setShowStatusModal(true);
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
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={{
                            flexGrow: 1,
                            justifyContent: 'flex-start',
                            paddingTop: Platform.OS === 'android' ? 40 : 20,
                            paddingBottom: 40
                        }}
                        className="px-6"
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ── Hero: centered brand logo ── */}
                        <View className="items-center mb-10 mt-4">
                            <View className="mb-5 shadow-2xl shadow-primary/20">
                                {/* Right-sized 330px logo.png (110dp @3x) — the full 1MB 1024px
                                    icon.png used to pop in seconds late on dev/OTA loads. */}
                                <Image
                                    source={require('../../assets/logo.png')}
                                    style={{ width: 110, height: 110, borderRadius: 28 }}
                                    contentFit="contain"
                                    cachePolicy="memory-disk"
                                />
                            </View>

                            <Text className="text-3xl font-black text-white mb-1 tracking-tight">
                                Welcome Back!
                            </Text>

                            <Text className="text-slate-400 text-center px-10 text-xs leading-4">
                                Sign in to continue your gaming journey with{' '}
                                <Text className="text-primary font-bold">GameHubz</Text>
                            </Text>
                        </View>

                        {/* ── Form card ── */}
                        <View className="w-full max-w-sm self-center bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5 gap-4">
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
                                className="self-end -mt-1"
                                onPress={() => navigation.navigate('ForgotPassword' as any)}
                                hitSlop={8}
                            >
                                <Text className="text-primary text-xs font-black uppercase tracking-wide">
                                    Forgot Password?
                                </Text>
                            </TouchableOpacity>

                            <Button
                                onPress={handleLogin}
                                loading={isLoading}
                                className="mt-1 h-16 rounded-2xl shadow-lg shadow-primary/30"
                                size="lg"
                            >
                                <View className="flex-row items-center justify-center gap-2">
                                    <Text className="text-primary-foreground font-black text-lg">Log In</Text>
                                    <Ionicons name="chevron-forward" size={18} color={COLORS.primaryForeground} />
                                </View>
                            </Button>
                        </View>

                        {/* ── Footer ── */}
                        <View className="flex-row items-center justify-center mt-8">
                            <Text className="text-slate-500">Don't have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Register' as any)} hitSlop={8}>
                                <Text className="text-primary font-black">Sign Up</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>

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