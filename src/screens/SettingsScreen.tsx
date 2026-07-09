import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { StatusModal } from '../components/modals/StatusModal';
import Constants from 'expo-constants';
import { COLORS } from '../lib/theme';
import { SectionLabel } from '../components/ui/SectionLabel';
import { MenuItem } from '../components/ui/MenuItem';

type SettingsNavigationProp = StackNavigationProp<RootStackParamList>;

// Avatar/username editing deliberately lives ONLY in Edit Profile Info
// (UpdateProfileScreen) — this screen is a pure settings menu.
export default function SettingsScreen() {
    const { logout, deleteAccount } = useAuth();
    const navigation = useNavigation<SettingsNavigationProp>();

    const [showStatusModal, setShowStatusModal] = React.useState(false);
    const [statusModalConfig, setStatusModalConfig] = React.useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    const handleLogout = () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => logout() }
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'Are you sure you want to delete your account? This action is permanent and cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const success = await deleteAccount();
                        if (success) {
                            setStatusModalConfig({
                                type: 'success',
                                title: 'Account Deleted',
                                message: 'Your account has been successfully deleted.'
                            });
                            setShowStatusModal(true);
                        } else {
                            setStatusModalConfig({
                                type: 'error',
                                title: 'Delete Failed',
                                message: 'Failed to delete your account. Please try again later.'
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
            <PageHeader title="Settings" showBack />

            <ScrollView className="flex-1 px-6">
                {/* Settings Menu — grouped cards */}
                <View className="gap-5 pt-4">
                    <View>
                        <SectionLabel icon="person" title="Account" />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="person-outline"
                                label="Edit Profile Info"
                                onPress={() => navigation.navigate('UpdateProfile')}
                            />
                            <MenuItem
                                icon="share-social-outline"
                                label="Manage Socials"
                                onPress={() => navigation.navigate('ManageUserSocials')}
                            />
                            <MenuItem
                                icon="lock-closed-outline"
                                label="Password & Security"
                                onPress={() => navigation.navigate('ChangePassword')}
                                isLast
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="help-buoy" title="Support" color={COLORS.info} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="help-circle-outline"
                                label="Help Center"
                                onPress={() => navigation.navigate('HelpCenter')}
                            />
                            <MenuItem
                                icon="mail-outline"
                                label="Contact Us"
                                onPress={() => navigation.navigate('ContactUs')}
                            />
                            <MenuItem
                                icon="information-circle-outline"
                                label="About Us"
                                onPress={() => navigation.navigate('AboutUs')}
                                isLast
                            />
                        </View>
                    </View>

                    <View>
                        <SectionLabel icon="exit-outline" title="Account Actions" color={COLORS.destructive} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="log-out-outline"
                                label="Log Out"
                                onPress={handleLogout}
                                destructive
                                showChevron={false}
                            />
                            <MenuItem
                                icon="trash-outline"
                                label="Delete Account"
                                onPress={handleDeleteAccount}
                                destructive
                                showChevron={false}
                                isLast
                            />
                        </View>
                    </View>
                </View>

                <View className="py-12 items-center opacity-30">
                    <Text className="text-white text-xs">GameHubz Mobile v{Constants.expoConfig?.version || '1.0.0'}</Text>
                </View>
            </ScrollView>

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
