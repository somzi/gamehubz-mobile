import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    ActivityIndicator,
    Pressable,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { StatusModal } from '../components/modals/StatusModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { TEAM_LABELS } from '../lib/teamConstants';
import {
    renameTeam,
    kickMember,
    leaveTeam,
    deleteTeam,
    getTeamJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
} from '../lib/teamApi';
import { ENDPOINTS, authenticatedFetch, getErrorMessage, API_BASE_URL } from '../lib/api';
import type { TeamDto, TeamJoinRequestDto } from '../types/team';

type TeamDashboardRouteProp = RouteProp<RootStackParamList, 'TeamDashboard'>;

export default function TeamDashboardScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const route = useRoute<TeamDashboardRouteProp>();
    const { teamId, tournamentId, tournamentStatus } = route.params;
    const { user } = useAuth();

    const [team, setTeam] = useState<TeamDto | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'members' | 'requests'>('members');

    // Join Requests
    const [joinRequests, setJoinRequests] = useState<TeamJoinRequestDto[]>([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(false);

    // Editing team name
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);

    // Confirmation modals
    const [confirmModal, setConfirmModal] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isDestructive: boolean;
        onConfirm: () => void;
        isLoading: boolean;
    }>({
        visible: false,
        title: '',
        message: '',
        isDestructive: true,
        onConfirm: () => { },
        isLoading: false,
    });

    // Status modal
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
        onClose?: () => void;
    }>({ type: 'success', title: '', message: '' });

    const [isRegistering, setIsRegistering] = useState(false);

    const fetchTeam = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const url = `${API_BASE_URL}/api/tournament/${tournamentId}/myTeam`;
            const response = await authenticatedFetch(url);
            if (!response.ok) throw new Error('Team not found');
            const teamData = await response.json();
            if (Array.isArray(teamData)) {
                const myTeam = teamData.find(t => {
                    const captainId = t.captainUserId || t.CaptainUserId;
                    if (captainId?.toLowerCase() === user?.id?.toLowerCase()) return true;
                    const members = t.members || t.Members || [];
                    return members.some((m: any) => (m.userId || m.UserId)?.toLowerCase() === user?.id?.toLowerCase());
                }) || teamData[0];
                setTeam(myTeam);
            } else {
                setTeam(teamData);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : TEAM_LABELS.ERROR_FETCH_TEAMS;
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [tournamentId, user?.id]);

    const fetchRequests = useCallback(async (tid: string) => {
        setIsLoadingRequests(true);
        try {
            const requests = await getTeamJoinRequests(tid);
            setJoinRequests(requests);
        } catch (err) {
            console.error('Error fetching join requests', err);
        } finally {
            setIsLoadingRequests(false);
        }
    }, []);

    useEffect(() => {
        fetchTeam();
    }, [fetchTeam]);

    useEffect(() => {
        const captainId = team?.captainUserId || team?.CaptainUserId;
        const isCap = !!user?.id && !!captainId && user.id.toLowerCase() === captainId.toLowerCase();
        if (team?.teamId && isCap) {
            fetchRequests(team.teamId);
        }
    }, [team, user?.id, fetchRequests]);

    const actualTeamSize = route.params.teamSize || team?.teamSize || team?.TeamSize || 2;
    const actualMemberCount = team?.memberCount || team?.MemberCount || team?.members?.length || 1;
    const isAlreadyRegistered = team?.isAlreadyRegistered || team?.IsAlreadyRegistered || team?.isAlreadyRegistred || team?.IsAlreadyRegistred;
    const isRegistrationAccepted = team?.isRegistrationAccepted || team?.IsRegistrationAccepted;
    const captainId = team?.captainUserId || team?.CaptainUserId;
    const isCaptain = !!user?.id && !!captainId && user.id.toLowerCase() === captainId.toLowerCase();

    // Hide Requests tab if team is registered or accepted
    const showRequestsTab = isCaptain && !isAlreadyRegistered && !isRegistrationAccepted;

    // --- Actions ---

    const handleStartEditName = () => {
        setEditedName(team?.teamName || '');
        setIsEditingName(true);
    };

    const handleSaveName = async () => {
        if (!team || !editedName.trim()) return;
        setIsSavingName(true);
        try {
            const updated = await renameTeam(team.teamId, editedName.trim());
            setTeam(updated);
            setIsEditingName(false);
        } catch (err: unknown) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
            setShowStatusModal(true);
        } finally {
            setIsSavingName(false);
        }
    };

    const handleLeaveTeam = () => {
        setConfirmModal({
            visible: true,
            title: TEAM_LABELS.CONFIRM_LEAVE_TITLE,
            message: TEAM_LABELS.CONFIRM_LEAVE_MESSAGE,
            isDestructive: true,
            isLoading: false,
            onConfirm: async () => {
                if (!team || !user?.id) return;
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await leaveTeam(team.teamId);
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    navigation.goBack();
                } catch (err: unknown) {
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
                    setShowStatusModal(true);
                }
            },
        });
    };

    const handleKickMember = (userId: string, username: string) => {
        setConfirmModal({
            visible: true,
            title: TEAM_LABELS.CONFIRM_KICK_TITLE,
            message: `${TEAM_LABELS.CONFIRM_KICK_MESSAGE}\n\nPlayer: ${username}`,
            isDestructive: true,
            isLoading: false,
            onConfirm: async () => {
                if (!team) return;
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await kickMember(team.teamId, userId);
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    fetchTeam();
                } catch (err: unknown) {
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
                    setShowStatusModal(true);
                }
            },
        });
    };

    const handleDeleteTeam = () => {
        setConfirmModal({
            visible: true,
            title: TEAM_LABELS.CONFIRM_DELETE_TITLE,
            message: TEAM_LABELS.CONFIRM_DELETE_MESSAGE,
            isDestructive: true,
            isLoading: false,
            onConfirm: async () => {
                if (!team) return;
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await deleteTeam(team.teamId);
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    navigation.goBack();
                } catch (err: unknown) {
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
                    setShowStatusModal(true);
                }
            },
        });
    };

    const handleRegisterTeam = async () => {
        if (!team || !user?.id) return;
        setIsRegistering(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REGISTER_TEAM_IN_TOURNAMENT(tournamentId, team.teamId), {
                method: 'GET',
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || TEAM_LABELS.ERROR_REGISTER_TEAM);
            }
            setStatusModalConfig({
                type: 'success',
                title: 'Team Registered!',
                message: 'Your team has been successfully registered for the tournament.',
                onClose: () => {
                    navigation.navigate('TournamentDetails', { id: tournamentId });
                }
            });
            setShowStatusModal(true);
        } catch (err: unknown) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
            setShowStatusModal(true);
        } finally {
            setIsRegistering(false);
        }
    };

    const handleApproveRequest = async (requestId: string) => {
        try {
            await approveJoinRequest(requestId);
            setStatusModalConfig({ type: 'success', title: 'Success', message: 'Player approved and added to the team!' });
            setShowStatusModal(true);
            fetchTeam();
            if (team?.teamId) fetchRequests(team.teamId);
        } catch (err: unknown) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
            setShowStatusModal(true);
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            await rejectJoinRequest(requestId);
            if (team?.teamId) fetchRequests(team.teamId);
        } catch (err: unknown) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
            setShowStatusModal(true);
        }
    };

    // --- Loading / Error States ---

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]">
                <PageHeader title={TEAM_LABELS.TEAM_DASHBOARD_TITLE} showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#00E5A0" />
                    <Text className="text-slate-400 mt-4">Loading team...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error || !team) {
        return (
            <SafeAreaView className="flex-1 bg-[#0F172A]">
                <PageHeader title={TEAM_LABELS.TEAM_DASHBOARD_TITLE} showBack />
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-red-400 mt-4 text-center font-medium">{error || 'Team not found'}</Text>
                    <Button onPress={fetchTeam} className="mt-6">Retry</Button>
                </View>
            </SafeAreaView>
        );
    }

    const memberProgress = actualMemberCount / actualTeamSize;
    const members = team.members || team.Members || [];

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]">
            <PageHeader title={TEAM_LABELS.TEAM_DASHBOARD_TITLE} showBack />

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero Section ── */}
                <View className="px-5 pt-5 pb-4">
                    {/* Team name row */}
                    <View className="flex-row items-center gap-3 mb-5">
                        {isEditingName ? (
                            <View className="flex-1 flex-row items-center gap-2">
                                <TextInput
                                    className="flex-1 bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-[#00E5A0]/30 text-lg font-bold"
                                    value={editedName}
                                    onChangeText={setEditedName}
                                    autoFocus
                                    placeholderTextColor="#6b7280"
                                />
                                <Pressable
                                    onPress={handleSaveName}
                                    disabled={isSavingName}
                                    className="w-10 h-10 rounded-xl bg-[#00E5A0]/20 items-center justify-center border border-[#00E5A0]/30"
                                >
                                    {isSavingName ? (
                                        <ActivityIndicator size="small" color="#00E5A0" />
                                    ) : (
                                        <Ionicons name="checkmark" size={20} color="#00E5A0" />
                                    )}
                                </Pressable>
                                <Pressable
                                    onPress={() => setIsEditingName(false)}
                                    className="w-10 h-10 rounded-xl bg-white/5 items-center justify-center border border-white/10"
                                >
                                    <Ionicons name="close" size={20} color="#94A3B8" />
                                </Pressable>
                            </View>
                        ) : (
                            <>
                                <View className="flex-1">
                                    <Text className="text-3xl font-black text-white" numberOfLines={2}>
                                        {team.teamName}
                                    </Text>
                                    <Text className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                                        {isCaptain ? 'You are the Captain' : 'Team Member'}
                                    </Text>
                                </View>

                                {isCaptain && Number(tournamentStatus) === 1 && !isRegistrationAccepted && (
                                    <Pressable
                                        onPress={handleStartEditName}
                                        className="w-10 h-10 rounded-xl bg-white/5 items-center justify-center border border-white/10"
                                    >
                                        <Ionicons name="pencil" size={18} color="#94A3B8" />
                                    </Pressable>
                                )}
                            </>
                        )}
                    </View>

                    {/* Member count card */}
                    <View className="bg-[#131B2E] rounded-3xl border border-white/5 p-5 shadow-md shadow-black/20">
                        <View className="flex-row items-center justify-between mb-3">
                            <View className="flex-row items-center gap-2">
                                <Ionicons name="people" size={18} color="#00E5A0" />
                                <Text className="text-sm font-bold text-white">{TEAM_LABELS.MEMBERS_LABEL}</Text>
                            </View>
                            <Text className="text-sm font-black text-[#00E5A0]">
                                {actualMemberCount} / {actualTeamSize}
                            </Text>
                        </View>

                        {/* Progress bar */}
                        <View className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <View
                                className="h-full rounded-full"
                                style={{
                                    width: `${Math.min(memberProgress * 100, 100)}%`,
                                    backgroundColor: memberProgress >= 1 ? '#00E5A0' : '#F59E0B',
                                }}
                            />
                        </View>

                        {/* Dot indicators */}
                        <View className="flex-row gap-2 mt-3 justify-center">
                            {Array.from({ length: actualTeamSize }).map((_, i) => (
                                <View
                                    key={i}
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: i < actualMemberCount ? '#00E5A0' : 'rgba(255,255,255,0.1)' }}
                                />
                            ))}
                        </View>
                    </View>
                </View>

                {/* ── Registration Status Banner ── */}
                {isCaptain && actualMemberCount === actualTeamSize && (
                    <View className="px-5 pb-4">
                        {isRegistrationAccepted ? (
                            <View className="w-full bg-[#10B981]/10 p-4 rounded-2xl border border-[#10B981]/20 flex-row justify-center gap-2 items-center">
                                <Ionicons name="shield-checkmark" size={20} color="#10B981" />
                                <Text className="text-[#10B981] font-black uppercase tracking-widest text-sm">Accepted</Text>
                            </View>
                        ) : isAlreadyRegistered ? (
                            <View className="w-full bg-[#F59E0B]/10 p-4 rounded-2xl border border-[#F59E0B]/20 flex-row justify-center gap-2 items-center">
                                <Ionicons name="hourglass-outline" size={20} color="#F59E0B" />
                                <Text className="text-[#F59E0B] font-black uppercase tracking-widest text-sm">Registered – Pending Approval</Text>
                            </View>
                        ) : (
                            <Button className="w-full bg-[#00E5A0]" onPress={handleRegisterTeam} loading={isRegistering}>
                                {TEAM_LABELS.REGISTER_TEAM_BUTTON}
                            </Button>
                        )}
                    </View>
                )}

                {/* ── Tabs ── */}
                <View className="px-5 pb-3">
                    <View className="flex-row bg-[#131B2E] p-1 rounded-2xl border border-white/5">
                        <Pressable
                            onPress={() => setActiveTab('members')}
                            className={`flex-1 py-2.5 items-center justify-center rounded-xl ${activeTab === 'members' ? 'bg-[#00E5A0]/10 border border-[#00E5A0]/20' : ''}`}
                        >
                            <Text className={`font-black text-[11px] uppercase tracking-wider ${activeTab === 'members' ? 'text-[#00E5A0]' : 'text-slate-500'}`}>
                                Members
                            </Text>
                        </Pressable>

                        {showRequestsTab && (
                            <Pressable
                                onPress={() => setActiveTab('requests')}
                                className={`flex-1 py-2.5 items-center justify-center rounded-xl ${activeTab === 'requests' ? 'bg-[#F59E0B]/10 border border-[#F59E0B]/20' : ''}`}
                            >
                                <View className="flex-row items-center gap-1.5">
                                    <Text className={`font-black text-[11px] uppercase tracking-wider ${activeTab === 'requests' ? 'text-[#F59E0B]' : 'text-slate-500'}`}>
                                        Requests
                                    </Text>
                                    {joinRequests.length > 0 && (
                                        <View className="w-5 h-5 rounded-full bg-[#F59E0B] items-center justify-center">
                                            <Text className="text-[9px] font-black text-[#0F172A]">{joinRequests.length}</Text>
                                        </View>
                                    )}
                                </View>
                            </Pressable>
                        )}
                    </View>
                </View>

                {/* Members List */}
                {activeTab === 'members' && (
                    <View className="px-5 gap-2">
                        {(() => {
                            const sortedMembers = [...(team.members || team.Members || [])].sort((a: any, b: any) => {
                                const aId = a.userId || a.UserId;
                                const bId = b.userId || b.UserId;
                                const aIsCap = a.isCaptain || a.IsCaptain || aId?.toLowerCase() === captainId?.toLowerCase();
                                const bIsCap = b.isCaptain || b.IsCaptain || bId?.toLowerCase() === captainId?.toLowerCase();
                                if (aIsCap && !bIsCap) return -1;
                                if (!aIsCap && bIsCap) return 1;
                                return 0;
                            });

                            if (sortedMembers.length === 0) {
                                return (
                                    <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={40} color="#71717A" />
                                        <Text className="text-slate-400 mt-3 text-center">No members yet</Text>
                                    </View>
                                );
                            }

                            return sortedMembers.map((member: any) => {
                                const memberId = member.userId || member.UserId;
                                const memberUsername = member.username || member.Username;
                                const memberAvatar = member.avatarUrl || member.AvatarUrl;
                                const memIsCaptain = member.isCaptain || member.IsCaptain || memberId?.toLowerCase() === captainId?.toLowerCase();
                                const isCurrentUser = user?.id?.toLowerCase() === memberId?.toLowerCase();

                                return (
                                    <View
                                        key={memberId}
                                        className={`p-4 rounded-[22px] border flex-row items-center gap-3 shadow-sm ${memIsCaptain ? 'bg-[#F59E0B]/5 border-[#F59E0B]/15' : 'bg-[#131B2E]/60 border-white/5'}`}
                                    >
                                        <PlayerAvatar
                                            name={memberUsername}
                                            src={memberAvatar}
                                            size="md"
                                        />
                                        <View className="flex-1">
                                            <View className="flex-row items-center gap-2">
                                                <Text className="font-bold text-base text-white">{memberUsername}</Text>
                                                {isCurrentUser && (
                                                    <View className="bg-white/10 px-1.5 py-0.5 rounded-full">
                                                        <Text className="text-[9px] text-slate-400 font-black uppercase">You</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {memIsCaptain && (
                                                <View className="flex-row items-center gap-1 mt-0.5">
                                                    <Ionicons name="shield-checkmark" size={11} color="#F59E0B" />
                                                    <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-wider">
                                                        {TEAM_LABELS.CAPTAIN_BADGE}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>

                                        {/* Captain can kick non-captain members while registration open */}
                                        {isCaptain && !memIsCaptain && Number(tournamentStatus) === 1 && !isAlreadyRegistered && !isRegistrationAccepted && (
                                            <Pressable
                                                onPress={() => handleKickMember(memberId, memberUsername)}
                                                className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                            >
                                                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                            </Pressable>
                                        )}
                                    </View>
                                );
                            });
                        })()}
                    </View>
                )}

                {/* ── Requests Tab ── */}
                {activeTab === 'requests' && showRequestsTab && (
                    <View className="px-5 gap-2">
                        {isLoadingRequests ? (
                            <ActivityIndicator size="small" color="#F59E0B" />
                        ) : joinRequests.length === 0 ? (
                            <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                <Ionicons name="mail-unread-outline" size={40} color="#71717A" />
                                <Text className="text-slate-400 mt-3 text-center">No join requests yet</Text>
                            </View>
                        ) : (
                            joinRequests.map((req, idx) => {
                                const requestId = req.requestId || req.RequestId || idx.toString();
                                const reqUsername = req.username || req.Username || 'Unknown';
                                const reqAvatar = req.avatarUrl || req.AvatarUrl;

                                return (
                                    <View
                                        key={requestId}
                                        className="bg-[#F59E0B]/5 p-4 rounded-[22px] border border-[#F59E0B]/15 flex-row items-center gap-3"
                                    >
                                        <PlayerAvatar name={reqUsername} src={reqAvatar} size="md" />
                                        <View className="flex-1">
                                            <Text className="font-bold text-base text-white">{reqUsername}</Text>
                                            <View className="flex-row items-center gap-1 mt-0.5">
                                                <Ionicons name="person-add-outline" size={11} color="#F59E0B" />
                                                <Text className="text-[10px] text-[#F59E0B] font-bold">Wants to join</Text>
                                            </View>
                                        </View>
                                        <View className="flex-row items-center gap-2">
                                            <Pressable
                                                onPress={() => handleRejectRequest(requestId)}
                                                className="w-10 h-10 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                            >
                                                <Ionicons name="close" size={18} color="#EF4444" />
                                            </Pressable>
                                            <Pressable
                                                onPress={() => handleApproveRequest(requestId)}
                                                className="w-10 h-10 rounded-xl bg-[#10B981]/10 items-center justify-center border border-[#10B981]/20 active:opacity-60"
                                            >
                                                <Ionicons name="checkmark" size={18} color="#10B981" />
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                )}

                {/* ── Danger Zone (Leave / Delete) ── */}
                {Number(tournamentStatus) === 1 && !isAlreadyRegistered && !isRegistrationAccepted && (
                    <View className="px-5 mt-6 gap-3">
                        <Button
                            variant="outline"
                            className="w-full border-red-500/30"
                            onPress={handleLeaveTeam}
                        >
                            {TEAM_LABELS.LEAVE_TEAM_BUTTON}
                        </Button>

                        {isCaptain && (
                            <Button
                                variant="destructive"
                                className="w-full"
                                onPress={handleDeleteTeam}
                            >
                                {TEAM_LABELS.DELETE_TEAM_BUTTON}
                            </Button>
                        )}
                    </View>
                )}
            </ScrollView>

            <ConfirmationModal
                visible={confirmModal.visible}
                onClose={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
                isLoading={confirmModal.isLoading}
            />

            {showStatusModal && (
                <StatusModal
                    visible={showStatusModal}
                    type={statusModalConfig.type}
                    title={statusModalConfig.title}
                    message={statusModalConfig.message}
                    onClose={() => {
                        setShowStatusModal(false);
                        if (statusModalConfig.onClose) statusModalConfig.onClose();
                    }}
                />
            )}
        </SafeAreaView>
    );
}
