import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type HubMembersScreenRouteProp = RouteProp<RootStackParamList, 'HubMembers'>;

export default function HubMembersScreen() {
    const route = useRoute<HubMembersScreenRouteProp>();
    const { hubId } = route.params;
    const { user: currentUser } = useAuth();

    const [members, setMembers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchMembers();
    }, [hubId]);

    const fetchMembers = async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_MEMBERS(hubId));
            if (response.ok) {
                const data = await response.json();
                console.log('[HubMembers] Raw API Data:', data);
                setMembers(data.result || data || []);
            }
        } catch (error) {
            console.error('Error fetching hub members:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKick = (memberId: string, memberName: string) => {
        Alert.alert(
            'Kick Member',
            `Are you sure you want to kick ${memberName} from the hub?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Kick',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await authenticatedFetch(ENDPOINTS.KICK_HUB_MEMBER(hubId, memberId), {
                                method: 'POST'
                            });
                            if (response.ok) {
                                setMembers(prev => prev.filter(m => {
                                    const mId = m.UserId || m.userId || m.id || m.Id || m.ID;
                                    return mId !== memberId;
                                }));
                                Alert.alert('Success', `${memberName} has been kicked.`);
                            } else {
                                Alert.alert('Error', 'Failed to kick member.');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'An unexpected error occurred.');
                        }
                    }
                }
            ]
        );
    };

    const filteredMembers = members.filter(m => {
        const name = m.Username || m.username || '';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Hub Members" showBack />

            <View className="px-4 py-2">
                <View className="flex-row items-center bg-card px-3 rounded-xl border border-white/5">
                    <Ionicons name="search-outline" size={20} color="#71717A" />
                    <TextInput
                        className="flex-1 h-12 text-white ml-2"
                        placeholder="Search members..."
                        placeholderTextColor="#71717A"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#8B5CF6" />
                </View>
            ) : (
                <ScrollView className="flex-1 px-4">
                    {filteredMembers.length > 0 ? (
                        filteredMembers.map((member, index) => {
                            // Extreme flexibility to catch any backend casing
                            const mId = member.UserId || member.userId || member.id || member.Id || member.ID;
                            const mName = member.Username || member.username || member.Name || member.name || 'Unknown';
                            const mNick = member.Nickname || member.nickname || member.nickName || '';

                            if (index === 0) {
                                console.log('[HubMembers] Current User ID:', currentUser?.id);
                                console.log('[HubMembers] First Member Object:', member);
                                console.log(`[HubMembers] Mapped Member -> Name: ${mName}, ID: ${mId}`);
                            }

                            return (
                                <View
                                    key={mId || `member-${index}`}
                                    className="flex-row items-center justify-between py-4 border-b border-white/5"
                                >
                                    <View className="flex-row items-center gap-3">
                                        <PlayerAvatar name={mName} size="md" />
                                        <View>
                                            <Text className="text-white font-medium text-base">
                                                {mName}
                                            </Text>
                                            {mNick ? (
                                                <Text className="text-gray-500 text-xs">
                                                    {mNick}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>

                                    {/* Loosen comparison to allow button to show even if ID is tricky, but still hide self */}
                                    {mId !== currentUser?.id && (
                                        <Pressable
                                            onPress={() => {
                                                if (!mId) {
                                                    Alert.alert('Error', 'Could not identify this user ID. Please check server logs.');
                                                    return;
                                                }
                                                console.log(`[HubMembers] Kicking user: ${mName} (${mId})`);
                                                handleKick(mId, mName);
                                            }}
                                            className="bg-destructive/10 px-4 py-2 rounded-lg"
                                        >
                                            <Text className="text-destructive font-bold text-sm">Kick</Text>
                                        </Pressable>
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        <View className="items-center py-20 opacity-30">
                            <Ionicons name="people-outline" size={64} color="white" />
                            <Text className="text-white mt-4">No members found</Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
