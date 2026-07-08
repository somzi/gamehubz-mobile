import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import * as ImagePicker from 'expo-image-picker';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import { StatusModal } from '../components/modals/StatusModal';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../lib/image';
import Constants from 'expo-constants';
import { cn } from '../lib/utils';
import { COLORS } from '../lib/theme';
import { SectionLabel } from '../components/ui/SectionLabel';

type EditProfileNavigationProp = StackNavigationProp<RootStackParamList>;

interface MenuItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    showChevron?: boolean;
    isLast?: boolean;
}

function MenuItem({ icon, label, onPress, destructive = false, showChevron = true, isLast = false }: MenuItemProps) {
    return (
        <Pressable
            onPress={onPress}
            className={cn(
                "flex-row items-center justify-between py-3.5 px-4 active:opacity-70",
                !isLast && "border-b border-white/5"
            )}
        >
            <View className="flex-row items-center gap-3">
                <View
                    className={cn(
                        "w-9 h-9 rounded-xl items-center justify-center border",
                        destructive
                            ? "bg-red-500/10 border-red-500/20"
                            : "bg-white/[0.04] border-white/[0.06]"
                    )}
                >
                    <Ionicons name={icon} size={17} color={destructive ? COLORS.destructive : COLORS.slate300} />
                </View>
                <Text className={cn("font-semibold text-[15px]", destructive ? "text-red-400" : "text-white")}>
                    {label}
                </Text>
            </View>
            {showChevron && <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />}
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

    // (Removed the useFocusEffect that called refreshUser() on every focus. This screen
    // only lists menu items — the user object it reads is already kept fresh by
    // AuthContext on login, refresh, and after each profile mutation. Firing an extra
    // /user/{id}/info request on every entry was pure waste.)

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
                    <Text className="text-slate-500 text-sm">{user?.email || ''}</Text>
                </View>

                {/* Settings Menu — grouped cards */}
                <View className="gap-5">
                    <View>
                        <SectionLabel icon="person" title="Account" />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="person-outline"
                                label="Edit Profile Info"
                                onPress={() => navigation.navigate('UpdateProfile')}
                            />
                            <MenuItem
                                icon="share-social-outline"
                                label="Manage Socials"
                                onPress={() => navigation.navigate('ManageUserSocials')}
                            />
                            <MenuItem
                                icon="lock-closed-outline"
                                label="Password & Security"
                                onPress={() => navigation.navigate('ChangePassword')}
                                isLast
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="help-buoy" title="Support" color={COLORS.info} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
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
                                isLast
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="exit-outline" title="Account Actions" color={COLORS.destructive} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="log-out-outline"
                                label="Log Out"
                                onPress={handleLogout}
                                destructive
                                showChevron={false}
                            />
                            <MenuItem
                                icon="trash-outline"
                                label="Delete Account"
                                onPress={handleDeleteAccount}
                                destructive
                                showChevron={false}
                                isLast
                            />
                        </View>
                    </View>
                </View>

                <View className="py-12 items-center opacity-30">
                    <Text className="text-white text-xs">GameHubz Mobile v{Constants.expoConfig?.version || '1.0.0'}</Text>
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
