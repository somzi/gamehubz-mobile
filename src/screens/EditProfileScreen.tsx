import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import * as ImagePicker from 'expo-image-picker';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import { StatusModal } from '../components/modals/StatusModal';

type EditProfileNavigationProp = StackNavigationProp<RootStackParamList>;

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
        >
            <View className="flex-row items-center gap-4">
                <Ionicons name={icon} size={22} color={color} />
                <Text className="text-white font-medium text-base">{label}</Text>
            </View>
            {showChevron && <Ionicons name="chevron-forward" size={18} color="#3F3F46" />}
        </Pressable>
    );
}

export default function EditProfileScreen() {
    const { user, logout, deleteAccount, refreshUser } = useAuth();
    const navigation = useNavigation<EditProfileNavigationProp>();

    // Avatar state
    const [avatarUri, setAvatarUri] = React.useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
    const [showStatusModal, setShowStatusModal] = React.useState(false);
    const [statusModalConfig, setStatusModalConfig] = React.useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    const handlePickAvatar = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.status !== 'granted') {
                Alert.alert('Permission Required', 'We need access to your photos to change your avatar.');
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

            const response = await authenticatedFetch(ENDPOINTS.UPLOAD_AVATAR, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                setStatusModalConfig({
                    type: 'success',
                    title: 'Avatar Updated',
                    message: 'Your profile picture has been updated successfully.'
                });
                setShowStatusModal(true);
                await refreshUser();
            } else {
                throw new Error('Failed to upload avatar');
            }
        } catch (error: any) {
            console.error('Error uploading avatar:', error);
            setStatusModalConfig({
                type: 'error',
                title: 'Upload Failed',
                message: 'Failed to update profile picture'
            });
            setShowStatusModal(true);
            setAvatarUri(null);
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (user?.id) {
                refreshUser();
            }
        }, [user?.id, refreshUser])
    );

    const handleLogout = () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => logout() }
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'Are you sure you want to delete your account? This action is permanent and cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const success = await deleteAccount();
                        if (success) {
                            setStatusModalConfig({
                                type: 'success',
                                title: 'Account Deleted',
                                message: 'Your account has been successfully deleted.'
                            });
                            setShowStatusModal(true);
                        } else {
                            setStatusModalConfig({
                                type: 'error',
                                title: 'Delete Failed',
                                message: 'Failed to delete your account. Please try again later.'
                            });
                            setShowStatusModal(true);
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Edit Profile" showBack />

            <ScrollView className="flex-1 px-6">
                {/* User Info Header (Optional but looks nice) */}
                <View className="items-center py-6">
                    <View className="relative">
                        <PlayerAvatar
                            name={user?.username || 'Guest'}
                            src={avatarUri || user?.avatarUrl}
                            size="lg"
                        />
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
                    </View>
                    <Text className="text-xl font-bold text-white mt-3">{user?.username || 'Guest'}</Text>
                    <Text className="text-gray-500 text-sm">{user?.email || ''}</Text>
                </View>

                {/* Settings Menu List */}
                <View className="space-y-1">
                    <MenuItem
                        icon="person-outline"
                        label="Manage Profile"
                        onPress={() => navigation.navigate('UpdateProfile')}
                    />
                    <MenuItem
                        icon="lock-closed-outline"
                        label="Password & Security"
                        onPress={() => navigation.navigate('ChangePassword')}
                    />
                    <MenuItem
                        icon="help-circle-outline"
                        label="Help Center"
                        onPress={() => navigation.navigate('HelpCenter')}
                    />
                    <MenuItem
                        icon="mail-outline"
                        label="Contact Us"
                        onPress={() => navigation.navigate('ContactUs')}
                    />
                    <MenuItem
                        icon="information-circle-outline"
                        label="About Us"
                        onPress={() => navigation.navigate('AboutUs')}
                    />
                    <MenuItem
                        icon="log-out-outline"
                        label="Log Out"
                        onPress={handleLogout}
                        color="#EF4444"
                        showChevron={false}
                    />
                    <MenuItem
                        icon="trash-outline"
                        label="Delete Account"
                        onPress={handleDeleteAccount}
                        color="#EF4444"
                        showChevron={false}
                    />
                </View>

                <View className="py-12 items-center opacity-30">
                    <Text className="text-white text-xs">GameHubz Mobile v1.0.0</Text>
                </View>
            </ScrollView>

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
