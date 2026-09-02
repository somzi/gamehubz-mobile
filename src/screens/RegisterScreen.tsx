import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
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
import { RegionType, Country } from '../types/auth';
import { SelectInput } from '../components/ui/SelectInput';
import { CountryPicker } from '../components/ui/CountryPicker';
import { getCountries, getRegionName } from '../lib/countries';
import { StatusModal } from '../components/modals/StatusModal';
import { SectionLabel } from '../components/ui/SectionLabel';
import { LanguageToggle } from '../components/ui/LanguageToggle';

export default function RegisterScreen() {
    const { t } = useTranslation('auth');
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { register, login, isLoading } = useAuth();

    const regionOptions = [
        { label: t('region.northAmerica'), value: RegionType.NA },
        { label: t('region.europe'), value: RegionType.EUROPE },
        { label: t('region.asia'), value: RegionType.ASIA },
        { label: t('region.southAmerica'), value: RegionType.SA },
        { label: t('region.africa'), value: RegionType.AFRICA },
        { label: t('region.oceania'), value: RegionType.OCEANIA },
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
        if (!formData.username) newErrors.username = t('register.usernameRequired');
        if (!formData.nickName) newErrors.nickName = t('register.nicknameRequired') as any;
        if (!formData.email) newErrors.email = t('register.emailRequired');
        if (!formData.password) newErrors.password = t('register.passwordRequired');
        if (formData.password.length < 6) newErrors.password = t('register.passwordMinLength');
        if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = t('register.passwordsDoNotMatch');
        // Region is required only when no country is chosen (country dictates region).
        if (!formData.country && formData.region === undefined) newErrors.region = t('register.regionRequired') as any;

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleRegister = async () => {
        if (!validate()) return;

        // Backend stores email lowercased — canonicalize on the client to keep register + login in sync.
        const normalizedEmail = formData.email.trim().toLowerCase();

        // Construct the payload expected by backend
        // If backend expects specific fields, this map should be adjusted.
        // Based on user object provided, we send what we have.
        const payload = {
            userName: formData.username,
            nickName: formData.nickName,
            email: normalizedEmail,
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
            const loginResult = await login(normalizedEmail, formData.password);
            if (loginResult.success) return;

            // Account created but auto-login failed (e.g. needs verification) — send to Login.
            setStatusModalConfig({
                type: 'success',
                title: t('register.createdTitle'),
                message: t('register.createdMessage'),
                onClose: () => navigation.navigate('Login')
            });
            setShowStatusModal(true);
        } else {
            setStatusModalConfig({
                type: 'error',
                title: t('register.failedTitle'),
                message: result.message || t('register.failedMessage')
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
            <KeyboardAvoider>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
                    className="px-6"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Language first, before a single field is filled in: the whole form
                        re-renders in the chosen language, and the `Language` header on submit
                        is what stamps the new account — so notifications start out right too.
                        Anyone who changes their mind later does it in Settings. */}
                    <View className="flex-row justify-end mt-5">
                        <LanguageToggle />
                    </View>

                    {/* ── Hero ── */}
                    <View className="flex-row items-start mt-4 mb-8">
                        <View className="flex-1 mr-4">
                            <View className="flex-row items-center gap-2 mb-3">
                                <View className="w-1.5 h-1.5 rounded-full bg-primary" />
                                <Text className="text-slate-500 text-[10px] font-black uppercase tracking-[3px]">
                                    {t('brand')}
                                </Text>
                            </View>
                            <Text
                                className="text-white font-black tracking-tight"
                                style={{ fontSize: 34, lineHeight: 38 }}
                            >
                                {t('register.createAccount')}
                            </Text>
                            <Text className="text-slate-400 text-[13px] font-medium mt-3 leading-5">
                                {t('register.tagline')}
                            </Text>
                        </View>
                        <View className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center">
                            <Ionicons name="person-add" size={24} color={COLORS.primary} />
                        </View>
                    </View>

                    <View className="w-full max-w-sm self-center gap-5">
                        {/* ── Account ── */}
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4">
                            <SectionLabel icon="at" title={t('register.sectionAccount')} />
                            <View className="gap-4">
                                <Input
                                    label={t('register.usernameLabel')}
                                    placeholder={t('register.usernamePlaceholder')}
                                    value={formData.username}
                                    onChangeText={(text) => updateForm('username', text)}
                                    leftIcon="person-outline"
                                    error={errors.username}
                                />

                                <Input
                                    label={t('register.nicknameLabel')}
                                    placeholder={t('register.nicknamePlaceholder')}
                                    value={formData.nickName}
                                    onChangeText={(text) => updateForm('nickName', text)}
                                    leftIcon="id-card-outline"
                                    error={errors.nickName as string | undefined}
                                />

                                <Input
                                    label={t('emailAddress')}
                                    placeholder={t('register.emailPlaceholder')}
                                    value={formData.email}
                                    onChangeText={(text) => updateForm('email', text)}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    leftIcon="mail-outline"
                                    error={errors.email}
                                />
                            </View>
                        </View>

                        {/* ── Player profile ── */}
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4">
                            <SectionLabel icon="earth" title={t('register.sectionPlayerProfile')} />
                            <View className="gap-4">
                                <CountryPicker
                                    label={t('register.countryLabel')}
                                    placeholder={t('register.countryPlaceholder')}
                                    value={formData.country}
                                    onSelect={handleSelectCountry}
                                    error={errors.country as string | undefined}
                                />

                                {formData.country ? (
                                    <View className="flex-row items-center -mt-1 ml-1">
                                        <Ionicons name="earth-outline" size={13} color={COLORS.slate500} />
                                        <Text className="text-slate-500 text-xs font-medium ml-1.5">
                                            Region: {getRegionName(formData.region)} (from country)
                                        </Text>
                                    </View>
                                ) : (
                                    <SelectInput
                                        label={t('register.regionLabel')}
                                        placeholder={t('register.regionPlaceholder')}
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
                                            label={t('register.firstNameLabel')}
                                            placeholder={t('register.firstNamePlaceholder')}
                                            value={formData.firstName}
                                            onChangeText={(text) => updateForm('firstName', text)}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Input
                                            label={t('register.lastNameLabel')}
                                            placeholder={t('register.lastNamePlaceholder')}
                                            value={formData.lastName}
                                            onChangeText={(text) => updateForm('lastName', text)}
                                        />
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* ── Security ── */}
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4">
                            <SectionLabel icon="lock-closed" title={t('register.sectionSecurity')} />
                            <View className="gap-4">
                                <Input
                                    label={t('passwordLabel')}
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
                                    label={t('register.confirmPasswordLabel')}
                                    placeholder="••••••••"
                                    value={formData.confirmPassword}
                                    onChangeText={(text) => updateForm('confirmPassword', text)}
                                    secureTextEntry={!showPassword}
                                    leftIcon="lock-closed-outline"
                                    error={errors.confirmPassword}
                                />
                            </View>
                        </View>

                        <Button
                            onPress={handleRegister}
                            loading={isLoading}
                            className="mt-1 h-16 rounded-2xl shadow-lg shadow-primary/30"
                            size="lg"
                        >
                            <View className="flex-row items-center justify-center gap-2">
                                <Text className="text-primary-foreground font-black text-lg">{t('register.createAccountButton')}</Text>
                                <Ionicons name="chevron-forward" size={18} color={COLORS.primaryForeground} />
                            </View>
                        </Button>

                        <View className="flex-row items-center justify-center mt-2 mb-4">
                            <Text className="text-slate-500">{t('register.haveAccount')}</Text>
                            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
                                <Text className="text-primary font-black">{t('register.logIn')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
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
