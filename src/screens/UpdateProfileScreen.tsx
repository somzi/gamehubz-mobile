import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { FormPanel, FieldInput, GradientButton, FIELD_LABEL } from '../components/ui/FormField';
import { ProfileHeaderCard } from '../components/profile/ProfileHeaderCard';
import { StatusModal } from '../components/modals/StatusModal';
import * as ImagePicker from 'expo-image-picker';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { ActivityIndicator } from 'react-native';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../lib/image';
import { CountryPicker } from '../components/ui/CountryPicker';
import { getRegionName, getCountries } from '../lib/countries';
import { Country } from '../types/auth';
import { COLORS } from '../lib/theme';

type UpdateProfileNavigationProp = StackNavigationProp<RootStackParamList>;

export default function UpdateProfileScreen() {
    const { t } = useTranslation('profile');
    const { t: tCommon } = useTranslation('common');
    const navigation = useNavigation<UpdateProfileNavigationProp>();
    const { user, updateProfile, refreshUser, isLoading } = useAuth();

    const [username, setUsername] = useState(user?.username || '');
    const [nickName, setNickName] = useState(user?.nickName || '');
    // Country: editable only while unset; once set it locks.
    const [country, setCountry] = useState<string | null>(user?.country ?? null);
    const countryLocked = !!user?.country;
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
        onClose?: () => void;
    }>({ type: 'success', title: '', message: '' });

    // The preview shows a newly picked country's flag and name before it is saved.
    const [countries, setCountries] = useState<Country[]>([]);
    useEffect(() => {
        let active = true;
        getCountries().then((list) => { if (active) setCountries(list); }).catch(() => { });
        return () => { active = false; };
    }, []);
    const previewCountry = useMemo(() => countries.find((c) => c.code === country), [countries, country]);

    // Avatar state
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

    useEffect(() => {
        refreshUser();
    }, []);

    useEffect(() => {
        if (user) {
            setUsername(user.username);
            setNickName(user.nickName || '');
            setCountry(user.country ?? null);
        }
    }, [user]);

    const handlePickAvatar = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.status !== 'granted') {
                Alert.alert(t('edit.permissionRequired'), t('edit.photoPermission'));
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const selectedAsset = result.assets[0];
                
                // File size check
                if (!isFileSizeValid(selectedAsset)) {
                    setStatusModalConfig({
                        type: 'error',
                        title: t('edit.fileTooLarge'),
                        message: t('edit.fileTooLargeMessage', { max: formatFileSize(MAX_FILE_SIZE), actual: formatFileSize(selectedAsset.fileSize || 0) })
                    });
                    setShowStatusModal(true);
                    return;
                }

                setAvatarUri(selectedAsset.uri);
                handleUploadAvatar(selectedAsset);
            }
        } catch (error) {
            console.error('Error picking avatar:', error);
            Alert.alert(tCommon('error'), t('edit.pickImageFailed'));
        }
    };

    const handleUploadAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
        if (!asset.uri) return;

        setIsUploadingAvatar(true);
        try {
            const formData = new FormData();
            const filename = asset.uri.split('/').pop() || 'avatar.jpg';
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : `image/jpeg`;

            // @ts-ignore
            formData.append('avatar', { uri: asset.uri, name: filename, type });

            const response = await authenticatedFetch(ENDPOINTS.UPLOAD_AVATAR, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                setStatusModalConfig({
                    type: 'success',
                    title: t('edit.avatarUpdated'),
                    message: t('edit.avatarUpdatedMessage')
                });
                setShowStatusModal(true);
                // Refresh user profile to get new avatar URL
                await refreshUser();
            } else {
                const errorText = await response.text();
                throw new Error(errorText || t('edit.uploadAvatarFailed'));
            }
        } catch (error: any) {
            console.error('Error uploading avatar:', error);
            setStatusModalConfig({
                type: 'error',
                title: t('edit.uploadFailed'),
                message: error.message || t('edit.uploadFailedMessage')
            });
            setShowStatusModal(true);
            // Revert preview if failed
            setAvatarUri(null);
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleSave = async () => {
        if (!username.trim()) {
            setStatusModalConfig({
                type: 'error',
                title: t('edit.emptyUsername'),
                message: t('edit.emptyUsernameMessage')
            });
            setShowStatusModal(true);
            return;
        }

        const success = await updateProfile({
            id: user?.id,
            username: username.trim(),
            nickName: nickName.trim(),
            // Only send when newly set (locked once it exists) so the backend applies it just once.
            country: !countryLocked && country ? country : undefined,
        });

        if (success) {
            setStatusModalConfig({
                type: 'success',
                title: t('edit.profileUpdated'),
                message: t('edit.profileUpdatedMessage'),
                onClose: () => navigation.goBack()
            });
            setShowStatusModal(true);
        } else {
            setStatusModalConfig({
                type: 'error',
                title: t('edit.updateFailed'),
                message: t('edit.updateFailedMessage')
            });
            setShowStatusModal(true);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('edit.title')} showBack />
            <KeyboardAvoider>
                <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                    {/* Your profile card as other players see it, following every edit below. */}
                    <ProfileHeaderCard
                        avatarUrl={avatarUri || user?.avatarUrl}
                        username={username.trim() || user?.username || t('edit.userFallback')}
                        nickname={nickName}
                        countryFlag={previewCountry?.flag ?? user?.countryFlag}
                        countryName={previewCountry?.name ?? user?.countryName}
                        region={previewCountry?.region ?? user?.region}
                        socialLinks={[]}
                        avatarAccessory={
                            <Pressable
                                onPress={handlePickAvatar}
                                disabled={isUploadingAvatar}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t('edit.changePhoto')}
                                className="w-9 h-9 rounded-full items-center justify-center bg-primary active:opacity-80"
                                style={{ borderWidth: 3, borderColor: COLORS.card }}
                            >
                                {isUploadingAvatar ? (
                                    <ActivityIndicator size="small" color={COLORS.primaryForeground} />
                                ) : (
                                    <Ionicons name="camera" size={16} color={COLORS.primaryForeground} />
                                )}
                            </Pressable>
                        }
                    />

                    <Text className={FIELD_LABEL} style={{ marginTop: 22 }}>{t('edit.sectionBasicInfo')}</Text>
                    <FormPanel>
                        <View style={{ gap: 16 }}>
                            <FieldInput
                                label={t('edit.usernameLabel')}
                                icon="person"
                                value={username}
                                onChangeText={setUsername}
                                placeholder={t('edit.usernamePlaceholder')}
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            <FieldInput
                                label={t('edit.nicknameLabel')}
                                icon="game-controller"
                                value={nickName}
                                onChangeText={setNickName}
                                placeholder={t('edit.nicknamePlaceholder')}
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            <CountryPicker
                                label={t('edit.countryLabel')}
                                value={country}
                                onSelect={setCountry}
                                locked={countryLocked}
                            />
                            {!countryLocked && country && (
                                <View className="flex-row items-center -mt-2 ml-1">
                                    <Ionicons name="earth-outline" size={13} color={COLORS.slate500} />
                                    <Text className="text-slate-500 text-xs font-medium ml-1.5">
                                        Region: {getRegionName(user?.region)} → updates to match your country
                                    </Text>
                                </View>
                            )}
                        </View>
                    </FormPanel>
                </ScrollView>

                <View className="px-5 pt-3 pb-4 border-t border-white/5 bg-background">
                    <GradientButton
                        label={t('edit.saveChanges')}
                        icon="checkmark-circle"
                        onPress={handleSave}
                        loading={isLoading}
                    />
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
