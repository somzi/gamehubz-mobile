import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { SocialType, UserSocial } from '../types/auth';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { SelectInput } from '../components/ui/SelectInput';
import { Toggle } from '../components/ui/Toggle';
import { StatusModal } from '../components/modals/StatusModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';

const DISCORD_BLURPLE = '#5865F2';

type ManageUserSocialsNavigationProp = StackNavigationProp<RootStackParamList>;

export default function ManageUserSocialsScreen() {
    const navigation = useNavigation<ManageUserSocialsNavigationProp>();
    const { user, saveUserSocial, deleteUserSocial, refreshUser } = useAuth();

    const [newSocialType, setNewSocialType] = useState<SocialType | undefined>(undefined);
    const [newSocialUsername, setNewSocialUsername] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    // Discord bot link (OAuth runs in the system browser; the backend does the whole exchange)
    const [isConnectingDiscord, setIsConnectingDiscord] = useState(false);
    const [isTogglingDm, setIsTogglingDm] = useState(false);
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const awaitingDiscordLink = useRef(false);
    const appStateRef = useRef(AppState.currentState);

    // When the user comes back from the browser mid-link, the callback has already stored the
    // link server-side — refetch the profile so the card flips to "connected".
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active' &&
                awaitingDiscordLink.current
            ) {
                awaitingDiscordLink.current = false;
                refreshUser();
            }
            appStateRef.current = nextAppState;
        });
        return () => subscription.remove();
    }, [refreshUser]);

    const showDiscordError = (message: string) => {
        setStatusModalConfig({ type: 'error', title: 'Discord', message });
        setShowStatusModal(true);
    };

    const handleConnectDiscord = async () => {
        if (isConnectingDiscord) return;
        setIsConnectingDiscord(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DISCORD_LINK_START);
            if (!response.ok) throw new Error(`DISCORD_LINK_START failed: ${response.status}`);
            const data = await response.json();
            const authorizeUrl = data.authorizeUrl || data.result?.authorizeUrl;
            if (!authorizeUrl) throw new Error('No authorize URL in response');

            awaitingDiscordLink.current = true;
            await Linking.openURL(authorizeUrl);
        } catch (error) {
            console.error('Error starting Discord link:', error);
            awaitingDiscordLink.current = false;
            showDiscordError('Could not start the Discord connection. Try again later.');
        } finally {
            setIsConnectingDiscord(false);
        }
    };

    const handleToggleDiscordDm = async (enabled: boolean) => {
        if (isTogglingDm) return;
        setIsTogglingDm(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DISCORD_DM_ENABLED, {
                method: 'PUT',
                body: JSON.stringify({ enabled }),
            });
            if (!response.ok) throw new Error(`DISCORD_DM_ENABLED failed: ${response.status}`);
            await refreshUser();
        } catch (error) {
            console.error('Error toggling Discord DMs:', error);
            showDiscordError('Could not update DM notifications. Try again later.');
        } finally {
            setIsTogglingDm(false);
        }
    };

    const handleDisconnectDiscord = async () => {
        if (isDisconnecting) return;
        setIsDisconnecting(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DISCORD_UNLINK, { method: 'DELETE' });
            if (!response.ok) throw new Error(`DISCORD_UNLINK failed: ${response.status}`);
            await refreshUser();
            setShowDisconnectConfirm(false);
        } catch (error) {
            console.error('Error disconnecting Discord:', error);
            showDiscordError('Could not disconnect Discord. Try again later.');
        } finally {
            setIsDisconnecting(false);
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
        { label: 'Twitch', value: SocialType.Twitch },
        { label: 'Kick', value: SocialType.Kick },
    ];

    const getSocialIcon = (type: SocialType): keyof typeof Ionicons.glyphMap => {
        switch (type) {
            case SocialType.Instagram: return 'logo-instagram';
            case SocialType.X: return 'logo-twitter';
            case SocialType.Facebook: return 'logo-facebook';
            case SocialType.TikTok: return 'logo-tiktok';
            case SocialType.YouTube: return 'logo-youtube';
            case SocialType.Discord: return 'logo-discord';
            case SocialType.Telegram: return 'paper-plane';
            case SocialType.Twitch: return 'logo-twitch';
            case SocialType.Kick: return 'play-circle';
            default: return 'link-outline';
        }
    };

    const getSocialLabel = (type: SocialType) => {
        return socialTypeOptions.find(opt => opt.value === type)?.label || 'Social';
    };

    const handleAddSocial = async () => {
        if (isSaving) return;
        if (!newSocialType) {
            setStatusModalConfig({ type: 'error', title: 'Missing Platform', message: 'Please select a social platform' });
            setShowStatusModal(true);
            return;
        }
        if (!newSocialUsername.trim()) {
            setStatusModalConfig({ type: 'error', title: 'Missing Username', message: 'Please enter your username/handle' });
            setShowStatusModal(true);
            return;
        }
        if (user?.userSocials?.some(s => s.socialType === newSocialType)) {
            setStatusModalConfig({ type: 'error', title: 'Platform Exists', message: 'You have already added this platform.' });
            setShowStatusModal(true);
            return;
        }

        setIsSaving(true);
        try {
            const success = await saveUserSocial({ socialType: newSocialType, username: newSocialUsername.trim() });
            if (success) {
                setNewSocialType(undefined);
                setNewSocialUsername('');
            } else {
                setStatusModalConfig({ type: 'error', title: 'Failed', message: 'Failed to add social account' });
                setShowStatusModal(true);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveSocial = (social: UserSocial) => {
        if (!social.id) return;
        if (removingId === social.id) return;
        Alert.alert(
            'Remove Social Account',
            `Are you sure you want to remove your ${getSocialLabel(social.socialType!)} account?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        setRemovingId(social.id!);
                        try {
                            const success = await deleteUserSocial(social.id!);
                            if (!success) {
                                setStatusModalConfig({ type: 'error', title: 'Failed', message: 'Failed to remove social account' });
                                setShowStatusModal(true);
                            }
                        } finally {
                            setRemovingId(null);
                        }
                    }
                }
            ]
        );
    };

    const socials = user?.userSocials || [];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Manage Socials" showBack />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false}>
                    {/* Discord bot link — DM notifications; separate from the public social links below */}
                    <View className="mb-6">
                        <Text className="text-lg font-bold text-foreground mb-4">Discord</Text>
                        <View className="p-4 bg-[#131B2E] rounded-2xl border border-white/[0.06]">
                            <View className="flex-row items-center gap-3">
                                <View
                                    className="w-10 h-10 rounded-xl items-center justify-center border"
                                    style={{ backgroundColor: 'rgba(88,101,242,0.1)', borderColor: 'rgba(88,101,242,0.2)' }}
                                >
                                    <Ionicons name="logo-discord" size={18} color={DISCORD_BLURPLE} />
                                </View>
                                <View className="flex-1">
                                    {user?.discordUsername ? (
                                        <>
                                            <Text className="text-sm font-bold text-white">Discord connected</Text>
                                            <Text className="text-xs text-slate-500">@{user.discordUsername}</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text className="text-sm font-bold text-white">Connect Discord</Text>
                                            <Text className="text-xs text-slate-500 mt-0.5">
                                                Get match reminders and messages as Discord DMs
                                            </Text>
                                        </>
                                    )}
                                </View>
                                {user?.discordUsername ? (
                                    <TouchableOpacity
                                        onPress={() => setShowDisconnectConfirm(true)}
                                        disabled={isDisconnecting}
                                        className={`w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 ${isDisconnecting ? 'opacity-50' : ''}`}
                                    >
                                        <Ionicons name="unlink-outline" size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                ) : null}
                            </View>

                            {user?.discordUsername ? (
                                <View className="flex-row items-center justify-between mt-4 pt-4 border-t border-white/5">
                                    <View className="flex-1 pr-3">
                                        <Text className="text-sm font-bold text-white">DM notifications</Text>
                                        <Text className="text-xs text-slate-500 mt-0.5">
                                            Match reminders and messages from the GameHubz bot
                                        </Text>
                                    </View>
                                    <Toggle
                                        size="sm"
                                        value={user.discordDmEnabled !== false}
                                        onValueChange={handleToggleDiscordDm}
                                        disabled={isTogglingDm}
                                        activeColor={DISCORD_BLURPLE}
                                    />
                                </View>
                            ) : (
                                <View className="mt-3">
                                    <Button
                                        onPress={handleConnectDiscord}
                                        variant="outline"
                                        size="sm"
                                        disabled={isConnectingDiscord}
                                        loading={isConnectingDiscord}
                                    >
                                        <View className="flex-row items-center gap-2">
                                            <Ionicons name="logo-discord" size={16} color="white" />
                                            <Text className="text-white font-bold">Connect Discord</Text>
                                        </View>
                                    </Button>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Connected Accounts */}
                    <View className="mb-6">
                        <Text className="text-lg font-bold text-foreground mb-4">Connected Accounts</Text>

                        {socials.length > 0 ? (
                            <View className="gap-3">
                                {socials.map((social) => (
                                    <View
                                        key={social.socialType!}
                                        className="flex-row items-center justify-between p-4 bg-[#131B2E] rounded-2xl border border-white/[0.06]"
                                    >
                                        <View className="flex-row items-center gap-3">
                                            <View className="w-10 h-10 rounded-xl bg-indigo-500/10 items-center justify-center border border-indigo-500/20">
                                                <Ionicons name={getSocialIcon(social.socialType!)} size={18} color="#818CF8" />
                                            </View>
                                            <View>
                                                <Text className="text-sm font-bold text-white">{getSocialLabel(social.socialType!)}</Text>
                                                <Text className="text-xs text-slate-500">@{social.username}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => handleRemoveSocial(social)}
                                            disabled={removingId === social.id}
                                            className={`w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 ${removingId === social.id ? 'opacity-50' : ''}`}
                                        >
                                            {removingId === social.id ? (
                                                <ActivityIndicator size="small" color="#EF4444" />
                                            ) : (
                                                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View className="py-10 items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5">
                                <View className="w-12 h-12 rounded-2xl bg-indigo-500/10 items-center justify-center mb-3">
                                    <Ionicons name="share-social-outline" size={24} color="#818CF8" />
                                </View>
                                <Text className="text-white font-bold text-sm">No social accounts yet</Text>
                                <Text className="text-slate-500 text-xs mt-1">Add your social links below</Text>
                            </View>
                        )}
                    </View>

                    {/* Add New Account */}
                    <View className="mb-8">
                        <Text className="text-lg font-bold text-foreground mb-4">Add Account</Text>
                        <View className="p-4 bg-[#131B2E] rounded-2xl border border-white/[0.06]">
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
                                disabled={!newSocialType || !newSocialUsername || isSaving}
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
                onClose={() => setShowStatusModal(false)}
                type={statusModalConfig.type}
                title={statusModalConfig.title}
                message={statusModalConfig.message}
            />

            <ConfirmationModal
                visible={showDisconnectConfirm}
                onClose={() => setShowDisconnectConfirm(false)}
                onConfirm={handleDisconnectDiscord}
                title="Disconnect Discord"
                message={`Disconnect @${user?.discordUsername || ''} from your GameHubz account? You'll stop receiving Discord DM notifications.`}
                confirmText="Disconnect"
                cancelText="Cancel"
                isDestructive
                isLoading={isDisconnecting}
            />
        </SafeAreaView>
    );
}
