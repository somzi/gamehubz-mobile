import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { HourlyAvailabilityPicker } from '../match/HourlyAvailabilityPicker';
import { MatchChatPanel } from '../match/MatchChatPanel';
import { MatchStreamPanel } from '../match/MatchStreamPanel';
import { AdminHelpSection } from '../match/AdminHelpSection';
import { MatchStream, MatchStreamStatus } from '../../types/stream';
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
import { MatchStage } from '../../types/tournament';

export type MatchStatus = 'pending_availability' | 'scheduled' | 'ready_phase' | 'completed';

export interface MatchResultDetailDto {
    /** Backend MatchStatus (1 Pending / 2 Scheduled / 3 Live / 4 Completed / 5 NoShow).
     *  Optional — older backends don't send it; used to detect a completed match when the
     *  modal was opened from a deep link with no bracket context. */
    status?: number;
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
    /** True when this match is one game of a team tie (resolved out of the parent team-match DTO).
     *  Drives the team-aware double-walkover copy — a voided game only counts for neither team;
     *  the tie itself is voided only if NO game ends up played. */
    isTeamSub?: boolean;
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
    // Optional `freshStructure` argument carries the refreshed bracket the backend now returns
    // inline with matchResult mutations so the parent can update its bracket state without a
    // follow-up GET_TOURNAMENT_STRUCTURE_V3 round-trip. Ignored by legacy call sites.
    onMatchUpdate?: (freshStructure?: any) => void;
    home?: { userId: string; username: string; score: number | null };
    away?: { userId: string; username: string; score: number | null };
    evidences?: string[];
    hubOwnerId?: string;
    canManage?: boolean;
    isRoundLocked?: boolean;
    canRevert?: boolean;
    requireResultApproval?: boolean;
    /** MatchStage of this match (mirrors backend enum). Drives the elimination-only Double Walkover action. */
    stage?: number;
    /** Downstream links — a Double Walkover needs somewhere to advance the surviving opponent into. */
    nextMatchId?: string | null;
    nextMatchLoserBracketId?: string | null;
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
    stage,
    nextMatchId,
    nextMatchLoserBracketId,
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

    // Delete-result (revert) state — reopens a completed match as Scheduled.
    const [isDeletingResult, setIsDeletingResult] = useState(false);

    // Double-walkover state — admin closes an unplayed match with no winner so the opponent advances.
    const [isApplyingWalkover, setIsApplyingWalkover] = useState(false);

    // Match / Chat tab state — initial value mirrors defaultTab; the effects below
    // re-apply it whenever the modal opens or the match changes so reopening on the
    // same matchId still honors the host's intent.
    const [activeTab, setActiveTab] = useState<'match' | 'chat' | 'stream'>(defaultTab);

    // Streams for this match — drives the Stream tab (live POVs + replays) and its LIVE dot.
    const [streams, setStreams] = useState<MatchStream[]>([]);

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

