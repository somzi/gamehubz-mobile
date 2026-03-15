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

type ManageTournamentScreenRouteProp = RouteProp<RootStackParamList, 'ManageTournament'>;
type ManageTournamentScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface MenuItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    color?: string;
    showChevron?: boolean;
    destructive?: boolean;
}

function MenuItem({ icon, label, onPress, color = "#94A3B8", showChevron = true, destructive = false }: MenuItemProps) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center justify-between py-5 border-b border-white/5"
        >
            <View className="flex-row items-center gap-4">
                <View className={`w-10 h-10 rounded-xl items-center justify-center ${destructive ? 'bg-red-500/10' : 'bg-white/5'}`}>
                    <Ionicons name={icon} size={20} color={destructive ? '#EF4444' : color} />
                </View>
                <Text className={`font-semibold text-base ${destructive ? 'text-red-500' : 'text-white'}`}>{label}</Text>
            </View>
            {showChevron && <Ionicons name="chevron-forward" size={18} color="#3F3F46" />}
        </Pressable>
    );
}

export default function ManageTournamentScreen() {
    const route = useRoute<ManageTournamentScreenRouteProp>();
    const navigation = useNavigation<ManageTournamentScreenNavigationProp>();
    const { id } = route.params as { id: string };

    const [tournament, setTournament] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
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
                });
            }
        } catch (error) {
            console.error('Error fetching tournament details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const promptCancelTournament = () => {
        Alert.alert(
            "Cancel Tournament",
            "Are you sure you want to cancel this tournament?",
            [
                { text: "No", style: "cancel" },
                { text: "Yes, Cancel", style: "destructive", onPress: handleCancelTournament }
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
                throw new Error(`Failed to cancel tournament: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Tournament cancelled successfully!'
            });
            setShowStatusModal(true);
            fetchTournamentDetails();
        } catch (err: any) {
            console.error('Cancel tournament error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to cancel tournament'
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    const promptDeleteTournament = () => {
        Alert.alert(
            "Delete Tournament",
            "Are you sure you want to permanently delete this tournament?",
            [
                { text: "No", style: "cancel" },
                { text: "Yes, Delete", style: "destructive", onPress: handleDeleteTournament }
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
                throw new Error(`Failed to delete tournament: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Tournament deleted successfully!'
            });
            setShowStatusModal(true);
            setTimeout(() => {
                navigation.navigate('MainTabs' as any);
            }, 1000);
        } catch (err: any) {
            console.error('Delete tournament error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to delete tournament'
            });
            setShowStatusModal(true);
            setIsLoading(false);
        }
    };

    if (isLoading && !tournament) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]">
                <PageHeader title="Manage Tournament" showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            <PageHeader title="Manage Tournament" showBack />

            <ScrollView className="flex-1 px-6">
                <View className="items-center py-8 border-b border-white/5 mb-6">
                    <View className="w-20 h-20 rounded-3xl bg-primary/10 items-center justify-center border border-primary/20 mb-4">
                        <Ionicons name="trophy" size={40} color="#10B981" />
                    </View>
                    <Text className="text-2xl font-black text-white text-center">{tournament?.name}</Text>
                    <Text className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-2">
                        {tournament?.status === 0 ? 'Open' : 
                         tournament?.status === 1 ? 'Upcoming' :
                         tournament?.status === 2 ? 'Reg. Closed' :
                         tournament?.status === 3 ? 'Live' :
                         tournament?.status === 4 ? 'Completed' : 'IDLE'}
                    </Text>
                </View>

                <View className="space-y-1">
                    <MenuItem
                        icon="create-outline"
                        label="Edit Tournament Info"
                        onPress={() => setShowEditModal(true)}
                    />
                    
                    {tournament?.status === 3 && (
                        <MenuItem
                            icon="stop-circle-outline"
                            label="Cancel Tournament"
                            onPress={promptCancelTournament}
                            destructive
                        />
                    )}

                    {(tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2) && (
                        <MenuItem
                            icon="trash-outline"
                            label="Delete Tournament"
                            onPress={promptDeleteTournament}
                            destructive
                        />
                    )}
                </View>
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
