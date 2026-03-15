import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { TournamentBracket } from '../components/bracket/TournamentBracket';
import { TournamentGroups } from '../components/bracket/TournamentGroups';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS, authenticatedFetch } from '../lib/api';
import { MatchDetailsModal } from '../components/modals/MatchDetailsModal';
import { TournamentRegion } from '../types/tournament';
import { StatusModal } from '../components/modals/StatusModal';
import { RoundScheduleModal } from '../components/modals/RoundScheduleModal';

type TournamentDetailsRouteProp = RouteProp<RootStackParamList, 'TournamentDetails'>;

export default function TournamentDetailsScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const route = useRoute<TournamentDetailsRouteProp>();
    const { id } = route.params;
    const [activeTab, setActiveTab] = useState('overview');
    const [tournament, setTournament] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stages, setStages] = useState<any[]>([]);
    const [selectedStageIndex, setSelectedStageIndex] = useState(0);
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
    const [loadingBracket, setLoadingBracket] = useState(false);
    const [bracketError, setBracketError] = useState<string | null>(null);

    const { user } = useAuth();
    const [isRegistering, setIsRegistering] = useState(false);
    const [participants, setParticipants] = useState<any[]>([]);
    const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
    const [pendingRegistrations, setPendingRegistrations] = useState<any[]>([]);
    const [isLoadingPending, setIsLoadingPending] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isCreatingBracket, setIsCreatingBracket] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<any>(null);
    const [isUserRegistered, setIsUserRegistered] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });
    const [hubOwnerId, setHubOwnerId] = useState<string | undefined>(undefined);
    
    const [showDeadlineModal, setShowDeadlineModal] = useState(false);
    const [selectedRoundForDeadline, setSelectedRoundForDeadline] = useState<{ roundNumber: number, currentDeadline?: string | null, roundOpenAt?: string | null } | null>(null);

    // Collapsible section states
    const [isGeneralInfoOpen, setIsGeneralInfoOpen] = useState(true);
    const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
    const [isRulesOpen, setIsRulesOpen] = useState(false);

    const handleJoin = async () => {
        if (!id || !user?.id) return;

        setIsRegistering(true);
        try {
            const payload = {
                TournamentId: id,
                UserId: user.id,
                Status: 0
            };

            const response = await authenticatedFetch(ENDPOINTS.REGISTER_TOURNAMENT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to join tournament');
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Congratulations!',
                message: 'Successfully registered to the tournament!'
            });
            setShowStatusModal(true);
            fetchTournamentDetails(); // Refresh details
        } catch (err: any) {
            setStatusModalConfig({
                type: 'error',
                title: 'Join Failed',
                message: err.message || 'An error occurred while joining'
            });
            setShowStatusModal(true);
        } finally {
            setIsRegistering(false);
        }
    };

    const checkRegistrationStatus = async () => {
        if (!id || !user?.id) return;
        try {
            const url = ENDPOINTS.CHECK_REGISTRATION(id, user.id);
            const response = await authenticatedFetch(url);
            if (response.ok) {
                const isRegistered = await response.json();
                setIsUserRegistered(!!isRegistered);
            }
        } catch (err) {
            console.error('Check registration error:', err);
        }
    };

    const fetchTournamentDetails = async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const url = ENDPOINTS.GET_TOURNAMENT_OVERVIEW(id);
            const response = await authenticatedFetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch tournament: ${response.status}`);
            }
            const data = await response.json();
            const rawData = data.result || data;

            // Normalize tournament data to use camelCase consistently
            const normalizedTournament = {
                ...rawData,
                id: rawData.id || rawData.Id,
                name: rawData.name || rawData.Name,
                status: rawData.status !== undefined ? rawData.status : rawData.Status,
                maxPlayers: rawData.maxPlayers || rawData.MaxPlayers,
                numberOfParticipants: rawData.numberOfParticipants || rawData.NumberOfParticipants,
                format: rawData.format !== undefined ? rawData.format : rawData.Format,
                createdBy: rawData.createdBy || rawData.CreatedBy || rawData.createdby,
                groupsCount: rawData.groupsCount || rawData.GroupsCount,
                qualifiersPerGroup: rawData.qualifiersPerGroup || rawData.QualifiersPerGroup,
                prize: rawData.prize || rawData.Prize,
                prizeCurrency: rawData.prizeCurrency || rawData.PrizeCurrency,
                startDate: rawData.startDate || rawData.StartDate,
                region: rawData.region !== undefined ? rawData.region : rawData.Region,
                description: rawData.description || rawData.Description,
                rules: rawData.rules || rawData.Rules,
                registrationDeadline: rawData.registrationDeadline || rawData.RegistrationDeadLine || rawData.registrationDeadLine,
                hubId: rawData.hubId || rawData.HubId,
            };

            setTournament(normalizedTournament);

            // Check registration status if tournament is open for registration
            if (normalizedTournament.status === 0 || normalizedTournament.status === 1) {
                checkRegistrationStatus();
            }
        } catch (err: any) {
            console.error('Tournament fetch error:', err);
            setError(err.message || 'Failed to load tournament details');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBracket = async () => {
        if (!id) return;
        setLoadingBracket(true);
        setBracketError(null);
        try {
            const url = ENDPOINTS.GET_TOURNAMENT_STRUCTURE(id);
            console.log('Fetching bracket from:', url);
            const response = await authenticatedFetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch bracket: ${response.status}`);
            }
            const data = await response.json();
            setStages(data.stages || []);

            // Extract hubOwnerId from bracket response
            if (data.hubOwnerId || data.HubOwnerId) {
                setHubOwnerId(data.hubOwnerId || data.HubOwnerId);
            }
        } catch (err) {
            console.error('Bracket fetch error:', err);
            setBracketError('Failed to load bracket structure');
        } finally {
            setLoadingBracket(false);
        }
    };

    const handleCreateBracket = async () => {
        if (!id) return;
        setIsCreatingBracket(true);
        try {
            const isGroupStage = tournament?.format === 5;

            const payload: any = {
                TournamentId: id,
                GroupsCount: isGroupStage ? (tournament.groupsCount || null) : null,
                QualifiersPerGroup: isGroupStage ? (tournament.qualifiersPerGroup || null) : null
            };

            const response = await authenticatedFetch(ENDPOINTS.CREATE_BRACKET, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to create bracket: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Bracket created successfully!'
            });
            setShowStatusModal(true);
            fetchBracket(); // Refresh the bracket view
            fetchTournamentDetails(); // Refresh details to update status if needed
        } catch (err: any) {
            console.error('Create bracket error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to create bracket'
            });
            setShowStatusModal(true);
        } finally {
            setIsCreatingBracket(false);
        }
    };

    const handleCloseRegistration = async () => {
        if (!id) return;
        setIsLoading(true); // Reuse main loading or add specific one
        try {
            const url = ENDPOINTS.CLOSE_REGISTRATION(id);
            const response = await authenticatedFetch(url, {
                method: 'POST'
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to close registration: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Registration closed successfully!'
            });
            setShowStatusModal(true);
            fetchTournamentDetails(); // Refresh details
        } catch (err: any) {
            console.error('Close registration error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to close registration'
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenRegistration = async () => {
        if (!id) return;
        setIsLoading(true); // Reuse main loading or add specific one
        try {
            const url = ENDPOINTS.OPEN_REGISTRATION(id);
            const response = await authenticatedFetch(url, {
                method: 'POST'
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to open registration: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Registration opened successfully!'
            });
            setShowStatusModal(true);
            fetchTournamentDetails(); // Refresh details
        } catch (err: any) {
            console.error('Open registration error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to open registration'
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPendingRegistrations = async () => {
        if (!id) return;
        setIsLoadingPending(true);
        try {
            const url = ENDPOINTS.GET_PENDING_REGISTRATIONS(id);
            const response = await authenticatedFetch(url);
            if (!response.ok) throw new Error('Failed to fetch pending registrations');
            const data = await response.json();
            setPendingRegistrations(data.result || data || []);
        } catch (err) {
            console.error('Pending registrations fetch error:', err);
        } finally {
            setIsLoadingPending(false);
        }
    };

    const fetchParticipants = async () => {
        if (!id) return;
        setIsLoadingParticipants(true);
        try {
            const url = ENDPOINTS.GET_TOURNAMENT_PARTICIPANTS(id);
            const response = await authenticatedFetch(url);
            if (!response.ok) throw new Error('Failed to fetch participants');
            const data = await response.json();
            setParticipants(data.result || data || []);
        } catch (err) {
            console.error('Participants fetch error:', err);
        } finally {
            setIsLoadingParticipants(false);
        }
    };

    const handleApprove = async (registrationId: string) => {
        setProcessingId(registrationId);
        try {
            console.log(`[Approve] Sending ID: ${registrationId}`);
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_REGISTRATION, {
                method: 'POST',
                // Try sending as a raw JSON string (quoted GUID)
                body: JSON.stringify(registrationId)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                console.error(`[Approve] Fail ${response.status}:`, text);
                throw new Error(`Failed code ${response.status}: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Approved',
                message: 'Registration approved!'
            });
            setShowStatusModal(true);
            fetchPendingRegistrations();
            fetchParticipants(); // Refresh participants list
            fetchTournamentDetails();
        } catch (err: any) {
            console.error('[Approve] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to approve registration'
            });
            setShowStatusModal(true);
        } finally {
            setProcessingId(null);
        }
    };

    const handleRemoveParticipant = async (participantUserId: string) => {
        if (!id) return;
        setProcessingId(participantUserId);
        try {
            console.log(`[RemoveParticipant] Removing User ID: ${participantUserId} from Tournament ID: ${id}`);
            const response = await authenticatedFetch(ENDPOINTS.REMOVE_PARTICIPANT(id, participantUserId), {
                method: 'POST'
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to remove participant: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Participant removed successfully!'
            });
            setShowStatusModal(true);
            fetchParticipants(); // Refresh list
            fetchTournamentDetails(); // Update participant count
        } catch (err: any) {
            console.error('[RemoveParticipant] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to remove participant'
            });
            setShowStatusModal(true);
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (registrationId: string) => {
        setProcessingId(registrationId);
        try {
            console.log(`[Reject] Sending ID: ${registrationId}`);
            const response = await authenticatedFetch(ENDPOINTS.REJECT_REGISTRATION, {
                method: 'POST',
                body: JSON.stringify(registrationId)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                console.error(`[Reject] Fail ${response.status}:`, text);
                throw new Error(`Failed code ${response.status}: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Rejected',
                message: 'Registration rejected.'
            });
            setShowStatusModal(true);
            fetchPendingRegistrations();
        } catch (err: any) {
            console.error('[Reject] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to reject registration'
            });
            setShowStatusModal(true);
        } finally {
            setProcessingId(null);
        }
    };

    const handleApproveAll = async () => {
        if (pendingRegistrations.length === 0) return;

        setIsLoadingPending(true);
        try {
            const ids = pendingRegistrations.map((reg: any) => reg.Id || reg.id || reg.registrationId);
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_ALL_REGISTRATIONS, {
                method: 'POST',
                body: JSON.stringify(ids)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to approve all: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'All registrations approved!'
            });
            setShowStatusModal(true);
            fetchPendingRegistrations();
            fetchParticipants();
            fetchTournamentDetails();
        } catch (err: any) {
            console.error('[ApproveAll] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to approve all registrations'
            });
            setShowStatusModal(true);
        } finally {
            setIsLoadingPending(false);
        }
    };

    const handleEditDeadline = (roundOrMatchday: any) => {
        const roundNumber = typeof roundOrMatchday === 'number' ? roundOrMatchday : roundOrMatchday.roundNumber;
        const currentDeadline = typeof roundOrMatchday === 'object' ? roundOrMatchday.roundDeadline : null;
        
        // Find roundOpenAt
        let roundOpenAt = null;
        if (typeof roundOrMatchday === 'object') {
            if (roundOrMatchday.roundOpenAt) {
                roundOpenAt = roundOrMatchday.roundOpenAt;
            } else if (roundOrMatchday.matches && roundOrMatchday.matches.length > 0) {
                roundOpenAt = roundOrMatchday.matches[0].matchOpensAt || roundOrMatchday.matches[0].roundOpenAt;
            }
        }
        
        setSelectedRoundForDeadline({ roundNumber, currentDeadline, roundOpenAt });
        setShowDeadlineModal(true);
    };

    const handleSaveSchedule = async (openAtStr: string | null, deadlineStr: string | null) => {
        if (!id || !selectedRoundForDeadline) return;
        
        setShowDeadlineModal(false);
        setIsLoading(true);
        
        try {
            const payload = {
                RoundNumber: selectedRoundForDeadline.roundNumber,
                Deadline: deadlineStr ? new Date(deadlineStr.replace(' ', 'T')).toISOString() : null,
                RoundStart: openAtStr ? new Date(openAtStr.replace(' ', 'T')).toISOString() : null
            };
            
            const response = await authenticatedFetch(ENDPOINTS.SET_ROUND_SCHEDULE(id), {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(`Failed to update schedule: ${text}`);
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: 'Round schedule updated successfully!'
            });
            setShowStatusModal(true);
            
            fetchBracket();
        } catch (err: any) {
            console.error('[SetDeadline] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: 'Error',
                message: err.message || 'Failed to set deadline'
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
            setSelectedRoundForDeadline(null);
        }
    };

    useEffect(() => {
        fetchTournamentDetails();
        fetchParticipants(); // Fetch participants on mount to check join status
    }, [id]);

    const handleMatchPress = (match: any) => {
        if (tournament?.status !== 3) {
            Alert.alert("Tournament Not In Progress", "You can only access matches when the tournament is actively in progress.");
            return;
        }

        // Only allow if match has participants
        if (!match.home || !match.away) return;

        // Allow Pending (1), Live (2) and Completed (3, 4) matches
        if (match.status !== 1 && match.status !== 2 && match.status !== 3 && match.status !== 4) return;

        const isCreator = tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase();
        
        if (match.isRoundLocked && !isCreator) {
            Alert.alert("Round Locked", "Unlocks when all matches in the previous round are completed");
            return;
        }

        setSelectedMatch(match);
        setShowReportModal(true);
    };

    useEffect(() => {
        if (activeTab === 'bracket') {
            fetchBracket();
        } else if (activeTab === 'registrations') {
            fetchPendingRegistrations();
        } else if (activeTab === 'players') {
            fetchParticipants();
        }
    }, [id, activeTab]);

    const tabs = [
        { label: 'Overview', value: 'overview' },
        { label: 'Bracket', value: 'bracket' },
        { label: 'Players', value: 'players' },
        ...(tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() && 
           (tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2) 
           ? [{ label: 'Registrations', value: 'registrations' }] : []),
    ];

    const getStatusText = (status: number) => {
        switch (status) {
            case 0: return 'Open';
            case 1: return 'Upcoming';
            case 2: return 'Reg. Closed';
            case 3: return 'Live';
            case 4: return 'Completed';
            default: return 'IDLE';
        }
    };

    const renderStages = () => {
        if (stages.length === 0) {
            const creatorId = tournament?.createdBy;
            const isCreator = creatorId && user?.id && creatorId.toLowerCase() === user.id.toLowerCase();
            const isRegClosed = tournament?.status === 2;

            return (
                <View className="py-20 items-center justify-center px-6">
                    <Ionicons name="trophy-outline" size={48} color="#71717A" />
                    <Text className="text-muted-foreground mt-4 text-center">
                        {isCreator
                            ? (isRegClosed
                                ? "Registration is closed! You can now generate the bracket."
                                : "The bracket can be generated once registration is closed.")
                            : "Bracket not available yet"}
                    </Text>

                    {isCreator && isRegClosed && (
                        <Button
                            className="mt-6 w-full"
                            onPress={handleCreateBracket}
                            loading={isCreatingBracket}
                        >
                            Create Bracket
                        </Button>
                    )}
                </View>
            );
        }

        const currentStage = stages[selectedStageIndex];
        if (!currentStage) return null;

        return (
            <View key={currentStage.stageId || selectedStageIndex} className="mb-8">
                {stages.length > 1 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="px-4 mb-6"
                        contentContainerStyle={{ gap: 8 }}
                    >
                        {stages.map((stage, idx) => (
                            <Pressable
                                key={stage.stageId || idx}
                                onPress={() => {
                                    setSelectedStageIndex(idx);
                                    setSelectedGroupIndex(0); // Reset group on stage change
                                }}
                                className={cn(
                                    "px-4 py-2 rounded-full border",
                                    selectedStageIndex === idx
                                        ? "bg-primary border-primary"
                                        : "bg-muted/10 border-border/10"
                                )}
                            >
                                <Text className={cn(
                                    "text-xs font-bold",
                                    selectedStageIndex === idx ? "text-primary-foreground" : "text-muted-foreground"
                                )}>
                                    {stage.name || `Stage ${idx + 1}`}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                )}


                {currentStage.rounds && currentStage.rounds.length > 0 ? (
                    <TournamentBracket
                        rounds={currentStage.rounds}
                        onMatchPress={handleMatchPress}
                        currentUserId={user?.id}
                        currentUsername={user?.username}
                        isAdmin={tournament?.createdBy === user?.id}
                        onEditDeadline={handleEditDeadline}
                        tournamentStatus={tournament?.status}
                    />
                ) : currentStage.groups && currentStage.groups.length > 0 ? (
                    <View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="px-4 mb-6"
                            contentContainerStyle={{ gap: 8 }}
                        >
                            {currentStage.groups.map((group: any, idx: number) => (
                                <Pressable
                                    key={group.groupId || idx}
                                    onPress={() => setSelectedGroupIndex(idx)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg border",
                                        selectedGroupIndex === idx
                                            ? "bg-accent/20 border-accent/40"
                                            : "bg-muted/5 border-border/5"
                                    )}
                                >
                                    <Text className={cn(
                                        "text-xs font-bold",
                                        selectedGroupIndex === idx ? "text-accent" : "text-muted-foreground"
                                    )}>
                                        {group.name || `Group ${String.fromCharCode(65 + idx)}`}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>

                        {currentStage.groups[selectedGroupIndex] && (
                            <TournamentGroups
                                groups={[currentStage.groups[selectedGroupIndex]]}
                                onMatchPress={handleMatchPress}
                                currentUserId={user?.id}
                                currentUsername={user?.username}
                                isAdmin={tournament?.createdBy === user?.id}
                                onEditDeadline={handleEditDeadline}
                                tournamentStatus={tournament?.status}
                            />
                        )}
                    </View>
                ) : (
                    <View className="py-10 items-center justify-center">
                        <Text className="text-muted-foreground italic">No rounds or groups found for this stage</Text>
                    </View>
                )}
            </View>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title="Tournament" showBack />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text className="text-muted-foreground mt-4">Loading tournament...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error || !tournament) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title="Tournament" showBack />
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-destructive mt-4 text-center font-medium">{error || 'Tournament not found'}</Text>
                    <Button onPress={fetchTournamentDetails} className="mt-6">Retry</Button>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]">
            <PageHeader
                title="Tournament"
                showBack
                rightElement={
                    tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() ? (
                        <Pressable
                            onPress={() => navigation.navigate('ManageTournament' as any, { id })}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
                        </Pressable>
                    ) : null
                }
            />
            <ScrollView className="flex-1 bg-[#0F172A]">
                <View className="animate-slide-up">
                    {/* Hero Section */}
                    <View className="px-4 py-6 bg-[#0F172A]">
                        <View className="mb-4">
                            <View className="flex-row items-start justify-between mb-2">
                                <Text className="text-3xl font-black text-white leading-tight flex-1 mr-3">{tournament.name}</Text>
                                {(() => {
                                    const s = Number(tournament.status);
                                    if (s === 3) return (
                                        <View className="bg-[#064E3B] px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-[#10B981]/20 mt-1">
                                            <View className="w-2 h-2 rounded-full bg-[#10B981]" />
                                            <Text className="text-[10px] font-black text-[#10B981] uppercase tracking-tighter">LIVE</Text>
                                        </View>
                                    );
                                    if (s === 4) return (
                                        <View className="bg-slate-800 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-slate-700/50 mt-1">
                                            <View className="w-2 h-2 rounded-full bg-slate-500" />
                                            <Text className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Completed</Text>
                                        </View>
                                    );
                                    if (s === 2) return (
                                        <View className="bg-yellow-500/10 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-yellow-500/20 mt-1">
                                            <View className="w-2 h-2 rounded-full bg-yellow-400" />
                                            <Text className="text-[10px] font-black text-yellow-400 uppercase tracking-tighter">Reg. Closed</Text>
                                        </View>
                                    );
                                    if (s === 1) return (
                                        <View className="bg-indigo-500/10 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-indigo-500/20 mt-1">
                                            <View className="w-2 h-2 rounded-full bg-indigo-400" />
                                            <Text className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Upcoming</Text>
                                        </View>
                                    );
                                    if (s === 0) return (
                                        <View className="bg-indigo-500/10 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-indigo-500/20 mt-1">
                                            <View className="w-2 h-2 rounded-full bg-indigo-400" />
                                            <Text className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Open</Text>
                                        </View>
                                    );
                                    return null;
                                })()}
                            </View>
                            <View className="flex-row items-center gap-2">
                                <Ionicons name="people-outline" size={16} color="#71717A" />
                                <Text className="text-sm font-bold text-zinc-500">{tournament.numberOfParticipants || 0} Participants</Text>
                            </View>
                        </View>

                        {(() => {
                            const creatorId = tournament.createdBy || tournament.createdby || tournament.CreatedBy;
                            const isCreator = creatorId && user?.id && creatorId.toLowerCase() === user.id.toLowerCase();
                            const isParticipant = participants.some(p =>
                                (p.username || p.Username)?.toLowerCase() === user?.username?.toLowerCase()
                            );
                            const isOpenOrUpcoming = tournament.status === 0 || tournament.status === 1;
                            const isFull = tournament.maxPlayers > 0 && (tournament.numberOfParticipants || 0) >= tournament.maxPlayers;

                            const buttons = [];

                            if (!isCreator && !isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull) {
                                buttons.push(
                                    <Button
                                        key="join"
                                        className="w-full"
                                        onPress={handleJoin}
                                        loading={isRegistering}
                                    >
                                        Join Tournament
                                    </Button>
                                );
                            }



                            return buttons.length > 0 ? <View className="gap-3 mt-4">{buttons}</View> : null;
                        })()}
                    </View>

                    <View className="px-4 py-4">
                        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
                    </View>

                    {activeTab === 'overview' && (
                        <View className="px-4 py-4 pb-12">
                            {/* Hub Owner Registration Button */}
                            {tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() &&
                             (tournament?.status === 0 || tournament?.status === 1) &&
                             !participants.some(p => (p.username || p.Username)?.toLowerCase() === user?.username?.toLowerCase()) &&
                             !isUserRegistered && (
                                <Button
                                    className="w-full mb-4"
                                    onPress={handleJoin}
                                    loading={isRegistering}
                                >
                                    Register for Tournament
                                </Button>
                            )}

                            {/* Hub Owner Close Registration Button */}
                            {tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() &&
                             (tournament?.status === 0 || tournament?.status === 1) &&
                             tournament?.numberOfParticipants >= tournament?.maxPlayers && (
                                <Button
                                    className="w-full mb-4 bg-[#EF4444]"
                                    onPress={handleCloseRegistration}
                                    loading={isLoading}
                                >
                                    Close Registration
                                </Button>
                            )}

                            {/* Hub Owner Open Registration Button */}
                            {tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() &&
                             tournament?.status === 2 && (
                                <Button
                                    className="w-full mb-4 bg-[#10B981]"
                                    onPress={handleOpenRegistration}
                                    loading={isLoading}
                                >
                                    Open Registration
                                </Button>
                            )}

                            {/* Registration Deadline Alert */}
                            {tournament.registrationDeadline && [0, 1, 2].includes(Number(tournament.status)) && (
                                <View className="w-full bg-[#181010]/80 p-4 rounded-2xl border border-red-500/10 flex-row items-center gap-3 mb-4">
                                    <View className="w-10 h-10 rounded-xl bg-red-500/10 items-center justify-center">
                                        <Ionicons name="time-outline" size={20} color="#EF4444" />
                                    </View>
                                    <View className="flex-1 gap-0.5">
                                        <Text className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Registration Deadline</Text>
                                        <Text className="text-base font-black text-white">
                                            {(() => {
                                                const d = new Date(tournament.registrationDeadline);
                                                return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
                                            })()}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* General Info - Collapsible */}
                            <View className="bg-[#131B2E] rounded-2xl border border-white/5 mb-3 overflow-hidden">
                                <Pressable
                                    onPress={() => setIsGeneralInfoOpen(!isGeneralInfoOpen)}
                                    className="flex-row items-center justify-between p-4"
                                >
                                    <View className="flex-row items-center gap-2.5">
                                        <View className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 items-center justify-center">
                                            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
                                        </View>
                                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">General Info</Text>
                                    </View>
                                    <Ionicons name={isGeneralInfoOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
                                </Pressable>
                                {isGeneralInfoOpen && (
                                    <View className="px-4 pb-4">
                                        <View className="border-t border-white/5 pt-4">
                                            {/* Prize Pool */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 items-center justify-center">
                                                        <Ionicons name="trophy-outline" size={16} color="#F59E0B" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Prize Pool</Text>
                                                </View>
                                                <Text className="text-base font-black text-white">
                                                    {tournament.prize} {tournament.prizeCurrency === 1 ? 'EUR' : 'USD'}
                                                </Text>
                                            </View>
                                            <View className="h-[1px] bg-white/5" />
                                            {/* Max Players */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#4F46E5]/10 items-center justify-center">
                                                        <Ionicons name="people-outline" size={16} color="#4F46E5" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Max Players</Text>
                                                </View>
                                                <Text className="text-base font-black text-white">
                                                    {tournament.maxPlayers || 'No Limit'}
                                                </Text>
                                            </View>
                                            <View className="h-[1px] bg-white/5" />
                                            {/* Format */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#8B5CF6]/10 items-center justify-center">
                                                        <Ionicons name="list-outline" size={16} color="#8B5CF6" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Format</Text>
                                                </View>
                                                <Text className="text-base font-black text-white text-right max-w-[60%]">
                                                    {tournament.format === 0 ? 'League' :
                                                     tournament.format === 1 ? 'Groups + Single Elimination' :
                                                     tournament.format === 2 ? 'Groups + Double Elimination' :
                                                     tournament.format === 3 ? 'Single Elimination' :
                                                     tournament.format === 4 ? 'Double Elimination' :
                                                     tournament.format === 5 ? 'Group Stage + Knockout' : 'Unknown'}
                                                </Text>
                                            </View>
                                            <View className="h-[1px] bg-white/5" />
                                            {/* Date */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#3B82F6]/10 items-center justify-center">
                                                        <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Date</Text>
                                                </View>
                                                <Text className="text-base font-black text-white">
                                                    {tournament.startDate ? new Date(tournament.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}
                                                </Text>
                                            </View>
                                            <View className="h-[1px] bg-white/5" />
                                            {/* Region */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#10B981]/10 items-center justify-center">
                                                        <Ionicons name="globe-outline" size={16} color="#10B981" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Region</Text>
                                                </View>
                                                <Text className="text-base font-black text-white uppercase">
                                                    {tournament.region === TournamentRegion.Europe ? 'EU'
                                                        : tournament.region === TournamentRegion.NorthAmerica ? 'NA'
                                                            : tournament.region === TournamentRegion.Asia ? 'Asia'
                                                                : tournament.region === TournamentRegion.SouthAmerica ? 'SA'
                                                                    : tournament.region === TournamentRegion.Africa ? 'AFR'
                                                                        : tournament.region === TournamentRegion.Oceania ? 'OCE'
                                                                            : 'Global'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Description - Collapsible */}
                            <View className="bg-[#131B2E] rounded-2xl border border-white/5 mb-3 overflow-hidden">
                                <Pressable
                                    onPress={() => setIsDescriptionOpen(!isDescriptionOpen)}
                                    className="flex-row items-center justify-between p-4"
                                >
                                    <View className="flex-row items-center gap-2.5">
                                        <View className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 items-center justify-center">
                                            <Ionicons name="flash-outline" size={18} color="#F59E0B" />
                                        </View>
                                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">Description</Text>
                                    </View>
                                    <Ionicons name={isDescriptionOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
                                </Pressable>
                                {isDescriptionOpen && (
                                    <View className="px-4 pb-4">
                                        <View className="border-t border-white/5 pt-4">
                                            <Text className="text-slate-400 leading-6 text-sm">
                                                {tournament.description || 'Join this competitive tournament and prove your skills to climb the leaderboard.'}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Rules & Regulations - Collapsible */}
                            <View className="bg-[#131B2E] rounded-2xl border border-white/5 mb-3 overflow-hidden">
                                <Pressable
                                    onPress={() => setIsRulesOpen(!isRulesOpen)}
                                    className="flex-row items-center justify-between p-4"
                                >
                                    <View className="flex-row items-center gap-2.5">
                                        <View className="w-8 h-8 rounded-xl bg-[#4F46E5]/10 items-center justify-center">
                                            <Ionicons name="shield-outline" size={18} color="#4F46E5" />
                                        </View>
                                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">Rules & Regulations</Text>
                                    </View>
                                    <Ionicons name={isRulesOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
                                </Pressable>
                                {isRulesOpen && (
                                    <View className="px-4 pb-4">
                                        <View className="border-t border-white/5 pt-4">
                                            <Text className="text-slate-400 leading-6 text-sm">
                                                {tournament.rules || '• Fair play is mandatory\n• No toxic behavior\n• Tournament organizers\' decisions are final.'}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {activeTab === 'bracket' && (
                        <View className="py-4 pb-12">
                            {renderStages()}
                        </View>
                    )}

                    {/* Pending Registrations Admin Tab */}
                    {activeTab === 'registrations' && (
                        <View className="px-4 py-4 space-y-4 pb-12">
                            <View className="flex-row justify-between items-center mb-4">
                                <View className="flex-row items-center gap-2">
                                    <Ionicons name="time-outline" size={20} color="#F59E0B" />
                                    <Text className="text-lg font-bold text-white">
                                        Pending Requests
                                    </Text>
                                </View>
                                {pendingRegistrations.length > 0 && (
                                    <Button
                                        size="sm"
                                        onPress={handleApproveAll}
                                        loading={isLoadingPending}
                                        className="bg-[#10B981]"
                                    >
                                        Approve All
                                    </Button>
                                )}
                            </View>

                            {isLoadingPending ? (
                                <ActivityIndicator size="small" color="#10B981" />
                            ) : pendingRegistrations.length === 0 ? (
                                <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                    <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                                    <Text className="text-slate-400 mt-4 text-center">No pending registrations.</Text>
                                </View>
                            ) : (
                                pendingRegistrations.map((reg) => (
                                    <View key={reg.id || reg.registrationId || Math.random().toString()} className="bg-[#131B2E]/50 p-5 mb-2 rounded-[28px] border border-white/5 flex-row items-center gap-4">
                                        <PlayerAvatar src={reg.avatarUrl || reg.AvatarUrl} name={reg.username || reg.Username || 'Unknown'} size="md" />
                                        <View className="flex-1 justify-center">
                                            <Text className="font-bold text-lg text-white">{reg.username || reg.Username}</Text>
                                            <Text className="text-sm text-slate-400 mt-0.5">Wants to join</Text>
                                        </View>
                                        <View className="flex-row gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-red-500/20 w-10 h-10 p-0 items-center justify-center"
                                                onPress={() => handleReject(reg.id || reg.registrationId || reg.Id)}
                                                disabled={processingId !== null}
                                            >
                                                {processingId === (reg.id || reg.registrationId || reg.Id) ? (
                                                    <ActivityIndicator size="small" color="#EF4444" />
                                                ) : (
                                                    <Ionicons name="close" size={20} color="#EF4444" />
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="bg-[#10B981] w-10 h-10 p-0 items-center justify-center"
                                                onPress={() => handleApprove(reg.id || reg.registrationId || reg.Id)}
                                                disabled={processingId !== null}
                                            >
                                                {processingId === (reg.id || reg.registrationId || reg.Id) ? (
                                                    <ActivityIndicator size="small" color="#131B2E" />
                                                ) : (
                                                    <Ionicons name="checkmark" size={20} color="#131B2E" />
                                                )}
                                            </Button>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    )}

                    {activeTab === 'players' && (
                        <View className="px-4 py-4 gap-3 pb-12">
                            <View className="flex-row items-center gap-2 mb-2">
                                <Ionicons name="people-outline" size={20} color="#3B82F6" />
                                <Text className="text-lg font-bold text-white">Participants List</Text>
                            </View>
                            {isLoadingParticipants ? (
                                <ActivityIndicator size="small" color="#10B981" />
                            ) : participants.length === 0 ? (
                                <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                    <Ionicons name="people-outline" size={48} color="#3B82F6" />
                                    <Text className="text-slate-400 mt-4 text-center">No participants yet.</Text>
                                </View>
                            ) : (
                                participants.map((p, i) => {
                                    const pUserId = p.userId || p.UserId || p.id;
                                    const isCreator = tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase();
                                    
                                    const canRemove = isCreator && (tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2);
                                    
                                    return (
                                        <View key={p.participantId || p.id || pUserId || i} className="flex-row items-center gap-2">
                                            <Pressable
                                                onPress={() => {
                                                    if (pUserId) {
                                                        navigation.navigate('PlayerProfile', { id: pUserId });
                                                    }
                                                }}
                                                className="bg-[#131B2E]/50 p-5 mb-1 rounded-[28px] border border-white/5 flex-row items-center gap-4 flex-1"
                                            >
                                                <View className="w-8 items-center justify-center">
                                                    <Text className="text-slate-500 font-bold text-sm">{i + 1}</Text>
                                                </View>
                                                <PlayerAvatar src={p.avatarUrl || p.AvatarUrl} name={p.username || p.Username || 'Player'} size="md" />
                                                <View className="flex-1 justify-center">
                                                    <Text className="font-bold text-lg text-white">{p.username || p.Username}</Text>
                                                </View>
                                                <Ionicons name="chevron-forward" size={24} color="#475569" />
                                            </Pressable>
                                            
                                            {canRemove && (
                                                <Pressable
                                                    onPress={() => handleRemoveParticipant(pUserId)}
                                                    disabled={processingId !== null}
                                                    className="w-12 h-12 rounded-2xl bg-red-500/10 items-center justify-center border border-red-500/20"
                                                >
                                                    {processingId === pUserId ? (
                                                        <ActivityIndicator size="small" color="#EF4444" />
                                                    ) : (
                                                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                                    )}
                                                </Pressable>
                                            )}
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            <MatchDetailsModal
                visible={showReportModal}
                onClose={() => setShowReportModal(false)}
                matchId={selectedMatch?.id}
                tournamentId={id}
                tournamentName={tournament?.name}
                roundName={selectedMatch?.roundName || 'Match Details'}
                opponentName={selectedMatch?.away?.username}
                scheduledTime={selectedMatch?.startTime ? new Date(selectedMatch.startTime).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : undefined}
                status={
                    selectedMatch?.status === 3 || selectedMatch?.status === 4 ? 'completed' :
                        selectedMatch?.status === 2 ? 'ready_phase' :
                            selectedMatch?.status === 1 ? 'scheduled' : 'ready_phase'
                }
                home={selectedMatch?.home}
                away={selectedMatch?.away}
                evidences={selectedMatch?.evidences}
                hubOwnerId={hubOwnerId}
                isRoundLocked={selectedMatch?.isRoundLocked}
                onMatchUpdate={() => {
                    fetchBracket(); // Refresh the bracket/league data
                    // Refresh details if needed
                }}
            />

            {showStatusModal && (
                <StatusModal
                    visible={showStatusModal}
                    type={statusModalConfig.type}
                    title={statusModalConfig.title}
                    message={statusModalConfig.message}
                    onClose={() => setShowStatusModal(false)}
                />
            )}
            
            <RoundScheduleModal
                visible={showDeadlineModal}
                onClose={() => setShowDeadlineModal(false)}
                onSave={handleSaveSchedule}
                roundNumber={selectedRoundForDeadline?.roundNumber || 0}
                initialOpenAt={selectedRoundForDeadline?.roundOpenAt || undefined}
                initialDeadline={selectedRoundForDeadline?.currentDeadline || undefined}
            />
        </SafeAreaView>
    );
}

