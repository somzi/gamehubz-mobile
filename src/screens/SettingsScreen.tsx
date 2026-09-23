import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useLanguage } from '../i18n/useLanguage';
import { usePushPermission } from '../hooks/usePushPermission';

type SettingsNavigationProp = StackNavigationProp<RootStackParamList>;

// Avatar/username editing deliberately lives ONLY in Edit Profile Info
// (UpdateProfileScreen) — this screen is a pure settings menu.
export default function SettingsScreen() {
    const { logout, deleteAccount } = useAuth();
    const navigation = useNavigation<SettingsNavigationProp>();
    const { t } = useTranslation('settings');
    const { t: tc } = useTranslation('common');
    const { current, options, language, change } = useLanguage();
    // Only read here, to flag push that is off on this device; changing it lives on the
    // Notifications screen.
    const { permission: pushPermission } = usePushPermission();

    const [showLanguageSheet, setShowLanguageSheet] = React.useState(false);
    const [showStatusModal, setShowStatusModal] = React.useState(false);
    const [statusModalConfig, setStatusModalConfig] = React.useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

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
                        <SectionLabel icon="options" title={t('sections.preferences')} color={COLORS.highlight} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="notifications-outline"
                                label={t('notifications.title')}
                                onPress={() => navigation.navigate('NotificationSettings')}
                                rightElement={pushPermission && !pushPermission.granted ? (
                                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.warning + '1F' }}>
                                        <Text className="text-[11px] font-black" style={{ color: COLORS.warning }}>
                                            {t('notifications.pushOff')}
                                        </Text>
                                    </View>
                                ) : undefined}
                            />
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

                <View className="py-8 items-center opacity-30">
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
