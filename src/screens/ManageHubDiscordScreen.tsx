import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { StatusModal } from '../components/modals/StatusModal';
import { SectionLabel } from '../components/ui/SectionLabel';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { cn } from '../lib/utils';

type ManageHubDiscordRouteProp = RouteProp<RootStackParamList, 'ManageHubDiscord'>;

const DISCORD_BLURPLE = '#5865F2';

// Mirrors the backend's DiscordNotificationSettings JSON (Hub.DiscordNotificationSettings).
// Missing keys default to ON on both sides.
interface DiscordNotificationSettings {
    registrationOpened: boolean;
    registrationClosed: boolean;
    tournamentStarted: boolean;
    matchApproved: boolean;
    matchReverted: boolean;
    tournamentFinished: boolean;
}

const DEFAULT_DISCORD_SETTINGS: DiscordNotificationSettings = {
    registrationOpened: true,
    registrationClosed: true,
    tournamentStarted: true,
    matchApproved: true,
    matchReverted: true,
    tournamentFinished: true,
};

const DISCORD_EVENTS: { key: keyof DiscordNotificationSettings; label: string; description: string }[] = [
    { key: 'registrationOpened', label: 'Registration Opened', description: 'A new tournament opens registration' },
    { key: 'registrationClosed', label: 'Registration Closed', description: 'Registration closes, participants locked in' },
    { key: 'tournamentStarted', label: 'Tournament Started', description: 'The bracket is drawn and play begins' },
    { key: 'matchApproved', label: 'Match Approved', description: 'A match result is confirmed' },
    { key: 'matchReverted', label: 'Match Reverted', description: 'A result is removed or a walkover applied' },
    { key: 'tournamentFinished', label: 'Tournament Finished', description: 'The champion is decided' },
];

const DISCORD_WEBHOOK_URL_PATTERN = /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//i;

function parseDiscordSettings(json?: string | null): DiscordNotificationSettings {
    if (!json) return { ...DEFAULT_DISCORD_SETTINGS };
    try {
        return { ...DEFAULT_DISCORD_SETTINGS, ...JSON.parse(json) };
    } catch {
        return { ...DEFAULT_DISCORD_SETTINGS };
    }
}

