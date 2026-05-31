import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { EditHubModal } from '../components/modals/EditHubModal';
import { CreateTournamentModal } from '../components/modals/CreateTournamentModal';
import { RequestVerificationModal } from '../components/modals/RequestVerificationModal';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { StatusModal } from '../components/modals/StatusModal';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../lib/image';

type ManageHubScreenRouteProp = RouteProp<RootStackParamList, 'ManageHub'>;
type ManageHubScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface MenuItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    color?: string;
    showChevron?: boolean;
}

function MenuItem({ icon, label, onPress, color = "#71717A", showChevron = true }: MenuItemProps) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center justify-between py-4 border-b border-white/5"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
            <View className="flex-row items-center gap-4">
                <Ionicons name={icon} size={22} color={color} />
                <Text 
                    className="font-medium text-base"
                    style={{ color: color === "#71717A" ? "#FFFFFF" : color }}
                >
                    {label}
                </Text>
            </View>
            {showChevron && <Ionicons name="chevron-forward" size={18} color="#3F3F46" />}
        </Pressable>
    );
}

export default function ManageHubScreen() {
    const route = useRoute<ManageHubScreenRouteProp>();
    const navigation = useNavigation<ManageHubScreenNavigationProp>();
    const { hubId } = route.params;

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

    useEffect(() => {
        fetchHubDetails();
    }, [hubId]);

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
                Alert.alert('Permission Required', 'We need access to your photos to change hub avatar.');
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
                        title: 'File Too Large',
                        message: `Maximum allowed image size is ${formatFileSize(MAX_FILE_SIZE)}. Your image is ${formatFileSize(selectedAsset.fileSize || 0)}.`
                    });
                    setShowStatusModal(true);
                    return;
                }

                setAvatarUri(selectedAsset.uri);
                handleUploadAvatar(selectedAsset);
            }
        } catch (error) {
            console.error('Error picking avatar:', error);
            Alert.alert('Error', 'Failed to pick image');
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
                    title: 'Hub Avatar Updated',
                    message: 'Hub profile picture has been updated successfully.'
                });
                setShowStatusModal(true);
                await fetchHubDetails();
            } else {
                throw new Error('Failed to upload avatar');
            }
        } catch (error: any) {
            console.error('Error uploading hub avatar:', error);
            setStatusModalConfig({
                type: 'error',
                title: 'Upload Failed',
                message: 'Failed to update hub profile picture'
            });
            setShowStatusModal(true);
            setAvatarUri(null);
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleUpdateHub = async (name: string, description: string, isPublic: boolean) => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.UPDATE_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    id: hubId,
                    name: name,
                    description: description,
                    isPublic: isPublic,
                }),
            });

            if (response.ok) {
                fetchHubDetails();
            } else {
                Alert.alert('Error', 'Failed to update hub.');
            }
        } catch (error) {
            console.error('Error updating hub:', error);
            Alert.alert('Error', 'An unexpected error occurred.');
        }
    };

    const handleDeleteHub = async () => {
        Alert.alert(
            "Delete Hub",
            "Are you sure you want to delete this hub? This action is permanent and cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setIsLoading(true);
                            const response = await authenticatedFetch(ENDPOINTS.DELETE_HUB(hubId), {
                                method: 'DELETE',
                            });

                            if (response.ok) {
                                setStatusModalConfig({
                                    type: 'success',
                                    title: 'Hub Deleted',
                                    message: 'The hub has been successfully deleted.'
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
                                Alert.alert('Error', 'Failed to delete hub. Please try again.');
                            }
                        } catch (error) {
                            setIsLoading(false);
                            console.error('Error deleting hub:', error);
                            Alert.alert('Error', 'An unexpected error occurred during hub deletion.');
                        }
                    }
                }
            ]
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title="Manage Hub" showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#8B5CF6" />
                </View>
            </SafeAreaView>
        );
    }

    const isOwner = !!(hubData?.isUserOwner || hubData?.IsUserOwner);
    const isAdmin = !!(hubData?.isUserAdmin || hubData?.IsUserAdmin);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Manage Hub" showBack />

            <ScrollView className="flex-1 px-6">
                {/* Hub Info Preview with Avatar Upload */}
                <View className="items-center py-6 border-b border-white/5 mb-4">
                    <View className="relative">
                        <PlayerAvatar
                            name={hubData?.name || 'Hub'}
                            src={avatarUri || hubData?.avatarUrl || hubData?.logoUrl}
                            size="lg"
                            className="w-20 h-20"
                        />
                        {isOwner && (
                            <TouchableOpacity
                                onPress={handlePickAvatar}
                                disabled={isUploadingAvatar}
                                className="absolute -bottom-1 -right-1 bg-primary w-8 h-8 rounded-full items-center justify-center border-2 border-background shadow-sm"
                            >
                                {isUploadingAvatar ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Ionicons name="camera" size={14} color="white" />
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text className="text-xl font-bold text-white text-center mt-3">{hubData?.name || 'Hub'}</Text>
                    <Text className="text-gray-500 text-sm text-center mt-1" numberOfLines={1}>
                        {'Management Dashboard'}
                    </Text>
                </View>

                {/* Management Menu */}
                <View className="space-y-1">
                    <MenuItem
                        icon="person-add-outline"
                        label="Manage Members"
                        onPress={() => navigation.navigate('HubMembers', { hubId })}
                    />
                    {isOwner && (
                        <MenuItem
                            icon="create-outline"
                            label="Edit Hub Info"
                            onPress={() => setShowEditModal(true)}
                        />
                    )}
                    <MenuItem
                        icon="share-social-outline"
                        label="Manage Socials"
                        onPress={() => navigation.navigate('ManageHubSocials', { hubId })}
                    />
                    <MenuItem
                        icon="trophy-outline"
                        label="Create Tournament"
                        onPress={() => setShowCreateTournamentModal(true)}
                    />
                    {isOwner && (
                        <Pressable
                            onPress={() => setShowVerificationModal(true)}
                            className="flex-row items-center justify-between py-4 border-b border-white/5"
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                            <View className="flex-row items-center gap-4">
                                <Ionicons name="shield-checkmark-outline" size={22} color="#71717A" />
                                <Text className="font-medium text-base text-white">Verification</Text>
                            </View>
                            <View className="flex-row items-center" style={{ gap: 8 }}>
                                {hubData?.isVerified ? (
                                    <View className="flex-row items-center bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 rounded-full" style={{ gap: 4 }}>
                                        <Ionicons name="checkmark" size={11} color="#38BDF8" />
                                        <Text className="text-[10px] font-black uppercase tracking-wider text-sky-300">Verified</Text>
                                    </View>
                                ) : verificationStatus === 0 ? (
                                    <View className="flex-row items-center bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-full" style={{ gap: 4 }}>
                                        <Ionicons name="time-outline" size={11} color="#F59E0B" />
                                        <Text className="text-[10px] font-black uppercase tracking-wider text-amber-300">Pending</Text>
                                    </View>
                                ) : verificationStatus === 2 ? (
                                    <View className="flex-row items-center bg-red-500/15 border border-red-500/30 px-2.5 py-1 rounded-full" style={{ gap: 4 }}>
                                        <Ionicons name="close" size={11} color="#EF4444" />
                                        <Text className="text-[10px] font-black uppercase tracking-wider text-red-300">Rejected</Text>
                                    </View>
                                ) : null}
                                <Ionicons name="chevron-forward" size={18} color="#3F3F46" />
                            </View>
                        </Pressable>
                    )}
                    {isOwner && (
                        <MenuItem
                            icon="trash-outline"
                            label="Delete Hub"
                            onPress={handleDeleteHub}
                            color="#EF4444"
                            showChevron={false}
                        />
                    )}
                </View>

                {/* Extra space at bottom */}
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
                onSubmitted={fetchHubDetails}
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
