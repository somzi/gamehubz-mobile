import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type HubMembersScreenRouteProp = RouteProp<RootStackParamList, 'HubMembers'>;

interface JoinRequest {
    requestId: string;
    userId: string;
    hubId: string;
    username: string;
    avatarUrl?: string;
    requestedAt: string;
}

export default function HubMembersScreen() {
    const route = useRoute<HubMembersScreenRouteProp>();
    const { hubId } = route.params;
    const { user: currentUser } = useAuth();

    const [activeTab, setActiveTab] = useState<'members' | 'requests'>('members');
    const [members, setMembers] = useState<any[]>([]);
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRequestsLoading, setIsRequestsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    const fetchMembers = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_MEMBERS(hubId));
            if (response.ok) {
                const data = await response.json();
                setMembers(data.result || data || []);
            }
        } catch (error) {
            console.error('Error fetching hub members:', error);
        } finally {
            setIsLoading(false);
        }
    }, [hubId]);

    const fetchRequests = useCallback(async () => {
        try {
            setIsRequestsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_JOIN_REQUESTS(hubId));
            if (response.ok) {
                const data = await response.json();
                setRequests(data.result || data || []);
            }
        } catch (error) {
            console.error('Error fetching join requests:', error);
        } finally {
            setIsRequestsLoading(false);
        }
    }, [hubId]);

    useFocusEffect(
        useCallback(() => {
            fetchMembers();
            fetchRequests();
        }, [fetchMembers, fetchRequests])
    );

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

    const handleApprove = async (requestId: string, username: string) => {
        setProcessingIds(prev => new Set(prev).add(requestId));
        try {
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_HUB_JOIN_REQUEST(requestId), {
                method: 'POST'
            });
            if (response.ok) {
                setRequests(prev => prev.filter(r => r.requestId !== requestId));
                fetchMembers();
            } else {
                Alert.alert('Error', `Failed to approve request from ${username}.`);
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred.');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(requestId);
                return next;
            });
        }
    };

    const handleReject = (requestId: string, username: string) => {
        Alert.alert(
            'Reject Request',
            `Reject join request from ${username}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: async () => {
                        setProcessingIds(prev => new Set(prev).add(requestId));
                        try {
                            const response = await authenticatedFetch(ENDPOINTS.REJECT_HUB_JOIN_REQUEST(requestId), {
                                method: 'POST'
                            });
                            if (response.ok) {
                                setRequests(prev => prev.filter(r => r.requestId !== requestId));
                            } else {
                                Alert.alert('Error', 'Failed to reject request.');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'An unexpected error occurred.');
                        } finally {
                            setProcessingIds(prev => {
                                const next = new Set(prev);
                                next.delete(requestId);
                                return next;
                            });
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

    const filteredRequests = requests.filter(r =>
        r.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const tabs = [
        { value: 'members' as const, label: 'Members', icon: 'people-outline' as const, count: members.length },
        { value: 'requests' as const, label: 'Requests', icon: 'mail-outline' as const, count: requests.length },
    ];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Hub Members" showBack />

            {/* Tabs */}
            <View className="px-4 pt-2 pb-1">
                <View className="flex-row bg-[#0D1525] rounded-2xl border border-white/[0.06] p-1.5" style={{ gap: 6 }}>
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.value;
                        return (
                            <Pressable
                                key={tab.value}
                                onPress={() => setActiveTab(tab.value)}
                                className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${isActive ? 'bg-indigo-500/15 border border-indigo-500/25' : ''}`}
                                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                            >
                                <Ionicons name={tab.icon} size={15} color={isActive ? '#818CF8' : '#475569'} />
                                <Text className={`text-sm font-black ${isActive ? 'text-white' : 'text-slate-600'}`}>
                                    {tab.label}
                                </Text>
                                {tab.count > 0 && (
                                    <View className={`px-2 py-0.5 rounded-full ${isActive ? 'bg-indigo-500/25' : 'bg-white/[0.05]'}`}>
                                        <Text className={`text-[10px] font-black ${isActive ? 'text-indigo-300' : 'text-slate-500'}`}>
                                            {tab.count}
                                        </Text>
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View className="px-4 py-2">
                <View className="flex-row items-center bg-card px-3 rounded-xl border border-white/5">
                    <Ionicons name="search-outline" size={20} color="#71717A" />
                    <TextInput
                        className="flex-1 h-12 text-white ml-2"
                        placeholder={activeTab === 'members' ? 'Search members...' : 'Search requests...'}
                        placeholderTextColor="#71717A"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {activeTab === 'members' ? (
                isLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#8B5CF6" />
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-4">
                        {filteredMembers.length > 0 ? (
                            filteredMembers.map((member, index) => {
                                const mId = member.UserId || member.userId || member.id || member.Id || member.ID;
                                const mName = member.Username || member.username || member.Name || member.name || 'Unknown';
                                const mNick = member.Nickname || member.nickname || member.nickName || '';

                                return (
                                    <View
                                        key={mId || `member-${index}`}
                                        className="flex-row items-center justify-between py-4 border-b border-white/5"
                                    >
                                        <View className="flex-row items-center gap-3">
                                            <PlayerAvatar name={mName} size="md" />
                                            <View>
                                                <Text className="text-white font-medium text-base">{mName}</Text>
                                                {mNick ? <Text className="text-gray-500 text-xs">{mNick}</Text> : null}
                                            </View>
                                        </View>

                                        {mId !== currentUser?.id && (
                                            <Pressable
                                                onPress={() => {
                                                    if (!mId) {
                                                        Alert.alert('Error', 'Could not identify this user.');
                                                        return;
                                                    }
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
                )
            ) : (
                isRequestsLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#818CF8" />
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-4">
                        {filteredRequests.length > 0 ? (
                            filteredRequests.map((request) => {
                                const isProcessing = processingIds.has(request.requestId);
                                return (
                                    <View
                                        key={request.requestId}
                                        className="flex-row items-center justify-between py-4 border-b border-white/5"
                                    >
                                        <View className="flex-row items-center gap-3 flex-1 mr-2">
                                            <PlayerAvatar name={request.username} src={request.avatarUrl} size="md" />
                                            <View className="flex-1">
                                                <Text className="text-white font-medium text-base" numberOfLines={1}>
                                                    {request.username}
                                                </Text>
                                                <Text className="text-gray-500 text-xs">
                                                    Requested {new Date(request.requestedAt).toLocaleDateString()}
                                                </Text>
                                            </View>
                                        </View>

                                        <View className="flex-row gap-2">
                                            <Pressable
                                                onPress={() => handleApprove(request.requestId, request.username)}
                                                disabled={isProcessing}
                                                className="bg-emerald-500/15 border border-emerald-500/30 w-10 h-10 rounded-xl items-center justify-center"
                                                style={({ pressed }) => ({ opacity: (pressed || isProcessing) ? 0.6 : 1 })}
                                            >
                                                {isProcessing ? (
                                                    <ActivityIndicator size="small" color="#10B981" />
                                                ) : (
                                                    <Ionicons name="checkmark" size={20} color="#10B981" />
                                                )}
                                            </Pressable>
                                            <Pressable
                                                onPress={() => handleReject(request.requestId, request.username)}
                                                disabled={isProcessing}
                                                className="bg-red-500/15 border border-red-500/30 w-10 h-10 rounded-xl items-center justify-center"
                                                style={({ pressed }) => ({ opacity: (pressed || isProcessing) ? 0.6 : 1 })}
                                            >
                                                <Ionicons name="close" size={20} color="#EF4444" />
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            })
                        ) : (
                            <View className="items-center py-20">
                                <View className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-4">
                                    <Ionicons name="mail-outline" size={28} color="#334155" />
                                </View>
                                <Text className="text-sm font-semibold text-slate-500">No pending requests</Text>
                                <Text className="text-xs text-slate-600 mt-1">New join requests will appear here</Text>
                            </View>
                        )}
                    </ScrollView>
                )
            )}
        </SafeAreaView>
    );
}