    // Streams + availability now arrive with the details response via /details/full, so this
    // effect only handles the standalone fallback where /details/full wasn't reachable. In the
    // normal path setStreams / setMySlots are populated from the combo response inside
    // fetchMatchDetails below and this effect stays inert.

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
            // fetchMatchDetails hits /details/full which returns details + streams + the caller's
            // availability in a single round-trip. It handles setting all three; the legacy
            // fetchAvailability / streams effect only runs as a fallback.
            fetchMatchDetails();
        }
    }, [visible, status, matchId, evidences, home, away]);

    // Picks our sub-match out of a parent team-match DTO and reshapes it into the
    // MatchResultDetailDto the solo modal renders (players, score, evidence, proposal &
    // admin-help flag). Mirrors the backend TeamSubMatchDto field names (camel/Pascal).
    const mapSubMatchDetails = (data: any, subMatches: any[]): MatchResultDetailDto => {
        const sub = subMatches.find(
            (s: any) => (s.matchId || s.MatchId || '').toLowerCase() === (matchId || '').toLowerCase()
        );
        const hp = sub?.homePlayer || sub?.HomePlayer;
        const ap = sub?.awayPlayer || sub?.AwayPlayer;
        return {
            status: sub?.status ?? sub?.Status,
            homeUser: hp?.username || hp?.Username || '',
            homeUserId: hp?.userId || hp?.UserId || '',
            awayUser: ap?.username || ap?.Username || '',
            awayUserId: ap?.userId || ap?.UserId || '',
            homeUserScore: sub?.homeScore ?? sub?.HomeScore ?? 0,
            awayUserScore: sub?.awayScore ?? sub?.AwayScore ?? 0,
            evidences: sub?.evidences || sub?.Evidences || [],
            scheduledTime: data.scheduledTime || data.ScheduledTime,
            homeUserAvatarUrl: formatAvatarUrl(hp?.avatarUrl || hp?.AvatarUrl),
            awayUserAvatarUrl: formatAvatarUrl(ap?.avatarUrl || ap?.AvatarUrl),
            requireResultApproval: data.requireResultApproval ?? data.RequireResultApproval ?? false,
            proposedHomeScore: sub?.proposedHomeScore ?? sub?.ProposedHomeScore ?? null,
            proposedAwayScore: sub?.proposedAwayScore ?? sub?.ProposedAwayScore ?? null,
            proposedByUserId: sub?.proposedByUserId ?? sub?.ProposedByUserId ?? null,
            adminHelpRequested: sub?.adminHelpRequested ?? sub?.AdminHelpRequested ?? false,
            adminHelpRequestedByUserId: sub?.adminHelpRequestedByUserId ?? sub?.AdminHelpRequestedByUserId ?? null,
            isTeamSub: true,
        };
    };

    const fetchMatchDetails = async () => {
        if (!matchId) return;
        setIsLoadingDetails(true);
        setError(null);
        try {
            // Combo endpoint: details + streams + availability in one round-trip.
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS_FULL(matchId));
            if (response.ok) {
                const envelope = await response.json();
                // /details/full response shape: { details, streams, availability? }. Older /details
                // returned the details DTO at the top level, so fall back to that when either the
                // envelope shape is missing or a proxy/older server is in the mix.
                const data = envelope?.details ?? envelope?.Details ?? envelope;
                const inlineStreams = envelope?.streams ?? envelope?.Streams;
                if (Array.isArray(inlineStreams)) setStreams(inlineStreams);
                const inlineAvailability = envelope?.availability ?? envelope?.Availability;
                if (inlineAvailability) {
                    if (inlineAvailability.mySlots) setMySlots(inlineAvailability.mySlots);
                    if (inlineAvailability.opponentSlots) setOpponentSlots(inlineAvailability.opponentSlots);
                    if (inlineAvailability.matchDeadline) setLocalDeadline(inlineAvailability.matchDeadline);
                    if (inlineAvailability.confirmedTime) {
                        const confirmedDate = parseUtcDate(inlineAvailability.confirmedTime);
                        setConfirmedTime(confirmedDate.toLocaleString());
                        setCurrentStatus('scheduled');
                    }
                }
                // For a team-tournament sub-match, GET_MATCH_DETAILS returns the parent
                // team-match DTO (no top-level home/away — the individual players, scores and
                // help-request flag live on the matching sub-match). Resolve our sub-match so
                // the solo modal renders the real pairing & result instead of an empty 0:0.
                const subMatches = data.subMatches || data.SubMatches;
                const normalizedData: MatchResultDetailDto = Array.isArray(subMatches)
                    ? mapSubMatchDetails(data, subMatches)
                    : {
                        ...data,
                        status: data.status ?? data.Status,
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

    const handleSubmitResult = async (cascade: boolean = false) => {
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
                TournamentId: tournamentId,
                Cascade: cascade
            };

            const response = await authenticatedFetch(ENDPOINTS.REPORT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to report result');
            }

            // Backend returns the freshly computed bracket structure inline so the parent
            // can update state directly without an extra GET. Body may be empty on very old
            // servers — the ?? undefined keeps that fallback path clean for the parent.
            let freshStructure: any = undefined;
            try {
                const body = await response.json();
                freshStructure = body?.structure ?? body?.Structure ?? undefined;
            } catch { /* legacy servers return an empty body — parent will refetch */ }

            if (selectedImages.length > 0) {
                await handleUploadOnly();
            }

            // When approval is required and the submitter is a regular participant, the result
            // becomes a pending proposal — keep the modal open so they immediately see the
            // "Awaiting approval" state instead of getting bounced back to the bracket.
            const willCreateProposal = approvalRequired && !(isHubOwner || canManage) && status !== 'completed';

            if (onMatchUpdate) onMatchUpdate(freshStructure);

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

    const submitDeleteResult = async (cascade: boolean = false) => {
        if (!matchId) return;
        setIsDeletingResult(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REVERT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({ MatchId: matchId, Cascade: cascade }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to delete result');
            }
            if (onMatchUpdate) onMatchUpdate();
            onClose();
        } catch (err: any) {
            console.error('Delete result error:', err);
            setError(err.message || 'An error occurred while deleting the result');
        } finally {
            setIsDeletingResult(false);
        }
    };

    // Builds a short human label for a downstream match the cascade would reopen.
    const describeAffected = (a: any): string => {
        const round = a.round ?? a.Round ?? 0;
        const isUpper = a.isUpperBracket ?? a.IsUpperBracket ?? true;
        const hs = a.homeScore ?? a.HomeScore ?? 0;
        const as = a.awayScore ?? a.AwayScore ?? 0;
        const side = isUpper ? `Round ${round}` : `Losers R${round}`;
        return `${side}  ·  ${hs}–${as}`;
    };

    // Fetches the list of already-played downstream matches this action would reopen, then routes to
    // the right confirmation: a plain confirm when nothing downstream is affected, or a cascade confirm
    // listing the collateral when there is. `onConfirm(cascade)` runs the actual mutation.
    const confirmWithCascade = async (
        mode: 'delete' | 'edit',
        onConfirm: (cascade: boolean) => void,
    ) => {
        if (!matchId) return;
        let affected: any[] = [];
        try {
            const res = await authenticatedFetch(ENDPOINTS.CASCADE_REVERT_PREVIEW, {
                method: 'POST',
                body: JSON.stringify({ MatchId: matchId }),
            });
            if (res.ok) {
                affected = await res.json();
            }
            // A non-OK preview (e.g. not privileged) just falls through to the plain confirm; the
            // backend stays the source of truth and will reject if the action really isn't allowed.
        } catch {
            // A network hiccup on the preview shouldn't block the action — fall back to plain confirm.
        }

        const count = Array.isArray(affected) ? affected.length : 0;

        if (count === 0) {
            if (mode === 'delete') {
                Alert.alert(
                    'Delete result?',
                    'This clears the score and winner and reopens the match. You can report the result again afterwards.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => onConfirm(false) },
                    ],
                );
            } else {
                Alert.alert(
                    'Save changes?',
                    'This changes the winner and re-advances the bracket.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Save', onPress: () => onConfirm(false) },
                    ],
                );
            }
            return;
        }

        const list = affected.map((a) => `•  ${describeAffected(a)}`).join('\n');
        const verb = mode === 'delete' ? 'Deleting' : 'Changing';
        Alert.alert(
            `${count} linked result${count > 1 ? 's' : ''} will also be reopened`,
            `${verb} this result first reopens ${count} already-played match${count > 1 ? 'es' : ''} below it — their scores will be cleared and they'll have to be played again:\n\n${list}\n\nThis cannot be undone. Continue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: mode === 'delete' ? 'Delete all' : 'Change & reopen',
                    style: 'destructive',
                    onPress: () => onConfirm(true),
                },
            ],
        );
    };

    // Deleting a result is destructive (clears the score/winner and reopens the match), so confirm
    // first — and, in a double-elimination bracket, surface any already-played downstream matches the
    // delete would also reopen. Backend re-checks permissions and the downstream lock.
    const handleDeleteResult = () => {
        confirmWithCascade('delete', (cascade) => submitDeleteResult(cascade));
    };

    // Editing an existing (completed) result. Always confirms. When only the score changes but the
    // winner stays the same the bracket is untouched (backend applies it in place); when the winner
    // flips we may need to reopen downstream matches, so route through the cascade confirmation.
    const handleSubmitEdit = () => {
        if (homeScore === '' || awayScore === '') {
            setError('Please enter scores for both players');
            return;
        }
        const newHome = parseInt(homeScore, 10);
        const newAway = parseInt(awayScore, 10);
        const oldHome = matchDetails?.homeUserScore ?? 0;
        const oldAway = matchDetails?.awayUserScore ?? 0;

        // Same scores (e.g. only adding evidence) or a score change that keeps the same winner: the
        // bracket below is untouched, so just confirm and save — the backend applies it in place.
        const scoresUnchanged = newHome === oldHome && newAway === oldAway;
        const winnerUnchanged =
            scoresUnchanged ||
            (oldHome > oldAway && newHome > newAway) ||
            (oldAway > oldHome && newAway > newHome);

        if (winnerUnchanged) {
            Alert.alert(
                'Save changes?',
                'This updates the result. The winner stays the same, so the rest of the bracket is unaffected.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Save', onPress: () => handleSubmitResult(false) },
                ],
            );
            return;
        }

        confirmWithCascade('edit', (cascade) => handleSubmitResult(cascade));
    };

    const submitDoubleWalkover = async () => {
        if (!matchId) return;
        setIsApplyingWalkover(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DOUBLE_WALKOVER, {
                method: 'POST',
                body: JSON.stringify({ MatchId: matchId }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to apply double walkover');
            }
            if (onMatchUpdate) onMatchUpdate();
            onClose();
        } catch (err: any) {
            console.error('Double walkover error:', err);
            setError(err.message || 'An error occurred while applying the double walkover');
        } finally {
            setIsApplyingWalkover(false);
        }
    };

    // Destructive, so confirm first — with format-specific consequences: elimination walkovers
    // eliminate both players and advance their opponent; league/group/Swiss walkovers close the
    // fixture as a no-show double forfeit (no points for either player — deliberately not a draw);
    // a team-tie game closes as a no-show counting for neither team, and if no game of the tie
    // ends up played the whole tie is voided. Backend re-checks the manage permission and state.
    const handleDoubleWalkover = () => {
        const homeName = home?.username || matchDetails?.homeUser || 'Player 1';
        const awayName = away?.username || matchDetails?.awayUser || 'Player 2';
        const message = matchDetails?.isTeamSub
            ? `Neither ${homeName} nor ${awayName} played this game, so it closes as a no-show and counts for neither team. The tie is decided by the games that were played — if none end up played, the whole tie is voided (both teams out, or zero points in a league). You can still enter a real result later. Continue?`
            : isEliminationMatch
                ? `Neither ${homeName} nor ${awayName} played, so both are eliminated and their opponent advances by walkover. This usually can't be undone once the opponent moves on. Continue?`
                : `Neither ${homeName} nor ${awayName} played, so the match closes as a no-show: no points for either player (not a draw) and the round can continue. You can still enter a real result later. Continue?`;
        Alert.alert(
            'Double walkover?',
            message,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Double walkover', style: 'destructive', onPress: submitDoubleWalkover },
            ],
        );
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

    // Deep links (push notifications) open this modal with only a matchId — the parent passes a
    // bare { id } shell, so the status/home/away props are missing. The /details/full payload is
    // then the only source of truth: trust its Status when it says Completed (4) so a played
    // match never renders the empty submit form, and fall back to its pairing for the names the
    // shell can't provide. Props win when present — bracket taps keep today's behavior.
    const effectiveStatus: MatchStatus = matchDetails?.status === 4 ? 'completed' : status;
    const effectiveHome = home ?? (matchDetails?.homeUser
        ? { userId: matchDetails.homeUserId, username: matchDetails.homeUser, score: null }
        : undefined);
    const effectiveAway = away ?? (matchDetails?.awayUser
        ? { userId: matchDetails.awayUserId, username: matchDetails.awayUser, score: null }
        : undefined);

    // Participants only get Edit/Delete when the result is cleanly revertable (canRevert). Owners/admins
    // also get them when the bracket has progressed downstream — they can cascade-reopen the collateral
    // (handled with a listing confirmation). Byes (a missing side) carry no result to edit.
    const canEditResult = effectiveStatus === 'completed' && !isEditMode
        && (canRevert || ((isHubOwner || canManage) && !!effectiveHome && !!effectiveAway));

    const canSubmit = isParticipant || isHubOwner || canManage;

    // Approval-flow derived state.
    // The tournament setting reaches us either from the parent (bracket structure) or the match details payload.
    const approvalRequired = !!(requireResultApproval || matchDetails?.requireResultApproval);
    const proposedByUserId = matchDetails?.proposedByUserId || null;
    const hasPendingProposal = approvalRequired && !!proposedByUserId && effectiveStatus !== 'completed';
    const isProposer = hasPendingProposal && !!user?.id && proposedByUserId?.toLowerCase() === user.id.toLowerCase();
    const isPrivileged = isHubOwner || canManage;
    // Opponent (or any privileged user) can confirm; the proposer cannot self-approve.
    const canDecideOnProposal = hasPendingProposal && !isProposer && (isParticipant || isPrivileged);

    // Double walkover: admin/owner only, on an unplayed match with both players set. Elimination
    // matches additionally need somewhere to advance the surviving opponent into (this also hides
    // the action on play-in matches, whose slots must always produce a qualifier — backend rejects
    // them outright). Group/league/Swiss matches close as a NoShow double forfeit instead — no
    // downstream needed, no points for either player. Team-tie games never need a downstream:
    // they advance through the team-match aggregation, not the Next* links. Backend re-validates.
    const isEliminationMatch = !matchDetails?.isTeamSub
        && stage !== undefined && stage !== null && Number(stage) !== MatchStage.GroupStage;
    const hasDownstream = !!nextMatchId || !!nextMatchLoserBracketId;
    const bothPlayersSet = !!(home?.username || matchDetails?.homeUserId) && !!(away?.username || matchDetails?.awayUserId);
    // Backend MatchStatus.NoShow (5) — an already-closed no-show must not offer the action again.
    const isNoShowClosed = matchDetails?.status === 5;
    const canDoubleWalkover = isPrivileged && effectiveStatus !== 'completed' && effectiveStatus !== 'pending_availability'
        && !isNoShowClosed && bothPlayersSet
        && (!isEliminationMatch || hasDownstream);

    const adminHelpRequested = !!matchDetails?.adminHelpRequested;
    // Chat & admin-help visibility:
    //  - tournament completed → nobody sees the chat tab (not even admins)
    //  - participants see it for their own matches
    //  - privileged users (hub owner/admin) can read the chat at any time while the tournament runs
    //    (not only when a help request is open) — they moderate / step in whenever needed
    //  - spectators tapping a bracket match keep the read-only match view
    const isTournamentCompleted = Number(tournamentStatus) === 4;
    const showChatTab = !isTournamentCompleted && (isParticipant || isPrivileged);
    // Streaming is relevant once a match is scheduled (live POVs) or done (replay). Visible to
    // everyone viewing the match — spectators can watch; the panel gates the streamer-only controls.
    const showStreamTab = effectiveStatus !== 'pending_availability';
    const hasLiveStream = streams.some(s => s.status === MatchStreamStatus.Live);
    // Completed matches keep the conversation visible but block new messages.
    const isChatReadOnly = effectiveStatus === 'completed';
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
                    <Text className="text-slate-500 mt-4 font-bold uppercase tracking-widest text-[10px] w-full text-center" numberOfLines={1}>Loading match data...</Text>
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
                            <View className="bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                                <Text className="text-[9px] font-black text-primary uppercase tracking-[3px]">Final Score</Text>
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
                                        <View className="bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                            <Text className="text-[8px] font-black text-primary uppercase tracking-widest">Winner</Text>
                                        </View>
                                    )}
                                </View>
                            </Pressable>

                            {/* Score Center */}
                            <View className="items-center px-2 pt-1">
                                <View className="flex-row items-baseline">
                                    <Text className={`text-5xl font-black ${winner === 'home' ? 'text-primary' : 'text-white/20'}`}>
                                        {matchDetails.homeUserScore}
                                    </Text>
                                    <Text className="text-2xl font-black text-white/10 mx-2">:</Text>
                                    <Text className={`text-5xl font-black ${winner === 'away' ? 'text-primary' : 'text-white/20'}`}>
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
                                        <View className="bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                            <Text className="text-[8px] font-black text-primary uppercase tracking-widest">Winner</Text>
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
                                                    style={{ width: 144, height: 192, backgroundColor: '#1E293B' }}
                                                    contentFit="cover"
                                                    cachePolicy="memory-disk"
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
                                    <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest w-full text-center" numberOfLines={1}>No Evidence Attached</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Edit / Delete Result Buttons */}
                {canEditResult && (
                    <View className="mx-5 mb-6 gap-3">
                        {error && (
                            <View className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20">
                                <Text className="text-red-400 text-sm text-center font-medium">{error}</Text>
                            </View>
                        )}
                        <Pressable
                            onPress={handleEditResult}
                            className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4 flex-row items-center justify-center gap-2.5 active:opacity-70"
                        >
                            <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
                                <Ionicons name="create-outline" size={16} color="#10B981" />
                            </View>
                            <Text className="text-sm font-black text-primary uppercase tracking-widest" numberOfLines={1}>Edit Result</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleDeleteResult}
                            disabled={isDeletingResult}
                            className="bg-red-500/[0.06] rounded-2xl border border-red-500/20 p-4 flex-row items-center justify-center gap-2.5 active:opacity-70"
                        >
                            {isDeletingResult ? (
                                <ActivityIndicator size="small" color="#F87171" />
                            ) : (
                                <>
                                    <View className="w-8 h-8 rounded-xl bg-red-500/10 items-center justify-center">
                                        <Ionicons name="trash-outline" size={16} color="#F87171" />
                                    </View>
                                    <Text className="text-sm font-black text-red-400 uppercase tracking-widest" numberOfLines={1}>Delete Result</Text>
                                </>
                            )}
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
                    <View className="bg-warning/10 px-4 py-1.5 rounded-full border border-warning/20">
                        <Text className="text-[9px] font-black text-warning uppercase tracking-[3px]">Editing Result</Text>
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
                        {/* Bottom-anchored so the chip centers on the score inputs (h-14), not on the whole column */}
                        <View className="w-10 items-center justify-end self-stretch">
                            <View className="h-14 justify-center">
                                <View className="bg-white/5 py-1 px-2.5 rounded-lg border border-white/10">
                                    <Text className="text-[8px] text-slate-500 font-black uppercase tracking-widest">VS</Text>
                                </View>
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
                        <Pressable onPress={pickImages} className="flex-row items-center bg-primary/10 px-3 py-2 rounded-xl border border-primary/20 active:opacity-70">
                            <Ionicons name="add" size={14} color="#10B981" />
                            <Text className="text-[10px] font-black text-primary ml-1.5 uppercase tracking-wider" numberOfLines={1}>Add</Text>
                        </Pressable>
                    </View>
                    {selectedImages.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {selectedImages.map((img, index) => (
                                <View key={img.uri + index} className="mr-3 mb-2">
                                    <View className="rounded-2xl overflow-hidden border border-white/5">
                                        <Image source={{ uri: img.uri }} style={{ width: 80, height: 80 }} />
                                    </View>
                                    <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1.5 -right-1.5 bg-red-500 w-5 h-5 rounded-full items-center justify-center border-2 border-background-deep shadow-sm">
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
                        <Text className="text-sm font-black text-slate-400 uppercase tracking-wider w-full text-center" numberOfLines={1}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleSubmitEdit}
                        className="flex-1 bg-primary rounded-2xl py-4 items-center active:opacity-80"
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#0F172A" />
                        ) : (
                            <Text className="text-sm font-black text-primary-foreground uppercase tracking-wider w-full text-center" numberOfLines={1}>Save</Text>
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
                        <View className="bg-warning/10 px-4 py-1.5 rounded-full">
                            <Text className="text-[9px] font-black text-warning uppercase tracking-[3px]">
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
                                <Text className="text-5xl font-black text-warning">{phs}</Text>
                                <Text className="text-2xl font-black text-white/10 mx-2">:</Text>
                                <Text className="text-5xl font-black text-warning">{pas}</Text>
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
                                        <Text className="text-xs font-black text-red-400 uppercase tracking-wider w-full text-center" numberOfLines={1}>Reject</Text>
                                    )}
                                </Pressable>
                            )}
                            {canDecideOnProposal && (
                                <Pressable
                                    onPress={handleApproveProposal}
                                    disabled={isApproving || isRejecting}
                                    className="flex-1 bg-primary rounded-2xl py-3.5 items-center active:opacity-80"
                                >
                                    {isApproving ? (
                                        <ActivityIndicator size="small" color="#0F172A" />
                                    ) : (
                                        <Text className="text-xs font-black text-primary-foreground uppercase tracking-wider w-full text-center" numberOfLines={1}>Approve</Text>
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
                                    className="flex-1 bg-warning/10 border border-warning/25 rounded-2xl py-3.5 items-center active:opacity-70"
                                >
                                    <Text className="text-xs font-black text-warning uppercase tracking-wider w-full text-center" numberOfLines={1}>Edit</Text>
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
                        <View className="bg-warning/[0.08] rounded-[24px] border border-warning/20 p-4 flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-2xl bg-warning/15 items-center justify-center">
                                <Ionicons name="create-outline" size={18} color="#F59E0B" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-[10px] font-black text-warning uppercase tracking-[2px]">
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
                        <View className="flex-row items-center gap-2 bg-blue-500/10 px-4 py-1.5 rounded-full border border-blue-500/20">
                            <Ionicons name="time-outline" size={12} color="#3B82F6" />
                            <Text className="text-[9px] font-black text-blue-500 uppercase tracking-[3px]">Match Time</Text>
                        </View>
                        <Text className="text-base font-black text-primary mt-3">
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
                            <PlayerAvatar src={homeAvatar} name={effectiveHome?.username || 'Home'} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center" numberOfLines={1}>
                                {effectiveHome?.username || 'Home'}
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
                        {/* Bottom-anchored so the chip centers on the score inputs (h-14), not on the whole column */}
                        <View className="w-10 items-center justify-end self-stretch">
                            <View className="h-14 justify-center">
                                <View className="bg-white/5 py-1 px-2.5 rounded-lg border border-white/10">
                                    <Text className="text-[8px] text-slate-500 font-black uppercase tracking-widest">VS</Text>
                                </View>
                            </View>
                        </View>
                        <View className="flex-1 items-center gap-3">
                            <PlayerAvatar src={awayAvatar} name={effectiveAway?.username || opponentName || 'Away'} size="lg" className="rounded-2xl border-0" />
                            <Text className="text-xs font-bold text-slate-300 text-center" numberOfLines={1}>
                                {effectiveAway?.username || opponentName || 'Away'}
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
                            <Text className="text-sm font-black text-slate-400 uppercase tracking-wider w-full text-center" numberOfLines={1}>Cancel</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => { setHomeScore(''); setAwayScore(''); setError(null); setSelectedImages([]); }}
                            className="flex-1 bg-white/5 rounded-2xl py-4 items-center border border-white/[0.06] active:opacity-70"
                        >
                            <Text className="text-sm font-black text-slate-400 uppercase tracking-wider w-full text-center" numberOfLines={1}>Clear</Text>
                        </Pressable>
                    )}
                    <Pressable
                        onPress={async () => { await handleSubmitResult(); setIsEditingProposal(false); }}
                        disabled={(isRoundLocked && !isHubOwner) || !canSubmit}
                        className={cn(
                            "flex-1 rounded-2xl py-4 items-center active:opacity-80",
                            ((isRoundLocked && !isHubOwner) || !canSubmit) ? "bg-white/5 border border-white/[0.06]" : "bg-primary"
                        )}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color={canSubmit ? "#0F172A" : "#71717A"} />
                        ) : (
                            <Text numberOfLines={1} className={cn(
                                "text-sm font-black uppercase tracking-wider w-full text-center",
                                ((isRoundLocked && !isHubOwner) || !canSubmit) ? "text-slate-500" : "text-primary-foreground"
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

                {/* Double Walkover — admin/owner only. Both players no-showed: elimination matches
                    close with no winner and their opponent advances; group/league/Swiss fixtures
                    close as a no-show double forfeit (no points either way). The subtitle doubles
                    as the in-place tooltip (no hover on mobile). */}
                {canDoubleWalkover && (
                    <View className="mb-5">
                        <View className="h-px bg-white/[0.08] mb-4" />
                        <Pressable
                            onPress={handleDoubleWalkover}
                            disabled={isApplyingWalkover}
                            className="bg-warning/10 border border-warning/25 rounded-2xl py-3.5 items-center flex-row justify-center gap-2 active:opacity-70"
                        >
                            {isApplyingWalkover ? (
                                <ActivityIndicator size="small" color="#F59E0B" />
                            ) : (
                                <>
                                    <Ionicons name="play-skip-forward-outline" size={16} color="#F59E0B" />
                                    <Text className="text-sm font-black text-warning uppercase tracking-wider" numberOfLines={1}>Double Walkover</Text>
                                </>
                            )}
                        </Pressable>
                        <Text className="text-[11px] text-slate-500 mt-2 text-center px-2 leading-4">
                            {matchDetails?.isTeamSub
                                ? 'Both players failed to play — closes this game as a no-show. It counts for neither team; if no game of the tie is played, the whole tie is voided.'
                                : isEliminationMatch
                                    ? 'Both players failed to play — closes this match with no winner and advances their opponent automatically.'
                                    : 'Both players failed to play — closes this match as a no-show. No points for either player (not a draw).'}
                        </Text>
                    </View>
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
                                            style={{ width: 112, height: 160, backgroundColor: '#1E293B' }}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
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
                                <View className="w-7 h-7 rounded-xl bg-primary/10 items-center justify-center">
                                    <Ionicons name="camera-outline" size={14} color="#10B981" />
                                </View>
                                <View>
                                    <Text className="text-[11px] font-black text-white uppercase tracking-[2px]">Add Evidence</Text>
                                    <Text className="text-[9px] text-slate-500 mt-0.5 font-medium">Match result screenshots</Text>
                                </View>
                            </View>
                            <Pressable onPress={pickImages} className="flex-row items-center bg-primary/10 px-3 py-2 rounded-xl border border-primary/20 active:opacity-70">
                                <Ionicons name="add" size={14} color="#10B981" />
                                <Text className="text-[10px] font-black text-primary ml-1.5 uppercase tracking-wider" numberOfLines={1}>Add</Text>
                            </Pressable>
                        </View>
                        {selectedImages.length > 0 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {selectedImages.map((img, index) => (
                                    <View key={img.uri + index} className="mr-3 mb-2">
                                        <View className="rounded-2xl overflow-hidden border border-white/5">
                                            <Image source={{ uri: img.uri }} style={{ width: 80, height: 80 }} />
                                        </View>
                                        <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1.5 -right-1.5 bg-red-500 w-5 h-5 rounded-full items-center justify-center border-2 border-background-deep shadow-sm">
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
                                        <Text className="text-xs font-black text-indigo-400 uppercase tracking-wider" numberOfLines={1}>Upload Evidence</Text>
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
                className="flex-1 bg-background-deep"
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
                        <Text className="text-sm font-black text-white uppercase tracking-[3px] w-full text-center" numberOfLines={1}>
                            {tournamentName}
                        </Text>
                        <Text className="text-[10px] text-slate-500 font-bold mt-0.5">{roundName}</Text>
                    </View>
                    <View className="w-10" />
                </View>

                {/* Match / Chat / Stream tabs. The bar appears if chat OR stream is available;
                    Match is always present, the other two are gated (showChatTab / showStreamTab). */}
                {(showChatTab || showStreamTab) && (
                    <View className="flex-row mx-6 mt-3 mb-2 rounded-2xl p-1 bg-card border border-white/[0.04]">
                        <Pressable
                            onPress={() => setActiveTab('match')}
                            className={cn(
                                "flex-1 py-2.5 items-center rounded-xl",
                                activeTab === 'match' ? "bg-primary/15" : "bg-transparent"
                            )}
                        >
                            <Text numberOfLines={1} className={cn(
                                "text-xs font-black uppercase tracking-widest w-full text-center",
                                activeTab === 'match' ? "text-primary" : "text-slate-500"
                            )}>Match</Text>
                        </Pressable>
                        {showChatTab && (
                        <Pressable
                            onPress={() => setActiveTab('chat')}
                            className={cn(
                                "flex-1 py-2.5 items-center rounded-xl",
                                activeTab === 'chat' ? "bg-primary/15" : "bg-transparent"
                            )}
                        >
                            <View className="flex-row items-center gap-1.5">
                                <Ionicons
                                    name="chatbubbles-outline"
                                    size={12}
                                    color={activeTab === 'chat' ? '#10B981' : '#64748B'}
                                />
                                <Text numberOfLines={1} className={cn(
                                    "text-xs font-black uppercase tracking-widest",
                                    activeTab === 'chat' ? "text-primary" : "text-slate-500"
                                )}>Chat</Text>
                                {adminHelpRequested && (
                                    <View className="w-1.5 h-1.5 rounded-full bg-warning" />
                                )}
                            </View>
                        </Pressable>
                        )}
                        {showStreamTab && (
                        <Pressable
                            onPress={() => setActiveTab('stream')}
                            className={cn(
                                "flex-1 py-2.5 items-center rounded-xl",
                                activeTab === 'stream' ? "bg-primary/15" : "bg-transparent"
                            )}
                        >
                            <View className="flex-row items-center gap-1.5">
                                <Text numberOfLines={1} className={cn(
                                    "text-xs font-black uppercase tracking-widest",
                                    activeTab === 'stream' ? "text-primary" : "text-slate-500"
                                )}>Stream</Text>
                                {hasLiveStream && (
                                    <View className="flex-row items-center gap-1 bg-red-500/15 px-1.5 py-0.5 rounded-md">
                                        <View className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                        <Text className="text-[8px] font-black text-red-400 uppercase">Live</Text>
                                    </View>
                                )}
                            </View>
                        </Pressable>
                        )}
                    </View>
                )}

                {isLoadingDetails && !matchDetails && (
                    <View className="py-2 items-center">
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                )}

                {activeTab === 'stream' && showStreamTab ? (
                    <View className="flex-1 px-6 pt-2">
                        <MatchStreamPanel
                            matchId={matchId}
                            isParticipant={isParticipant}
                            isCompleted={effectiveStatus === 'completed'}
                            currentUserId={user?.id}
                            initialStreams={streams}
                            onStreamsChange={setStreams}
                        />
                    </View>
                ) : activeTab === 'chat' && showChatTab ? (
                    (() => {
                        // iOS keeps KeyboardAvoidingView; Android pads by the tracked keyboard height
                        // (see the Keyboard listener effect above).
                        const KeyboardWrapper: React.ComponentType<any> = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
                        const wrapperProps: any = Platform.OS === 'ios'
                            ? { behavior: 'padding', keyboardVerticalOffset: 0, style: { flex: 1 } }
                            // Android edge-to-edge: keyboardDidShow reports the IME height WITHOUT the
                            // navigation-bar inset (the keyboard visually covers the nav bar below it),
                            // so the real gap from the keyboard top to the screen bottom is
                            // keyboardHeight + insets.bottom. The modal root already pads insets.bottom,
                            // so padding the wrapper by the full keyboardHeight lands the composer right
                            // above the keyboard. (Subtracting insets.bottom here left it one nav-bar
                            // height too low, hiding the composer behind the keyboard.)
                            : { style: { flex: 1, paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 } };
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
                    {effectiveStatus === 'completed' ? (
                        renderCompletedMatch()
                    ) : (effectiveStatus === 'scheduled' || effectiveStatus === 'ready_phase') ? (
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
                            style={{ width: '100%', height: '100%' }}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                        />
                    )}
                </View>
            </Modal>
        </Modal>
    );
}
