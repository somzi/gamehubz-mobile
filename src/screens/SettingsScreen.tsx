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
import { MenuItem } from '../components/ui/MenuItem';
import { SettingsHero, SettingsHeroLine, SettingsGroup, SETTINGS_EMBLEM_IMAGE, SETTINGS_EMBLEM_IMAGE_RADIUS } from '../components/ui/SettingsBlocks';
import { EmblemImage } from '../components/ui/HeroCard';
import { useLanguage } from '../i18n/useLanguage';
import { usePushPermission } from '../hooks/usePushPermission';

type SettingsNavigationProp = StackNavigationProp<RootStackParamList>;

// Avatar/username editing deliberately lives ONLY in Edit Profile Info
// (UpdateProfileScreen) — this screen is a pure settings menu.
export default function SettingsScreen() {
    const { logout, deleteAccount, user } = useAuth();
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

            <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <View style={{ gap: 22 }}>
                    {/* You: the card opens Edit profile */}
                    <SettingsHero
                        theme="player"
                        onPress={() => navigation.navigate('UpdateProfile')}
                        accessibilityLabel={t('editProfile')}
                        title={user?.username || ''}
                        emblem={
                            <EmblemImage
                                src={user?.avatarUrl}
                                name={user?.username || ''}
                                size={SETTINGS_EMBLEM_IMAGE}
                                radius={SETTINGS_EMBLEM_IMAGE_RADIUS}
                            />
                        }
                    >
                        {user?.nickName?.trim() ? (
                            <SettingsHeroLine icon="game-controller" iconColor={COLORS.primary} text={user.nickName.trim()} />
                        ) : null}
                        <SettingsHeroLine icon="create-outline" iconColor={COLORS.primaryBright} text={t('editProfile')} textColor={COLORS.primaryBright} />
                    </SettingsHero>

                    <SettingsGroup title={t('sections.account')}>
                        <MenuItem
                            icon="share-social"
                            color="#60A5FA"
                            label={t('manageSocials')}
                            onPress={() => navigation.navigate('ManageUserSocials')}
                        />
                        <MenuItem
                            icon="lock-closed"
                            color={COLORS.warning}
                            label={t('passwordSecurity')}
                            onPress={() => navigation.navigate('ChangePassword')}
                            isLast
                        />
                    </SettingsGroup>

                    <SettingsGroup title={t('sections.preferences')}>
                        <MenuItem
                            icon="notifications"
                            color="#F43F5E"
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
                            icon="language"
                            color={COLORS.highlight}
                            label={t('language')}
                            onPress={() => setShowLanguageSheet(true)}
                            isLast
                            rightElement={
                                <Text className="text-slate-400 text-[13px] font-semibold" numberOfLines={1}>
                                    {current.flag}  {current.label}
                                </Text>
                            }
                        />
                    </SettingsGroup>

                    <SettingsGroup title={t('sections.support')}>
                        <MenuItem
                            icon="help-circle"
                            color="#22D3EE"
                            label={t('helpCenter')}
                            onPress={() => navigation.navigate('HelpCenter')}
                        />
                        <MenuItem
                            icon="mail"
                            color={COLORS.primary}
                            label={t('contactUs')}
                            onPress={() => navigation.navigate('ContactUs')}
                        />
                        <MenuItem
                            icon="information-circle"
                            color={COLORS.slate400}
                            label={t('aboutUs')}
                            onPress={() => navigation.navigate('AboutUs')}
                            isLast
                        />
                    </SettingsGroup>

                    <SettingsGroup title={t('sections.accountActions')} danger>
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
                    </SettingsGroup>
                </View>

                <View className="py-8 items-center">
                    <Text className="text-slate-600 text-xs font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
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
