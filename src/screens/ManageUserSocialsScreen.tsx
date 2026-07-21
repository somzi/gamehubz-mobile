import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../components/ui/KeyboardAvoider';
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
import { SectionLabel } from '../components/ui/SectionLabel';
import { EmptyState } from '../components/ui/EmptyState';
import { COLORS } from '../lib/theme';

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
    const [isTogglingShow, setIsTogglingShow] = useState(false);
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

    const handleToggleShowOnProfile = async (show: boolean) => {
        if (isTogglingShow) return;
        setIsTogglingShow(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DISCORD_SHOW_ON_PROFILE, {
                method: 'PUT',
                body: JSON.stringify({ show }),
            });
            if (!response.ok) throw new Error(`DISCORD_SHOW_ON_PROFILE failed: ${response.status}`);
            await refreshUser();
        } catch (error) {
            console.error('Error toggling Discord profile visibility:', error);
            showDiscordError('Could not update profile visibility. Try again later.');
        } finally {
            setIsTogglingShow(false);
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
        // Discord is intentionally not an "add" option — it's connected via the OAuth card above,
        // which yields a real user id (the only thing that produces a working Discord link).
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
        // Discord is no longer an "add" option (it's the OAuth card above), but legacy manual
        // entries may still exist — keep its label resolvable.
        if (type === SocialType.Discord) return 'Discord';
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
            <KeyboardAvoider>
                <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {/* Discord bot link — DM notifications; separate from the public social links below */}
                    <View className="mb-6">
                        <SectionLabel icon="logo-discord" title="Discord" color={DISCORD_BLURPLE} />
                        <View className="p-4 bg-card rounded-2xl border border-white/[0.06]">
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
                                <>
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
                                    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-white/5">
                                        <View className="flex-1 pr-3">
                                            <Text className="text-sm font-bold text-white">Show on profile</Text>
                                            <Text className="text-xs text-slate-500 mt-0.5">
                                                Let others open your Discord from your public profile
                                            </Text>
                                        </View>
                                        <Toggle
                                            size="sm"
                                            value={user.discordShowOnProfile !== false}
                                            onValueChange={handleToggleShowOnProfile}
                                            disabled={isTogglingShow}
                                            activeColor={DISCORD_BLURPLE}
                                        />
                                    </View>
                                </>
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
                        <SectionLabel icon="share-social" title="Connected Accounts" color={COLORS.info} />

                        {socials.length > 0 ? (
                            <View className="gap-3">
                                {socials.map((social) => (
                                    <View
                                        key={social.socialType!}
                                        className="flex-row items-center justify-between p-4 bg-card rounded-2xl border border-white/[0.06]"
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
                            <EmptyState
                                icon="share-social-outline"
                                color={COLORS.info}
                                title="No social accounts yet"
                                description="Add your social links below"
                            />
                        )}
                    </View>

                    {/* Add New Account */}
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
            </KeyboardAvoider>

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
