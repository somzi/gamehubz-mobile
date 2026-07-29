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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { StatusModal } from '../components/modals/StatusModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { TEAM_LABELS } from '../lib/teamConstants';
import {
    renameTeam,
    kickMember,
    leaveTeam,
    deleteTeam,
    getTeamJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    swapLineupMember,
} from '../lib/teamApi';
import { LineupSwapModal, type LineupPlayer } from '../components/modals/LineupSwapModal';
import { ENDPOINTS, authenticatedFetch, getErrorMessage, API_BASE_URL } from '../lib/api';
import { shareTeam } from '../lib/share';
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

    // Substitution sheet: the bench player being brought in (null = closed).
    const [subTarget, setSubTarget] = useState<LineupPlayer | null>(null);
    const [isSwappingLineup, setIsSwappingLineup] = useState(false);
    const [lineupSwapError, setLineupSwapError] = useState<string | null>(null);

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

    // ── Lineup / bench ──────────────────────────────────────────────────────────────────────
    // TeamSize is the LINEUP size, so with reserves on the roster can legitimately be larger.
    // Every readiness check below keys off the lineup, never the roster count: a squad of 3
    // starters + 2 reserves is ready to play, 2 starters + 3 reserves is not.
    const allowReserves = Boolean(team?.allowReserves ?? team?.AllowReserves);
    const maxReserves = Number(team?.maxReserves ?? team?.MaxReserves ?? 0);
    const allMembers = team?.members || team?.Members || [];
    const isMemberReserve = (m: any) => Boolean(m?.isReserve ?? m?.IsReserve);
    const starterMembers = allMembers.filter((m: any) => !isMemberReserve(m));
    const reserveMembers = allMembers.filter((m: any) => isMemberReserve(m));
    const starterCount = starterMembers.length;
    const isLineupFull = starterCount >= actualTeamSize;

    const toLineupPlayer = (m: any): LineupPlayer => {
        const id = m.userId || m.UserId;
        return {
            userId: id,
            username: m.username || m.Username || 'Player',
            avatarUrl: m.avatarUrl || m.AvatarUrl,
            isCaptain: m.isCaptain || m.IsCaptain || id?.toLowerCase() === captainId?.toLowerCase(),
        };
    };

    // Substitutions stay open while the tournament is running — that's the point of a bench.
    // Only a closed tournament (Completed 4 / Cancelled 5 / Deleted 6) locks the lineup.
    const canSubstitute = isCaptain && allowReserves && Number(tournamentStatus ?? 0) <= 3;

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

    const handleConfirmSubstitution = async (starterUserId: string) => {
        if (!team || !subTarget) return;
        setIsSwappingLineup(true);
        setLineupSwapError(null);
        try {
            const updated = await swapLineupMember(team.teamId, starterUserId, subTarget.userId);
            setTeam(updated);
            setSubTarget(null);
            // The response carries the new roster, but the fixtures it repointed live elsewhere —
            // re-read so the lineup shown here can't drift from what the bracket now holds.
            fetchTeam();
        } catch (err: unknown) {
            setLineupSwapError(getErrorMessage(err));
        } finally {
            setIsSwappingLineup(false);
        }
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
            // Refresh so isAlreadyRegistered flips to true and the "Registered – Pending"
            // banner replaces the Register button immediately (in case the user stays on /
            // returns to this screen instead of navigating away via the modal).
            await fetchTeam();
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

    // Approving changes the roster — and with a bench, where the new player lands depends on whether
    // the lineup is already complete — so say which it will be before committing.
    const handleApproveRequest = (requestId: string, username: string) => {
        const landsOnBench = allowReserves && isLineupFull;
        setConfirmModal({
            visible: true,
            title: 'Add this player?',
            message: `${username} joins the team${allowReserves
                ? landsOnBench ? ' on the bench — the lineup is already full.' : ' in the lineup.'
                : '.'}`,
            isDestructive: false,
            isLoading: false,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await approveJoinRequest(requestId);
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    setStatusModalConfig({ type: 'success', title: 'Success', message: 'Player approved and added to the team!' });
                    setShowStatusModal(true);
                    fetchTeam();
                    if (team?.teamId) fetchRequests(team.teamId);
                } catch (err: unknown) {
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
                    setShowStatusModal(true);
                }
            },
        });
    };

    const handleRejectRequest = (requestId: string, username: string) => {
        setConfirmModal({
            visible: true,
            title: 'Decline this request?',
            message: `${username} won't join the team. They can ask again later.`,
            isDestructive: true,
            isLoading: false,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await rejectJoinRequest(requestId);
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    if (team?.teamId) fetchRequests(team.teamId);
                } catch (err: unknown) {
                    setConfirmModal(prev => ({ ...prev, visible: false, isLoading: false }));
                    setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
                    setShowStatusModal(true);
                }
            },
        });
    };

    // --- Loading / Error States ---

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background">
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
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title={TEAM_LABELS.TEAM_DASHBOARD_TITLE} showBack />
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-red-400 mt-4 text-center font-medium">{error || 'Team not found'}</Text>
                    <Button onPress={fetchTeam} className="mt-6">Retry</Button>
                </View>
            </SafeAreaView>
        );
    }

    // "Full" = the lineup is complete. The bench is optional, so an empty bench never blocks play.
    const isRosterFull = isLineupFull;
    const teamInitials = (() => {
        const words = (team.teamName || '').trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return 'T';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return (words[0][0] + words[1][0]).toUpperCase();
    })();

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title={TEAM_LABELS.TEAM_DASHBOARD_TITLE}
                showBack
                rightElement={
                    <Pressable
                        onPress={() => shareTeam(team.teamId, team.teamName)}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                        accessibilityLabel="Share team"
                    >
                        <Ionicons name="share-outline" size={20} color="#FAFAFA" />
                    </Pressable>
                }
            />

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero Section ── */}
                <View className="px-5 pt-4 pb-2">
                    <LinearGradient
                        colors={['#18273F', '#0F1A2E']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}
                    >
                        <View className="p-5">
                            {isEditingName ? (
                                <View className="flex-row items-center gap-2">
                                    <TextInput
                                        className="flex-1 bg-black/30 px-4 h-12 rounded-2xl text-white border border-team/40 text-lg font-bold"
                                        value={editedName}
                                        onChangeText={setEditedName}
                                        autoFocus
                                        placeholderTextColor="#6b7280"
                                    />
                                    <Pressable
                                        onPress={handleSaveName}
                                        disabled={isSavingName}
                                        className="w-11 h-11 rounded-2xl bg-team items-center justify-center"
                                    >
                                        {isSavingName ? (
                                            <ActivityIndicator size="small" color="#06251D" />
                                        ) : (
                                            <Ionicons name="checkmark" size={22} color="#06251D" />
                                        )}
                                    </Pressable>
                                    <Pressable
                                        onPress={() => setIsEditingName(false)}
                                        className="w-11 h-11 rounded-2xl bg-white/5 items-center justify-center border border-white/10"
                                    >
                                        <Ionicons name="close" size={22} color="#94A3B8" />
                                    </Pressable>
                                </View>
                            ) : (
                                <View className="flex-row items-center gap-4">
                                    {/* Team crest */}
                                    <LinearGradient
                                        colors={['#00E5A0', '#0AA6C9']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={{ width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Text className="text-2xl font-black text-team-foreground">{teamInitials}</Text>
                                    </LinearGradient>

                                    <View className="flex-1">
                                        <Text className="text-2xl font-black text-white" numberOfLines={2}>
                                            {team.teamName}
                                        </Text>
                                        <View className="flex-row items-center gap-1.5 mt-1.5">
                                            <Ionicons
                                                name={isCaptain ? 'shield-checkmark' : 'person'}
                                                size={12}
                                                color={isCaptain ? '#F59E0B' : '#64748B'}
                                            />
                                            <Text
                                                className="text-[11px] font-black uppercase tracking-widest"
                                                style={{ color: isCaptain ? '#F59E0B' : '#64748B' }}
                                            >
                                                {isCaptain ? 'Captain' : 'Member'}
                                            </Text>
                                        </View>
                                    </View>

                                    {isCaptain && Number(tournamentStatus) === 1 && !isRegistrationAccepted && (
                                        <Pressable
                                            onPress={handleStartEditName}
                                            className="w-10 h-10 rounded-2xl bg-white/[0.06] items-center justify-center border border-white/10 active:opacity-70"
                                        >
                                            <Ionicons name="pencil" size={16} color="#94A3B8" />
                                        </Pressable>
                                    )}
                                </View>
                            )}

                            {/* Roster capacity */}
                            {!isEditingName && (
                                <View className="mt-5 pt-4 border-t border-white/[0.06]">
                                    <View className="flex-row items-center justify-between mb-2.5">
                                        <View className="flex-row items-center gap-1.5">
                                            <Ionicons name="people" size={13} color="#64748B" />
                                            <Text className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                                {allowReserves ? 'Lineup' : 'Roster'}
                                            </Text>
                                        </View>
                                        <Text className="text-[13px] font-black">
                                            <Text style={{ color: isLineupFull ? '#00E5A0' : '#F59E0B' }}>{starterCount}</Text>
                                            <Text className="text-slate-500"> / {actualTeamSize}</Text>
                                        </Text>
                                    </View>
                                    <View className="flex-row gap-1.5">
                                        {Array.from({ length: actualTeamSize }).map((_, i) => (
                                            <View
                                                key={i}
                                                className="flex-1 h-2 rounded-full"
                                                style={{
                                                    backgroundColor: i < starterCount
                                                        ? (isLineupFull ? '#00E5A0' : '#F59E0B')
                                                        : 'rgba(255,255,255,0.07)',
                                                }}
                                            />
                                        ))}
                                    </View>

                                    {/* Bench is optional — shown so the captain can see the slots, never gating play. */}
                                    {allowReserves && maxReserves > 0 && (
                                        <View className="mt-3.5">
                                            <View className="flex-row items-center justify-between mb-2">
                                                <View className="flex-row items-center gap-1.5">
                                                    <Ionicons name="reorder-four-outline" size={13} color="#64748B" />
                                                    <Text className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                                        Bench
                                                    </Text>
                                                    <View className="px-1.5 py-[1px] rounded-full bg-white/[0.06]">
                                                        <Text className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                                                            Optional
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text className="text-[13px] font-black">
                                                    <Text style={{ color: '#818CF8' }}>{reserveMembers.length}</Text>
                                                    <Text className="text-slate-500"> / {maxReserves}</Text>
                                                </Text>
                                            </View>
                                            <View className="flex-row gap-1.5">
                                                {Array.from({ length: maxReserves }).map((_, i) => (
                                                    <View
                                                        key={`bench-${i}`}
                                                        className="flex-1 h-2 rounded-full"
                                                        style={{
                                                            backgroundColor: i < reserveMembers.length
                                                                ? 'rgba(129,140,248,0.75)'
                                                                : 'rgba(255,255,255,0.07)',
                                                        }}
                                                    />
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    </LinearGradient>
                </View>

                {/* ── Registration Status Banner ── */}
                {/* Gated on a complete LINEUP, not the roster count: with a bench the roster can be
                    bigger than TeamSize, and the old equality check would never fire. */}
                {isCaptain && isLineupFull && (
                    <View className="px-5 pb-4">
                        {isRegistrationAccepted ? (
                            <View className="w-full bg-primary/10 p-4 rounded-2xl border border-primary/20 flex-row justify-center gap-2 items-center">
                                <Ionicons name="shield-checkmark" size={20} color="#10B981" />
                                <Text className="text-primary font-black uppercase tracking-widest text-sm">Accepted</Text>
                            </View>
                        ) : isAlreadyRegistered ? (
                            <View className="w-full bg-warning/10 p-4 rounded-2xl border border-warning/20 flex-row justify-center gap-2 items-center">
                                <Ionicons name="hourglass-outline" size={20} color="#F59E0B" />
                                <Text className="text-warning font-black uppercase tracking-widest text-sm">Registered – Pending Approval</Text>
                            </View>
                        ) : (
                            <Pressable
                                onPress={handleRegisterTeam}
                                disabled={isRegistering}
                                className="active:opacity-80"
                                style={{
                                    shadowColor: '#00E5A0',
                                    shadowOpacity: 0.4,
                                    shadowRadius: 16,
                                    shadowOffset: { width: 0, height: 6 },
                                }}
                            >
                                <LinearGradient
                                    colors={['#00E5A0', '#0AA6C9']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={{ borderRadius: 18, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                >
                                    {isRegistering ? (
                                        <ActivityIndicator color="#06251D" />
                                    ) : (
                                        <>
                                            <Ionicons name="rocket" size={18} color="#06251D" />
                                            <Text className="text-team-foreground font-black text-[15px]">{TEAM_LABELS.REGISTER_TEAM_BUTTON}</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* ── Tabs ── */}
                <View className="px-5 pb-3">
                    <PremiumTabs
                        tabs={[
                            { value: 'members', label: 'Members', icon: 'people-outline' } as PremiumTabItem,
                            ...(showRequestsTab ? [{
                                value: 'requests',
                                label: 'Requests',
                                icon: 'hourglass-outline' as const,
                                badge: joinRequests.length > 0 ? joinRequests.length : undefined,
                            }] : []),
                        ]}
                        activeTab={activeTab}
                        onTabChange={(v) => setActiveTab(v as 'members' | 'requests')}
                    />
                </View>

                {/* Members List */}
                {activeTab === 'members' && (
                    <View className="px-5 gap-2">
                        {(() => {
                            // Captain floats to the top of whichever group they're in.
                            const captainFirst = (list: any[]) => [...list].sort((a: any, b: any) => {
                                const aId = a.userId || a.UserId;
                                const bId = b.userId || b.UserId;
                                const aIsCap = a.isCaptain || a.IsCaptain || aId?.toLowerCase() === captainId?.toLowerCase();
                                const bIsCap = b.isCaptain || b.IsCaptain || bId?.toLowerCase() === captainId?.toLowerCase();
                                if (aIsCap && !bIsCap) return -1;
                                if (!aIsCap && bIsCap) return 1;
                                return 0;
                            });

                            if (allMembers.length === 0) {
                                return (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={40} color="#71717A" />
                                        <Text className="text-slate-400 mt-3 text-center">No members yet</Text>
                                    </View>
                                );
                            }

                            const renderMemberCard = (member: any, onBench: boolean) => {
                                const memberId = member.userId || member.UserId;
                                const memberUsername = member.username || member.Username;
                                const memberAvatar = member.avatarUrl || member.AvatarUrl;
                                const memIsCaptain = member.isCaptain || member.IsCaptain || memberId?.toLowerCase() === captainId?.toLowerCase();
                                const isCurrentUser = user?.id?.toLowerCase() === memberId?.toLowerCase();

                                const cardClass = onBench
                                    ? 'bg-white/[0.02] border-white/[0.07]'
                                    : memIsCaptain
                                        ? 'bg-warning/[0.06] border-warning/20'
                                        : 'bg-card/70 border-white/[0.06]';

                                return (
                                    <View
                                        key={memberId}
                                        className={`p-3.5 rounded-[20px] border flex-row items-center gap-3.5 ${cardClass}`}
                                    >
                                        <View
                                            className={`rounded-full p-[3px] ${memIsCaptain && !onBench ? 'border-2 border-warning/50' : 'border border-white/10'}`}
                                            style={onBench ? { opacity: 0.75 } : undefined}
                                        >
                                            <PlayerAvatar
                                                name={memberUsername}
                                                src={memberAvatar}
                                                size="md"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <View className="flex-row items-center gap-2 flex-wrap">
                                                <Text className="font-bold text-[15px] text-white">{memberUsername}</Text>
                                                {isCurrentUser && (
                                                    <View className="bg-white/10 px-2 py-0.5 rounded-full">
                                                        <Text className="text-[9px] text-slate-300 font-black uppercase tracking-wider">You</Text>
                                                    </View>
                                                )}
                                                {onBench && (
                                                    <View
                                                        className="px-2 py-0.5 rounded-full"
                                                        style={{ backgroundColor: 'rgba(129,140,248,0.14)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.28)' }}
                                                    >
                                                        <Text className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#A5B4FC' }}>
                                                            Reserve
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            {memIsCaptain ? (
                                                <View className="flex-row items-center gap-1 mt-1">
                                                    <Ionicons name="shield-checkmark" size={11} color="#F59E0B" />
                                                    <Text className="text-[10px] font-black text-warning uppercase tracking-wider">
                                                        {TEAM_LABELS.CAPTAIN_BADGE}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <Text className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                                    {onBench ? 'Not playing' : allowReserves ? 'In the lineup' : 'Player'}
                                                </Text>
                                            )}
                                        </View>

                                        {/* Bring a reserve in — the sub takes the outgoing player's exact game. */}
                                        {onBench && canSubstitute && (
                                            <Pressable
                                                onPress={() => {
                                                    setLineupSwapError(null);
                                                    setSubTarget(toLineupPlayer(member));
                                                }}
                                                className="h-9 px-3 rounded-xl flex-row items-center gap-1.5 active:opacity-60"
                                                style={{ backgroundColor: 'rgba(0,229,160,0.10)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.26)' }}
                                            >
                                                <Ionicons name="repeat" size={15} color="#00E5A0" />
                                                <Text className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#00E5A0' }}>
                                                    Sub in
                                                </Text>
                                            </Pressable>
                                        )}

                                        {/* Captain can kick non-captain members while registration open */}
                                        {isCaptain && !memIsCaptain && Number(tournamentStatus) === 1 && !isAlreadyRegistered && !isRegistrationAccepted && (
                                            <Pressable
                                                onPress={() => handleKickMember(memberId, memberUsername)}
                                                className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                            >
                                                <Ionicons name="close" size={18} color="#EF4444" />
                                            </Pressable>
                                        )}
                                    </View>
                                );
                            };

                            const renderOpenSlots = (count: number, keyPrefix: string, label: string) =>
                                Array.from({ length: Math.max(0, count) }).map((_, i) => (
                                    <View
                                        key={`${keyPrefix}-${i}`}
                                        className="p-3.5 rounded-[20px] border border-white/10 bg-white/[0.02] flex-row items-center gap-3.5"
                                        style={{ borderStyle: 'dashed' }}
                                    >
                                        <View
                                            className="w-10 h-10 rounded-full border border-white/15 items-center justify-center"
                                            style={{ borderStyle: 'dashed' }}
                                        >
                                            <Ionicons name="person-add-outline" size={16} color="#475569" />
                                        </View>
                                        <Text className="text-slate-600 text-sm font-semibold">{label}</Text>
                                    </View>
                                ));

                            const sectionHeader = (icon: keyof typeof Ionicons.glyphMap, title: string, accent: string, note?: string) => (
                                <View key={`hdr-${title}`} className="flex-row items-center gap-2 mt-1 mb-0.5">
                                    <Ionicons name={icon} size={13} color={accent} />
                                    <Text className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>
                                        {title}
                                    </Text>
                                    {note ? (
                                        <Text className="text-[10px] font-semibold text-slate-600">{note}</Text>
                                    ) : null}
                                </View>
                            );

                            // Without reserves the roster IS the lineup, so keep the flat list the
                            // screen has always shown rather than adding an empty second section.
                            if (!allowReserves) {
                                return [
                                    ...captainFirst(allMembers).map((m: any) => renderMemberCard(m, false)),
                                    ...renderOpenSlots(actualTeamSize - allMembers.length, 'empty', 'Open slot'),
                                ];
                            }

                            return [
                                sectionHeader('football-outline', 'Lineup', '#00E5A0', `${starterCount}/${actualTeamSize}`),
                                ...captainFirst(starterMembers).map((m: any) => renderMemberCard(m, false)),
                                ...renderOpenSlots(actualTeamSize - starterCount, 'empty-starter', 'Open lineup slot'),

                                sectionHeader(
                                    'reorder-four-outline',
                                    'Bench',
                                    '#818CF8',
                                    maxReserves > 0 ? `${reserveMembers.length}/${maxReserves}` : undefined,
                                ),
                                ...captainFirst(reserveMembers).map((m: any) => renderMemberCard(m, true)),
                                ...renderOpenSlots(maxReserves - reserveMembers.length, 'empty-bench', 'Open bench slot'),
                            ];
                        })()}
                    </View>
                )}

                {/* ── Requests Tab ── */}
                {activeTab === 'requests' && showRequestsTab && (
                    <View className="px-5 gap-2">
                        {isLoadingRequests ? (
                            <ActivityIndicator size="small" color="#F59E0B" />
                        ) : joinRequests.length === 0 ? (
                            <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
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
                                        className="bg-warning/5 p-4 rounded-[22px] border border-warning/15 flex-row items-center gap-3"
                                    >
                                        <PlayerAvatar name={reqUsername} src={reqAvatar} size="md" />
                                        <View className="flex-1">
                                            <Text className="font-bold text-base text-white">{reqUsername}</Text>
                                            <View className="flex-row items-center gap-1 mt-0.5">
                                                <Ionicons name="person-add-outline" size={11} color="#F59E0B" />
                                                <Text className="text-[10px] text-warning font-bold">Wants to join</Text>
                                            </View>
                                        </View>
                                        <View className="flex-row items-center gap-2">
                                            <Pressable
                                                onPress={() => handleRejectRequest(requestId, reqUsername)}
                                                className="w-10 h-10 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                            >
                                                <Ionicons name="close" size={18} color="#EF4444" />
                                            </Pressable>
                                            <Pressable
                                                onPress={() => handleApproveRequest(requestId, reqUsername)}
                                                className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center border border-primary/20 active:opacity-60"
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
                    <View className="px-5 mt-7">
                        <Text className="text-[10px] font-black uppercase tracking-[2px] text-slate-600 mb-3 ml-1">
                            Danger Zone
                        </Text>
                        <View className="gap-2.5">
                            <Pressable
                                onPress={handleLeaveTeam}
                                className="flex-row items-center justify-center gap-2 h-[52px] rounded-2xl border border-white/10 bg-white/[0.03] active:opacity-70"
                            >
                                <Ionicons name="exit-outline" size={18} color="#94A3B8" />
                                <Text className="text-slate-200 font-bold text-[15px]">{TEAM_LABELS.LEAVE_TEAM_BUTTON}</Text>
                            </Pressable>

                            {isCaptain && (
                                <Pressable
                                    onPress={handleDeleteTeam}
                                    className="flex-row items-center justify-center gap-2 h-[52px] rounded-2xl bg-destructive/10 border border-destructive/25 active:opacity-70"
                                >
                                    <Ionicons name="trash-outline" size={18} color="#F87171" />
                                    <Text className="text-red-400 font-bold text-[15px]">{TEAM_LABELS.DELETE_TEAM_BUTTON}</Text>
                                </Pressable>
                            )}
                        </View>
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

            <LineupSwapModal
                visible={!!subTarget}
                onClose={() => { setSubTarget(null); setLineupSwapError(null); }}
                reserve={subTarget}
                starters={starterMembers.map(toLineupPlayer)}
                busy={isSwappingLineup}
                error={lineupSwapError}
                onConfirm={handleConfirmSubstitution}
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
