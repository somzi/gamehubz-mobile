import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { StatusModal } from '../components/modals/StatusModal';
import * as ImagePicker from 'expo-image-picker';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { ActivityIndicator } from 'react-native';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../lib/image';
import { CountryPicker } from '../components/ui/CountryPicker';
import { getRegionName } from '../lib/countries';
import { SectionLabel } from '../components/ui/SectionLabel';
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
                <ScrollView className="flex-1 px-5 py-6" keyboardShouldPersistTaps="handled">
                    {/* Avatar Section */}
                    <View className="items-center mb-8">
                        <View className="relative">
                            <PlayerAvatar
                                name={user?.username || t('edit.userFallback')}
                                src={avatarUri || user?.avatarUrl}
                                size="xl"
                                className="w-24 h-24 border-4 border-primary/20"
                            />
                            <TouchableOpacity
                                onPress={handlePickAvatar}
                                disabled={isUploadingAvatar}
                                className="absolute bottom-0 right-0 bg-primary w-8 h-8 rounded-full items-center justify-center border-2 border-background shadow-sm"
                            >
                                {isUploadingAvatar ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Ionicons name="camera" size={16} color="white" />
                                )}
                            </TouchableOpacity>
                        </View>
                        <Text className="text-sm font-medium text-muted-foreground mt-3">{t('edit.changePhoto')}</Text>
                    </View>

                    <View className="mb-8 bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5">
                        <SectionLabel icon="person" title={t('edit.sectionBasicInfo')} />
                        <View className="gap-4">
                            <Input
                                label={t('edit.usernameLabel')}
                                value={username}
                                onChangeText={setUsername}
                                placeholder={t('edit.usernamePlaceholder')}
                                leftIcon="person-outline"
                            />
                            <Input
                                label={t('edit.nicknameLabel')}
                                value={nickName}
                                onChangeText={setNickName}
                                placeholder={t('edit.nicknamePlaceholder')}
                                leftIcon="id-card-outline"
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
                    </View>
                </ScrollView>

                <View className="p-5 border-t border-white/5 bg-background">
                    <Button
                        onPress={handleSave}
                        loading={isLoading}
                        size="lg"
                        className="h-14 rounded-2xl shadow-lg shadow-primary/30"
                    >
                        <View className="flex-row items-center justify-center gap-2">
                            <Text className="text-primary-foreground font-black text-base">{t('edit.saveChanges')}</Text>
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
