import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { HourlyAvailabilityPicker } from '../match/HourlyAvailabilityPicker';
import { MatchChatPanel } from '../match/MatchChatPanel';
import { AdminHelpSection } from '../match/AdminHelpSection';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { getOptimizedCloudinaryUrl, MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../../lib/image';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn, parseUtcDate } from '../../lib/utils';

export type MatchStatus = 'pending_availability' | 'scheduled' | 'ready_phase' | 'completed';

export interface MatchResultDetailDto {
    homeUser: string;
    homeUserId: string;
    awayUser: string;
    awayUserId: string;
    homeUserScore: number;
    awayUserScore: number;
    evidences: string[];
    hubOwnerId?: string;
    scheduledTime?: string;
    homeUserAvatarUrl?: string;
    HomeUserAvatarUrl?: string;
    awayUserAvatarUrl?: string;
    AwayUserAvatarUrl?: string;
    requireResultApproval?: boolean;
    proposedHomeScore?: number | null;
    proposedAwayScore?: number | null;
    proposedByUserId?: string | null;
    adminHelpRequested?: boolean;
    adminHelpRequestedByUserId?: string | null;
}

interface MatchDetailsModalProps {
    visible: boolean;
    onClose: () => void;
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    roundName: string;
    opponentName: string;
    status: MatchStatus;
    deadline?: string;
    scheduledTime?: string;
    opponentAvailability?: string[];
    myAvailability?: string[];
    onMatchUpdate?: () => void;
    home?: { userId: string; username: string; score: number | null };
    away?: { userId: string; username: string; score: number | null };
    evidences?: string[];
    hubOwnerId?: string;
    canManage?: boolean;
    isRoundLocked?: boolean;
    canRevert?: boolean;
    requireResultApproval?: boolean;
    /** Backend tournament status (4 = Completed). When completed, the chat tab is hidden for everyone. */
    tournamentStatus?: number;
    /**
     * Which tab to show first when the modal opens. Defaults to "match".
     * The TournamentDetailsScreen passes "chat" when an admin enters from the
     * help-requests inbox so the conversation is one tap away.
     */
    defaultTab?: 'match' | 'chat';
}

export function MatchDetailsModal({
    visible,
    onClose,
    matchId,
    tournamentId,
    tournamentName,
    roundName,
    opponentName,
    status,
    deadline = 'TBD',
    scheduledTime,
    opponentAvailability = [],
    myAvailability = [],
    onMatchUpdate,
    home,
    away,
    evidences,
    hubOwnerId,
    canManage = false,
    isRoundLocked = false,
    canRevert = false,
    requireResultApproval = false,
    tournamentStatus,
    defaultTab = 'match',
}: MatchDetailsModalProps) {
    const { user } = useAuth();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const insets = useSafeAreaInsets();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Availability state
    const [mySlots, setMySlots] = useState<string[]>(myAvailability);
    const [opponentSlots, setOpponentSlots] = useState<string[]>(opponentAvailability);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
    const [confirmedTime, setConfirmedTime] = useState<string | undefined>(scheduledTime);
    const [currentStatus, setCurrentStatus] = useState<MatchStatus>(status);
    const [localDeadline, setLocalDeadline] = useState<string>(deadline);

    // Reporting state
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);

    // Details for completed matches
    const [matchDetails, setMatchDetails] = useState<MatchResultDetailDto | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    // Image preview state
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Edit mode state
    const [isEditMode, setIsEditMode] = useState(false);

    // Evidence collapse state
    const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

    // Approval flow state
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [isEditingProposal, setIsEditingProposal] = useState(false);

    // Match / Chat tab state — initial value mirrors defaultTab; the effects below
    // re-apply it whenever the modal opens or the match changes so reopening on the
    // same matchId still honors the host's intent.
    const [activeTab, setActiveTab] = useState<'match' | 'chat'>(defaultTab);

    // Android-only: under Expo SDK 54 edge-to-edge the window no longer resizes for
    // the keyboard, so we track the real keyboard height and pad the chat ourselves.
    // iOS keeps using KeyboardAvoidingView below.
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const formatAvatarUrl = (url?: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
        const path = url.startsWith('/') ? url : `/${url}`;
        return `${baseUrl}${path}`;
    };

    // Reset per-match input state when the admin switches to a different match
    // (the parent keeps the modal mounted and just swaps matchId).
    useEffect(() => {
        setHomeScore('');
        setAwayScore('');
        setSelectedImages([]);
        setError(null);
        setIsEditMode(false);
        setIsEditingProposal(false);
    }, [matchId]);

    // Apply the host-requested starting tab whenever the modal opens or the match
    // changes — covers reopens on the same matchId (e.g. admin closes from chat,
    // reopens via the help-requests inbox and expects chat again).
    useEffect(() => {
        if (visible) setActiveTab(defaultTab);
    }, [matchId, visible, defaultTab]);

    useEffect(() => {
        if (visible && matchId) {
            fetchMatchDetails();
            if (status === 'pending_availability') {
                fetchAvailability();
            }
        }
    }, [visible, status, matchId, evidences, home, away]);

    const fetchMatchDetails = async () => {
        if (!matchId) return;
        setIsLoadingDetails(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS(matchId));
            if (response.ok) {
                const data = await response.json();
                const normalizedData: MatchResultDetailDto = {
                    ...data,
                    homeUser: data.homeUser || data.HomeUser || '',
                    homeUserId: data.homeUserId || data.HomeUserId || '',
                    awayUser: data.awayUser || data.AwayUser || '',
                    awayUserId: data.awayUserId || data.AwayUserId || '',
                    homeUserScore: data.homeUserScore ?? data.HomeUserScore ?? 0,
                    awayUserScore: data.awayUserScore ?? data.AwayUserScore ?? 0,
                    evidences: data.evidences || data.Evidences || [],
                    scheduledTime: data.scheduledTime || data.ScheduledTime,
                    homeUserAvatarUrl: formatAvatarUrl(data.homeUserAvatarUrl || data.HomeUserAvatarUrl),
                    awayUserAvatarUrl: formatAvatarUrl(data.awayUserAvatarUrl || data.AwayUserAvatarUrl),
                    requireResultApproval: data.requireResultApproval ?? data.RequireResultApproval ?? false,
                    proposedHomeScore: data.proposedHomeScore ?? data.ProposedHomeScore ?? null,
                    proposedAwayScore: data.proposedAwayScore ?? data.ProposedAwayScore ?? null,
                    proposedByUserId: data.proposedByUserId ?? data.ProposedByUserId ?? null,
                    adminHelpRequested: data.adminHelpRequested ?? data.AdminHelpRequested ?? false,
                    adminHelpRequestedByUserId: data.adminHelpRequestedByUserId ?? data.AdminHelpRequestedByUserId ?? null,
                };
                setMatchDetails(normalizedData);
                if (normalizedData.scheduledTime) {
                    const date = parseUtcDate(normalizedData.scheduledTime);
                    setConfirmedTime(date.toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }));
                }
            } else {
                setError('Failed to load match results');
            }
        } catch (err) {
            console.error('Error fetching match details:', err);
            setError('An error occurred while loading results');
        } finally {
            setIsLoadingDetails(false);
            setIsEditMode(false);
        }
    };

    const fetchAvailability = async () => {
        if (!user?.id || !matchId) return;
        setIsLoadingAvailability(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_AVAILABILITY(matchId, user.id));
            if (response.ok) {
                const data = await response.json();
                if (data.mySlots) setMySlots(data.mySlots);
                if (data.opponentSlots) setOpponentSlots(data.opponentSlots);
                if (data.matchDeadline) {
                    setLocalDeadline(data.matchDeadline);
                }
                if (data.confirmedTime) {
                    const confirmedDate = parseUtcDate(data.confirmedTime);
                    setConfirmedTime(confirmedDate.toLocaleString());
                    setCurrentStatus('scheduled');
                }
            }
        } catch (error) {
            console.error('Error fetching availability:', error);
        } finally {
            setIsLoadingAvailability(false);
        }
    };

    const pickImages = async () => {
        try {
            const { status: pStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (pStatus !== 'granted') {
                setError('Sorry, we need camera roll permissions to make this work!');
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
                    setError(`Some images are too large: ${oversizedNames}. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);

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
            setError('Failed to pick images');
        }
    };

    const removeImage = (uri: string) => {
        setSelectedImages(prev => prev.filter(img => img.uri !== uri));
    };

    const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

    const handleUploadOnly = async () => {
        if (!matchId || selectedImages.length === 0) return;

        setIsUploadingEvidence(true);
        setError(null);

        try {
            const formData = new FormData();
            selectedImages.forEach((img, index) => {
                const filename = img.uri.split('/').pop() || `evidence-${index}.jpg`;
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                // @ts-ignore
                formData.append('files', { uri: img.uri, name: filename, type });
            });

            const response = await authenticatedFetch(ENDPOINTS.UPLOAD_MATCH_EVIDENCE(matchId), {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to upload images');
            }

            setSelectedImages([]);
            if (onMatchUpdate) onMatchUpdate();
            fetchMatchDetails();

        } catch (err: any) {
            console.error('Upload evidence error:', err);
            setError(err.message || 'An error occurred while uploading evidence');
        } finally {
            setIsUploadingEvidence(false);
        }
    };

    const handleSubmitResult = async () => {
        if (!matchId || !tournamentId) return;
        if (homeScore === '' || awayScore === '') {
            setError('Please enter scores for both players');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const payload = {
                MatchId: matchId,
                HomeScore: parseInt(homeScore, 10),
                AwayScore: parseInt(awayScore, 10),
                TournamentId: tournamentId
            };

            const response = await authenticatedFetch(ENDPOINTS.REPORT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to report result');
            }

            if (selectedImages.length > 0) {
                await handleUploadOnly();
            }

            // When approval is required and the submitter is a regular participant, the result
            // becomes a pending proposal — keep the modal open so they immediately see the
            // "Awaiting approval" state instead of getting bounced back to the bracket.
            const willCreateProposal = approvalRequired && !(isHubOwner || canManage) && status !== 'completed';

            if (onMatchUpdate) onMatchUpdate();

            if (willCreateProposal) {
                setHomeScore('');
                setAwayScore('');
                setSelectedImages([]);
                await fetchMatchDetails();
            } else {
                onClose();
            }
        } catch (err: any) {
            console.error('Report result error:', err);
            setError(err.message || 'An error occurred while reporting result');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApproveProposal = async () => {
        if (!matchId) return;
        setIsApproving(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({ MatchId: matchId }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to approve result');
            }
            if (onMatchUpdate) onMatchUpdate();
            onClose();
        } catch (err: any) {
            console.error('Approve result error:', err);
            setError(err.message || 'An error occurred while approving the result');
        } finally {
            setIsApproving(false);
        }
    };

    const handleRejectProposal = async () => {
        if (!matchId) return;
        setIsRejecting(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REJECT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({ MatchId: matchId }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to reject result');
            }
            if (onMatchUpdate) onMatchUpdate();
            await fetchMatchDetails();
        } catch (err: any) {
            console.error('Reject result error:', err);
            setError(err.message || 'An error occurred while rejecting the result');
        } finally {
            setIsRejecting(false);
        }
    };

    const navigateToProfile = (userId?: string) => {
        if (!userId) return;
        onClose();
        navigation.navigate('PlayerProfile', { id: userId });
    };

    const handleEditResult = () => {
        if (!matchDetails) return;
        setHomeScore(matchDetails.homeUserScore.toString());
        setAwayScore(matchDetails.awayUserScore.toString());
        setIsEditMode(true);
    };

    const handleCancelEdit = () => {
        setIsEditMode(false);
        setHomeScore('');
        setAwayScore('');
        setSelectedImages([]);
        setError(null);
    };

    // Permission check
    // canManage covers hub owner, hub admin and platform admin (resolved by the v2 structure endpoint).
    const isHubOwner = !!(hubOwnerId && user?.id && hubOwnerId.toLowerCase() === user.id.toLowerCase());

    const isHome = (home?.userId || matchDetails?.homeUserId)?.toLowerCase() === user?.id?.toLowerCase();
    const isAway = (away?.userId || matchDetails?.awayUserId)?.toLowerCase() === user?.id?.toLowerCase();
    const isParticipant = !!(isHome || isAway);

    const canEditResult = status === 'completed' && !isEditMode && canRevert;

    const canSubmit = isParticipant || isHubOwner || canManage;

    // Approval-flow derived state.
    // The tournament setting reaches us either from the parent (bracket structure) or the match details payload.
    const approvalRequired = !!(requireResultApproval || matchDetails?.requireResultApproval);
    const proposedByUserId = matchDetails?.proposedByUserId || null;
    const hasPendingProposal = approvalRequired && !!proposedByUserId && status !== 'completed';
    const isProposer = hasPendingProposal && !!user?.id && proposedByUserId?.toLowerCase() === user.id.toLowerCase();
    const isPrivileged = isHubOwner || canManage;
    // Opponent (or any privileged user) can confirm; the proposer cannot self-approve.
    const canDecideOnProposal = hasPendingProposal && !isProposer && (isParticipant || isPrivileged);

    const adminHelpRequested = !!matchDetails?.adminHelpRequested;
    // Chat & admin-help visibility:
    //  - tournament completed → nobody sees the chat tab (not even admins)
    //  - participants see it for their own matches
    //  - privileged users (hub owner/admin) only see it while a help request is open
    //  - spectators tapping a bracket match keep the read-only match view
    const isTournamentCompleted = Number(tournamentStatus) === 4;
    const showChatTab = !isTournamentCompleted && (isParticipant || (isPrivileged && adminHelpRequested));
    // Completed matches keep the conversation visible but block new messages.
    const isChatReadOnly = status === 'completed';
    const adminHelpRequestedByMe = !!user?.id &&
        matchDetails?.adminHelpRequestedByUserId?.toLowerCase() === user.id.toLowerCase();

    const chatAvatars: Record<string, string | undefined> = {};
    if (matchDetails?.homeUserId) chatAvatars[matchDetails.homeUserId.toLowerCase()] = matchDetails.homeUserAvatarUrl || undefined;
    if (matchDetails?.awayUserId) chatAvatars[matchDetails.awayUserId.toLowerCase()] = matchDetails.awayUserAvatarUrl || undefined;

    // Determine winner for completed matches
    const getWinnerSide = () => {
        if (!matchDetails) return null;
        if (matchDetails.homeUserScore > matchDetails.awayUserScore) return 'home';
        if (matchDetails.awayUserScore > matchDetails.homeUserScore) return 'away';
        return 'draw';
    };

    const renderCompletedMatch = () => {
        if (isLoadingDetails) {
            return (
                <View className="flex-1 items-center justify-center py-20">
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text className="text-slate-500 mt-4 font-bold uppercase tracking-widest text-[10px]">Loading match data...</Text>
                </View>
            );
        }

        if (!matchDetails) {
            return (
                <View className="py-20 items-center">
                    <Ionicons name="alert-circle-outline" size={48} color="#71717A" />
                    <Text className="text-muted-foreground mt-2">{error || 'No details available'}</Text>
                </View>
            );
        }

        if (isEditMode) {
            return renderEditMode();
        }

        const winner = getWinnerSide();
        const homeAvatar = matchDetails.homeUserAvatarUrl || matchDetails.HomeUserAvatarUrl || '';
        const awayAvatar = matchDetails.awayUserAvatarUrl || matchDetails.AwayUserAvatarUrl || '';

        return (
            <View>
                {/* Score Card */}
                <View className="mx-5 mt-4 mb-5">
                    <View className="bg-[#111827]/60 rounded-[32px] border border-white/[0.06] p-6 overflow-hidden">
                        {/* Status Badge */}
                        <View className="items-center mb-5">
                            <View className="bg-[#10B981]/10 px-4 py-1.5 rounded-full border border-[#10B981]/20">
                                <Text className="text-[9px] font-black text-[#10B981] uppercase tracking-[3px]">Final Score</Text>
                            </View>
                        </View>

                        {/* Players & Score - fixed alignment */}
                        <View className="flex-row items-start justify-between">
                            {/* Home Player */}
                            <Pressable onPress={() => navigateToProfile(matchDetails.homeUserId)} className="flex-1 items-center">
                                {/* Avatar with winner ring — fixed size wrapper so border doesn't shift layout */}
                                <View
                                    style={{
                                        width: 60,
                                        height: 60,
                                        borderRadius: 16,
                                        borderWidth: 2,
                                        borderColor: winner === 'home' ? 'rgba(16,185,129,0.4)' : 'transparent',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <PlayerAvatar
                                        src={homeAvatar}
                                        name={matchDetails.homeUser}
                                        size="lg"
                                        className="rounded-2xl border-0"
                                    />
                                </View>
                                <Text className="text-xs font-bold text-slate-300 text-center mt-2.5 px-1" numberOfLines={1}>
                                    {matchDetails.homeUser}
                                </Text>
                                {/* Always render winner space to keep names at same height */}
                                <View className="mt-1.5 h-5 items-center justify-center">
                                    {winner === 'home' && (
                                        <View className="bg-[#10B981]/10 px-2 py-0.5 rounded-full border border-[#10B981]/20">
                                            <Text className="text-[8px] font-black text-[#10B981] uppercase tracking-widest">Winner</Text>
                                        </View>
                                    )}
                                </View>
                            </Pressable>

                            {/* Score Center */}
                            <View className="items-center px-2 pt-1">
                                <View className="flex-row items-baseline">
                                    <Text className={`text-5xl font-black ${winner === 'home' ? 'text-[#10B981]' : 'text-white/20'}`}>
                                        {matchDetails.homeUserScore}
                                    </Text>
                                    <Text className="text-2xl font-black text-white/10 mx-2">:</Text>
                                    <Text className={`text-5xl font-black ${winner === 'away' ? 'text-[#10B981]' : 'text-white/20'}`}>
                                        {matchDetails.awayUserScore}
                                    </Text>
                                </View>
                            </View>

                            {/* Away Player */}
                            <Pressable onPress={() => navigateToProfile(matchDetails.awayUserId)} className="flex-1 items-center">
                                <View
                                    style={{
                                        width: 60,
                                        height: 60,
                                        borderRadius: 16,
                                        borderWidth: 2,
                                        borderColor: winner === 'away' ? 'rgba(16,185,129,0.4)' : 'transparent',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <PlayerAvatar
                                        src={awayAvatar}
                                        name={matchDetails.awayUser}
                                        size="lg"
                                        className="rounded-2xl border-0"
                                    />
                                </View>
                                <Text className="text-xs font-bold text-slate-300 text-center mt-2.5 px-1" numberOfLines={1}>
                                    {matchDetails.awayUser}
                                </Text>
                                <View className="mt-1.5 h-5 items-center justify-center">
                                    {winner === 'away' && (
                                        <View className="bg-[#10B981]/10 px-2 py-0.5 rounded-full border border-[#10B981]/20">
                                            <Text className="text-[8px] font-black text-[#10B981] uppercase tracking-widest">Winner</Text>
                                        </View>
                                    )}
                                </View>
                            </Pressable>
                        </View>
                    </View>
                </View>

                {/* Evidence Gallery — collapsible */}
                <View className="mx-5 mb-5">
                    <Pressable
                        onPress={() => setIsEvidenceOpen(prev => !prev)}
                        className="flex-row items-center justify-between py-1 active:opacity-70"
                    >
                        <View className="flex-row items-center gap-2.5">
                            <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center">
                                <Ionicons name="images-outline" size={14} color="#818CF8" />
                            </View>
                            <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">Evidence</Text>
                            {matchDetails.evidences && matchDetails.evidences.length > 0 && (
                                <View className="bg-white/5 px-2 py-0.5 rounded-full">
                                    <Text className="text-[9px] font-bold text-slate-500">{matchDetails.evidences.length}</Text>
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
                            {matchDetails.evidences && matchDetails.evidences.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {matchDetails.evidences.map((url, idx) => (
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

                {/* Edit Result Button */}
                {canEditResult && (
                    <View className="mx-5 mb-6">
                        <Pressable
                            onPress={handleEditResult}
                            className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4 flex-row items-center justify-center gap-2.5 active:opacity-70"
                        >
                            <View className="w-8 h-8 rounded-xl bg-[#10B981]/10 items-center justify-center">
                                <Ionicons name="create-outline" size={16} color="#10B981" />
                            </View>
                            <Text className="text-sm font-black text-[#10B981] uppercase tracking-widest">Edit Result</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        );
    };

    const renderEditMode = () => {
        if (!matchDetails) return null;

        const homeAvatar = matchDetails.homeUserAvatarUrl || matchDetails.HomeUserAvatarUrl || '';
        const awayAvatar = matchDetails.awayUserAvatarUrl || matchDetails.AwayUserAvatarUrl || '';

        return (
            <View className="mx-5 mt-4">
                {/* Edit Header */}
                <View className="items-center mb-5">
                    <View className="bg-[#F59E0B]/10 px-4 py-1.5 rounded-full border border-[#F59E0B]/20">
                        <Text className="text-[9px] font-black text-[#F59E0B] uppercase tracking-[3px]">Editing Result</Text>
                    </View>
                    <Text className="text-[10px] text-slate-500 mt-2 font-bold">{isHubOwner ? 'Hub Owner Privileges' : 'Fix Your Score'}</Text>
                </View>

                {error && (
                    <View className="bg-red-500/10 p-4 rounded-2xl mb-4 border border-red-500/20">
                        <Text className="text-red-400 text-sm text-center font-medium">{error}</Text>
                    </View>
                )}

                {/* Score Input Card */}
                <View className="bg-[#111827]/60 rounded-[28px] border border-white/[0.06] p-5 mb-5">
                    <View className="flex-row items-center justify-center gap-4">
                        <View className="flex-1 items-center gap-3">
                            <PlayerAvatar src={homeAvatar} name={matchDetails.homeUser} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center" numberOfLines={1}>
                                {matchDetails.homeUser}
                            </Text>
                            <TextInput
                                className="bg-white/5 w-20 h-14 rounded-2xl text-center text-2xl font-black text-white border border-white/10"
                                placeholder="0"
                                placeholderTextColor="#334155"
                                keyboardType="numeric"
                                value={homeScore}
                                onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                            />
                        </View>
                        <View className="w-10 items-center justify-center mt-8">
                            <View className="bg-white/5 py-1 px-2.5 rounded-lg border border-white/10">
                                <Text className="text-[8px] text-slate-500 font-black uppercase tracking-widest">VS</Text>
                            </View>
                        </View>
                        <View className="flex-1 items-center gap-3">
                            <PlayerAvatar src={awayAvatar} name={matchDetails.awayUser} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center" numberOfLines={1}>
                                {matchDetails.awayUser}
                            </Text>
                            <TextInput
                                className="bg-white/5 w-20 h-14 rounded-2xl text-center text-2xl font-black text-white border border-white/10"
                                placeholder="0"
                                placeholderTextColor="#334155"
                                keyboardType="numeric"
                                value={awayScore}
                                onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                            />
                        </View>
                    </View>
                </View>

                {/* Evidence Section */}
                <View className="mb-5">
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-2">
                            <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center">
                                <Ionicons name="images-outline" size={14} color="#818CF8" />
                            </View>
                            <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">Evidence</Text>
                        </View>
                        <Pressable onPress={pickImages} className="flex-row items-center bg-[#10B981]/10 px-3 py-2 rounded-xl border border-[#10B981]/20 active:opacity-70">
                            <Ionicons name="add" size={14} color="#10B981" />
                            <Text className="text-[10px] font-black text-[#10B981] ml-1.5 uppercase tracking-wider">Add</Text>
                        </Pressable>
                    </View>
                    {selectedImages.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {selectedImages.map((img, index) => (
                                <View key={img.uri + index} className="mr-3 mb-2">
                                    <View className="rounded-2xl overflow-hidden border border-white/5">
                                        <Image source={{ uri: img.uri }} className="w-20 h-20" />
                                    </View>
                                    <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1.5 -right-1.5 bg-red-500 w-5 h-5 rounded-full items-center justify-center border-2 border-[#0B1120] shadow-sm">
                                        <Ionicons name="close" size={10} color="white" />
                                    </Pressable>
                                </View>
                            ))}
                        </ScrollView>
                    ) : (
                        <Pressable onPress={pickImages} className="h-20 border border-dashed border-white/10 rounded-2xl items-center justify-center bg-white/[0.02]">
                            <Ionicons name="images-outline" size={22} color="#334155" />
                            <Text className="text-[10px] text-slate-600 mt-1 font-bold">No photos selected</Text>
                        </Pressable>
                    )}
                </View>

                {/* Action Buttons */}
                <View className="flex-row gap-3 mb-6">
                    <Pressable
                        onPress={handleCancelEdit}
                        className="flex-1 bg-white/5 rounded-2xl py-4 items-center border border-white/[0.06] active:opacity-70"
                    >
                        <Text className="text-sm font-black text-slate-400 uppercase tracking-wider">Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleSubmitResult}
                        className="flex-1 bg-[#10B981] rounded-2xl py-4 items-center active:opacity-80"
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#0F172A" />
                        ) : (
                            <Text className="text-sm font-black text-[#0F172A] uppercase tracking-wider">Save</Text>
                        )}
                    </Pressable>
                </View>
            </View>
        );
    };

    const renderPendingProposalCard = () => {
        if (!matchDetails) return null;
        const homeAvatar = matchDetails.homeUserAvatarUrl || matchDetails.HomeUserAvatarUrl || '';
        const awayAvatar = matchDetails.awayUserAvatarUrl || matchDetails.AwayUserAvatarUrl || '';
        const phs = matchDetails.proposedHomeScore ?? 0;
        const pas = matchDetails.proposedAwayScore ?? 0;

        // Whose name to display as "reported by" — fall back to the side label so the screen
        // is never blank if the proposer profile didn't load.
        const proposerIsHome = proposedByUserId?.toLowerCase() === matchDetails.homeUserId?.toLowerCase();
        const proposerName = proposerIsHome
            ? matchDetails.homeUser
            : matchDetails.awayUser;

        return (
            <View className="mx-5 mt-4 mb-3">
                <View className="bg-[#111827]/60 rounded-[32px] border border-white/[0.06] p-6 overflow-hidden">
                    <View className="items-center mb-5">
                        <View className="bg-[#F59E0B]/10 px-4 py-1.5 rounded-full">
                            <Text className="text-[9px] font-black text-[#F59E0B] uppercase tracking-[3px]">
                                {isProposer ? 'Awaiting Approval' : 'Result Reported'}
                            </Text>
                        </View>
                        <Text className="text-[10px] text-slate-400 mt-2 font-bold text-center">
                            {isProposer
                                ? 'Your opponent needs to confirm before this match is final.'
                                : `${proposerName} reported the result. Confirm if it's correct.`}
                        </Text>
                    </View>

                    {error && (
                        <View className="bg-red-500/10 p-3 rounded-2xl mb-4 border border-red-500/20">
                            <Text className="text-red-400 text-sm text-center font-medium">{error}</Text>
                        </View>
                    )}

                    <View className="flex-row items-start justify-between">
                        <Pressable onPress={() => navigateToProfile(matchDetails.homeUserId)} className="flex-1 items-center">
                            <PlayerAvatar src={homeAvatar} name={matchDetails.homeUser} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center mt-2.5 px-1" numberOfLines={1}>
                                {matchDetails.homeUser}
                            </Text>
                        </Pressable>

                        <View className="items-center px-2 pt-1">
                            <View className="flex-row items-baseline">
                                <Text className="text-5xl font-black text-[#F59E0B]">{phs}</Text>
                                <Text className="text-2xl font-black text-white/10 mx-2">:</Text>
                                <Text className="text-5xl font-black text-[#F59E0B]">{pas}</Text>
                            </View>
                        </View>

                        <Pressable onPress={() => navigateToProfile(matchDetails.awayUserId)} className="flex-1 items-center">
                            <PlayerAvatar src={awayAvatar} name={matchDetails.awayUser} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center mt-2.5 px-1" numberOfLines={1}>
                                {matchDetails.awayUser}
                            </Text>
                        </Pressable>
                    </View>

                    {(canDecideOnProposal || ((isProposer || isPrivileged) && !isEditingProposal)) && (
                        <View className="flex-row gap-2.5 mt-6">
                            {canDecideOnProposal && (
                                <Pressable
                                    onPress={handleRejectProposal}
                                    disabled={isRejecting || isApproving}
                                    className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl py-3.5 items-center active:opacity-70"
                                >
                                    {isRejecting ? (
                                        <ActivityIndicator size="small" color="#F87171" />
                                    ) : (
                                        <Text className="text-xs font-black text-red-400 uppercase tracking-wider">Reject</Text>
                                    )}
                                </Pressable>
                            )}
                            {canDecideOnProposal && (
                                <Pressable
                                    onPress={handleApproveProposal}
                                    disabled={isApproving || isRejecting}
                                    className="flex-1 bg-[#10B981] rounded-2xl py-3.5 items-center active:opacity-80"
                                >
                                    {isApproving ? (
                                        <ActivityIndicator size="small" color="#0F172A" />
                                    ) : (
                                        <Text className="text-xs font-black text-[#0F172A] uppercase tracking-wider">Approve</Text>
                                    )}
                                </Pressable>
                            )}
                            {(isProposer || isPrivileged) && !isEditingProposal && (
                                <Pressable
                                    onPress={() => {
                                        setHomeScore(String(phs ?? ''));
                                        setAwayScore(String(pas ?? ''));
                                        setIsEditingProposal(true);
                                    }}
                                    className="flex-1 bg-[#F59E0B]/10 border border-[#F59E0B]/25 rounded-2xl py-3.5 items-center active:opacity-70"
                                >
                                    <Text className="text-xs font-black text-[#F59E0B] uppercase tracking-wider">Edit</Text>
                                </Pressable>
                            )}
                        </View>
                    )}
                </View>

                {/* Slim divider before the evidence section */}
                <View className="h-px bg-white/[0.08] mt-5" />
            </View>
        );
    };

    const renderScheduledMatch = () => {
        const homeAvatar = matchDetails?.homeUserAvatarUrl || matchDetails?.HomeUserAvatarUrl || '';
        const awayAvatar = matchDetails?.awayUserAvatarUrl || matchDetails?.AwayUserAvatarUrl || '';

        // While a proposal is pending we hide the manual submit form so the proposal card alone
        // drives the decision. Anyone with the right to act (proposer, opponent, admin/owner)
        // can open the form via the "Edit" button on the card.
        const submitFormSuppressed = hasPendingProposal && !isEditingProposal;

        return (
            <View className="mx-5 mt-4">
                {/* Pending proposal card — hidden while the user is editing so the edit form gets the full stage. */}
                {hasPendingProposal && !isEditingProposal && renderPendingProposalCard()}

                {submitFormSuppressed ? null : (
                <>
                {/* Edit-mode banner */}
                {isEditingProposal && (
                    <View className="mb-5">
                        <View className="bg-[#F59E0B]/[0.08] rounded-[24px] border border-[#F59E0B]/20 p-4 flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 items-center justify-center">
                                <Ionicons name="create-outline" size={18} color="#F59E0B" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-[2px]">
                                    {isPrivileged && !isProposer ? 'Edit & Finalize' : 'Editing Your Report'}
                                </Text>
                                <Text className="text-[11px] text-slate-400 mt-0.5">
                                    {isPrivileged && !isProposer
                                        ? 'This will overwrite the proposal and finalize the match.'
                                        : 'Update the score and tap Update Report to notify your opponent.'}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Scheduled Time */}
                <View className="bg-[#111827]/60 rounded-[28px] border border-white/[0.06] p-5 mb-5">
                    <View className="items-center mb-5">
                        <View className="flex-row items-center gap-2 bg-[#3B82F6]/10 px-4 py-1.5 rounded-full border border-[#3B82F6]/20">
                            <Ionicons name="time-outline" size={12} color="#3B82F6" />
                            <Text className="text-[9px] font-black text-[#3B82F6] uppercase tracking-[3px]">Match Time</Text>
                        </View>
                        <Text className="text-base font-black text-[#10B981] mt-3">
                            {confirmedTime || scheduledTime || 'TBD'}
                        </Text>
                    </View>

                    {error && !hasPendingProposal && (
                        <View className="bg-red-500/10 p-3 rounded-2xl mb-4 border border-red-500/20">
                            <Text className="text-red-400 text-sm text-center font-medium">{error}</Text>
                        </View>
                    )}

                    {/* Players & Score Input */}
                    <View className="flex-row items-center justify-center gap-4">
                        <View className="flex-1 items-center gap-3">
                            <PlayerAvatar src={homeAvatar} name={home?.username || 'Home'} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center" numberOfLines={1}>
                                {home?.username || 'Home'}
                            </Text>
                            <TextInput
                                className={cn("bg-white/5 w-20 h-14 rounded-2xl text-center text-2xl font-black text-white border border-white/10", !canSubmit && "opacity-40")}
                                placeholder="0"
                                placeholderTextColor="#334155"
                                keyboardType="numeric"
                                value={homeScore}
                                onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                                editable={canSubmit}
                            />
                        </View>
                        <View className="w-10 items-center justify-center mt-8">
                            <View className="bg-white/5 py-1 px-2.5 rounded-lg border border-white/10">
                                <Text className="text-[8px] text-slate-500 font-black uppercase tracking-widest">VS</Text>
                            </View>
                        </View>
                        <View className="flex-1 items-center gap-3">
                            <PlayerAvatar src={awayAvatar} name={away?.username || opponentName || 'Away'} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center" numberOfLines={1}>
                                {away?.username || opponentName || 'Away'}
                            </Text>
                            <TextInput
                                className={cn("bg-white/5 w-20 h-14 rounded-2xl text-center text-2xl font-black text-white border border-white/10", !canSubmit && "opacity-40")}
                                placeholder="0"
                                placeholderTextColor="#334155"
                                keyboardType="numeric"
                                value={awayScore}
                                onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                                editable={canSubmit}
                            />
                        </View>
                    </View>
                </View>

                {/* Action Buttons */}
                <View className="flex-row gap-3 mb-4">
                    {isEditingProposal ? (
                        <Pressable
                            onPress={() => { setIsEditingProposal(false); setHomeScore(''); setAwayScore(''); setError(null); }}
                            className="flex-1 bg-white/5 rounded-2xl py-4 items-center border border-white/[0.06] active:opacity-70"
                        >
                            <Text className="text-sm font-black text-slate-400 uppercase tracking-wider">Cancel</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => { setHomeScore(''); setAwayScore(''); setError(null); setSelectedImages([]); }}
                            className="flex-1 bg-white/5 rounded-2xl py-4 items-center border border-white/[0.06] active:opacity-70"
                        >
                            <Text className="text-sm font-black text-slate-400 uppercase tracking-wider">Clear</Text>
                        </Pressable>
                    )}
                    <Pressable
                        onPress={async () => { await handleSubmitResult(); setIsEditingProposal(false); }}
                        disabled={(isRoundLocked && !isHubOwner) || !canSubmit}
                        className={cn(
                            "flex-1 rounded-2xl py-4 items-center active:opacity-80",
                            ((isRoundLocked && !isHubOwner) || !canSubmit) ? "bg-white/5 border border-white/[0.06]" : "bg-[#10B981]"
                        )}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color={canSubmit ? "#0F172A" : "#71717A"} />
                        ) : (
                            <Text className={cn(
                                "text-sm font-black uppercase tracking-wider",
                                ((isRoundLocked && !isHubOwner) || !canSubmit) ? "text-slate-500" : "text-[#0F172A]"
                            )}>
                                {(isRoundLocked && !isHubOwner)
                                    ? "Locked"
                                    : !canSubmit
                                        ? "View Only"
                                        : isEditingProposal
                                            ? "Update Report"
                                            : (approvalRequired && !isPrivileged ? "Report" : "Submit")}
                            </Text>
                        )}
                    </Pressable>
                </View>
                </>
                )}

                {/* Previously Uploaded Evidence — always visible so both sides can verify the proposal */}
                {matchDetails?.evidences && matchDetails.evidences.length > 0 && (
                    <View className="mb-5">
                        <View className="flex-row items-center gap-2.5 mb-3.5 ml-1">
                            <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center">
                                <Ionicons name="images-outline" size={14} color="#818CF8" />
                            </View>
                            <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">Uploaded Evidence</Text>
                            <View className="bg-white/5 px-2 py-0.5 rounded-full">
                                <Text className="text-[9px] font-bold text-slate-400">{matchDetails.evidences.length}</Text>
                            </View>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {matchDetails.evidences.map((url, idx) => (
                                <Pressable key={idx} className="mr-3" onPress={() => setPreviewImage(url)}>
                                    <View className="rounded-2xl overflow-hidden border border-white/5">
                                        <Image
                                            source={{ uri: getOptimizedCloudinaryUrl(url, 400) }}
                                            className="w-28 h-40 bg-muted"
                                            resizeMode="cover"
                                        />
                                    </View>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Evidence Upload — always visible so the proposer can keep adding screenshots
                    even while a proposal is pending */}
                {(isParticipant || isPrivileged) && (
                    <View className="mb-5">
                        <View className="flex-row items-center justify-between mb-3">
                            <View className="flex-row items-center gap-2">
                                <View className="w-7 h-7 rounded-xl bg-[#10B981]/10 items-center justify-center">
                                    <Ionicons name="camera-outline" size={14} color="#10B981" />
                                </View>
                                <View>
                                    <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">Add Evidence</Text>
                                    <Text className="text-[9px] text-slate-500 mt-0.5 font-medium">Match result screenshots</Text>
                                </View>
                            </View>
                            <Pressable onPress={pickImages} className="flex-row items-center bg-[#10B981]/10 px-3 py-2 rounded-xl border border-[#10B981]/20 active:opacity-70">
                                <Ionicons name="add" size={14} color="#10B981" />
                                <Text className="text-[10px] font-black text-[#10B981] ml-1.5 uppercase tracking-wider">Add</Text>
                            </Pressable>
                        </View>
                        {selectedImages.length > 0 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {selectedImages.map((img, index) => (
                                    <View key={img.uri + index} className="mr-3 mb-2">
                                        <View className="rounded-2xl overflow-hidden border border-white/5">
                                            <Image source={{ uri: img.uri }} className="w-20 h-20" />
                                        </View>
                                        <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1.5 -right-1.5 bg-red-500 w-5 h-5 rounded-full items-center justify-center border-2 border-[#0B1120] shadow-sm">
                                            <Ionicons name="close" size={10} color="white" />
                                        </Pressable>
                                    </View>
                                ))}
                            </ScrollView>
                        ) : (
                            <Pressable onPress={pickImages} className="h-20 border border-dashed border-white/10 rounded-2xl items-center justify-center bg-white/[0.02]">
                                <Ionicons name="images-outline" size={22} color="#334155" />
                                <Text className="text-[10px] text-slate-600 mt-1 font-bold">No photos selected</Text>
                            </Pressable>
                        )}

                        {selectedImages.length > 0 && submitFormSuppressed && (
                            <Pressable
                                onPress={handleUploadOnly}
                                className="mt-3 bg-indigo-500/10 rounded-2xl py-3 items-center border border-indigo-500/20 flex-row justify-center gap-2 active:opacity-70"
                            >
                                {isUploadingEvidence ? (
                                    <ActivityIndicator size="small" color="#818CF8" />
                                ) : (
                                    <>
                                        <Ionicons name="cloud-upload-outline" size={14} color="#818CF8" />
                                        <Text className="text-xs font-black text-indigo-400 uppercase tracking-wider">Upload Evidence</Text>
                                    </>
                                )}
                            </Pressable>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (!visible) return null;

    return (
        <Modal
            animationType="slide"
            transparent={false}
            visible={visible}
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
                <View className="flex-row items-center justify-between px-6 pb-4 mb-1 border-b border-white/5">
                    <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-white/5 items-center justify-center active:bg-white/10">
                        <Ionicons name="close" size={20} color="#94A3B8" />
                    </Pressable>
                    <View className="items-center flex-1 mx-4">
                        <Text className="text-sm font-black text-white uppercase tracking-[3px]" numberOfLines={1}>
                            {tournamentName}
                        </Text>
                        <Text className="text-[10px] text-slate-500 font-bold mt-0.5">{roundName}</Text>
                    </View>
                    <View className="w-10" />
                </View>

                {/* Match / Chat tabs — visibility rules in showChatTab above */}
                {showChatTab && (
                    <View className="flex-row mx-6 mt-3 mb-2 rounded-2xl p-1 bg-[#131B2E] border border-white/[0.04]">
                        <Pressable
                            onPress={() => setActiveTab('match')}
                            className={cn(
                                "flex-1 py-2.5 items-center rounded-xl",
                                activeTab === 'match' ? "bg-[#10B981]/15" : "bg-transparent"
                            )}
                        >
                            <Text className={cn(
                                "text-xs font-black uppercase tracking-widest",
                                activeTab === 'match' ? "text-[#10B981]" : "text-slate-500"
                            )}>Match</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setActiveTab('chat')}
                            className={cn(
                                "flex-1 py-2.5 items-center rounded-xl",
                                activeTab === 'chat' ? "bg-[#10B981]/15" : "bg-transparent"
                            )}
                        >
                            <View className="flex-row items-center gap-1.5">
                                <Ionicons
                                    name="chatbubbles-outline"
                                    size={12}
                                    color={activeTab === 'chat' ? '#10B981' : '#64748B'}
                                />
                                <Text className={cn(
                                    "text-xs font-black uppercase tracking-widest",
                                    activeTab === 'chat' ? "text-[#10B981]" : "text-slate-500"
                                )}>Chat</Text>
                                {adminHelpRequested && (
                                    <View className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                                )}
                            </View>
                        </Pressable>
                    </View>
                )}

                {isLoadingDetails && !matchDetails && (
                    <View className="py-2 items-center">
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                )}

                {activeTab === 'chat' && showChatTab ? (
                    (() => {
                        // iOS keeps KeyboardAvoidingView; Android pads by the tracked keyboard height
                        // (see the Keyboard listener effect above).
                        const KeyboardWrapper: React.ComponentType<any> = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
                        const wrapperProps: any = Platform.OS === 'ios'
                            ? { behavior: 'padding', keyboardVerticalOffset: 0, style: { flex: 1 } }
                            : { style: { flex: 1, paddingBottom: keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom) : 0 } };
                        return (
                            <KeyboardWrapper {...wrapperProps}>
                                <MatchChatPanel
                                    matchId={matchId}
                                    active={visible && activeTab === 'chat'}
                                    participantIds={[home?.userId, away?.userId, matchDetails?.homeUserId, matchDetails?.awayUserId]}
                                    avatarsByUserId={chatAvatars}
                                    readOnly={isChatReadOnly}
                                />
                            </KeyboardWrapper>
                        );
                    })()
                ) : (
                <ScrollView
                    className="flex-1"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 40 }}
                >
                    {status === 'completed' ? (
                        renderCompletedMatch()
                    ) : (status === 'scheduled' || status === 'ready_phase') ? (
                        renderScheduledMatch()
                    ) : (
                        <View className="flex-1">
                            {currentStatus === 'pending_availability' ? (
                                <View className="flex-1 px-2">
                                    <HourlyAvailabilityPicker
                                        matchId={matchId}
                                        deadline={localDeadline}
                                        opponentName={opponentName}
                                        opponentAvailability={opponentSlots}
                                        initialSlots={mySlots}
                                        onSubmit={async (slots: string[], dateTimeSlots: string[]) => {
                                            try {
                                                setIsSubmitting(true);
                                                const payload = {
                                                    matchId: matchId,
                                                    selectedSlots: dateTimeSlots,
                                                };
                                                const response = await authenticatedFetch(ENDPOINTS.SUBMIT_MATCH_AVAILABILITY, {
                                                    method: 'POST',
                                                    body: JSON.stringify(payload),
                                                });
                                                if (response.ok) {
                                                    const result = await response.json();
                                                    if (result.data?.confirmedTime) {
                                                        const confirmedDate = new Date(result.data.confirmedTime);
                                                        setConfirmedTime(confirmedDate.toLocaleString());
                                                        setCurrentStatus('scheduled');
                                                    }
                                                    if (onMatchUpdate) onMatchUpdate();
                                                }
                                            } catch (error) {
                                                console.error('Error submitting availability:', error);
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }}
                                    />
                                </View>
                            ) : (
                                <View className="py-10 items-center justify-center">
                                    <Text className="text-muted-foreground italic">Scheduling Not Supported Here</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Admin-help escalation — request (participants) / resolve (admins) */}
                    {(isParticipant || isPrivileged) && matchDetails && (
                        <View className="mx-5 mt-2 mb-6">
                            <AdminHelpSection
                                matchId={matchId}
                                requested={adminHelpRequested}
                                requestedByMe={adminHelpRequestedByMe}
                                isParticipant={isParticipant}
                                canResolve={isPrivileged}
                                onChanged={() => {
                                    fetchMatchDetails();
                                    if (onMatchUpdate) onMatchUpdate();
                                }}
                            />
                        </View>
                    )}
                </ScrollView>
                )}
            </View>

            {/* Fullscreen Image Preview */}
            <Modal
                visible={!!previewImage}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setPreviewImage(null)}
            >
                <View className="flex-1 bg-black/95 items-center justify-center p-4">
                    <Pressable
                        className="absolute top-12 right-6 z-10 w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/20"
                        onPress={() => setPreviewImage(null)}
                    >
                        <Ionicons name="close" size={24} color="white" />
                    </Pressable>

                    {previewImage && (
                        <Image
                            source={{ uri: previewImage }}
                            className="w-full h-full"
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>
        </Modal>
    );
}
