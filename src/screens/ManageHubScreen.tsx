import { useTranslation } from 'react-i18next';
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateHubData } from '../lib/queryPolicy';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { EditHubModal } from '../components/modals/EditHubModal';
import { CreateTournamentModal } from '../components/modals/CreateTournamentModal';
import { RequestVerificationModal } from '../components/modals/RequestVerificationModal';
import { StatusModal } from '../components/modals/StatusModal';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../lib/image';
import { COLORS } from '../lib/theme';
import { MenuItem } from '../components/ui/MenuItem';
import { SettingsHero, SettingsHeroLine, SettingsGroup, CameraButton, SETTINGS_EMBLEM_IMAGE, SETTINGS_EMBLEM_IMAGE_RADIUS } from '../components/ui/SettingsBlocks';
import { EmblemImage } from '../components/ui/HeroCard';

type ManageHubScreenRouteProp = RouteProp<RootStackParamList, 'ManageHub'>;
type ManageHubScreenNavigationProp = StackNavigationProp<RootStackParamList>;

export default function ManageHubScreen() {
    const { t } = useTranslation('hub');
    const { t: tCommon } = useTranslation('common');
    const route = useRoute<ManageHubScreenRouteProp>();
    const navigation = useNavigation<ManageHubScreenNavigationProp>();
    const { hubId } = route.params;
    const queryClient = useQueryClient();

    const [hubData, setHubData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showCreateTournamentModal, setShowCreateTournamentModal] = useState(false);
    const [showVerificationModal, setShowVerificationModal] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<number | null>(null);

    // Avatar state
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    // Refetch on focus so rows reflecting hub state (e.g. the Discord Connected/Off
    // pill) stay fresh after editing on a pushed screen and coming back.
    useFocusEffect(
        useCallback(() => {
            fetchHubDetails();
        }, [hubId])
    );

    const fetchHubDetails = async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB(hubId));
            if (response.ok) {
                const data = await response.json();
                setHubData(data.result || data);
            }
        } catch (error) {
            console.error('Error fetching hub details:', error);
        } finally {
            setIsLoading(false);
        }
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_VERIFICATION_REQUEST(hubId));
            if (response.ok) {
                const data = await response.json();
                setVerificationStatus(data?.status ?? null);
            }
        } catch {
            // ignore
        }
    };

    const handlePickAvatar = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.status !== 'granted') {
                Alert.alert(t('manage.permissionRequired'), t('manage.photoPermission'));
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
                        title: t('manage.fileTooLarge'),
                        message: t('manage.fileTooLargeMessage', { max: formatFileSize(MAX_FILE_SIZE), actual: formatFileSize(selectedAsset.fileSize || 0) })
                    });
                    setShowStatusModal(true);
                    return;
                }

                setAvatarUri(selectedAsset.uri);
                handleUploadAvatar(selectedAsset);
            }
        } catch (error) {
            console.error('Error picking avatar:', error);
            Alert.alert(tCommon('error'), t('manage.pickImageFailed'));
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

            const response = await authenticatedFetch(ENDPOINTS.UPLOAD_HUB_AVATAR(hubId), {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                setStatusModalConfig({
                    type: 'success',
                    title: t('manage.avatarUpdated'),
                    message: t('manage.avatarUpdatedMessage')
                });
                setShowStatusModal(true);
                await invalidateHubData(queryClient, hubId);
                await fetchHubDetails();
            } else {
                throw new Error(t('manage.uploadAvatarFailed'));
            }
        } catch (error: any) {
            console.error('Error uploading hub avatar:', error);
            setStatusModalConfig({
                type: 'error',
                title: t('manage.uploadFailed'),
                message: t('manage.uploadFailedMessage')
            });
            setShowStatusModal(true);
            setAvatarUri(null);
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleUpdateHub = async (
        name: string,
        description: string,
        isPublic: boolean,
    ) => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.UPDATE_HUB, {
                method: 'POST',
                // Discord fields deliberately omitted (= null on the backend, which
                // preserves them) — they're managed on the Discord Integration screen.
                body: JSON.stringify({
                    id: hubId,
                    name: name,
                    description: description,
                    isPublic: isPublic,
                }),
            });

            if (response.ok) {
                await invalidateHubData(queryClient, hubId);
                fetchHubDetails();
            } else {
                Alert.alert(tCommon('error'), t('manage.updateHubFailed'));
            }
        } catch (error) {
            console.error('Error updating hub:', error);
            Alert.alert(tCommon('error'), tCommon('unexpectedError'));
        }
    };

    const handleDeleteHub = async () => {
        Alert.alert(
            t('manage.deleteHubTitle'),
            t('manage.deleteHubMessage'),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: tCommon('delete'),
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setIsLoading(true);
                            const response = await authenticatedFetch(ENDPOINTS.DELETE_HUB(hubId), {
                                method: 'DELETE',
                            });

                            if (response.ok) {
                                await invalidateHubData(queryClient, hubId);
                                setStatusModalConfig({
                                    type: 'success',
                                    title: t('manage.hubDeleted'),
                                    message: t('manage.hubDeletedMessage')
                                });
                                setShowStatusModal(true);
                                
                                // Reset loading since we stay on screen for a bit to show success modal
                                setIsLoading(false);
                                
                                // Auto-navigate after a short delay
                                setTimeout(() => {
                                    // @ts-ignore
                                    navigation.navigate('MainTabs', { screen: 'Hubs' });
                                }, 1500);
                            } else {
                                setIsLoading(false);
                                Alert.alert(tCommon('error'), t('manage.deleteHubFailed'));
                            }
                        } catch (error) {
                            setIsLoading(false);
                            console.error('Error deleting hub:', error);
                            Alert.alert(tCommon('error'), t('manage.deleteHubError'));
                        }
                    }
                }
            ]
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title={t('manage.title')} showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </SafeAreaView>
        );
    }

    const isOwner = !!(hubData?.isUserOwner || hubData?.IsUserOwner);
    const isAdmin = !!(hubData?.isUserAdmin || hubData?.IsUserAdmin);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title={t('manage.title')} showBack />

            <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <View style={{ gap: 22 }}>
                    {/* The hub, as on its page; the owner changes the logo from the emblem */}
                    <SettingsHero
                        theme="hub"
                        title={hubData?.name || t('manage.hubFallback')}
                        titleAccessory={hubData?.isVerified ? (
                            <View className="w-[18px] h-[18px] rounded-full bg-sky-500 items-center justify-center">
                                <Ionicons name="checkmark" size={12} color="#fff" />
                            </View>
                        ) : null}
                        emblem={
                            <EmblemImage
                                src={avatarUri || hubData?.avatarUrl || hubData?.logoUrl}
                                name={hubData?.name || t('manage.hubFallback')}
                                size={SETTINGS_EMBLEM_IMAGE}
                                radius={SETTINGS_EMBLEM_IMAGE_RADIUS}
                            />
                        }
                        emblemAccessory={isOwner ? (
                            <CameraButton onPress={handlePickAvatar} busy={isUploadingAvatar} label={t('profile:edit.changePhoto')} />
                        ) : null}
                    >
                        {hubData?.isPublic !== false ? (
                            <SettingsHeroLine icon="globe-outline" iconColor={COLORS.primaryBright} text={t('profile.public')} />
                        ) : (
                            <SettingsHeroLine icon="lock-closed" iconColor={COLORS.warning} text={t('profile.private')} />
                        )}
                    </SettingsHero>

                    <SettingsGroup title={t('manage.sectionCommunity')}>
                        <MenuItem
                            icon="people"
                            color={COLORS.info}
                            label={t('manage.manageMembers')}
                            onPress={() => navigation.navigate('HubMembers', { hubId })}
                        />
                        <MenuItem
                            icon="trophy"
                            color="#FBBF24"
                            label={t('manage.createTournament')}
                            onPress={() => setShowCreateTournamentModal(true)}
                            isLast
                        />
                    </SettingsGroup>

                    <SettingsGroup title={t('manage.sectionSettings')}>
                        {isOwner && (
                            <MenuItem
                                icon="create"
                                color={COLORS.primary}
                                label={t('manage.editHubInfo')}
                                onPress={() => setShowEditModal(true)}
                            />
                        )}
                        <MenuItem
                            icon="share-social"
                            color="#60A5FA"
                            label={t('manage.manageSocials')}
                            onPress={() => navigation.navigate('ManageHubSocials', { hubId })}
                            isLast={!isOwner}
                        />
                        {isOwner && (
                            <MenuItem
                                icon="logo-discord"
                                color="#5865F2"
                                label={t('manage.discord')}
                                onPress={() => navigation.navigate('ManageHubDiscord', { hubId })}
                                rightElement={
                                    hubData?.discordWebhookUrl ? (
                                        <StatusPill icon="checkmark" color="#818CF8" text={t('manage.connected')} />
                                    ) : (
                                        <StatusPill color={COLORS.slate500} text={t('manage.off')} />
                                    )
                                }
                            />
                        )}
                        {isOwner && (
                            <MenuItem
                                icon="shield-checkmark"
                                color="#38BDF8"
                                label={t('manage.verification')}
                                onPress={() => setShowVerificationModal(true)}
                                isLast
                                rightElement={
                                    hubData?.isVerified ? (
                                        <StatusPill icon="checkmark" color="#38BDF8" text={t('manage.verified')} />
                                    ) : verificationStatus === 0 ? (
                                        <StatusPill icon="time-outline" color={COLORS.warning} text={t('manage.pending')} />
                                    ) : verificationStatus === 2 ? (
                                        <StatusPill icon="close" color={COLORS.destructive} text={t('manage.rejected')} />
                                    ) : null
                                }
                            />
                        )}
                    </SettingsGroup>

                    {isOwner && (
                        <SettingsGroup title={t('manage.sectionOwnerActions')} danger>
                            <MenuItem
                                icon="trash-outline"
                                label={t('manage.deleteHub')}
                                onPress={handleDeleteHub}
                                destructive
                                showChevron={false}
                                isLast
                            />
                        </SettingsGroup>
                    )}
                </View>

                <View className="h-20" />
            </ScrollView>

            <EditHubModal
                visible={showEditModal}
                hubId={hubId}
                initialName={hubData?.name || ''}
                initialDescription={hubData?.description || ''}
                initialIsPublic={hubData?.isPublic !== false}
                onClose={() => setShowEditModal(false)}
                onSave={handleUpdateHub}
            />
            <CreateTournamentModal
                visible={showCreateTournamentModal}
                onClose={() => setShowCreateTournamentModal(false)}
                hubId={hubId}
            />
            <RequestVerificationModal
                visible={showVerificationModal}
                hubId={hubId}
                isAlreadyVerified={!!hubData?.isVerified}
                onClose={() => setShowVerificationModal(false)}
                onSubmitted={async () => {
                    await invalidateHubData(queryClient, hubId);
                    await fetchHubDetails();
                }}
            />
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

/** Small tinted state pill at the end of a menu row (Discord connected, verification state). */
function StatusPill({ icon, color, text }: { icon?: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
    return (
        <View
            className="flex-row items-center px-2.5 py-1 rounded-full"
            style={{ gap: 4, backgroundColor: color + '1F', borderWidth: 1, borderColor: color + '4D' }}
        >
            {icon ? <Ionicons name={icon} size={11} color={color} /> : null}
            <Text className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>{text}</Text>
        </View>
    );
}