export default function ManageHubDiscordScreen() {
    const route = useRoute<ManageHubDiscordRouteProp>();
    const { hubId } = route.params;

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    // UpdateHub unconditionally overwrites name/description/isPublic, so the fetched
    // values must be echoed back alongside the Discord fields on save.
    const [hubIdentity, setHubIdentity] = useState<{ name: string; description: string; isPublic: boolean } | null>(null);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [settings, setSettings] = useState<DiscordNotificationSettings>({ ...DEFAULT_DISCORD_SETTINGS });
    const [webhookUrlError, setWebhookUrlError] = useState<string | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    useEffect(() => {
        fetchHub();
    }, [hubId]);

    const fetchHub = async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB(hubId));
            if (response.ok) {
                const data = await response.json();
                const hub = data.result || data;
                setHubIdentity({
                    name: hub.name || '',
                    description: hub.description || '',
                    isPublic: hub.isPublic !== false,
                });
                setWebhookUrl(hub.discordWebhookUrl || '');
                setSettings(parseDiscordSettings(hub.discordNotificationSettings));
            }
        } catch (error) {
            console.error('Error fetching hub:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleEvent = (key: keyof DiscordNotificationSettings, value: boolean) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (isSaving || !hubIdentity) return;

        const trimmed = webhookUrl.trim();
        if (trimmed && !DISCORD_WEBHOOK_URL_PATTERN.test(trimmed)) {
            setWebhookUrlError('Must start with https://discord.com/api/webhooks/');
            return;
        }
        setWebhookUrlError(null);

        setIsSaving(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.UPDATE_HUB, {
                method: 'POST',
                body: JSON.stringify({
                    id: hubId,
                    name: hubIdentity.name,
                    description: hubIdentity.description,
                    isPublic: hubIdentity.isPublic,
                    // Empty string = explicit clear (null would mean "not sent" and preserve it)
                    discordWebhookUrl: trimmed,
                    discordNotificationSettings: JSON.stringify(settings),
                }),
            });

            if (response.ok) {
                setStatusModalConfig({
                    type: 'success',
                    title: 'Settings Saved',
                    message: trimmed
                        ? 'Tournament announcements will be posted to your Discord channel.'
                        : 'Discord integration is turned off.',
                });
            } else {
                setStatusModalConfig({
                    type: 'error',
                    title: 'Save Failed',
                    message: 'Failed to save Discord settings. Please try again.',
                });
            }
            setShowStatusModal(true);
        } catch (error) {
            console.error('Error saving Discord settings:', error);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: 'An unexpected error occurred.',
            });
            setShowStatusModal(true);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <PageHeader title="Discord Integration" showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={DISCORD_BLURPLE} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Discord Integration" showBack />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
            >
                <ScrollView
                    className="flex-1 px-6"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
                >
                    {/* Hero */}
                    <View className="bg-indigo-500/[0.06] border border-indigo-500/15 rounded-3xl p-5 mb-6">
                        <View className="flex-row items-center gap-3">
                            <View className="w-12 h-12 rounded-2xl items-center justify-center bg-indigo-500/15">
                                <Ionicons name="logo-discord" size={24} color={DISCORD_BLURPLE} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-black text-base">Hub Announcements</Text>
                                <Text className="text-slate-400 text-xs mt-0.5 leading-4">
                                    Post tournament updates from this hub straight into your Discord server.
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Webhook */}
                    <View className="mb-6">
                        <SectionLabel icon="link" title="Webhook" color={DISCORD_BLURPLE} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4">
                            <Text className="text-white font-bold text-sm mb-1">Webhook URL</Text>
                            <Text className="text-slate-500 text-xs mb-3 leading-4">
                                In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
                            </Text>
                            <TextInput
                                value={webhookUrl}
                                onChangeText={(text) => {
                                    setWebhookUrl(text);
                                    if (webhookUrlError) setWebhookUrlError(null);
                                }}
                                placeholder="https://discord.com/api/webhooks/..."
                                placeholderTextColor="#334155"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                className={cn(
                                    "bg-white/[0.03] p-3.5 rounded-2xl text-white border text-sm",
                                    webhookUrlError ? "border-red-500/50" : "border-white/[0.06]"
                                )}
                            />
                            {webhookUrlError && (
                                <Text className="text-red-400 text-xs mt-1.5">{webhookUrlError}</Text>
                            )}
                            <Text className="text-slate-600 text-[11px] mt-2.5">
                                Clear the field and save to turn the integration off.
                            </Text>
                        </View>
                    </View>

                    {/* Events */}
                    {webhookUrl.trim().length > 0 && (
                        <View className="mb-6">
                            <SectionLabel icon="notifications" title="Events" color={DISCORD_BLURPLE} />
                            <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl px-4 py-1">
                                {DISCORD_EVENTS.map((event, index) => (
                                    <View
                                        key={event.key}
                                        className={cn(
                                            "flex-row items-center justify-between py-3",
                                            index < DISCORD_EVENTS.length - 1 && "border-b border-white/5"
                                        )}
                                    >
                                        <View className="flex-1 pr-3">
                                            <Text className="text-white font-semibold text-sm">{event.label}</Text>
                                            <Text className="text-slate-500 text-xs mt-0.5">{event.description}</Text>
                                        </View>
                                        <Toggle
                                            size="sm"
                                            value={settings[event.key]}
                                            onValueChange={(value) => toggleEvent(event.key, value)}
                                            activeColor={DISCORD_BLURPLE}
                                        />
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <Button
                        onPress={handleSave}
                        loading={isSaving}
                        className="w-full h-14 rounded-2xl"
                    >
                        Save Changes
                    </Button>
                </ScrollView>
            </KeyboardAvoidingView>

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
