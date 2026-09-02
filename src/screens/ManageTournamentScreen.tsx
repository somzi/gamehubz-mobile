import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { EditTournamentModal } from '../components/modals/EditTournamentModal';
import { StatusModal } from '../components/modals/StatusModal';
import { SectionLabel } from '../components/ui/SectionLabel';
import { MenuItem } from '../components/ui/MenuItem';
import { COLORS } from '../lib/theme';

type ManageTournamentScreenRouteProp = RouteProp<RootStackParamList, 'ManageTournament'>;
type ManageTournamentScreenNavigationProp = StackNavigationProp<RootStackParamList>;

export default function ManageTournamentScreen() {
    const { t } = useTranslation('tournament');
    const { t: tCommon } = useTranslation('common');
    const route = useRoute<ManageTournamentScreenRouteProp>();
    const navigation = useNavigation<ManageTournamentScreenNavigationProp>();
    const { id } = route.params as { id: string };

    const [tournament, setTournament] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    useEffect(() => {
        fetchTournamentDetails();
    }, [id]);

    const fetchTournamentDetails = async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const response = await authenticatedFetch(ENDPOINTS.GET_TOURNAMENT_OVERVIEW(id));
            if (response.ok) {
                const data = await response.json();
                const rawData = data.result || data;
                setTournament({
                    ...rawData,
                    id: rawData.id || rawData.Id,
                    status: rawData.status !== undefined ? rawData.status : rawData.Status,
                    name: rawData.name || rawData.Name,
                    createdBy: rawData.createdBy || rawData.createdby || rawData.CreatedBy,
                    // Backend serializes this as `registrationDeadLine` (capital L — a DTO typo that
                    // shipped wide). EditTournamentModal reads `registrationDeadline`, so normalize
                    // every spelling here or the deadline field opens blank even though it's set.
                    // Mirrors the details-screen and web normalizers.
                    registrationDeadline: rawData.registrationDeadline || rawData.RegistrationDeadLine || rawData.registrationDeadLine,
                });
            } else if (response.status === 404) {
                setTournament(null);
                setLoadError(t('manage.notExists'));
            } else {
                setTournament(null);
                setLoadError(t('manage.loadFailed'));
            }
        } catch (error) {
            console.error('Error fetching tournament details:', error);
            setTournament(null);
            setLoadError(t('manage.noServer'));
        } finally {
            setIsLoading(false);
        }
    };

    const promptCancelTournament = () => {
        Alert.alert(
            t('manage.cancelTitle'),
            t('manage.cancelMessage'),
            [
                { text: tCommon('no'), style: 'cancel' },
                { text: t('manage.yesCancel'), style: 'destructive', onPress: handleCancelTournament }
            ]
        );
    };

    const handleCancelTournament = async () => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.CANCEL_TOURNAMENT(id), {
                method: 'POST'
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(t('manage.cancelFailedWith', { text }));
            }

            setStatusModalConfig({
                type: 'success',
                title: tCommon('success'),
                message: t('manage.cancelled')
            });
            setShowStatusModal(true);
            fetchTournamentDetails();
        } catch (err: any) {
            console.error('Cancel tournament error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: err.message || t('manage.cancelFailed')
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    const promptDeleteTournament = () => {
        Alert.alert(
            t('manage.deleteTitle'),
            t('manage.deleteMessage'),
            [
                { text: tCommon('no'), style: 'cancel' },
                { text: t('manage.yesDelete'), style: 'destructive', onPress: handleDeleteTournament }
            ]
        );
    };

    const handleDeleteTournament = async () => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.HARD_DELETE_TOURNAMENT(id), {
                method: 'DELETE'
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(t('manage.deleteFailedWith', { text }));
            }

            setStatusModalConfig({
                type: 'success',
                title: tCommon('success'),
                message: t('manage.deleted')
            });
            setShowStatusModal(true);
            setTimeout(() => {
                navigation.navigate('MainTabs' as any);
            }, 1000);
        } catch (err: any) {
            console.error('Delete tournament error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: err.message || t('manage.deleteFailed')
            });
            setShowStatusModal(true);
            setIsLoading(false);
        }
    };

    if (isLoading && !tournament) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title={t('manage.title')} showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                </View>
            </SafeAreaView>
        );
    }

    // If fetch failed and we have no tournament loaded, lock the screen
    // down to an error message so the user can't trigger destructive
    // actions (delete, cancel) against an id that doesn't exist anymore.
    if (!tournament) {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <PageHeader title={t('manage.title')} showBack />
                <View className="flex-1 items-center justify-center px-8">
                    <View className="w-16 h-16 rounded-3xl bg-red-500/10 items-center justify-center border border-red-500/20 mb-4">
                        <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
                    </View>
                    <Text className="text-white font-black text-lg text-center">{t('manage.cantLoad')}</Text>
                    <Text className="text-slate-400 text-sm text-center mt-2 font-medium">
                        {loadError || t('manage.notFound')}
                    </Text>
                    <View className="flex-row gap-3 mt-6">
                        <Pressable
                            onPress={fetchTournamentDetails}
                            className="bg-emerald-500 px-5 py-3 rounded-2xl active:opacity-80"
                        >
                            <Text className="text-primary-foreground font-black text-sm uppercase tracking-wider">{tCommon('retry')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => navigation.goBack()}
                            className="bg-white/5 border border-white/10 px-5 py-3 rounded-2xl active:opacity-80"
                        >
                            <Text className="text-slate-300 font-black text-sm uppercase tracking-wider">{t('manage.goBack')}</Text>
                        </Pressable>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title={t('manage.title')} showBack />

            <ScrollView className="flex-1 px-6">
                <View className="items-center py-8 mb-2">
                    <View className="w-20 h-20 rounded-3xl bg-primary/10 items-center justify-center border border-primary/20 mb-4">
                        <Ionicons name="trophy" size={40} color="#10B981" />
                    </View>
                    <Text className="text-2xl font-black text-white text-center">{tournament?.name}</Text>
                    <Text className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-2">
                        {tournament?.status === 0 ? (tournament?.registrationOpensAt ? t('manage.statusScheduled') : t('details.statusOpen')) : 
                         tournament?.status === 1 ? t('details.statusUpcoming') :
                         tournament?.status === 2 ? t('details.statusRegClosed') :
                         tournament?.status === 3 ? t('details.statusLive') :
                         tournament?.status === 4 ? t('details.statusCompleted') : t('details.statusIdle')}
                    </Text>
                </View>

                <View className="gap-5">
                    <View>
                        <SectionLabel icon="trophy" title={t('manage.sectionTournament')} />
                        <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                            <MenuItem
                                icon="create-outline"
                                label={t('manage.editInfo')}
                                onPress={() => setShowEditModal(true)}
                                isLast
                            />
                        </View>
                    </View>

                    {(tournament?.status === 3 ||
                        tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2) && (
                        <View>
                            <SectionLabel icon="exit-outline" title={t('manage.sectionAdminActions')} color={COLORS.destructive} />
                            <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                                {tournament?.status === 3 && (
                                    <MenuItem
                                        icon="stop-circle-outline"
                                        label={t('manage.cancelTitle')}
                                        onPress={promptCancelTournament}
                                        destructive
                                        showChevron={false}
                                        isLast
                                    />
                                )}
                                {(tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2) && (
                                    <MenuItem
                                        icon="trash-outline"
                                        label={t('manage.deleteTitle')}
                                        onPress={promptDeleteTournament}
                                        destructive
                                        showChevron={false}
                                        isLast
                                    />
                                )}
                            </View>
                        </View>
                    )}
                </View>

                <View className="h-10" />
            </ScrollView>

            <EditTournamentModal
                visible={showEditModal}
                tournament={tournament}
                onClose={() => setShowEditModal(false)}
                onSaveSuccess={() => {
                    setShowEditModal(false);
                    fetchTournamentDetails();
                }}
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
