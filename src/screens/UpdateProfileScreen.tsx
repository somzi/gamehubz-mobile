import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

type UpdateProfileNavigationProp = StackNavigationProp<RootStackParamList>;

export default function UpdateProfileScreen() {
    const navigation = useNavigation<UpdateProfileNavigationProp>();
    const { user, updateProfile, refreshUser, isLoading } = useAuth();

    const [username, setUsername] = useState(user?.username || '');
    const [nickName, setNickName] = useState(user?.nickName || '');
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
        }
    }, [user]);

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
                // Refresh user profile to get new avatar URL
                await refreshUser();
            } else {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to upload avatar');
            }
        } catch (error: any) {
            console.error('Error uploading avatar:', error);
            setStatusModalConfig({
                type: 'error',
                title: 'Upload Failed',
                message: error.message || 'Failed to update profile picture'
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
                title: 'Empty Username',
                message: 'Username cannot be empty'
            });
            setShowStatusModal(true);
            return;
        }

        const success = await updateProfile({
            id: user?.id,
            username: username.trim(),
            nickName: nickName.trim(),
        });

        if (success) {
            setStatusModalConfig({
                type: 'success',
                title: 'Profile Updated',
                message: 'Profile updated successfully',
                onClose: () => navigation.goBack()
            });
            setShowStatusModal(true);
        } else {
            setStatusModalConfig({
                type: 'error',
                title: 'Update Failed',
                message: 'Failed to update profile'
            });
            setShowStatusModal(true);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="Edit Profile Info" showBack />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView className="flex-1 px-4 py-6">
                    {/* Avatar Section */}
                    <View className="items-center mb-8">
                        <View className="relative">
                            <PlayerAvatar
                                name={user?.username || 'User'}
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
                        <Text className="text-sm font-medium text-muted-foreground mt-3">Change Profile Photo</Text>
                    </View>

                    <View className="mb-8">
                        <Text className="text-lg font-bold text-foreground mb-4">Basic Info</Text>
                        <Input
                            label="Username"
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Enter username"
                        />
                        <View className="h-4" />
                        <Input
                            label="Nickname"
                            value={nickName}
                            onChangeText={setNickName}
                            placeholder="In-game nick"
                        />
                    </View>
                </ScrollView>

                <View className="p-4 border-t border-border/30 bg-background">
                    <Button onPress={handleSave} loading={isLoading} size="lg">
                        Save Changes
                    </Button>
                </View>
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
