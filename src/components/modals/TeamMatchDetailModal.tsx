import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    ActivityIndicator,
    Pressable,
    Modal,
    AppState,
    Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getOptimizedCloudinaryUrl, MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../../lib/image';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { StatusModal } from './StatusModal';
import { TEAM_LABELS } from '../../lib/teamConstants';
import {
    getMatchDetails,
    getTieBreakStatus,
    submitTieBreakRepresentative,
} from '../../lib/teamApi';
import { authenticatedFetch, ENDPOINTS, getErrorMessage, API_BASE_URL } from '../../lib/api';
import type {
    TeamMatchDetailsDto,
    SubMatchDto,
    TieBreakStatusDto,
    TeamMemberDto,
} from '../../types/team';

interface TeamMatchDetailModalProps {
    visible: boolean;
    onClose: () => void;
    matchId: string | null;
    tournamentId?: string;
    hubOwnerId?: string;
    canManage?: boolean;
    currentUserId?: string;
    onMatchUpdate?: () => void;
}

export function TeamMatchDetailModal({
    visible,
    onClose,
    matchId,
    tournamentId,
    hubOwnerId,
    canManage = false,
    currentUserId,
    onMatchUpdate,
}: TeamMatchDetailModalProps) {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const insets = useSafeAreaInsets();

    const [data, setData] = useState<TeamMatchDetailsDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Score input per sub-match
    const [scoreInputs, setScoreInputs] = useState<
        Record<string, { home: string; away: string }>
    >({});
    const [submittingScoreId, setSubmittingScoreId] = useState<string | null>(null);

    // Edit & Evidence state
    const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
    const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
    const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

    // Tie-break
    const [tieBreakStatus, setTieBreakStatus] = useState<TieBreakStatusDto | null>(null);
    const [showRepPicker, setShowRepPicker] = useState(false);
    const [isSubmittingRep, setIsSubmittingRep] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Status modal
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusConfig, setStatusConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });

    const formatAvatarUrl = (url?: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
        const path = url.startsWith('/') ? url : `/${url}`;
        return `${baseUrl}${path}`;
    };

    const fetchData = useCallback(async () => {
        if (!matchId) return;
        setIsLoading(true);
        setError(null);
        try {
            const raw = await getMatchDetails(matchId);

            const home = raw.homeTeam || raw.HomeTeam;
            const away = raw.awayTeam || raw.AwayTeam;
            const tb = raw.tieBreak || raw.TieBreak;
            const agg = raw.aggregateScore || raw.AggregateScore;

            const normalized: TeamMatchDetailsDto = {
                teamMatchId: raw.teamMatchId || raw.TeamMatchId || '',
                status: raw.status ?? raw.Status ?? 'Pending',
                winnerTeamParticipantId: raw.winnerTeamParticipantId || raw.WinnerTeamParticipantId || null,
                homeTeam: home ? {
                    teamId: home.teamId || home.TeamId || '',
                    teamName: home.teamName || home.TeamName || '',
                    members: (home.members || home.Members || []).map((m: any) => ({
                        userId: m.userId || m.UserId || '',
                        username: m.username || m.Username || '',
                        isCaptain: m.isCaptain || m.IsCaptain || false,
                        avatarUrl: formatAvatarUrl(m.avatarUrl || m.AvatarUrl),
                    })),
                    captainUserId: home.captainUserId || home.CaptainUserId || '',
                    avatarUrl: formatAvatarUrl(home.avatarUrl || home.AvatarUrl),
                } : null,
                awayTeam: away ? {
                    teamId: away.teamId || away.TeamId || '',
                    teamName: away.teamName || away.TeamName || '',
                    members: (away.members || away.Members || []).map((m: any) => ({
                        userId: m.userId || m.UserId || '',
                        username: m.username || m.Username || '',
                        isCaptain: m.isCaptain || m.IsCaptain || false,
                        avatarUrl: formatAvatarUrl(m.avatarUrl || m.AvatarUrl),
                    })),
                    captainUserId: away.captainUserId || away.CaptainUserId || '',
                    avatarUrl: formatAvatarUrl(away.avatarUrl || away.AvatarUrl),
                } : null,
                subMatches: (raw.subMatches || raw.SubMatches || []).map((sm: any) => {
                    const hp = sm.homePlayer || sm.HomePlayer;
                    const ap = sm.awayPlayer || sm.AwayPlayer;
                    
                    // Fall back to team member avatars if sub-match player avatar is null
                    const homeTeamMember = (home?.members || home?.Members || []).find((m: any) => 
                        (m.userId || m.UserId) === (hp?.userId || hp?.UserId)
                    );
                    const awayTeamMember = (away?.members || away?.Members || []).find((m: any) => 
                        (m.userId || m.UserId) === (ap?.userId || ap?.UserId)
                    );

                    return {
                        matchId: sm.matchId || sm.MatchId || '',
                        homePlayer: hp ? {
                            userId: hp.userId || hp.UserId || '',
                            username: hp.username || hp.Username || '',
                            isCaptain: hp.isCaptain || hp.IsCaptain || false,
                            avatarUrl: formatAvatarUrl(hp.avatarUrl || hp.AvatarUrl || homeTeamMember?.avatarUrl || homeTeamMember?.AvatarUrl),
                        } : null,
                        awayPlayer: ap ? {
                            userId: ap.userId || ap.UserId || '',
                            username: ap.username || ap.Username || '',
                            isCaptain: ap.isCaptain || ap.IsCaptain || false,
                            avatarUrl: formatAvatarUrl(ap.avatarUrl || ap.AvatarUrl || awayTeamMember?.avatarUrl || awayTeamMember?.AvatarUrl),
                        } : null,
                        homeScore: sm.homeScore ?? sm.HomeScore ?? null,
                        awayScore: sm.awayScore ?? sm.AwayScore ?? null,
                        status: sm.status ?? sm.Status ?? 'Pending',
                        winnerUserId: sm.winnerUserId || sm.WinnerUserId || null,
                        isTieBreakMatch: sm.isTieBreakMatch || sm.IsTieBreakMatch || false,
                        evidences: sm.evidences || sm.Evidences || [],
                    };
                }),
                aggregateScore: agg ? {
                    homeTeamWins: agg.homeTeamWins ?? agg.HomeTeamWins ?? 0,
                    awayTeamWins: agg.awayTeamWins ?? agg.AwayTeamWins ?? 0,
                    homeTeamTotalScore: agg.homeTeamTotalScore ?? agg.HomeTeamTotalScore ?? 0,
                    awayTeamTotalScore: agg.awayTeamTotalScore ?? agg.AwayTeamTotalScore ?? 0
                } : {
                    homeTeamWins: 0,
                    awayTeamWins: 0,
                    homeTeamTotalScore: 0,
                    awayTeamTotalScore: 0
                },
                tieBreak: tb ? {
                    isRequired: tb.isRequired || tb.IsRequired || false,
                    homeRepresentative: (() => {
                        const hr = tb.homeRepresentative || tb.HomeRepresentative;
                        return hr ? {
                            userId: hr.userId || hr.UserId || '',
                            username: hr.username || hr.Username || '',
                            isCaptain: hr.isCaptain || hr.IsCaptain || false,
                            avatarUrl: hr.avatarUrl || hr.AvatarUrl || '',
                        } : null;
                    })(),
                    awayRepresentative: (() => {
                        const ar = tb.awayRepresentative || tb.AwayRepresentative;
                        return ar ? {
                            userId: ar.userId || ar.UserId || '',
                            username: ar.username || ar.Username || '',
                            isCaptain: ar.isCaptain || ar.IsCaptain || false,
                            avatarUrl: ar.avatarUrl || ar.AvatarUrl || '',
                        } : null;
                    })(),
                } : null,
                evidences: raw.evidences || raw.Evidences || []
            };

            setData(normalized);
            if (normalized.tieBreak?.isRequired) {
                setTieBreakStatus(normalized.tieBreak);
            }
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [matchId]);

    useEffect(() => {
        if (visible && matchId) {
            fetchData();
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [visible, matchId, fetchData]);

    // Tie-break polling
    useEffect(() => {
        if (!visible || !data?.teamMatchId || data.status !== 'TieBreakRequired') {
            if (pollRef.current) clearInterval(pollRef.current);
            return;
        }

        const poll = async () => {
            try {
                const status = await getTieBreakStatus(data.teamMatchId);
                setTieBreakStatus(status);
                // If both reps are set, refresh full data to get the tie-break sub-match
                if (status.homeRepresentative && status.awayRepresentative) {
                    fetchData();
                    if (pollRef.current) clearInterval(pollRef.current);
                }
            } catch {
                // Silently fail polling
            }
        };

        pollRef.current = setInterval(poll, 5000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [visible, data?.teamMatchId, data?.status, fetchData]);

    // Also refresh on app focus
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active' && visible && matchId) {
                fetchData();
            }
        });
        return () => subscription.remove();
    }, [visible, matchId, fetchData]);

    const pickImages = async () => {
        try {
            const { status: pStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (pStatus !== 'granted') {
                setStatusConfig({ type: 'error', title: 'Permission Required', message: 'Camera roll permissions are needed.' });
                setShowStatusModal(true);
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                quality: 0.8,
            });

            if (!result.canceled) {
                const oversized = result.assets.filter(asset => !isFileSizeValid(asset));

                if (oversized.length > 0) {
                    const oversizedNames = oversized.map(a => a.fileName || 'Image').join(', ');
                    setStatusConfig({ 
                        type: 'error', 
                        title: 'Files too large', 
                        message: `Some images are too large: ${oversizedNames}. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.` 
                    });
                    setShowStatusModal(true);

                    const validAssets = result.assets.filter(asset => isFileSizeValid(asset));
                    if (validAssets.length > 0) {
                        setSelectedImages(prev => [...prev, ...validAssets]);
                    }
                    return;
                }

                setSelectedImages(prev => [...prev, ...result.assets]);
            }
        } catch (err) {
            console.error('Error picking images:', err);
        }
    };

    const removeImage = (uri: string) => {
        setSelectedImages(prev => prev.filter(img => img.uri !== uri));
    };

    const handleUploadOnly = async (subMatchId: string) => {
        if (!subMatchId || selectedImages.length === 0) return;
        setIsUploadingEvidence(true);
        try {
            const formData = new FormData();
            selectedImages.forEach((img, index) => {
                const filename = img.uri.split('/').pop() || `evidence-${index}.jpg`;
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                // @ts-ignore
                formData.append('files', { uri: img.uri, name: filename, type });
            });

            const response = await authenticatedFetch(ENDPOINTS.UPLOAD_MATCH_EVIDENCE(subMatchId), {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to upload images');
            }
            setSelectedImages([]);
            fetchData();
        } catch (err: any) {
            console.error('Upload evidence error:', err);
            setStatusConfig({ type: 'error', title: 'Upload Failed', message: err.message || 'Failed to upload evidence' });
            setShowStatusModal(true);
        } finally {
            setIsUploadingEvidence(false);
        }
    };

    const handleEditSubMatch = (sm: SubMatchDto) => {
        setEditingMatchId(sm.matchId);
        setScoreInputs((prev) => ({
            ...prev,
            [sm.matchId]: { home: String(sm.homeScore ?? ''), away: String(sm.awayScore ?? '') }
        }));
        setSelectedImages([]);
    };

    const handleCancelEdit = () => {
        setEditingMatchId(null);
        setSelectedImages([]);
    };

    const handleScoreChange = (subMatchId: string, side: 'home' | 'away', value: string) => {
        setScoreInputs((prev) => ({
            ...prev,
            [subMatchId]: {
                ...prev[subMatchId],
                [side]: value,
            },
        }));
    };

    const handleSubmitScore = async (subMatch: SubMatchDto) => {
        const inputs = scoreInputs[subMatch.matchId];
        if (!inputs?.home || !inputs?.away) return;

        const homeScore = parseInt(inputs.home);
        const awayScore = parseInt(inputs.away);
        if (isNaN(homeScore) || isNaN(awayScore)) return;

        setSubmittingScoreId(subMatch.matchId);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REPORT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({
                    MatchId: subMatch.matchId,
                    HomeScore: homeScore,
                    AwayScore: awayScore,
                    TournamentId: tournamentId
                }),
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'Failed');
                throw new Error(text);
            }

            if (selectedImages.length > 0 && subMatch.matchId === editingMatchId) {
                await handleUploadOnly(subMatch.matchId);
            }

            // Refresh data after submission
            setEditingMatchId(null);
            fetchData();
            onMatchUpdate?.();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setStatusConfig({ type: 'error', title: 'Error', message });
            setShowStatusModal(true);
        } finally {
            setSubmittingScoreId(null);
        }
    };

    const handleApproveSubMatch = async (subMatch: SubMatchDto) => {
        setSubmittingScoreId(subMatch.matchId);
        try {
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({ MatchId: subMatch.matchId }),
            });
            if (!response.ok) {
                const text = await response.text().catch(() => 'Failed');
                throw new Error(text);
            }
            fetchData();
            onMatchUpdate?.();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setStatusConfig({ type: 'error', title: 'Error', message });
            setShowStatusModal(true);
        } finally {
            setSubmittingScoreId(null);
        }
    };

    const handleRejectSubMatch = async (subMatch: SubMatchDto) => {
        setSubmittingScoreId(subMatch.matchId);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REJECT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({ MatchId: subMatch.matchId }),
            });
            if (!response.ok) {
                const text = await response.text().catch(() => 'Failed');
                throw new Error(text);
            }
            fetchData();
            onMatchUpdate?.();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setStatusConfig({ type: 'error', title: 'Error', message });
            setShowStatusModal(true);
        } finally {
            setSubmittingScoreId(null);
        }
    };

    const handleSelectRepresentative = async (member: TeamMemberDto) => {
        if (!data) return;
        setIsSubmittingRep(true);
        try {
            const status = await submitTieBreakRepresentative(data.teamMatchId, member.userId);
            setTieBreakStatus(status);
            setShowRepPicker(false);
            fetchData();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setStatusConfig({ type: 'error', title: 'Error', message });
            setShowStatusModal(true);
        } finally {
            setIsSubmittingRep(false);
        }
    };

    // Owner-level privileges: hub owner, hub admin or platform admin (canManage comes from the v2 endpoint).
    const isHubOwner =
        canManage ||
        (!!currentUserId && !!hubOwnerId &&
            currentUserId.toLowerCase() === hubOwnerId.toLowerCase());

    const isCaptainOfHome = data?.homeTeam && !!currentUserId && (
        String(data.homeTeam.captainUserId).toLowerCase() === String(currentUserId).toLowerCase() ||
        data.homeTeam.members?.some(m => String(m.userId).toLowerCase() === String(currentUserId).toLowerCase() && m.isCaptain)
    );
    const isCaptainOfAway = data?.awayTeam && !!currentUserId && (
        String(data.awayTeam.captainUserId).toLowerCase() === String(currentUserId).toLowerCase() ||
        data.awayTeam.members?.some(m => String(m.userId).toLowerCase() === String(currentUserId).toLowerCase() && m.isCaptain)
    );
    const isCaptainOfEitherTeam = !!(isCaptainOfHome || isCaptainOfAway);
 
    const isTieBreakMatchCreated = data?.subMatches?.some(sm => sm.isTieBreakMatch);
 
    // Check if current user already submitted rep
    const hasSubmittedRep = (() => {
        if (!tieBreakStatus) return false;
        if (isCaptainOfHome && tieBreakStatus.homeRepresentative) return true;
        if (isCaptainOfAway && tieBreakStatus.awayRepresentative) return true;
        return false;
    })();

    // Get the team members for the rep picker
    const myTeamMembers: TeamMemberDto[] = (() => {
        if (!data) return [];
        // Prioritize the team the user is actually on
        const userAsHome = data.homeTeam?.members?.some(m => m.userId.toLowerCase() === currentUserId?.toLowerCase());
        const userAsAway = data.awayTeam?.members?.some(m => m.userId.toLowerCase() === currentUserId?.toLowerCase());

        if (userAsHome && data.homeTeam) return data.homeTeam.members || [];
        if (userAsAway && data.awayTeam) return data.awayTeam.members || [];
        
        // If hub owner but not in a team, and not a captain, show both if we want admin choice
        // But user said "only show members from my team" - so if they are admin they might need both
        // Let's assume as admin they pick for the team they "choose" or we show all
        if (isHubOwner) {
            return (data.homeTeam?.members || []).concat(data.awayTeam?.members || []);
        }
        return [];
    })();

    const getStatusBadge = (status: string | number, isCompleted?: boolean) => {
        // If tied and no winner, always show tie-break state
        if (tieBreakStatus?.isRequired && !data?.winnerTeamParticipantId) {
             return (
                <View className="bg-[#F59E0B]/10 px-3 py-1 rounded-full border border-[#F59E0B]/30 flex-row items-center gap-1.5 shadow-sm">
                    <View className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                    <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-tighter">
                        Tie-Break
                    </Text>
                </View>
            );
        }

        if (isCompleted) {
            return (
                <View className="bg-[#064E3B] px-2 py-1 rounded-full">
                    <Text className="text-[9px] font-black text-[#10B981] uppercase">
                        Completed
                    </Text>
                </View>
            );
        }

        const statusStr = typeof status === 'number'
            ? (status === 0 ? 'Pending' : status === 1 ? 'ReadyPhase' : status === 2 ? 'InProgress' : status === 3 ? 'Completed' : status === 4 ? 'TieBreakRequired' : 'Pending')
            : status;

        switch (statusStr) {
            case 'Completed':
            case '2':
            case '3':
                return (
                    <View className="bg-[#064E3B] px-2 py-1 rounded-full">
                        <Text className="text-[9px] font-black text-[#10B981] uppercase">
                            Completed
                        </Text>
                    </View>
                );
            case 'Pending':
            case '0':
            case 'Scheduled':
            case '1':
            case 'ReadyPhase':
            case 'InProgress':
                return (
                    <View className="bg-yellow-500/10 px-2 py-1 rounded-full">
                        <Text className="text-[9px] font-black text-yellow-400 uppercase">
                            Pending
                        </Text>
                    </View>
                );
            case 'TieBreakRequired':
            case '4':
            case '5':
                return (
                    <View className="bg-[#F59E0B]/10 px-3 py-1 rounded-full border border-[#F59E0B]/30 flex-row items-center gap-1.5 shadow-sm">
                        <View className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                        <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-tighter">
                            Tie-Break
                        </Text>
                    </View>
                );
            default:
                return (
                    <View className="bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30 flex-row items-center gap-1.5 shadow-sm">
                        <View className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                        <Text className="text-[10px] font-black text-[#10B981] uppercase tracking-tighter">
                            Completed
                        </Text>
                    </View>
                );
        }
    };

    const getMatchPill = (status: string | number, isCompleted?: boolean) => {
        if (isCompleted || status === 'Completed' || status === 3) {
            return (
                <View className="bg-[#10B981]/10 px-2 py-0.5 rounded-full border border-[#10B981]/20 mt-1">
                    <Text className="text-[8px] font-black text-[#10B981] uppercase tracking-widest text-center">
                        Done
                    </Text>
                </View>
            );
        }
        return null;
    };

    const allEvidences = [...(data?.evidences || []), ...(data?.subMatches?.flatMap(sm => sm.evidences || []) || [])];

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View
                className="flex-1 bg-[#0B1120]"
                style={{
                    paddingTop: Math.max(insets.top, 50),
                    paddingBottom: Math.max(insets.bottom, 20),
                }}
            >
                {/* Header Bar */}
                <View className="flex-row items-center justify-between px-6 pb-4 mb-2 border-b border-white/5">
                    <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-white/5 items-center justify-center active:bg-white/10">
                        <Ionicons name="close" size={20} color="#94A3B8" />
                    </Pressable>
                    <Text className="text-sm font-black text-white uppercase tracking-[4px]">
                        MATCH DETAILS
                    </Text>
                    <View className="w-10" />
                </View>

                {isLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#10B981" />
                        <Text className="text-muted-foreground mt-4 font-bold uppercase tracking-widest text-[10px]">Loading match data...</Text>
                    </View>
                ) : error || !data ? (
                    <View className="flex-1 items-center justify-center px-6">
                        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                        <Text className="text-destructive mt-4 text-center font-medium">
                            {error || 'Match data unavailable'}
                        </Text>
                        <Button onPress={fetchData} className="mt-6">Retry</Button>
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Match Header */}
                        <View className="px-6 py-8 items-center">
                            <View className="flex-row items-center justify-center py-6 w-full bg-muted/10 rounded-3xl border border-border/10 shadow-sm">
                                {/* Home Team */}
                                <View className="items-center flex-1">
                                    <View className="mb-2">
                                        {data?.homeTeam?.avatarUrl ? (
                                            <PlayerAvatar
                                                src={data?.homeTeam?.avatarUrl}
                                                name={data?.homeTeam?.teamName || ''}
                                                size="lg"
                                                className="rounded-2xl border-0"
                                            />
                                        ) : (
                                            <View className="w-14 h-14 rounded-2xl bg-[#10B981]/10 items-center justify-center">
                                                <Ionicons name="people" size={24} color="#10B981" />
                                            </View>
                                        )}
                                    </View>
                                    <Text
                                        className="text-sm font-black text-foreground text-center"
                                        numberOfLines={2}
                                    >
                                        {data?.homeTeam?.teamName || 'Unknown'}
                                    </Text>
                                </View>

                                {/* Score */}
                                <View className="items-center px-4">
                                    <View className="flex-row items-center mb-1">
                                        <Text className={`text-6xl font-black ${(data?.aggregateScore?.homeTeamWins ?? 0) > (data?.aggregateScore?.awayTeamWins ?? 0) ? 'text-[#10B981]' : 'text-white/20'}`}>
                                            {data?.aggregateScore?.homeTeamWins ?? 0}
                                        </Text>
                                        <Text className="text-3xl font-black text-white/10 mx-3">:</Text>
                                        <Text className={`text-6xl font-black ${(data?.aggregateScore?.awayTeamWins ?? 0) > (data?.aggregateScore?.homeTeamWins ?? 0) ? 'text-[#10B981]' : 'text-foreground'}`}>
                                            {data?.aggregateScore?.awayTeamWins ?? 0}
                                        </Text>
                                    </View>
                                    <View className="mt-2">
                                        {getStatusBadge(data?.status || 'Pending', !!data?.winnerTeamParticipantId)}
                                    </View>
                                </View>

                                {/* Away Team */}
                                <View className="items-center flex-1">
                                    <View className="mb-2">
                                        {data?.awayTeam?.avatarUrl ? (
                                            <PlayerAvatar
                                                src={data?.awayTeam?.avatarUrl}
                                                name={data?.awayTeam?.teamName || ''}
                                                size="lg"
                                                className="rounded-2xl border-0"
                                            />
                                        ) : (
                                            <View className="w-14 h-14 rounded-2xl bg-indigo-500/10 items-center justify-center">
                                                <Ionicons name="people" size={24} color="#6366f1" />
                                            </View>
                                        )}
                                    </View>
                                    <Text
                                        className="text-sm font-black text-foreground text-center"
                                        numberOfLines={2}
                                    >
                                        {data?.awayTeam?.teamName || 'Unknown'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Tie-Break Banner */}
                        {tieBreakStatus?.isRequired && !data?.winnerTeamParticipantId && (
                            <View className="mx-6 mb-4">
                                <View className="bg-[#F59E0B]/10 p-4 rounded-2xl border border-[#F59E0B]/20">
                                    <View className="flex-row items-center gap-2 mb-2">
                                        <Ionicons name="warning" size={18} color="#F59E0B" />
                                        <Text className="text-sm font-black text-[#F59E0B]">
                                            {tieBreakStatus.homeRepresentative && tieBreakStatus.awayRepresentative
                                                ? TEAM_LABELS.TIE_BREAK_IN_PROGRESS
                                                : TEAM_LABELS.TIE_BREAK_BANNER}
                                        </Text>
                                    </View>

                                    {/* Representative status */}
                                    <View className="gap-2 mt-2">
                                        <View className="flex-row items-center justify-between">
                                            <Text className="text-xs text-muted-foreground font-bold">
                                                {TEAM_LABELS.HOME_REPRESENTATIVE}:
                                            </Text>
                                            <Text className="text-xs font-bold text-foreground">
                                                {tieBreakStatus.homeRepresentative?.username || TEAM_LABELS.WAITING_LABEL}
                                            </Text>
                                        </View>
                                        <View className="flex-row items-center justify-between">
                                            <Text className="text-xs text-muted-foreground font-bold">
                                                {TEAM_LABELS.AWAY_REPRESENTATIVE}:
                                            </Text>
                                            <Text className="text-xs font-bold text-foreground">
                                                {tieBreakStatus.awayRepresentative?.username || TEAM_LABELS.WAITING_LABEL}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Select Representative Button */}
                                    {(isCaptainOfEitherTeam || isHubOwner) && !isTieBreakMatchCreated && (
                                        <Button
                                            className="mt-3 bg-[#F59E0B]"
                                            size="sm"
                                            onPress={() => setShowRepPicker(true)}
                                            loading={isSubmittingRep}
                                        >
                                            <Text className="text-white font-black uppercase text-[10px]">
                                                {isHubOwner && !isCaptainOfEitherTeam ? "Admin: " : ""}
                                                {hasSubmittedRep ? "Change Representative" : String(TEAM_LABELS.SELECT_REPRESENTATIVE)}
                                            </Text>
                                        </Button>
                                    )}

                                    {isCaptainOfEitherTeam && hasSubmittedRep && (
                                        <Text className="text-xs text-[#F59E0B] mt-2 text-center font-bold">
                                            {TEAM_LABELS.WAITING_FOR_OPPONENT}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* Sub-Matches */}
                        <View className="px-6">
                            <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[2px] mb-4 ml-1">
                                INDIVIDUAL MATCHES
                            </Text>

                            {data.subMatches.map((sm) => (
                                <View
                                    key={sm.matchId}
                                    className="bg-[#111827]/40 rounded-[28px] border border-white/5 p-4 mb-3 shadow-sm"
                                >
                                    {sm.isTieBreakMatch && (
                                        <View className="bg-[#F59E0B]/10 px-2 py-0.5 rounded-full self-start mb-3 border border-[#F59E0B]/20">
                                            <Text className="text-[7px] font-black text-[#F59E0B] uppercase tracking-widest">
                                                {TEAM_LABELS.TIE_BREAK_LABEL}
                                            </Text>
                                        </View>
                                    )}
 
                                    <View className="flex-row items-center justify-between py-1">
                                        {/* Home player */}
                                        <Pressable 
                                            onPress={() => {
                                                if (sm.homePlayer?.userId) {
                                                    onClose();
                                                    navigation.navigate('PlayerProfile', { id: sm.homePlayer.userId });
                                                }
                                            }}
                                            className="flex-1 items-center gap-1.5"
                                        >
                                            <PlayerAvatar
                                                src={sm.homePlayer?.avatarUrl}
                                                name={sm.homePlayer?.username || 'Unknown'}
                                                size="md"
                                                className="rounded-xl"
                                            />
                                            <Text className="text-[11px] text-slate-200 font-bold text-center w-full px-1" numberOfLines={1}>
                                                {sm.homePlayer?.username || 'Unknown'}
                                            </Text>
                                        </Pressable>
 
                                        {/* Score Center */}
                                        <View className="items-center justify-center px-1 min-w-[80px]">
                                            {sm.homeScore !== null && sm.awayScore !== null ? (
                                                <View className="items-center">
                                                    <View className="flex-row items-center">
                                                        <Text className={`text-2xl font-black ${(sm.homeScore ?? 0) > (sm.awayScore ?? 0) ? 'text-[#10B981]' : 'text-slate-300'}`}>
                                                            {sm.homeScore}
                                                        </Text>
                                                        <Text className="text-base text-slate-600 font-black mx-2">:</Text>
                                                        <Text className={`text-2xl font-black ${(sm.awayScore ?? 0) > (sm.homeScore ?? 0) ? 'text-[#10B981]' : 'text-slate-300'}`}>
                                                            {sm.awayScore}
                                                        </Text>
                                                    </View>
                                                    <View className="mt-0.5">
                                                        {getMatchPill(sm.status, !!sm.winnerUserId)}
                                                    </View>
                                                </View>
                                            ) : (
                                                <View className="bg-white/5 py-0.5 px-2.5 rounded-lg border border-white/10">
                                                    <Text className="text-[8px] text-slate-500 font-black uppercase tracking-widest text-center">VS</Text>
                                                </View>
                                            )}
                                        </View>
 
                                        {/* Away player */}
                                        <Pressable 
                                            onPress={() => {
                                                if (sm.awayPlayer?.userId) {
                                                    onClose();
                                                    navigation.navigate('PlayerProfile', { id: sm.awayPlayer.userId });
                                                }
                                            }}
                                            className="flex-1 items-center gap-1.5"
                                        >
                                            <PlayerAvatar
                                                src={sm.awayPlayer?.avatarUrl}
                                                name={sm.awayPlayer?.username || 'Unknown'}
                                                size="md"
                                                className="rounded-xl"
                                            />
                                            <Text className="text-[11px] text-slate-200 font-bold text-center w-full px-1" numberOfLines={1}>
                                                {sm.awayPlayer?.username || 'Unknown'}
                                            </Text>
                                        </Pressable>
                                    </View>

                                    {(() => {
                                        // Pending proposal — surfaced only while approval is required and the sub-match has not yet completed.
                                        const approvalRequired = !!(data?.requireResultApproval ?? data?.RequireResultApproval);
                                        const proposedBy = (sm.proposedByUserId ?? sm.ProposedByUserId) || null;
                                        const subPending = sm.status === 'Pending' || sm.status === 0 || sm.status === 1;
                                        const hasProposal = approvalRequired && !!proposedBy && subPending;
                                        if (!hasProposal) return null;

                                        const phs = sm.proposedHomeScore ?? sm.ProposedHomeScore ?? 0;
                                        const pas = sm.proposedAwayScore ?? sm.ProposedAwayScore ?? 0;
                                        const isProposer = !!currentUserId && proposedBy!.toLowerCase() === currentUserId.toLowerCase();
                                        const homeId = (sm.homePlayer?.userId || sm.HomePlayer?.userId || '').toLowerCase();
                                        const awayId = (sm.awayPlayer?.userId || sm.AwayPlayer?.userId || '').toLowerCase();
                                        const me = (currentUserId || '').toLowerCase();
                                        const isOpponent = !isProposer && (me === homeId || me === awayId);
                                        const canDecide = isOpponent || isHubOwner;

                                        return (
                                            <View className="mt-3 pt-3 border-t border-[#F59E0B]/20">
                                                <View className="bg-[#F59E0B]/[0.06] rounded-xl border border-[#F59E0B]/15 p-3">
                                                    <View className="flex-row items-center justify-between mb-2">
                                                        <View className="bg-[#F59E0B]/15 px-2 py-0.5 rounded-md border border-[#F59E0B]/25">
                                                            <Text className="text-[9px] font-black text-[#F59E0B] uppercase tracking-widest">
                                                                {isProposer ? 'Awaiting Approval' : 'Result Reported'}
                                                            </Text>
                                                        </View>
                                                        <Text className="text-[14px] font-black text-[#F59E0B]">{phs} : {pas}</Text>
                                                    </View>
                                                    {canDecide && (
                                                        <View className="flex-row gap-2 mt-1">
                                                            <Pressable
                                                                onPress={() => handleRejectSubMatch(sm)}
                                                                disabled={submittingScoreId === sm.matchId}
                                                                className="flex-1 bg-red-500/10 rounded-lg py-2 items-center border border-red-500/20 active:opacity-70"
                                                            >
                                                                {submittingScoreId === sm.matchId ? (
                                                                    <ActivityIndicator size="small" color="#F87171" />
                                                                ) : (
                                                                    <Text className="text-[10px] font-black text-red-400 uppercase tracking-wider">Reject</Text>
                                                                )}
                                                            </Pressable>
                                                            <Pressable
                                                                onPress={() => handleApproveSubMatch(sm)}
                                                                disabled={submittingScoreId === sm.matchId}
                                                                className="flex-1 bg-[#10B981] rounded-lg py-2 items-center active:opacity-80"
                                                            >
                                                                {submittingScoreId === sm.matchId ? (
                                                                    <ActivityIndicator size="small" color="#0F172A" />
                                                                ) : (
                                                                    <Text className="text-[10px] font-black text-[#0F172A] uppercase tracking-wider">Approve</Text>
                                                                )}
                                                            </Pressable>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })()}

                                    {/* Evidence & Edit Mode */}
                                    {editingMatchId === sm.matchId || (isHubOwner && sm.status === 'Pending') ? (
                                        <View className="mt-3 pt-3 border-t border-border/10">
                                            {/* Score Input */}
                                            <View className="flex-row items-center gap-2 mb-3">
                                                <TextInput
                                                    className="flex-1 bg-muted/30 px-3 h-10 rounded-xl text-foreground text-center border border-border/10 font-black"
                                                    placeholder="0"
                                                    placeholderTextColor="#71717A"
                                                    keyboardType="numeric"
                                                    value={scoreInputs[sm.matchId]?.home || ''}
                                                    onChangeText={(v) => handleScoreChange(sm.matchId, 'home', v)}
                                                />
                                                <Text className="text-muted-foreground font-bold text-xs">—</Text>
                                                <TextInput
                                                    className="flex-1 bg-muted/30 px-3 h-10 rounded-xl text-foreground text-center border border-border/10 font-black"
                                                    placeholder="0"
                                                    placeholderTextColor="#71717A"
                                                    keyboardType="numeric"
                                                    value={scoreInputs[sm.matchId]?.away || ''}
                                                    onChangeText={(v) => handleScoreChange(sm.matchId, 'away', v)}
                                                />
                                            </View>
                                            
                                            {/* Evidence Section */}
                                            <View className="mb-4">
                                                <View className="flex-row items-center justify-between mb-2">
                                                    <View className="flex-row items-center gap-1.5">
                                                        <View className="w-5 h-5 rounded-md bg-[#10B981]/10 items-center justify-center">
                                                            <Ionicons name="images-outline" size={12} color="#10B981" />
                                                        </View>
                                                        <Text className="text-[10px] font-black text-white uppercase tracking-widest">Evidence</Text>
                                                    </View>
                                                    <Pressable onPress={pickImages} className="bg-[#10B981]/10 px-2 py-1 rounded-md border border-[#10B981]/20">
                                                        <Text className="text-[9px] font-black text-[#10B981] uppercase tracking-wider">Add</Text>
                                                    </Pressable>
                                                </View>
                                                {selectedImages.length > 0 ? (
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                        {selectedImages.map((img, index) => (
                                                            <View key={img.uri + index} className="mr-2 mb-1">
                                                                <View className="rounded-xl overflow-hidden border border-white/5">
                                                                    <Image source={{ uri: img.uri }} className="w-16 h-16" />
                                                                </View>
                                                                <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1 -right-1 bg-red-500 w-4 h-4 rounded-full items-center justify-center border border-[#0B1120] shadow-sm">
                                                                    <Ionicons name="close" size={8} color="white" />
                                                                </Pressable>
                                                            </View>
                                                        ))}
                                                    </ScrollView>
                                                ) : (
                                                    <Pressable onPress={pickImages} className="h-14 border border-dashed border-white/10 rounded-xl items-center justify-center bg-white/[0.02]">
                                                        <Text className="text-[10px] text-slate-600 font-bold">No photos selected</Text>
                                                    </Pressable>
                                                )}
                                            </View>

                                            <View className="flex-row gap-2">
                                                {sm.status !== 'Pending' && (
                                                    <Pressable onPress={handleCancelEdit} className="flex-1 bg-white/5 rounded-xl py-2 items-center border border-white/10 active:opacity-70">
                                                        <Text className="text-xs font-black text-slate-400 uppercase tracking-wider">Cancel</Text>
                                                    </Pressable>
                                                )}
                                                <Pressable 
                                                    onPress={() => handleSubmitScore(sm)} 
                                                    className="flex-1 bg-primary/90 rounded-xl py-2 items-center active:opacity-80"
                                                >
                                                    {submittingScoreId === sm.matchId ? (
                                                        <ActivityIndicator size="small" color="#0F172A" />
                                                    ) : (
                                                        <Text className="text-xs font-black text-primary-foreground uppercase tracking-wider">Save</Text>
                                                    )}
                                                </Pressable>
                                            </View>
                                        </View>
                                    ) : (
                                        <>
                                            {isHubOwner && sm.status !== 'Pending' && (
                                                <View className="flex-row justify-end mt-2 pt-2 border-t border-border/10">
                                                    <Pressable 
                                                        onPress={() => handleEditSubMatch(sm)}
                                                        className="bg-[#10B981]/10 px-3 py-1 rounded-md border border-[#10B981]/20 active:opacity-70"
                                                    >
                                                        <Text className="text-[9px] font-black text-[#10B981] uppercase tracking-wider">Edit Result</Text>
                                                    </Pressable>
                                                </View>
                                            )}
                                        </>
                                    )}
                                </View>
                            ))}
                        </View>

                        {/* Evidence Gallery — collapsible */}
                        <View className="mx-6 mb-6">
                            <Pressable
                                onPress={() => setIsEvidenceOpen(prev => !prev)}
                                className="flex-row items-center justify-between py-1 active:opacity-70"
                            >
                                <View className="flex-row items-center gap-2.5">
                                    <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center">
                                        <Ionicons name="images-outline" size={14} color="#818CF8" />
                                    </View>
                                    <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">Evidence</Text>
                                    {allEvidences.length > 0 && (
                                        <View className="bg-white/5 px-2 py-0.5 rounded-full">
                                            <Text className="text-[9px] font-bold text-slate-500">{allEvidences.length}</Text>
                                        </View>
                                    )}
                                </View>
                                <View className="w-7 h-7 rounded-full bg-white/5 items-center justify-center">
                                    <Ionicons
                                        name={isEvidenceOpen ? 'chevron-up' : 'chevron-down'}
                                        size={14}
                                        color="#475569"
                                    />
                                </View>
                            </Pressable>

                            {isEvidenceOpen && (
                                <View className="mt-3">
                                    {/* Display existing evidences */}
                                    {allEvidences.length > 0 ? (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                            {allEvidences.map((url, idx) => (
                                                <Pressable
                                                    key={idx}
                                                    className="mr-3"
                                                    onPress={() => setPreviewImage(url)}
                                                >
                                                    <View className="rounded-2xl overflow-hidden border border-white/5">
                                                        <Image
                                                            source={{ uri: getOptimizedCloudinaryUrl(url, 400) }}
                                                            className="w-36 h-48 bg-muted"
                                                            resizeMode="cover"
                                                        />
                                                    </View>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    ) : (
                                        <View className="bg-white/5 rounded-2xl py-6 items-center justify-center border border-white/10 border-dashed">
                                            <View className="w-10 h-10 rounded-full bg-indigo-500/10 items-center justify-center mb-2">
                                                <Ionicons name="images-outline" size={18} color="#818CF8" />
                                            </View>
                                            <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No Evidence Attached</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Footer */}
                        <View className="px-6 pt-2 mb-8">
                            { (tieBreakStatus?.isRequired || (data && (data.status === 'TieBreakRequired' || data.status === 4))) && !data?.winnerTeamParticipantId ? (
                                <View className="bg-[#F59E0B]/10 rounded-3xl border border-[#F59E0B]/30 p-5 items-center">
                                    <View className="flex-row items-center gap-3">
                                        <Ionicons name="warning" size={20} color="#F59E0B" />
                                        <Text className="text-sm font-black text-[#F59E0B] uppercase tracking-widest">
                                            {TEAM_LABELS.TIE_BREAK_BANNER}
                                        </Text>
                                    </View>
                                </View>
                            ) : (data?.status === 'Completed' || data?.status === 3 || data?.winnerTeamParticipantId) && ((data?.aggregateScore?.homeTeamWins ?? 0) !== (data?.aggregateScore?.awayTeamWins ?? 0) || data?.winnerTeamParticipantId) ? (
                                <View className="bg-[#10B981]/10 rounded-[32px] border border-[#10B981]/30 p-6 shadow-lg relative overflow-hidden">
                                     <View className="flex-row items-center gap-4">
                                         <View className="bg-[#10B981]/20 p-4 rounded-3xl shadow-sm border border-[#10B981]/30">
                                             <Ionicons name="trophy" size={32} color="#10B981" />
                                         </View>
                                         <View className="flex-1">
                                             {(() => {
                                                 let winnerIsHome = false;
                                                 let isTie = false;
                                                 let winnerCalculated = false;

                                                 const matchWinsHome = data?.aggregateScore?.homeTeamWins ?? 0;
                                                 const matchWinsAway = data?.aggregateScore?.awayTeamWins ?? 0;
                                                 const totalScoreHome = data?.aggregateScore?.homeTeamTotalScore ?? 0;
                                                 const totalScoreAway = data?.aggregateScore?.awayTeamTotalScore ?? 0;

                                                 if (data?.winnerTeamParticipantId) {
                                                     if (data?.homeTeam?.teamId === data?.winnerTeamParticipantId) {
                                                         winnerIsHome = true;
                                                         winnerCalculated = true;
                                                     } else if (data?.awayTeam?.teamId === data?.winnerTeamParticipantId) {
                                                         winnerIsHome = false;
                                                         winnerCalculated = true;
                                                     }
                                                 }

                                                 if (!winnerCalculated) {
                                                     if (matchWinsHome !== matchWinsAway) {
                                                         winnerIsHome = matchWinsHome > matchWinsAway;
                                                     } else if (totalScoreHome !== totalScoreAway) {
                                                         winnerIsHome = totalScoreHome > totalScoreAway;
                                                     } else {
                                                         isTie = true;
                                                     }
                                                 }

                                                 const winningTeamName = isTie ? 'MATCH DRAW' : (winnerIsHome ? data?.homeTeam?.teamName : data?.awayTeam?.teamName);
                                                 const winningWins = winnerIsHome ? matchWinsHome : matchWinsAway;
                                                 const losingWins = winnerIsHome ? matchWinsAway : matchWinsHome;
                                                 const winningTotal = winnerIsHome ? totalScoreHome : totalScoreAway;
                                                 const losingTotal = winnerIsHome ? totalScoreAway : totalScoreHome;
                                                 
                                                 const isMatchWinsTie = matchWinsHome === matchWinsAway;
                                                 const isBigWin = Math.abs(winningWins - losingWins) >= 2;

                                                 return (
                                                     <>
                                                         <Text className="text-[10px] font-black text-[#10B981]/60 uppercase tracking-[2px] mb-1">
                                                             TEAM MATCH WINNER
                                                         </Text>
                                                         <Text className="text-xl font-black text-[#10B981] uppercase leading-tight mb-2" numberOfLines={1}>
                                                             {winningTeamName}
                                                         </Text>
                                                         
                                                         {isTie ? (
                                                             <View className="flex-row items-center bg-[#10B981]/15 self-start px-2.5 py-1 rounded-lg border border-[#10B981]/20 gap-1.5">
                                                                 <Ionicons name="calculator" size={12} color="#10B981" />
                                                                 <Text className="text-[10px] font-black text-[#10B981] uppercase tracking-wider mt-0.5">
                                                                     DRAW · {winningWins} - {losingWins}
                                                                 </Text>
                                                             </View>
                                                         ) : isMatchWinsTie ? (
                                                             <View className="flex-row items-center bg-[#10B981]/15 self-start px-2.5 py-1 rounded-lg border border-[#10B981]/20 gap-1.5">
                                                                 <Ionicons name="calculator" size={12} color="#10B981" />
                                                                 <Text className="text-[10px] font-black text-[#10B981] uppercase tracking-wider mt-0.5">
                                                                     AGGREGATE WIN · {winningTotal} - {losingTotal}
                                                                 </Text>
                                                             </View>
                                                         ) : (
                                                             <View className="flex-row items-center bg-[#10B981]/15 self-start px-2.5 py-1 rounded-lg border border-[#10B981]/20 gap-1.5">
                                                                 <Ionicons name="flag" size={12} color="#10B981" />
                                                                 <Text className="text-[10px] font-black text-[#10B981] uppercase tracking-wider mt-0.5">
                                                                     {isBigWin ? 'DOMINANT WIN' : 'MATCH WINS'} · {winningWins} - {losingWins}
                                                                 </Text>
                                                             </View>
                                                         )}
                                                     </>
                                                 );
                                             })()}
                                         </View>
                                     </View>
                                </View>
                            ) : (
                                <View className="bg-white/5 rounded-3xl border border-white/10 p-5 items-center">
                                    <View className="flex-row items-center gap-3">
                                        <ActivityIndicator size="small" color="#64748B" />
                                        <Text className="text-sm font-black text-slate-500 uppercase tracking-widest">
                                            {TEAM_LABELS.AWAITING_RESULTS}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                )}
            </View>

            {/* Representative Picker Sub-Modal */}
            {showRepPicker && (
                <Modal
                    visible={showRepPicker}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowRepPicker(false)}
                >
                    <View className="flex-1 bg-black/60 items-center justify-center p-6">
                        <Pressable
                            className="absolute inset-0"
                            onPress={() => setShowRepPicker(false)}
                        />
                        <View className="bg-card w-full max-w-sm rounded-[32px] overflow-hidden border border-border/10 shadow-2xl">
                            <View className="p-6 border-b border-white/5">
                                <Text className="text-lg font-bold text-white text-center">
                                    {TEAM_LABELS.SELECT_REPRESENTATIVE}
                                </Text>
                            </View>
                            <ScrollView className="max-h-80">
                                {myTeamMembers.map((member) => (
                                    <Pressable
                                        key={member.userId}
                                        onPress={() => handleSelectRepresentative(member)}
                                        disabled={isSubmittingRep}
                                        className="flex-row items-center gap-3 p-4 border-b border-white/5 active:bg-white/5"
                                    >
                                        <PlayerAvatar
                                            src={member.avatarUrl}
                                            name={member.username}
                                            size="md"
                                        />
                                        <Text className="flex-1 text-white font-bold text-base">
                                            {member.username}
                                        </Text>
                                        {member.isCaptain && (
                                            <Ionicons name="shield" size={14} color="#F59E0B" />
                                        )}
                                        {isSubmittingRep ? (
                                            <ActivityIndicator size="small" color="#00E5A0" />
                                        ) : (
                                            <Ionicons name="chevron-forward" size={18} color="#475569" />
                                        )}
                                    </Pressable>
                                ))}
                            </ScrollView>
                            <View className="p-4">
                                <Button
                                    variant="outline"
                                    onPress={() => setShowRepPicker(false)}
                                    className="w-full"
                                >
                                    {TEAM_LABELS.CANCEL_BUTTON}
                                </Button>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {showStatusModal && (
                <StatusModal
                    visible={showStatusModal}
                    type={statusConfig.type}
                    title={statusConfig.title}
                    message={statusConfig.message}
                    onClose={() => setShowStatusModal(false)}
                />
            )}

            {/* Evidence Image Preview Modal */}
            {previewImage && (
                <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
                    <View className="flex-1 bg-black/95 items-center justify-center p-4">
                        <Pressable onPress={() => setPreviewImage(null)} className="absolute top-12 right-6 z-10 w-10 h-10 bg-white/10 rounded-full items-center justify-center">
                            <Ionicons name="close" size={24} color="white" />
                        </Pressable>
                        <Image
                            source={{ uri: getOptimizedCloudinaryUrl(previewImage, 800) }}
                            className="w-full h-full"
                            resizeMode="contain"
                        />
                    </View>
                </Modal>
            )}
        </Modal>
    );
}
