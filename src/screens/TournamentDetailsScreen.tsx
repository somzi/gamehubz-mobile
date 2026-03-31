import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
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
import { buildDeepLink, shareDeepLink } from '../lib/share';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS, authenticatedFetch, getErrorMessage } from '../lib/api';
import { MatchDetailsModal } from '../components/modals/MatchDetailsModal';
import { getTournamentFormatLabel, TournamentRegion } from '../types/tournament';
import { StatusModal } from '../components/modals/StatusModal';
import { RoundScheduleModal } from '../components/modals/RoundScheduleModal';
import { TeamRegistrationModal } from '../components/modals/TeamRegistrationModal';
import { TeamMatchDetailModal } from '../components/modals/TeamMatchDetailModal';
import {
    getPendingTournamentTeams,
    getTournamentTeams,
    joinTeam,
    requestJoinTeam,
    getTeamsToJoin
} from '../lib/teamApi';
import { TEAM_LABELS } from '../lib/teamConstants';
import type { TeamDto } from '../types/team';

type TournamentDetailsRouteProp = RouteProp<RootStackParamList, 'TournamentDetails'>;

export default function TournamentDetailsScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const route = useRoute<TournamentDetailsRouteProp>();
    const { id } = route.params;
    const [activeTab, setActiveTab] = useState('overview');
    const [teamsTab, setTeamsTab] = useState('confirmed');
    const [playersTab, setPlayersTab] = useState<'confirmed' | 'registrations'>('confirmed');
    const [openTeams, setOpenTeams] = useState<TeamDto[]>([]);
    const [isLoadingOpenTeams, setIsLoadingOpenTeams] = useState(false);
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
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);

    const [showDeadlineModal, setShowDeadlineModal] = useState(false);
    const [selectedRoundForDeadline, setSelectedRoundForDeadline] = useState<{ roundNumber: number, currentDeadline?: string | null, roundOpenAt?: string | null } | null>(null);

    const [isExportingPdf, setIsExportingPdf] = useState(false);

    // Team tournament states
    const [showTeamRegistration, setShowTeamRegistration] = useState(false);
    const [tournamentTeams, setTournamentTeams] = useState<TeamDto[]>([]);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [userTeam, setUserTeam] = useState<TeamDto | null>(null);
    const [showTeamMatchDetail, setShowTeamMatchDetail] = useState(false);
    const [selectedTeamMatchId, setSelectedTeamMatchId] = useState<string | null>(null);
    const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);

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
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setIsRegistering(false);
        }
    };

    const handleJoinTeam = async (teamId: string, requiresApproval?: boolean) => {
        setJoiningTeamId(teamId);
        try {
            if (requiresApproval) {
                await requestJoinTeam(teamId);
                setStatusModalConfig({
                    type: 'success',
                    title: 'Request Sent',
                    message: 'Your join request was sent to the team captain!'
                });
            } else {
                await joinTeam(teamId);
                setStatusModalConfig({
                    type: 'success',
                    title: 'Success!',
                    message: 'You have successfully joined the team!'
                });
            }
            setShowStatusModal(true);
            fetchTournamentDetails(true); // silent refresh
            if (activeTab === 'teams' && teamsTab === 'open') {
                fetchOpenTeams();
            }
        } catch (err: unknown) {
            setStatusModalConfig({
                type: 'error',
                title: requiresApproval ? 'Request Failed' : 'Join Failed',
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setJoiningTeamId(null);
        }
    };

    const handleExportBracketPdf = async () => {
        if (!id) return;
        setIsExportingPdf(true);
        try {
            const token = await SecureStore.getItemAsync('access_token');
            const safeName = (tournament?.name ?? id)
                .replace(/\s+/g, '_')
                .replace(/[^a-zA-Z0-9_\-]/g, '');
            const destFile = new FSFile(Paths.cache, `${safeName}_bracket.pdf`);
            // Remove stale cache file so downloadFileAsync never hits "Destination already exists"
            if (destFile.exists) {
                destFile.delete();
            }
            const downloaded = await FSFile.downloadFileAsync(
                ENDPOINTS.EXPORT_BRACKET_PDF(id),
                destFile,
                token ? { headers: { Authorization: `Bearer ${token}` } } : {}
            );
            const canShare = await Sharing.isAvailableAsync();
            if (!canShare) {
                Alert.alert('Sharing not available', 'Your device does not support sharing.');
                return;
            }
            await Sharing.shareAsync(downloaded.uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Share Bracket PDF',
                UTI: 'com.adobe.pdf',
            });
        } catch (err: any) {
            Alert.alert('Export Failed', err.message || 'Could not export the bracket PDF.');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleShare = async () => {
        if (!tournament) return;
        try {
            await shareDeepLink({
                title: tournament.name,
                description: `Join ${tournament.name} on GameHubz.`,
                deepLink: buildDeepLink('tournament', id),
            });
        } catch (error) {
            console.error('Share error:', error);
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

    const fetchTournamentDetails = async (silent = false) => {
        if (!id) return;
        if (!silent) setIsLoading(true);
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
                hubName: rawData.hubName || rawData.HubName,
                isTeamTournament: rawData.isTeamTournament ?? rawData.IsTeamTournament ?? false,
                teamSize: rawData.teamSize ?? rawData.TeamSize ?? null,
            };

            setTournament(normalizedTournament);

            // Fetch teams and registration status in parallel so page renders with full data
            const parallelTasks: Promise<any>[] = [];
            if (normalizedTournament.isTeamTournament) {
                parallelTasks.push(fetchTournamentTeams(id));
            }
            if (normalizedTournament.status === 0 || normalizedTournament.status === 1) {
                parallelTasks.push(checkRegistrationStatus());
            }
            if (parallelTasks.length > 0) {
                await Promise.all(parallelTasks);
            }
        } catch (err: any) {
            console.error('Tournament fetch error:', err);
            setError(getErrorMessage(err));
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
                throw new Error(text);
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
                message: getErrorMessage(err)
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
                throw new Error(text);
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
                message: getErrorMessage(err)
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
                throw new Error(text);
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
                message: getErrorMessage(err)
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
                throw new Error(text);
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
                message: getErrorMessage(err)
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
                throw new Error(text);
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
                message: getErrorMessage(err)
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
                throw new Error(text);
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
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setProcessingId(null);
        }
    };

    const handleApproveAll = async () => {
        if (pendingRegistrations.length === 0) return;

        const ids = pendingRegistrations
            .filter((reg: any) => {
                const isTeam = reg.isTeamRegistration || reg.IsTeamRegistration;
                if (isTeam && tournament?.teamSize) {
                    const currentMembers = reg.memberCount || reg.MemberCount || 1;
                    return currentMembers >= tournament.teamSize;
                }
                return true;
            })
            .map((reg: any) => reg.Id || reg.id || reg.registrationId);

        if (ids.length === 0) return;

        setIsLoadingPending(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_ALL_REGISTRATIONS, {
                method: 'POST',
                body: JSON.stringify(ids)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
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
                message: getErrorMessage(err)
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
                throw new Error(text);
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
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setIsLoading(false);
            setSelectedRoundForDeadline(null);
        }
    };

    const fetchTournamentTeams = async (tournamentId: string) => {
        setIsLoadingTeams(true);
        try {
            // Populate confirmed list
            const finalTeams = await getTournamentTeams(tournamentId);
            setTournamentTeams(finalTeams);

            // Find user's team from all teams (including pending) like before
            if (user?.id) {
                try {
                    const allTeams = await getPendingTournamentTeams(tournamentId);
                    const myTeam = allTeams.find(t =>
                        t.members && t.members.some(m => (m.userId || m.UserId)?.toLowerCase() === user.id.toLowerCase())
                    );
                    setUserTeam(myTeam || null);
                } catch (checkErr) {
                    console.error('Error verifying user team status:', checkErr);
                }
            }
        } catch (err) {
            console.error('Error fetching tournament teams:', err);
        } finally {
            setIsLoadingTeams(false);
        }
    };

    const handleTeamJoined = (team: TeamDto) => {
        setUserTeam(team);
        setShowTeamRegistration(false);
        if (tournament?.isTeamTournament) {
            fetchTournamentTeams(id);
        }
    };

    const handleRemoveTeam = (teamId: string, teamName: string) => {
        Alert.alert(
            'Remove Team',
            `Are you sure you want to remove "${teamName}" from this tournament?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        setRemovingTeamId(teamId);
                        try {
                            const endpointUrl = ENDPOINTS.REMOVE_TEAM_FROM_TOURNAMENT(id, teamId);
                            console.log(`[Remove Team] Hitting endpoint: POST ${endpointUrl}`);
                            const response = await authenticatedFetch(
                                endpointUrl,
                                { method: 'POST' }
                            );
                            if (!response.ok) {
                                const text = await response.text().catch(() => 'Failed to remove team');
                                throw new Error(text);
                            }
                            setStatusModalConfig({
                                type: 'success',
                                title: 'Team Removed',
                                message: `${teamName} has been removed from the tournament.`
                            });
                            setShowStatusModal(true);
                            setTournamentTeams(prev => prev.filter(t => (t.teamId || t.TeamId) !== teamId));
                            fetchTournamentTeams(id);
                            fetchTournamentDetails();
                        } catch (err: any) {
                            setStatusModalConfig({
                                type: 'error',
                                title: 'Error',
                                message: getErrorMessage(err)
                            });
                            setShowStatusModal(true);
                        } finally {
                            setRemovingTeamId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleTeamMatchPress = (match: any) => {

        if (!match.home || !match.away) return;
        if (match.status !== 1 && match.status !== 2 && match.status !== 3 && match.status !== 4) return;
        setSelectedTeamMatchId(match.id);
        setShowTeamMatchDetail(true);
    };

    // Load initial data and silently refresh when coming back to this screen
    useFocusEffect(
        useCallback(() => {
            // First time it mounts, isLoading is already true by default, so silent doesn't matter visually, 
            // but for subsequent focuses, silent=true prevents the screen from going blank
            fetchTournamentDetails(true);
            fetchParticipants();
        }, [id])
    );

    const handleMatchPress = (match: any) => {

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
            if (playersTab === 'confirmed') fetchParticipants();
            else if (playersTab === 'registrations' && pendingRegistrations.length === 0) fetchPendingRegistrations();
        } else if (activeTab === 'teams' && tournament?.isTeamTournament) {
            if (teamsTab === 'open' && openTeams.length === 0) fetchOpenTeams();
            else if (teamsTab === 'registrations' && pendingRegistrations.length === 0) fetchPendingRegistrations();
            else if (teamsTab === 'confirmed' && tournamentTeams.length === 0) fetchTournamentTeams(id);
        }
    }, [id, activeTab, teamsTab, playersTab]);

    const fetchOpenTeams = async () => {
        if (!id) return;
        setIsLoadingOpenTeams(true);
        try {
            const data = await getTeamsToJoin(id);
            setOpenTeams(data);
        } catch (err) {
            console.error('Fetch open teams error:', err);
        } finally {
            setIsLoadingOpenTeams(false);
        }
    };

    const tabs = [
        { label: 'Overview', value: 'overview' },
        { label: 'Bracket', value: 'bracket' },
        ...(tournament?.isTeamTournament
            ? [{ label: 'Teams', value: 'teams' }]
            : [{ label: 'Players', value: 'players' }]),
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
                        onMatchPress={tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress}
                        currentUserId={user?.id}
                        currentUsername={user?.username}
                        isAdmin={tournament?.createdBy === user?.id}
                        onEditDeadline={handleEditDeadline}
                        tournamentStatus={tournament?.status}
                        isTeamTournament={tournament?.isTeamTournament}
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

    const creatorId = tournament?.createdBy || tournament?.createdby || tournament?.CreatedBy;

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]">
            <PageHeader
                title="Tournament"
                showBack
                rightElement={
                    <View className="flex-row items-center gap-2">
                        {activeTab === 'bracket' && stages.length > 0 && (
                            <Pressable
                                onPress={handleExportBracketPdf}
                                disabled={isExportingPdf}
                                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                            >
                                {isExportingPdf ? (
                                    <ActivityIndicator size="small" color="#FAFAFA" />
                                ) : (
                                    <Ionicons name="document-outline" size={20} color="#FAFAFA" />
                                )}
                            </Pressable>
                        )}
{/* Share button hidden - coming soon */}
                        {creatorId?.toLowerCase() === user?.id?.toLowerCase() && (
                            <Pressable
                                onPress={() => navigation.navigate('ManageTournament' as any, { id })}
                                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
                            >
                                <Ionicons name="settings-outline" size={20} color="#FAFAFA" />
                            </Pressable>
                        )}
                    </View>
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
                                <Text className="text-sm font-bold text-zinc-500">
                                    {tournament?.isTeamTournament ? tournamentTeams.length : (tournament.numberOfParticipants || 0)} {tournament?.isTeamTournament ? 'Teams' : 'Participants'}
                                </Text>
                            </View>
                        </View>

                        {(() => {
                            const isCreator = creatorId && user?.id && creatorId.toLowerCase() === user.id.toLowerCase();
                            const isParticipant = participants.some(p =>
                                (p.username || p.Username)?.toLowerCase() === user?.username?.toLowerCase()
                            );
                            const isOpenOrUpcoming = tournament.status === 0 || tournament.status === 1;
                            const attendeeCount = tournament?.isTeamTournament ? tournamentTeams.length : (tournament.numberOfParticipants || 0);
                            const currentAttendeeCount = attendeeCount;
                            const isFull = tournament.maxPlayers > 0 && currentAttendeeCount >= tournament.maxPlayers;

                            const buttons = [];

                            if (tournament.isTeamTournament) {
                                // Show nothing while teams are still loading (prevents flash of register button)
                                if (isLoadingTeams) {
                                    // render nothing — button appears smoothly once data resolves
                                } else if (!userTeam && !isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull) {
                                    buttons.push(
                                        <Button
                                            key="team-register"
                                            className="w-full"
                                            onPress={() => setShowTeamRegistration(true)}
                                        >
                                            {TEAM_LABELS.REGISTER_CREATE_JOIN}
                                        </Button>
                                    );
                                }
                            } else {
                                // Solo tournament: existing flow
                                if (!isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull) {
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
                            }

                            return buttons.length > 0 ? <View className="gap-3 mt-4">{buttons}</View> : null;
                        })()}
                    </View>

                    <View className="px-4 py-4">
                        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
                    </View>

                    {activeTab === 'overview' && (
                        <View className="px-4 py-4 pb-12">

                            {/* Hub Owner Close Registration Button */}
                            {creatorId?.toLowerCase() === user?.id?.toLowerCase() &&
                                (tournament?.status === 0 || tournament?.status === 1) && (
                                    <Button
                                        className="w-full mb-4 bg-[#EF4444]"
                                        onPress={handleCloseRegistration}
                                        loading={isLoading}
                                    >
                                        Close Registration
                                    </Button>
                                )}

                            {/* Hub Owner Open Registration Button */}
                            {creatorId?.toLowerCase() === user?.id?.toLowerCase() &&
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

                            {/* My Team Button - Polished & Modern */}
                            {tournament.isTeamTournament && !isLoadingTeams && userTeam && (
                                <Pressable
                                    onPress={() => navigation.navigate('TeamDashboard', { teamId: userTeam.teamId, tournamentId: id, teamSize: tournament?.teamSize, tournamentStatus: tournament?.status })}
                                    className="mb-4 bg-gradient-to-r from-[#1A233A] to-[#131B2E] border border-[#00E5A0]/30 rounded-[24px] overflow-hidden"
                                >
                                    <View className="px-5 py-4 flex-row items-center justify-between">
                                        <View className="flex-row items-center gap-4">
                                            <View className="w-12 h-12 bg-[#00E5A0]/10 rounded-2xl items-center justify-center shadow-sm shadow-[#00E5A0]/20 border border-[#00E5A0]/20">
                                                <Ionicons name="shield-half" size={24} color="#00E5A0" />
                                            </View>
                                            <View>
                                                <Text className="text-white font-black text-lg tracking-wide">{TEAM_LABELS.MY_TEAM_BUTTON}</Text>
                                                <Text className="text-[#00E5A0]/80 text-[11px] font-bold tracking-widest uppercase mt-0.5">Manage Your Roster</Text>
                                            </View>
                                        </View>
                                        <View className="w-10 h-10 bg-white/5 border border-white/5 rounded-full items-center justify-center">
                                            <Ionicons name="chevron-forward" size={18} color="#00E5A0" />
                                        </View>
                                    </View>
                                </Pressable>
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
                                                    {getTournamentFormatLabel(Number(tournament.format))}
                                                </Text>
                                            </View>
                                            <View className="h-[1px] bg-white/5" />
                                            {/* Mode */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#00E5A0]/10 items-center justify-center">
                                                        <Ionicons name="game-controller-outline" size={16} color="#00E5A0" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Mode</Text>
                                                </View>
                                                <Text className="text-base font-black text-white">
                                                    {tournament.isTeamTournament ? 'Team' : 'Solo'}
                                                </Text>
                                            </View>
                                            <View className="h-[1px] bg-white/5" />
                                            {/* Team Size */}
                                            {tournament.isTeamTournament && (
                                                <>
                                                    <View className="flex-row items-center justify-between py-3">
                                                        <View className="flex-row items-center gap-3">
                                                            <View className="w-8 h-8 rounded-xl bg-[#EC4899]/10 items-center justify-center">
                                                                <Ionicons name="people-circle-outline" size={16} color="#EC4899" />
                                                            </View>
                                                            <Text className="text-sm text-slate-400 font-bold">Team Size</Text>
                                                        </View>
                                                        <Text className="text-base font-black text-white">
                                                            {tournament.teamSize || '?'}v{tournament.teamSize || '?'}
                                                        </Text>
                                                    </View>
                                                    <View className="h-[1px] bg-white/5" />
                                                </>
                                            )}
                                            {/* Date */}
                                            <View className="flex-row items-center justify-between py-3">
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-xl bg-[#3B82F6]/10 items-center justify-center">
                                                        <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
                                                    </View>
                                                    <Text className="text-sm text-slate-400 font-bold">Start Date</Text>
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

                                            {/* Hub */}
                                            {tournament.hubName && tournament.hubId && (
                                                <>
                                                    <View className="h-[1px] bg-white/5" />
                                                    <View className="flex-row items-center justify-between py-3">
                                                        <View className="flex-row items-center gap-3">
                                                            <View className="w-8 h-8 rounded-xl bg-indigo-500/10 items-center justify-center">
                                                                <Ionicons name="home-outline" size={16} color="#6366F1" />
                                                            </View>
                                                            <Text className="text-sm text-slate-400 font-bold">Hub</Text>
                                                        </View>
                                                        <Pressable onPress={() => navigation.navigate('HubProfile', { id: tournament.hubId })}>
                                                            <Text className="text-base font-black text-[#10B981] underline">
                                                                {tournament.hubName}
                                                            </Text>
                                                        </Pressable>
                                                    </View>
                                                </>
                                            )}
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

                    {/* Teams Tab (team tournaments only) */}
                    {activeTab === 'teams' && tournament?.isTeamTournament && (
                        <View className="px-4 py-4 gap-3 pb-12">
                            <View className="flex-row items-center gap-2 mb-4">
                                <Ionicons name="people-outline" size={20} color="#00E5A0" />
                                <Text className="text-lg font-bold text-white">{TEAM_LABELS.TEAMS_SECTION_TITLE}</Text>
                            </View>

                            {/* Sub Tabs */}
                            <View className="flex-row bg-[#131B2E] p-1 rounded-2xl border border-white/5 mb-4 shadow-sm shadow-black/20">
                                <Pressable
                                    onPress={() => setTeamsTab('confirmed')}
                                    className={`flex-1 py-2.5 items-center justify-center rounded-xl ${teamsTab === 'confirmed' ? 'bg-[#00E5A0]/10 border border-[#00E5A0]/20' : 'bg-transparent'}`}
                                >
                                    <Text className={`font-black text-[10px] uppercase tracking-wider ${teamsTab === 'confirmed' ? 'text-[#00E5A0]' : 'text-slate-500'}`}>Confirmed</Text>
                                </Pressable>
                                {tournament?.status < 3 && (
                                    <Pressable
                                        onPress={() => setTeamsTab('open')}
                                        className={`flex-1 py-2.5 items-center justify-center rounded-xl ${teamsTab === 'open' ? 'bg-[#3B82F6]/10 border border-[#3B82F6]/20' : 'bg-transparent'}`}
                                    >
                                        <Text className={`font-black text-[10px] uppercase tracking-wider ${teamsTab === 'open' ? 'text-[#3B82F6]' : 'text-slate-500'}`}>Registred</Text>
                                    </Pressable>
                                )}
                                {creatorId?.toLowerCase() === user?.id?.toLowerCase() && (
                                    <Pressable
                                        onPress={() => setTeamsTab('registrations')}
                                        className={`flex-1 py-2.5 items-center justify-center rounded-xl ${teamsTab === 'registrations' ? 'bg-[#F59E0B]/10 border border-[#F59E0B]/20' : 'bg-transparent'}`}
                                    >
                                        <Text className={`font-black text-[10px] uppercase tracking-wider ${teamsTab === 'registrations' ? 'text-[#F59E0B]' : 'text-slate-500'}`}>Requests</Text>
                                    </Pressable>
                                )}
                            </View>

                            {/* Confirmed Teams */}
                            {teamsTab === 'confirmed' && (
                                isLoadingTeams ? (
                                    <ActivityIndicator size="small" color="#00E5A0" />
                                ) : tournamentTeams.length === 0 ? (
                                    <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">{TEAM_LABELS.NO_TEAMS_REGISTERED}</Text>
                                    </View>
                                ) : (
                                    tournamentTeams.map((t, index) => {
                                        const teamId = t.teamId || t.TeamId;
                                        const teamName = t.teamName || t.TeamName;
                                        const memberCount = t.memberCount || t.MemberCount || 0;
                                        const teamSize = t.teamSize || t.TeamSize || tournament?.teamSize || 0;
                                        const captainUserId = t.captainUserId || t.CaptainUserId;

                                        const membersList = t.members || t.Members || [];
                                        const captain = membersList.find((m: any) =>
                                            m.userId?.toLowerCase() === captainUserId?.toLowerCase() ||
                                            m.UserId?.toLowerCase() === captainUserId?.toLowerCase()
                                        );

                                        const isExpanded = expandedTeamId === teamId;

                                        return (
                                            <View key={teamId || index.toString()} className="flex-row items-start gap-3 mb-2">
                                                <Pressable
                                                    onPress={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                    className={`flex-1 bg-gradient-to-br from-[#1A233A] to-[#131B2E] p-5 rounded-[24px] border border-white/5 overflow-hidden ${isExpanded ? 'border-[#00E5A0]/20' : ''}`}
                                                >
                                                    <View className="flex-row items-center gap-4">
                                                        <View className="w-12 h-12 rounded-2xl bg-[#00E5A0]/10 items-center justify-center border border-[#00E5A0]/20 shadow-sm shadow-[#00E5A0]/20">
                                                            <Ionicons name="shield-half-outline" size={24} color="#00E5A0" />
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="font-black text-lg text-white" numberOfLines={1}>
                                                                {teamName || 'Unknown Team'}
                                                            </Text>
                                                            <View className="flex-row items-center gap-2 mt-1">
                                                                {(memberCount >= teamSize && teamSize > 0) ? (
                                                                    <View className="bg-[#00E5A0]/10 px-2 py-0.5 rounded-full border border-[#00E5A0]/20 flex-shrink-0">
                                                                        <Text className="text-[9px] font-black text-[#00E5A0] uppercase">
                                                                            {TEAM_LABELS.TEAM_FULL}
                                                                        </Text>
                                                                    </View>
                                                                ) : (
                                                                    <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex-shrink-0">
                                                                        {memberCount} / {teamSize > 0 ? teamSize : '?'} {TEAM_LABELS.MEMBERS_LABEL}
                                                                    </Text>
                                                                )}
                                                                {captain && (
                                                                    <View className="flex-row items-center gap-1 bg-[#F59E0B]/10 px-2 rounded-full py-0.5 border border-[#F59E0B]/20 flex-shrink">
                                                                        <Ionicons name="shield" size={10} color="#F59E0B" />
                                                                        <Text className="text-[9px] text-[#F59E0B] font-black uppercase flex-shrink" numberOfLines={1}>
                                                                            {captain?.username || captain?.Username}
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>
                                                        <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center border border-white/5">
                                                            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
                                                        </View>
                                                    </View>

                                                    {/* Expanded Members List */}
                                                    {isExpanded && (
                                                        <View className="mt-4 pt-4 border-t border-white/5 space-y-4">
                                                            {membersList.length > 0 ? (
                                                                membersList.map((m: any, mIdx: number) => {
                                                                    const isMemberCaptain = (m.userId || m.UserId)?.toLowerCase() === captainUserId?.toLowerCase();
                                                                    return (
                                                                        <Pressable
                                                                            key={(m.userId || m.UserId) || mIdx.toString()}
                                                                            onPress={() => navigation.navigate('PlayerProfile', { id: m.userId || m.UserId })}
                                                                            className="flex-row items-center justify-between bg-white/[0.03] p-4 rounded-[18px] border border-white/10 active:opacity-60 shadow-sm"
                                                                        >
                                                                            <View className="flex-row items-center gap-3">
                                                                                <PlayerAvatar name={m.username || m.Username} src={m.avatarUrl || m.AvatarUrl} size="sm" />
                                                                                <Text className="text-white font-bold text-sm tracking-wide">{m.username || m.Username}</Text>
                                                                            </View>
                                                                            {isMemberCaptain && (
                                                                                <View className="bg-[#F59E0B]/10 px-2 py-1.5 rounded-full flex-row items-center gap-1.5 border border-[#F59E0B]/20">
                                                                                    <Ionicons name="shield-checkmark" size={13} color="#F59E0B" />
                                                                                    <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-widest">Captain</Text>
                                                                                </View>
                                                                            )}
                                                                        </Pressable>
                                                                    );
                                                                })
                                                            ) : (
                                                                <Text className="text-slate-500 text-center text-xs py-2 italic">No members found</Text>
                                                            )}

                                                            {/* Join Button inside Expanded View */}
                                                            {(!userTeam && !isUserRegistered && memberCount < teamSize && teamSize > 0) && (
                                                                <Button
                                                                    className={t.requiresApproval || t.RequiresApproval ? "bg-[#3B82F6] py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-[#3B82F6]/20" : "bg-[#00E5A0] py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-[#00E5A0]/20"}
                                                                    onPress={() => handleJoinTeam(teamId as string, t.requiresApproval || t.RequiresApproval)}
                                                                    loading={joiningTeamId === teamId}
                                                                    disabled={joiningTeamId !== null || t.userRequestStatus === 'Pending' || t.UserRequestStatus === 'Pending'}
                                                                >
                                                                    <Text className={t.requiresApproval || t.RequiresApproval ? "text-white font-black uppercase tracking-widest text-sm text-center" : "text-[#0F172A] font-black uppercase tracking-widest text-sm text-center"}>
                                                                        {(t.userRequestStatus === 'Pending' || t.UserRequestStatus === 'Pending')
                                                                            ? 'Request Pending'
                                                                            : (t.requiresApproval || t.RequiresApproval) ? 'Request to Join' : 'Join This Team'}
                                                                    </Text>
                                                                </Button>
                                                            )}
                                                        </View>
                                                    )}
                                                </Pressable>

                                                {/* Remove Team Button — Creator Only (Outside Card) */}
                                                {creatorId?.toLowerCase() === user?.id?.toLowerCase() && (
                                                    <View className="self-start mt-5">
                                                        <Pressable
                                                            onPress={() => handleRemoveTeam(teamId as string, teamName as string)}
                                                            disabled={removingTeamId === teamId}
                                                            className="w-12 h-12 rounded-2xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                                        >
                                                            {removingTeamId === teamId ? (
                                                                <ActivityIndicator size="small" color="#EF4444" />
                                                            ) : (
                                                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                                            )}
                                                        </Pressable>
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })
                                )
                            )}

                            {/* Open Teams */}
                            {teamsTab === 'open' && tournament?.status < 3 && (
                                isLoadingOpenTeams ? (
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                ) : openTeams.length === 0 ? (
                                    <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center mt-2">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">No open teams looking for players right now.</Text>
                                    </View>
                                ) : (
                                    openTeams.map((t, index) => {
                                        const teamId = t.teamId || t.TeamId;
                                        const teamName = t.teamName || t.TeamName;
                                        const memberCount = t.memberCount || t.MemberCount || 0;
                                        const teamSize = t.teamSize || t.TeamSize || tournament?.teamSize || 0;
                                        const captainUserId = t.captainUserId || t.CaptainUserId;
                                        const membersList = t.members || t.Members || [];
                                        const captain = membersList.find((m: any) =>
                                            m.userId?.toLowerCase() === captainUserId?.toLowerCase() ||
                                            m.UserId?.toLowerCase() === captainUserId?.toLowerCase()
                                        );

                                        const isExpanded = expandedTeamId === teamId;

                                        return (
                                            <View key={teamId || index.toString()} className="flex-row items-start gap-3 mb-2">
                                                <Pressable
                                                    onPress={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                    className={`flex-1 bg-gradient-to-br from-[#1A233A] to-[#131B2E] p-5 rounded-[24px] border border-white/5 overflow-hidden ${isExpanded ? 'border-[#3B82F6]/20' : ''}`}
                                                >
                                                    <View className="flex-row items-center gap-4">
                                                        <View className="w-12 h-12 rounded-2xl bg-[#3B82F6]/10 items-center justify-center border border-[#3B82F6]/20 shadow-sm shadow-[#3B82F6]/20">
                                                            <Ionicons name="game-controller-outline" size={24} color="#3B82F6" />
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="font-black text-lg text-white" numberOfLines={1}>
                                                                {teamName || 'Unknown Team'}
                                                            </Text>
                                                            <View className="flex-row items-center gap-2 mt-1">
                                                                {(memberCount >= teamSize && teamSize > 0) ? (
                                                                    <View className="bg-[#3B82F6]/10 px-2 py-0.5 rounded-full border border-[#3B82F6]/20 flex-shrink-0">
                                                                        <Text className="text-[9px] font-black text-[#3B82F6] uppercase">
                                                                            {TEAM_LABELS.TEAM_FULL}
                                                                        </Text>
                                                                    </View>
                                                                ) : (
                                                                    <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex-shrink-0">
                                                                        {memberCount} / {teamSize > 0 ? teamSize : '?'} {TEAM_LABELS.MEMBERS_LABEL}
                                                                    </Text>
                                                                )}
                                                                {captain && (
                                                                    <View className="flex-row items-center gap-1 bg-[#F59E0B]/10 px-2 rounded-full py-0.5 border border-[#F59E0B]/20 flex-shrink">
                                                                        <Ionicons name="shield" size={10} color="#F59E0B" />
                                                                        <Text className="text-[9px] text-[#F59E0B] font-black uppercase flex-shrink" numberOfLines={1}>
                                                                            {captain?.username || captain?.Username}
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>
                                                        <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center border border-white/5">
                                                            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
                                                        </View>
                                                    </View>

                                                    {/* Expanded Members List */}
                                                    {isExpanded && (
                                                        <View className="mt-4 pt-4 border-t border-white/5 space-y-4">
                                                            {membersList.length > 0 ? (
                                                                membersList.map((m: any, mIdx: number) => {
                                                                    const isMemberCaptain = (m.userId || m.UserId)?.toLowerCase() === captainUserId?.toLowerCase();
                                                                    return (
                                                                        <Pressable
                                                                            key={(m.userId || m.UserId) || mIdx.toString()}
                                                                            onPress={() => navigation.navigate('PlayerProfile', { id: m.userId || m.UserId })}
                                                                            className="flex-row items-center justify-between bg-white/[0.03] p-4 rounded-[18px] border border-white/10 active:opacity-60 shadow-sm"
                                                                        >
                                                                            <View className="flex-row items-center gap-3">
                                                                                <PlayerAvatar name={m.username || m.Username} src={m.avatarUrl || m.AvatarUrl} size="sm" />
                                                                                <Text className="text-white font-bold text-sm tracking-wide">{m.username || m.Username}</Text>
                                                                            </View>
                                                                            {isMemberCaptain && (
                                                                                <View className="bg-[#F59E0B]/10 px-2 py-1.5 rounded-full flex-row items-center gap-1.5 border border-[#F59E0B]/20">
                                                                                    <Ionicons name="shield-checkmark" size={13} color="#F59E0B" />
                                                                                    <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-widest">Captain</Text>
                                                                                </View>
                                                                            )}
                                                                        </Pressable>
                                                                    );
                                                                })
                                                            ) : (
                                                                <Text className="text-slate-500 text-center text-xs py-2 italic">No members found</Text>
                                                            )}

                                                            {/* Join Button inside Expanded View */}
                                                            {(() => {
                                                                const isApproved = t.userRequestStatus === 'Approved' || t.UserRequestStatus === 'Approved' || (t.userRequestStatus as any) === 1 || (t.UserRequestStatus as any) === 1;
                                                                const isPending = t.userRequestStatus === 'Pending' || t.UserRequestStatus === 'Pending' || (t.userRequestStatus as any) === 0 || (t.UserRequestStatus as any) === 0;
                                                                // If the user has no team (they may have been kicked), trust userTeam state.
                                                                // Per-team isApproved prevents rejoining a team they're already "approved" in.
                                                                const showButton = !userTeam && !isUserRegistered && !isApproved && memberCount < teamSize && teamSize > 0;

                                                                if (!showButton) return null;

                                                                return (
                                                                    <Button
                                                                        className={t.requiresApproval || t.RequiresApproval ? "bg-[#3B82F6] py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-[#3B82F6]/20" : "bg-[#00E5A0] py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-[#00E5A0]/20"}
                                                                        onPress={() => handleJoinTeam(teamId as string, t.requiresApproval || t.RequiresApproval)}
                                                                        loading={joiningTeamId === teamId}
                                                                        disabled={joiningTeamId !== null || isPending}
                                                                    >
                                                                        <Text className={t.requiresApproval || t.RequiresApproval ? "text-white font-black uppercase tracking-widest text-sm text-center" : "text-[#0F172A] font-black uppercase tracking-widest text-sm text-center"}>
                                                                            {isPending
                                                                                ? 'Request Pending'
                                                                                : (t.requiresApproval || t.RequiresApproval) ? 'Request to Join' : 'Join This Team'}
                                                                        </Text>
                                                                    </Button>
                                                                );
                                                            })()}
                                                        </View>
                                                    )}
                                                </Pressable>
                                            </View>
                                        );
                                    })
                                )
                            )}

                            {/* Registrations (Moved into Teams logic) */}
                            {teamsTab === 'registrations' && creatorId?.toLowerCase() === user?.id?.toLowerCase() && (
                                <View className="mt-2">
                                    <View className="flex-row justify-between items-center mb-4">
                                        <Text className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                            Pending Requests
                                        </Text>
                                        {(() => {
                                            const displayedRegistrations = pendingRegistrations.reduce((acc: any[], current: any) => {
                                                const teamId = current.teamId || current.TeamId;
                                                if (teamId) {
                                                    const exists = acc.find(item => (item.teamId || item.TeamId) === teamId);
                                                    if (!exists) acc.push(current);
                                                } else {
                                                    acc.push(current);
                                                }
                                                return acc;
                                            }, []);

                                            const hasApprovable = displayedRegistrations.some((reg: any) => {
                                                const isTeam = reg.isTeamRegistration || reg.IsTeamRegistration;
                                                if (isTeam && tournament?.teamSize) {
                                                    const currentMembers = reg.memberCount || reg.MemberCount || 1;
                                                    return currentMembers >= tournament?.teamSize;
                                                }
                                                return true;
                                            });

                                            return hasApprovable && displayedRegistrations.length > 0 && (
                                                <Button
                                                    size="sm"
                                                    onPress={handleApproveAll}
                                                    loading={isLoadingPending}
                                                    className="bg-[#10B981]"
                                                >
                                                    Approve All
                                                </Button>
                                            );
                                        })()}
                                    </View>

                                    {isLoadingPending ? (
                                        <ActivityIndicator size="small" color="#F59E0B" />
                                    ) : pendingRegistrations.length === 0 ? (
                                        <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                            <Ionicons name="checkmark-circle-outline" size={48} color="#F59E0B" />
                                            <Text className="text-slate-400 mt-4 text-center">No pending registrations.</Text>
                                        </View>
                                    ) : (
                                        pendingRegistrations.reduce((acc: any[], current: any) => {
                                            const teamId = current.teamId || current.TeamId;
                                            if (teamId) {
                                                const exists = acc.find(item => (item.teamId || item.TeamId) === teamId);
                                                if (!exists) acc.push(current);
                                            } else {
                                                acc.push(current);
                                            }
                                            return acc;
                                        }, []).map((reg) => {
                                            const isTeam = reg.isTeamRegistration || reg.IsTeamRegistration;
                                            const regId = reg.id || reg.registrationId || reg.Id;

                                            if (isTeam) {
                                                const currentMembers = reg.memberCount || reg.MemberCount || 1;
                                                const requiredMembers = tournament?.teamSize || 2;
                                                const canApprove = currentMembers >= requiredMembers;

                                                return (
                                                    <View key={regId || Math.random().toString()} className="bg-[#131B2E]/80 p-5 mb-3 rounded-[28px] border border-[#F59E0B]/20 flex-row items-center gap-4">
                                                        <View className="w-12 h-12 rounded-2xl bg-[#F59E0B]/10 items-center justify-center border border-[#F59E0B]/20">
                                                            <Ionicons name="people" size={22} color="#F59E0B" />
                                                        </View>
                                                        <View className="flex-1 justify-center">
                                                            <Text className="font-bold text-lg text-white" numberOfLines={1}>
                                                                {reg.teamName || reg.TeamName}
                                                            </Text>
                                                            <Text className="text-sm text-slate-400 mt-0.5">
                                                                {currentMembers} / {requiredMembers} members
                                                            </Text>
                                                        </View>
                                                        <View className="flex-row gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-red-500/20 w-10 h-10 p-0 items-center justify-center"
                                                                onPress={() => handleReject(regId)}
                                                                disabled={processingId !== null}
                                                            >
                                                                {processingId === regId ? (
                                                                    <ActivityIndicator size="small" color="#EF4444" />
                                                                ) : (
                                                                    <Ionicons name="close" size={20} color="#EF4444" />
                                                                )}
                                                            </Button>
                                                            {canApprove && (
                                                                <Button
                                                                    size="sm"
                                                                    className="bg-[#10B981] w-10 h-10 p-0 items-center justify-center"
                                                                    onPress={() => handleApprove(regId)}
                                                                    disabled={processingId !== null}
                                                                >
                                                                    {processingId === regId ? (
                                                                        <ActivityIndicator size="small" color="#131B2E" />
                                                                    ) : (
                                                                        <Ionicons name="checkmark" size={20} color="#131B2E" />
                                                                    )}
                                                                </Button>
                                                            )}
                                                        </View>
                                                    </View>
                                                );
                                            }

                                            return null;
                                        })
                                    )}
                                </View>
                            )}

                        </View>
                    )}

                    {/* Pending Registrations Admin Tab (Solo Only) - now merged into players tab */}

                    {activeTab === 'players' && (
                        <View className="px-4 py-4 gap-3 pb-12">
                            {/* Header */}
                            <View className="flex-row items-center justify-between mb-1">
                                <View className="flex-row items-center gap-2">
                                    <Ionicons name="people-outline" size={20} color="#3B82F6" />
                                    <Text className="text-lg font-black text-white">Players</Text>
                                </View>
                            </View>

                            {/* Sub-tabs */}
                            <View className="flex-row bg-[#131B2E] p-1 rounded-2xl border border-white/5 mb-2 shadow-sm shadow-black/20">
                                <Pressable
                                    onPress={() => setPlayersTab('confirmed')}
                                    className={`flex-1 py-2.5 items-center justify-center rounded-xl ${playersTab === 'confirmed' ? 'bg-[#3B82F6]/10 border border-[#3B82F6]/20' : 'bg-transparent'}`}
                                >
                                    <Text className={`font-black text-[10px] uppercase tracking-wider ${playersTab === 'confirmed' ? 'text-[#3B82F6]' : 'text-slate-500'}`}>Confirmed</Text>
                                </Pressable>
                                {tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() && (
                                    <Pressable
                                        onPress={() => {
                                            setPlayersTab('registrations');
                                            if (pendingRegistrations.length === 0) fetchPendingRegistrations();
                                        }}
                                        className={`flex-1 py-2.5 items-center justify-center rounded-xl ${playersTab === 'registrations' ? 'bg-[#F59E0B]/10 border border-[#F59E0B]/20' : 'bg-transparent'}`}
                                    >
                                        <View className="flex-row items-center gap-1.5">
                                            <Text className={`font-black text-[10px] uppercase tracking-wider ${playersTab === 'registrations' ? 'text-[#F59E0B]' : 'text-slate-500'}`}>Registrations</Text>
                                            {pendingRegistrations.length > 0 && (
                                                <View className="w-5 h-5 rounded-full bg-[#F59E0B] items-center justify-center">
                                                    <Text className="text-[9px] font-black text-[#0F172A]">{pendingRegistrations.length}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </Pressable>
                                )}
                            </View>

                            {/* Confirmed Players */}
                            {playersTab === 'confirmed' && (
                                isLoadingParticipants ? (
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                ) : participants.length === 0 ? (
                                    <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">No confirmed players yet.</Text>
                                    </View>
                                ) : (
                                    participants.map((p, i) => {
                                        const pUserId = p.userId || p.UserId || p.id;
                                        const isCreator = tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase();
                                        const canRemove = isCreator && (tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2);
                                        const isCurrentUser = user?.id?.toLowerCase() === pUserId?.toLowerCase();

                                        return (
                                            <View key={p.participantId || p.id || pUserId || i} className="flex-row items-center gap-2 mb-2">
                                                <Pressable
                                                    onPress={() => { if (pUserId) navigation.navigate('PlayerProfile', { id: pUserId }); }}
                                                    className="bg-[#131B2E]/60 p-4 rounded-[22px] border border-white/5 flex-row items-center gap-3 flex-1 active:opacity-70"
                                                >
                                                    <View className="w-7 items-center justify-center">
                                                        <Text className="text-slate-500 font-black text-sm">{i + 1}</Text>
                                                    </View>
                                                    <PlayerAvatar src={p.avatarUrl || p.AvatarUrl} name={p.username || p.Username || 'Player'} size="md" />
                                                    <View className="flex-1 justify-center">
                                                        <View className="flex-row items-center gap-2">
                                                            <Text className="font-bold text-base text-white">{p.username || p.Username}</Text>
                                                            {isCurrentUser && (
                                                                <View className="bg-white/10 px-1.5 py-0.5 rounded-full">
                                                                    <Text className="text-[9px] text-slate-400 font-black uppercase">You</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </View>
                                                    <Ionicons name="chevron-forward" size={16} color="#475569" />
                                                </Pressable>
                                                {canRemove && (
                                                    <Pressable
                                                        onPress={() => handleRemoveParticipant(pUserId)}
                                                        disabled={processingId !== null}
                                                        className="w-11 h-11 rounded-2xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                                    >
                                                        {processingId === pUserId ? (
                                                            <ActivityIndicator size="small" color="#EF4444" />
                                                        ) : (
                                                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                                        )}
                                                    </Pressable>
                                                )}
                                            </View>
                                        );
                                    })
                                )
                            )}

                            {/* Registrations (admin, solo) */}
                            {playersTab === 'registrations' && tournament?.createdBy?.toLowerCase() === user?.id?.toLowerCase() && (
                                <>
                                    {/* Approve All button */}
                                    {pendingRegistrations.length > 0 && (
                                        <View className="flex-row justify-end mb-1">
                                            <Button
                                                size="sm"
                                                onPress={handleApproveAll}
                                                loading={isLoadingPending}
                                                className="bg-[#10B981]"
                                            >
                                                Approve All
                                            </Button>
                                        </View>
                                    )}
                                    {isLoadingPending ? (
                                        <ActivityIndicator size="small" color="#F59E0B" />
                                    ) : pendingRegistrations.length === 0 ? (
                                        <View className="bg-[#131B2E]/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                            <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                                            <Text className="text-slate-400 mt-4 text-center">No pending registrations.</Text>
                                        </View>
                                    ) : (
                                        pendingRegistrations.map((reg) => {
                                            const regId = reg.id || reg.registrationId || reg.Id;
                                            return (
                                                <View key={regId || Math.random().toString()} className="bg-[#F59E0B]/5 p-4 mb-2 rounded-[22px] border border-[#F59E0B]/15 flex-row items-center gap-3">
                                                    <PlayerAvatar src={reg.avatarUrl || reg.AvatarUrl} name={reg.username || reg.Username || 'Unknown'} size="md" />
                                                    <View className="flex-1 justify-center">
                                                        <Text className="font-bold text-base text-white">{reg.username || reg.Username}</Text>
                                                        <View className="flex-row items-center gap-1 mt-0.5">
                                                            <Ionicons name="person-add-outline" size={11} color="#F59E0B" />
                                                            <Text className="text-[10px] text-[#F59E0B] font-bold">Wants to join</Text>
                                                        </View>
                                                    </View>
                                                    <View className="flex-row gap-2 items-center">
                                                        <Pressable
                                                            onPress={() => handleReject(regId)}
                                                            disabled={processingId !== null}
                                                            className="w-10 h-10 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                                        >
                                                            {processingId === regId ? (
                                                                <ActivityIndicator size="small" color="#EF4444" />
                                                            ) : (
                                                                <Ionicons name="close" size={18} color="#EF4444" />
                                                            )}
                                                        </Pressable>
                                                        <Pressable
                                                            onPress={() => handleApprove(regId)}
                                                            disabled={processingId !== null}
                                                            className="w-10 h-10 rounded-xl bg-[#10B981]/10 items-center justify-center border border-[#10B981]/20 active:opacity-60"
                                                        >
                                                            {processingId === regId ? (
                                                                <ActivityIndicator size="small" color="#10B981" />
                                                            ) : (
                                                                <Ionicons name="checkmark" size={18} color="#10B981" />
                                                            )}
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            );
                                        })
                                    )}
                                </>
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

            {/* Team Registration Modal */}
            {showTeamRegistration && (
                <TeamRegistrationModal
                    visible={showTeamRegistration}
                    onClose={() => setShowTeamRegistration(false)}
                    tournamentId={id}
                    onTeamJoined={handleTeamJoined}
                    availableTeams={tournamentTeams}
                />
            )}

            {/* Team Match Detail Modal */}
            {showTeamMatchDetail && (
                <TeamMatchDetailModal
                    visible={showTeamMatchDetail}
                    onClose={() => { setShowTeamMatchDetail(false); setSelectedTeamMatchId(null); }}
                    matchId={selectedTeamMatchId}
                    tournamentId={tournament?.id}
                    hubOwnerId={hubOwnerId}
                    currentUserId={user?.id}
                    onMatchUpdate={() => {
                        fetchBracket();
                        if (tournament?.isTeamTournament) fetchTournamentTeams(id);
                    }}
                />
            )}
        </SafeAreaView>
    );
}

