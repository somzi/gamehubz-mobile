import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { SocialType, HubSocial } from '../types/auth';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { SelectInput } from '../components/ui/SelectInput';
import { StatusModal } from '../components/modals/StatusModal';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { COLORS } from '../lib/theme';
import { SectionLabel } from '../components/ui/SectionLabel';

type ManageHubSocialsRouteProp = RouteProp<RootStackParamList, 'ManageHubSocials'>;
type ManageHubSocialsNavigationProp = StackNavigationProp<RootStackParamList>;

export default function ManageHubSocialsScreen() {
    const navigation = useNavigation<ManageHubSocialsNavigationProp>();
    const route = useRoute<ManageHubSocialsRouteProp>();
    const { hubId } = route.params;

    const [hubSocials, setHubSocials] = useState<HubSocial[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // New social input state
    const [newSocialType, setNewSocialType] = useState<SocialType | undefined>(undefined);
    const [newSocialUsername, setNewSocialUsername] = useState('');
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
        onClose?: () => void;
    }>({ type: 'success', title: '', message: '' });

    useEffect(() => {
        fetchHubSocials();
    }, [hubId]);

    const fetchHubSocials = async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB(hubId));
            if (response.ok) {
                const data = await response.json();
                const hub = data.result || data;
                setHubSocials(hub.hubSocials || []);
            }
        } catch (error) {
            console.error('Error fetching hub socials:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const socialTypeOptions = [
        { label: 'Instagram', value: SocialType.Instagram },
        { label: 'X (Twitter)', value: SocialType.X },
        { label: 'Facebook', value: SocialType.Facebook },
        { label: 'TikTok', value: SocialType.TikTok },
        { label: 'YouTube', value: SocialType.YouTube },
        { label: 'Discord', value: SocialType.Discord },
        { label: 'Telegram', value: SocialType.Telegram },
    ];

    const getSocialIcon = (type: SocialType) => {
        switch (type) {
            case SocialType.Instagram: return 'logo-instagram';
            case SocialType.X: return 'logo-twitter';
            case SocialType.Facebook: return 'logo-facebook';
            case SocialType.TikTok: return 'logo-tiktok';
            case SocialType.YouTube: return 'logo-youtube';
            case SocialType.Discord: return 'logo-discord';
            case SocialType.Telegram: return 'paper-plane';
            default: return 'link-outline';
        }
    };

    const getSocialLabel = (type: SocialType) => {
        return socialTypeOptions.find(opt => opt.value === type)?.label || 'Social';
    };

    const handleAddSocial = async () => {
        if (!newSocialType) {
            setStatusModalConfig({
                type: 'error',
                title: 'Missing Platform',
                message: 'Please select a social platform'
            });
            setShowStatusModal(true);
            return;
        }
        if (!newSocialUsername.trim()) {
            setStatusModalConfig({
                type: 'error',
                title: 'Missing Username',
                message: 'Please enter your username/handle'
            });
            setShowStatusModal(true);
            return;
        }

        if (hubSocials.some(s => s.socialType === newSocialType || s.type === newSocialType)) {
            setStatusModalConfig({
                type: 'error',
                title: 'Platform Exists',
                message: 'This hub already has this platform added.'
            });
            setShowStatusModal(true);
            return;
        }

        try {
            setIsSaving(true);
            const response = await authenticatedFetch(ENDPOINTS.HUB_SOCIAL, {
                method: 'POST',
                body: JSON.stringify({
                    id: null,
                    username: newSocialUsername.trim(),
                    type: newSocialType,
                    hubId: hubId
                }),
            });

            if (response.ok) {
                setNewSocialType(undefined);
                setNewSocialUsername('');
                await fetchHubSocials();
                setStatusModalConfig({
                    type: 'success',
                    title: 'Success',
                    message: 'Social account added successfully'
                });
                setShowStatusModal(true);
            } else {
                setStatusModalConfig({
                    type: 'error',
                    title: 'Failed',
                    message: 'Failed to add social account'
                });
                setShowStatusModal(true);
            }
        } catch (error) {
            console.error('Error adding social:', error);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: 'An unexpected error occurred'
            });
            setShowStatusModal(true);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveSocial = (social: HubSocial) => {
        if (!social.id) return;

        Alert.alert(
            'Remove Social Account',
            `Are you sure you want to remove ${getSocialLabel(social.socialType || social.type!)}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await authenticatedFetch(ENDPOINTS.DELETE_HUB_SOCIAL(social.id!), {
                                method: 'DELETE',
                            });

                            if (response.ok) {
                                await fetchHubSocials();
                            } else {
                                setStatusModalConfig({
                                    type: 'error',
                                    title: 'Failed',
                                    message: 'Failed to remove social account'
                                });
                                setShowStatusModal(true);
                            }
                        } catch (error) {
                            console.error('Error removing social:', error);
                            setStatusModalConfig({
                                type: 'error',
                                title: 'Error',
                                message: 'An unexpected error occurred'
                            });
                            setShowStatusModal(true);
                        }
                    }
                }
            ]
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title="Manage Socials" showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="Manage Hub Socials" showBack />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
            >
                <ScrollView className="flex-1 px-4 py-6" keyboardShouldPersistTaps="handled">
                    <View className="mb-6">
                        <SectionLabel icon="share-social" title="Social Accounts" color={COLORS.warning} />

                        {hubSocials && hubSocials.length > 0 ? (
                            <View className="gap-3">
                                {hubSocials.map((social) => {
                                    const socialType = social.socialType || social.type;
                                    return (
                                        <View
                                            key={socialType!}
                                            className="flex-row items-center justify-between p-4 bg-card rounded-2xl border border-white/[0.06]"
                                        >
                                            <View className="flex-row items-center gap-3">
                                                <View className="w-10 h-10 rounded-xl bg-warning/10 items-center justify-center border border-warning/20">
                                                    <Ionicons name={getSocialIcon(socialType!) as any} size={18} color={COLORS.warning} />
                                                </View>
                                                <View>
                                                    <Text className="text-sm font-bold text-white">{getSocialLabel(socialType!)}</Text>
                                                    <Text className="text-xs text-slate-500">@{social.username}</Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => handleRemoveSocial(social)}
                                                className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20"
                                            >
                                                <Ionicons name="trash-outline" size={16} color={COLORS.destructive} />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                        ) : (
                            <View className="py-10 items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5">
                                <View className="w-12 h-12 rounded-2xl bg-warning/10 items-center justify-center mb-3">
                                    <Ionicons name="share-social-outline" size={24} color={COLORS.warning} />
                                </View>
                                <Text className="text-white font-bold text-sm">No social accounts yet</Text>
                                <Text className="text-slate-500 text-xs mt-1">Add your hub's social links below</Text>
                            </View>
                        )}
                    </View>

                    <View className="mb-8">
                        <SectionLabel icon="add-circle" title="Add Account" />
                        <View className="p-4 bg-card rounded-2xl border border-white/[0.06]">
                            <SelectInput
                                placeholder="Select Platform"
                                options={socialTypeOptions}
                                value={newSocialType}
                                onSelect={setNewSocialType}
                                className="mb-3"
                            />

                            {newSocialType && (
                                <View className="mb-3">
                                    <Input
                                        placeholder="Username / Handle"
                                        value={newSocialUsername}
                                        onChangeText={setNewSocialUsername}
                                    />
                                </View>
                            )}

                            <Button
                                onPress={handleAddSocial}
                                variant="outline"
                                size="sm"
                                disabled={!newSocialType || !newSocialUsername}
                                loading={isSaving}
                            >
                                <View className="flex-row items-center gap-2">
                                    <Ionicons name="add" size={16} color="white" />
                                    <Text className="text-white font-bold">Add Account</Text>
                                </View>
                            </Button>
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
