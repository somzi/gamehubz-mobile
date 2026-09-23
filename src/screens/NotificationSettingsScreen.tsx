import React from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { StatusModal } from '../components/modals/StatusModal';
import { MenuItem } from '../components/ui/MenuItem';
import { Toggle } from '../components/ui/Toggle';
import { COLORS } from '../lib/theme';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { NotificationSettings } from '../types/social';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { usePushPermission } from '../hooks/usePushPermission';

// Settings → Notifications. The inbox itself is not here: it lives behind the bell on Home.
export default function NotificationSettingsScreen() {
    const { t } = useTranslation('settings');
    const { permission: pushPermission, refresh: refreshPushPermission } = usePushPermission();
    const { requestAndSync } = usePushNotifications();

    // Notification switches. Loaded lazily on mount — one tiny GET, and the row simply stays out
    // of the way until it arrives rather than rendering a toggle in a guessed state.
    const [notificationSettings, setNotificationSettings] = React.useState<NotificationSettings | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [showSaveFailed, setShowSaveFailed] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS);
                if (!response.ok) return;
                const data = (await response.json()) as NotificationSettings;
                if (!cancelled) setNotificationSettings(data);
            } catch { /* best-effort — the row stays hidden */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // Off but still askable → the OS prompt (and the token sync that follows a yes). Off for good, or
    // already on → the system settings page, the only place either can be changed.
    const handlePushPermissionPress = async () => {
        if (pushPermission && !pushPermission.granted && pushPermission.canAskAgain) {
            await requestAndSync();
            await refreshPushPermission();
            return;
        }
        Linking.openSettings().catch(() => { /* nothing more to do */ });
    };

    // Optimistic, with rollback: the toggle is the whole interaction, so it must not wait on
    // a round-trip to move.
    const handleToggleModeratedChats = async (enabled: boolean) => {
        if (isSaving || !notificationSettings) return;
        const previous = notificationSettings;
        setNotificationSettings({ ...previous, moderatedChatNotifications: enabled });
        setIsSaving(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS, {
                method: 'PUT',
                body: JSON.stringify({ ...previous, moderatedChatNotifications: enabled }),
            });
            if (!response.ok) throw new Error(`NOTIFICATION_SETTINGS failed: ${response.status}`);
        } catch (error) {
            console.error('Error updating notification settings:', error);
            setNotificationSettings(previous);
            setShowSaveFailed(true);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title={t('notifications.title')} showBack />

            <ScrollView className="flex-1 px-6">
                {(pushPermission || notificationSettings) && (
                    <View className="mt-4 bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                        {pushPermission && (
                            <MenuItem
                                icon="phone-portrait-outline"
                                label={t('notifications.push')}
                                onPress={handlePushPermissionPress}
                                isLast={!notificationSettings}
                                rightElement={
                                    <View
                                        className="px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: (pushPermission.granted ? COLORS.primary : COLORS.warning) + '1F' }}
                                    >
                                        <Text
                                            className="text-[11px] font-black"
                                            style={{ color: pushPermission.granted ? COLORS.primaryBright : COLORS.warning }}
                                        >
                                            {pushPermission.granted ? t('notifications.pushOn') : t('notifications.pushOff')}
                                        </Text>
                                    </View>
                                }
                            />
                        )}
                        {notificationSettings && (
                            <View className="flex-row items-center justify-between py-3.5 px-4">
                                <View className="flex-row items-center gap-3 flex-1 pr-3">
                                    <View className="w-9 h-9 rounded-xl items-center justify-center border bg-white/[0.04] border-white/[0.06]">
                                        <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.slate300} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-semibold text-[15px] text-white">{t('notifications.moderatedChats')}</Text>
                                        <Text className="text-xs text-slate-500 mt-0.5">
                                            {t('notifications.moderatedChatsHint')}
                                        </Text>
                                    </View>
                                </View>
                                <Toggle
                                    size="sm"
                                    value={notificationSettings.moderatedChatNotifications}
                                    onValueChange={handleToggleModeratedChats}
                                    disabled={isSaving}
                                />
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            <StatusModal
                visible={showSaveFailed}
                onClose={() => setShowSaveFailed(false)}
                type="error"
                title={t('notifications.saveFailedTitle')}
                message={t('notifications.saveFailedMessage')}
            />
        </SafeAreaView>
    );
}
