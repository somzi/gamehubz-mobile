import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, TextInput, ScrollView } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { Toggle } from '../ui/Toggle';
import { cn } from '../../lib/utils';

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

interface EditHubModalProps {
    visible: boolean;
    hubId: string;
    initialName: string;
    initialDescription: string;
    initialIsPublic?: boolean;
    initialDiscordWebhookUrl?: string | null;
    initialDiscordNotificationSettings?: string | null;
    onClose: () => void;
    onSave: (
        name: string,
        description: string,
        isPublic: boolean,
        discordWebhookUrl: string,
        discordNotificationSettings: string,
    ) => Promise<void>;
}

export function EditHubModal({
    visible,
    hubId,
    initialName,
    initialDescription,
    initialIsPublic = true,
    initialDiscordWebhookUrl,
    initialDiscordNotificationSettings,
    onClose,
    onSave,
}: EditHubModalProps) {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [isPublic, setIsPublic] = useState(initialIsPublic);
    const [discordWebhookUrl, setDiscordWebhookUrl] = useState(initialDiscordWebhookUrl || '');
    const [discordSettings, setDiscordSettings] = useState<DiscordNotificationSettings>(
        parseDiscordSettings(initialDiscordNotificationSettings)
    );
    const [webhookUrlError, setWebhookUrlError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setName(initialName);
            setDescription(initialDescription);
            setIsPublic(initialIsPublic);
            setDiscordWebhookUrl(initialDiscordWebhookUrl || '');
            setDiscordSettings(parseDiscordSettings(initialDiscordNotificationSettings));
            setWebhookUrlError(null);
        }
    }, [visible, initialName, initialDescription, initialIsPublic, initialDiscordWebhookUrl, initialDiscordNotificationSettings]);

    const toggleDiscordEvent = (key: keyof DiscordNotificationSettings, value: boolean) => {
        setDiscordSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!name.trim() || isSaving) return;

        const webhookUrl = discordWebhookUrl.trim();
        if (webhookUrl && !DISCORD_WEBHOOK_URL_PATTERN.test(webhookUrl)) {
            setWebhookUrlError('Must start with https://discord.com/api/webhooks/');
            return;
        }
        setWebhookUrlError(null);

        setIsSaving(true);
        try {
            await onSave(name, description, isPublic, webhookUrl, JSON.stringify(discordSettings));
        } catch (error) {
            console.error('Error saving hub:', error);
        } finally {
            setIsSaving(false);
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable
                className="flex-1 bg-black/60 justify-center items-center px-5"
                onPress={onClose}
            >
                <Pressable
                    className="bg-[#0D1525] rounded-3xl p-6 w-full max-w-md max-h-[88%] border border-white/[0.06]"
                    onPress={(e) => e.stopPropagation()}
                >
                    <View className="flex-row justify-between items-center mb-5">
                        <Text className="text-xl font-black text-white">Edit Hub</Text>
                        <Pressable onPress={onClose} className="w-8 h-8 rounded-xl bg-white/[0.05] items-center justify-center">
                            <Ionicons name="close" size={18} color="#64748B" />
                        </Pressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View className="mb-4">
                            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Hub Name</Text>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                placeholder="Enter hub name"
                                placeholderTextColor="#334155"
                                className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm"
                            />
                        </View>

                        <View className="mb-5">
                            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Description</Text>
                            <TextInput
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Enter hub description"
                                placeholderTextColor="#334155"
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                className="bg-white/[0.03] p-3.5 rounded-2xl text-white border border-white/[0.06] text-sm h-24"
                            />
                        </View>

                        <View className="h-[1px] bg-white/5 mb-5" />

                        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Privacy</Text>
                        <View className="bg-white/[0.03] p-4 rounded-2xl border border-white/[0.06]">
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3 flex-1">
                                    <View className={cn(
                                        "w-10 h-10 rounded-2xl items-center justify-center",
                                        isPublic ? "bg-emerald-500/10" : "bg-amber-500/10"
                                    )}>
                                        <Ionicons
                                            name={isPublic ? "globe-outline" : "lock-closed-outline"}
                                            size={18}
                                            color={isPublic ? "#10B981" : "#F59E0B"}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-white font-bold text-sm">
                                            {isPublic ? "Public Hub" : "Private Hub"}
                                        </Text>
                                        <Text className="text-slate-500 text-xs mt-0.5">
                                            {isPublic
                                                ? "Anyone can follow this hub"
                                                : "Members need approval to join"}
                                        </Text>
                                    </View>
                                </View>
                                <Toggle
                                    value={isPublic}
                                    onValueChange={setIsPublic}
                                    activeColor="#10B981"
                                    inactiveColor="#F59E0B"
                                />
                            </View>
                        </View>

                        <View className="h-[1px] bg-white/5 my-5" />

                        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Discord Integration</Text>
                        <View className="bg-white/[0.03] p-4 rounded-2xl border border-white/[0.06]">
                            <View className="flex-row items-center gap-3 mb-3">
                                <View className="w-10 h-10 rounded-2xl items-center justify-center bg-indigo-500/10">
                                    <Ionicons name="logo-discord" size={18} color="#5865F2" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-white font-bold text-sm">Webhook URL</Text>
                                    <Text className="text-slate-500 text-xs mt-0.5">
                                        Tournament announcements are posted to this channel
                                    </Text>
                                </View>
                            </View>
                            <TextInput
                                value={discordWebhookUrl}
                                onChangeText={(text) => {
                                    setDiscordWebhookUrl(text);
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

                            {discordWebhookUrl.trim().length > 0 && (
                                <View className="mt-4">
                                    <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Events</Text>
                                    {DISCORD_EVENTS.map((event, index) => (
                                        <View
                                            key={event.key}
                                            className={cn(
                                                "flex-row items-center justify-between py-2.5",
                                                index < DISCORD_EVENTS.length - 1 && "border-b border-white/5"
                                            )}
                                        >
                                            <View className="flex-1 pr-3">
                                                <Text className="text-white font-semibold text-sm">{event.label}</Text>
                                                <Text className="text-slate-500 text-xs mt-0.5">{event.description}</Text>
                                            </View>
                                            <Toggle
                                                size="sm"
                                                value={discordSettings[event.key]}
                                                onValueChange={(value) => toggleDiscordEvent(event.key, value)}
                                                activeColor="#5865F2"
                                            />
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </ScrollView>

                    <View className="flex-row gap-3 mt-6">
                        <Button
                            onPress={onClose}
                            variant="secondary"
                            className="flex-1"
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            onPress={handleSave}
                            className="flex-1"
                            disabled={isSaving || !name.trim()}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
