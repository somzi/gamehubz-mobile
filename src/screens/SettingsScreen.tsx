import React from 'react';
import { View, Text, ScrollView, Alert, AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { StatusModal } from '../components/modals/StatusModal';
import { ActionSheetModal } from '../components/modals/ActionSheetModal';
import Constants from 'expo-constants';
import { COLORS } from '../lib/theme';
import { SectionLabel } from '../components/ui/SectionLabel';
import { MenuItem } from '../components/ui/MenuItem';
import { Toggle } from '../components/ui/Toggle';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { NotificationSettings } from '../types/social';
import { useLanguage } from '../i18n/useLanguage';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNotifications } from '../context/NotificationsContext';

type SettingsNavigationProp = StackNavigationProp<RootStackParamList>;

// Avatar/username editing deliberately lives ONLY in Edit Profile Info
// (UpdateProfileScreen) — this screen is a pure settings menu.
export default function SettingsScreen() {
    const { logout, deleteAccount } = useAuth();
    const navigation = useNavigation<SettingsNavigationProp>();
    const { t } = useTranslation('settings');
    const { t: tc } = useTranslation('common');
    const { current, options, language, change } = useLanguage();

    const [showLanguageSheet, setShowLanguageSheet] = React.useState(false);
    const [showStatusModal, setShowStatusModal] = React.useState(false);
    const [statusModalConfig, setStatusModalConfig] = React.useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    // Notification switches. Loaded lazily on mount — one tiny GET, and the section simply
    // stays out of the way until it arrives rather than rendering a toggle in a guessed state.
    const [notificationSettings, setNotificationSettings] = React.useState<NotificationSettings | null>(null);
    const [isSavingNotifications, setIsSavingNotifications] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS);
                if (!response.ok) return;
                const data = (await response.json()) as NotificationSettings;
                if (!cancelled) setNotificationSettings(data);
            } catch { /* best-effort — the section stays hidden */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // Inbox entry + the OS push permission. The permission is only read here, never requested on
    // mount, and it is re-read whenever the app returns to the foreground — which is how a user coming
    // back from the system settings page sees their change straight away.
    const { summary: notificationSummary } = useNotifications();
    const { requestAndSync } = usePushNotifications();
    const [pushPermission, setPushPermission] = React.useState<{ granted: boolean; canAskAgain: boolean } | null>(null);

    const readPushPermission = React.useCallback(async () => {
        try {
            const permission = await Notifications.getPermissionsAsync();
            setPushPermission({
                granted: permission.granted || permission.status === 'granted',
                canAskAgain: permission.canAskAgain,
            });
        } catch { /* best-effort — the row stays hidden */ }
    }, []);

    React.useEffect(() => {
        readPushPermission();
        const subscription = AppState.addEventListener('change', (next) => {
            if (next === 'active') readPushPermission();
        });
        return () => subscription.remove();
    }, [readPushPermission]);

    // Off but still askable → the OS prompt (and the token sync that follows a yes). Off for good, or
    // already on → the system settings page, the only place either can be changed.
    const handlePushPermissionPress = async () => {
        if (pushPermission && !pushPermission.granted && pushPermission.canAskAgain) {
            await requestAndSync();
            await readPushPermission();
            return;
        }
        Linking.openSettings().catch(() => { /* nothing more to do */ });
    };

    // Optimistic, with rollback: the toggle is the whole interaction, so it must not wait on
    // a round-trip to move.
    const handleToggleModeratedChats = async (enabled: boolean) => {
        if (isSavingNotifications || !notificationSettings) return;
        const previous = notificationSettings;
        setNotificationSettings({ ...previous, moderatedChatNotifications: enabled });
        setIsSavingNotifications(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS, {
                method: 'PUT',
                body: JSON.stringify({ ...previous, moderatedChatNotifications: enabled }),
            });
            if (!response.ok) throw new Error(`NOTIFICATION_SETTINGS failed: ${response.status}`);
        } catch (error) {
            console.error('Error updating notification settings:', error);
            setNotificationSettings(previous);
            setStatusModalConfig({
                type: 'error',
                title: t('notifications.saveFailedTitle'),
                message: t('notifications.saveFailedMessage'),
            });
            setShowStatusModal(true);
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const handleLogout = () => {
        Alert.alert(
            t('logOutConfirm.title'),
            t('logOutConfirm.message'),
            [
                { text: tc('cancel'), style: 'cancel' },
                { text: t('logOut'), style: 'destructive', onPress: () => logout() }
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            t('deleteConfirm.title'),
            t('deleteConfirm.message'),
            [
                { text: tc('cancel'), style: 'cancel' },
                {
                    text: tc('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        const success = await deleteAccount();
                        if (success) {
                            setStatusModalConfig({
                                type: 'success',
                                title: t('deleteSuccess.title'),
                                message: t('deleteSuccess.message')
                            });
                            setShowStatusModal(true);
                        } else {
                            setStatusModalConfig({
                                type: 'error',
                                title: t('deleteFailed.title'),
                                message: t('deleteFailed.message')
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
            <PageHeader title={t('title')} showBack />

            <ScrollView className="flex-1 px-6">
                {/* Settings Menu — grouped cards */}
                <View className="gap-5 pt-4">
                    <View>
                        <SectionLabel icon="person" title={t('sections.account')} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="person-outline"
                                label={t('editProfile')}
                                onPress={() => navigation.navigate('UpdateProfile')}
                            />
                            <MenuItem
                                icon="share-social-outline"
                                label={t('manageSocials')}
                                onPress={() => navigation.navigate('ManageUserSocials')}
                            />
                            <MenuItem
                                icon="lock-closed-outline"
                                label={t('passwordSecurity')}
                                onPress={() => navigation.navigate('ChangePassword')}
                                isLast
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="notifications" title={t('sections.notifications')} color={COLORS.warning} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="file-tray-full-outline"
                                label={t('notifications.inbox')}
                                onPress={() => navigation.navigate('Notifications')}
                                isLast={!pushPermission && !notificationSettings}
                                rightElement={notificationSummary.unread > 0 ? (
                                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.primary + '1F' }}>
                                        <Text className="text-[11px] font-black" style={{ color: COLORS.primaryBright }}>
                                            {notificationSummary.unread > 99 ? '99+' : notificationSummary.unread}
                                        </Text>
                                    </View>
                                ) : undefined}
                            />
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
                                        disabled={isSavingNotifications}
                                    />
                                </View>
                            )}
                        </View>
                        {pushPermission && !pushPermission.granted && (
                            <Text className="text-[11px] text-slate-600 mt-2 px-1 leading-4">
                                {t('notifications.pushOffHint')}
                            </Text>
                        )}
                        {notificationSettings && (
                            <Text className="text-[11px] text-slate-600 mt-2 px-1 leading-4">
                                {t('notifications.perMatchHint')}
                            </Text>
                        )}
                    </View>

                    <View>
                        <SectionLabel icon="options" title={t('sections.preferences')} color={COLORS.highlight} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="language-outline"
                                label={t('language')}
                                onPress={() => setShowLanguageSheet(true)}
                                isLast
                                rightElement={
                                    <Text className="text-slate-400 text-[13px] font-semibold" numberOfLines={1}>
                                        {current.flag}  {current.label}
                                    </Text>
                                }
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="help-buoy" title={t('sections.support')} color={COLORS.info} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="help-circle-outline"
                                label={t('helpCenter')}
                                onPress={() => navigation.navigate('HelpCenter')}
                            />
                            <MenuItem
                                icon="mail-outline"
                                label={t('contactUs')}
                                onPress={() => navigation.navigate('ContactUs')}
                            />
                            <MenuItem
                                icon="information-circle-outline"
                                label={t('aboutUs')}
                                onPress={() => navigation.navigate('AboutUs')}
                                isLast
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="exit-outline" title={t('sections.accountActions')} color={COLORS.destructive} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="log-out-outline"
                                label={t('logOut')}
                                onPress={handleLogout}
                                destructive
                                showChevron={false}
                            />
                            <MenuItem
                                icon="trash-outline"
                                label={t('deleteAccount')}
                                onPress={handleDeleteAccount}
                                destructive
                                showChevron={false}
                                isLast
                            />
                        </View>
                    </View>
                </View>

                <View className="py-12 items-center opacity-30">
                    <Text className="text-white text-xs">
                        {t('version', { version: Constants.expoConfig?.version || '1.0.0' })}
                    </Text>
                </View>
            </ScrollView>

            <ActionSheetModal
                visible={showLanguageSheet}
                onClose={() => setShowLanguageSheet(false)}
                title={t('languagePicker.title')}
                subtitle={t('languagePicker.subtitle')}
                actions={options.map(option => ({
                    label: option.label,
                    emoji: option.flag,
                    selected: option.code === language,
                    onPress: () => { void change(option.code); },
                }))}
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
