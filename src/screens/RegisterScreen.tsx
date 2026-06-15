import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { RegionType, Country } from '../types/auth';
import { SelectInput } from '../components/ui/SelectInput';
import { CountryPicker } from '../components/ui/CountryPicker';
import { getCountries, getRegionName } from '../lib/countries';
import { StatusModal } from '../components/modals/StatusModal';

export default function RegisterScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { register, login, isLoading } = useAuth();

    const regionOptions = [
        { label: 'North America', value: RegionType.NA },
        { label: 'Europe', value: RegionType.EUROPE },
        { label: 'Asia', value: RegionType.ASIA },
        { label: 'South America', value: RegionType.SA },
        { label: 'Africa', value: RegionType.AFRICA },
        { label: 'Oceania', value: RegionType.OCEANIA },
    ];

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        nickName: '',
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        region: undefined as RegionType | undefined,
        country: undefined as string | undefined,
    });

    // Country list (to derive region from the chosen country — country dictates region).
    const [countries, setCountries] = useState<Country[]>([]);
    useEffect(() => {
        getCountries().then(setCountries).catch(() => { });
    }, []);

    const handleSelectCountry = (code: string) => {
        const region = countries.find(c => c.code === code)?.region;
        setFormData(prev => ({ ...prev, country: code, region: region ?? prev.region }));
        setErrors(prev => ({ ...prev, region: undefined, country: undefined }));
    };

    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<Partial<typeof formData>>({});
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
        onClose?: () => void;
    }>({ type: 'success', title: '', message: '' });

    const updateForm = (key: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }));
        // Clear error when user types
        if (errors[key]) {
            setErrors(prev => ({ ...prev, [key]: undefined }));
        }
    };

    const validate = () => {
        const newErrors: Partial<typeof formData> = {};
        if (!formData.username) newErrors.username = 'Username is required';
        if (!formData.nickName) newErrors.nickName = 'Nickname is required' as any;
        if (!formData.email) newErrors.email = 'Email is required';
        if (!formData.password) newErrors.password = 'Password is required';
        if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
        if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
        // Region is required only when no country is chosen (country dictates region).
        if (!formData.country && formData.region === undefined) newErrors.region = 'Region or country is required' as any;

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleRegister = async () => {
        if (!validate()) return;

        // Construct the payload expected by backend
        // If backend expects specific fields, this map should be adjusted.
        // Based on user object provided, we send what we have.
        const payload = {
            userName: formData.username,
            nickName: formData.nickName,
            email: formData.email,
            password: formData.password,
            region: formData.region,
            country: formData.country,
            firstName: formData.firstName || "",
            lastName: formData.lastName || "",
            userRoleId: "6AB87F80-2DE2-4F95-BCE5-7B86F38E426F"
        };

        const result = await register(payload);
        if (result.success) {
            // Auto-login so the user lands straight in the app. On success,
            // isAuthenticated flips and RootNavigator swaps to the app stack.
            const loginResult = await login(formData.email, formData.password);
            if (loginResult.success) return;

            // Account created but auto-login failed (e.g. needs verification) — send to Login.
            setStatusModalConfig({
                type: 'success',
                title: 'Account Created',
                message: 'Your account has been successfully created. Please log in.',
                onClose: () => navigation.navigate('Login')
            });
            setShowStatusModal(true);
        } else {
            setStatusModalConfig({
                type: 'error',
                title: 'Registration Failed',
                message: result.message || 'Unable to create account. Please try again.'
            });
            setShowStatusModal(true);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <StatusBar style="light" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
                    className="px-6"
                    showsVerticalScrollIndicator={false}
                >
                    <View className="items-center mb-10 mt-6">
                        {/* Premium Hero Icon */}
                        <View className="relative mb-6">
                            <View 
                                className="absolute -inset-4 bg-primary opacity-20 rounded-full" 
                                style={{ transform: [{ scale: 1.1 }] }}
                            />
                            <View className="w-20 h-20 bg-[#131B2E] rounded-[28px] items-center justify-center border border-white/10 shadow-xl shadow-primary/20">
                                <View className="w-14 h-14 bg-primary/10 rounded-[20px] items-center justify-center">
                                    <Ionicons name="person-add" size={32} color="#10B981" />
                                </View>
                            </View>
                        </View>

                        <Text className="text-3xl font-black text-white mb-2 tracking-tight">Create Account</Text>
                        <Text className="text-slate-400 text-center px-10 text-sm leading-5">
                            Join the <Text className="text-primary font-black uppercase tracking-widest text-[10px]">GameHubz</Text> community and start competing at the highest level
                        </Text>
                    </View>

                    <View className="gap-4 w-full max-w-sm self-center">
                        <Input
                            label="USERNAME"
                            placeholder="ProGamer123"
                            value={formData.username}
                            onChangeText={(text) => updateForm('username', text)}
                            leftIcon="person-outline"
                            error={errors.username}
                        />

                        <Input
                            label="NICKNAME"
                            placeholder="In-game nick"
                            value={formData.nickName}
                            onChangeText={(text) => updateForm('nickName', text)}
                            leftIcon="id-card-outline"
                            error={errors.nickName as string | undefined}
                        />

                        <Input
                            label="EMAIL ADDRESS"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChangeText={(text) => updateForm('email', text)}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            leftIcon="mail-outline"
                            error={errors.email}
                        />

                        <CountryPicker
                            label="COUNTRY (OPTIONAL)"
                            placeholder="Select your country"
                            value={formData.country}
                            onSelect={handleSelectCountry}
                            error={errors.country as string | undefined}
                        />

                        {formData.country ? (
                            <View className="flex-row items-center -mt-1 ml-1">
                                <Ionicons name="earth-outline" size={13} color="#64748B" />
                                <Text className="text-slate-500 text-xs font-medium ml-1.5">
                                    Region: {getRegionName(formData.region)} (from country)
                                </Text>
                            </View>
                        ) : (
                            <SelectInput
                                label="REGION"
                                placeholder="Select your region"
                                options={regionOptions}
                                value={formData.region}
                                onSelect={(val) => updateForm('region', val)}
                                leftIcon="earth-outline"
                                error={errors.region as string | undefined}
                                className="mb-1"
                            />
                        )}

                        <View className="flex-row gap-3">
                            <View className="flex-1">
                                <Input
                                    label="FIRST NAME (OPT)"
                                    placeholder="John"
                                    value={formData.firstName}
                                    onChangeText={(text) => updateForm('firstName', text)}
                                />
                            </View>
                            <View className="flex-1">
                                <Input
                                    label="LAST NAME (OPT)"
                                    placeholder="Doe"
                                    value={formData.lastName}
                                    onChangeText={(text) => updateForm('lastName', text)}
                                />
                            </View>
                        </View>

                        <Input
                            label="PASSWORD"
                            placeholder="••••••••"
                            value={formData.password}
                            onChangeText={(text) => updateForm('password', text)}
                            secureTextEntry={!showPassword}
                            leftIcon="lock-closed-outline"
                            rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                            onRightIconPress={() => setShowPassword(!showPassword)}
                            error={errors.password}
                        />

                        <Input
                            label="CONFIRM PASSWORD"
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onChangeText={(text) => updateForm('confirmPassword', text)}
                            secureTextEntry={!showPassword}
                            leftIcon="lock-closed-outline"
                            error={errors.confirmPassword}
                        />

                        <Button
                            onPress={handleRegister}
                            loading={isLoading}
                            className="mt-4 h-16 rounded-2xl shadow-lg shadow-primary/30"
                            size="lg"
                        >
                            <View className="flex-row items-center justify-center gap-2">
                                <Text className="text-primary-foreground font-black text-lg">Create Account</Text>
                                <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                            </View>
                        </Button>

                        <View className="flex-row items-center justify-center mt-6 mb-4">
                            <Text className="text-muted-foreground">Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.goBack()}>
                                <Text className="text-primary font-bold">Log In</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

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
