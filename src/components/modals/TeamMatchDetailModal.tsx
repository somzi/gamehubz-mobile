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
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

// One source of truth for the redesigned palette — emerald primary, amber pending/tie-break,
// neutral surfaces tuned for the dark theme. Kept inline so the modal stays self-contained.
const C = {
    emerald: '#10B981',
    emeraldSoft: 'rgba(16,185,129,0.10)',
    emeraldRing: 'rgba(16,185,129,0.30)',
    amber: '#F59E0B',
    amberSoft: 'rgba(245,158,11,0.10)',
    amberRing: 'rgba(245,158,11,0.30)',
    red: '#EF4444',
    redSoft: 'rgba(239,68,68,0.10)',
    redRing: 'rgba(239,68,68,0.25)',
    indigo: '#818CF8',
    bg: '#0B1120',
    surface: '#0F172A',
    surfaceRaised: '#111827',
    surfaceCard: '#131B2E',
    border: 'rgba(255,255,255,0.06)',
    borderStrong: 'rgba(255,255,255,0.10)',
    text: '#F8FAFC',
    textDim: '#94A3B8',
    textFaint: '#475569',
    textGhost: '#334155',
};

type TeamState = 'pending' | 'live' | 'completed' | 'tieBreak';
type SubState = 'pending' | 'completed' | 'awaitingApproval' | 'tieBreak';

function deriveTeamState(data: TeamMatchDetailsDto | null, tieBreak: TieBreakStatusDto | null): TeamState {
    if (tieBreak?.isRequired && !data?.winnerTeamParticipantId) return 'tieBreak';
    if (data?.winnerTeamParticipantId || data?.status === 'Completed' || data?.status === 3) return 'completed';
    if (data?.status === 'InProgress' || data?.status === 2) return 'live';
    return 'pending';
}

function deriveSubState(sm: SubMatchDto, approvalRequired: boolean): SubState {
    if (sm.isTieBreakMatch && !sm.winnerUserId && (sm.homeScore === null || sm.awayScore === null)) return 'tieBreak';
    const hasResult = sm.homeScore !== null && sm.awayScore !== null;
    if (hasResult && (sm.status === 'Completed' || sm.status === 2 || sm.status === 3 || !!sm.winnerUserId)) return 'completed';
    const proposed = (sm as any).proposedByUserId ?? (sm as any).ProposedByUserId;
    const subPending = sm.status === 'Pending' || sm.status === 0 || sm.status === 1;
    if (approvalRequired && !!proposed && subPending) return 'awaitingApproval';
    return 'pending';
}

function paletteFor(state: TeamState | SubState) {
    switch (state) {
        case 'completed':
            return { accent: C.emerald, soft: C.emeraldSoft, ring: C.emeraldRing, label: 'Completed' };
        case 'live':
            return { accent: C.emerald, soft: C.emeraldSoft, ring: C.emeraldRing, label: 'Live' };
        case 'tieBreak':
            return { accent: C.amber, soft: C.amberSoft, ring: C.amberRing, label: 'Tie-Break' };
        case 'awaitingApproval':
            return { accent: C.amber, soft: C.amberSoft, ring: C.amberRing, label: 'Awaiting Approval' };
        default:
            return { accent: C.amber, soft: C.amberSoft, ring: C.amberRing, label: 'Pending' };
    }
}

// Pill with state dot — tightened typography and a slightly larger dot for legibility at glance.
function StatusPill({ state, size = 'md' }: { state: TeamState | SubState; size?: 'sm' | 'md' }) {
    const p = paletteFor(state);
    const isSm = size === 'sm';
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: p.soft,
                borderWidth: 1,
                borderColor: p.ring,
                paddingHorizontal: isSm ? 8 : 10,
                paddingVertical: isSm ? 3 : 5,
                borderRadius: 999,
                gap: 6,
            }}
        >
            <View style={{ width: isSm ? 5 : 6, height: isSm ? 5 : 6, borderRadius: 999, backgroundColor: p.accent }} />
            <Text style={{ color: p.accent, fontSize: isSm ? 8 : 9, fontWeight: '900', letterSpacing: 1.6, textTransform: 'uppercase' }}>
                {p.label}
            </Text>
        </View>
    );
}

// Square avatar that FULLY fills its frame. The old build nested a fixed-size PlayerAvatar
// (40px) inside a larger ring (52px) with no centering, so the initials sat pinned in the
// top-left corner and visually "spilled" out of the frame. Sizing the image/initials to the
// frame itself removes that whole class of bug.
function Avatar({
    url,
    name,
    size,
    ring = false,
    ringColor = C.emeraldRing,
}: {
    url?: string;
    name: string;
    size: number;
    ring?: boolean;
    ringColor?: string;
}) {
    const initials = (name || '')
        .split(' ')
        .map((n) => n?.[0] || '')
        .join('')
        .toUpperCase()
        .slice(0, 2);
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.32),
                borderWidth: ring ? 2 : 1,
                borderColor: ring ? ringColor : 'rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(255,255,255,0.04)',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }}
        >
            {url ? (
                <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
                <Text style={{ color: C.text, fontWeight: '800', fontSize: Math.round(size * 0.38) }}>
                    {initials || '?'}
                </Text>
            )}
        </View>
    );
}

// Team crest for the hero card — emerald glow for the winning side, neutral for the rest.
function TeamCrest({
    avatarUrl,
    teamName,
    isWinner,
}: {
    avatarUrl?: string;
    teamName?: string;
    isWinner: boolean;
}) {
    const SIZE = 58;
    return (
        <View style={{ alignItems: 'center', flex: 1 }}>
            <View
                style={{
                    borderRadius: Math.round(SIZE * 0.32),
                    shadowColor: isWinner ? C.emerald : '#000',
                    shadowOpacity: isWinner ? 0.35 : 0.22,
                    shadowRadius: isWinner ? 14 : 7,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: isWinner ? 6 : 3,
                }}
            >
                {avatarUrl ? (
                    <Avatar url={avatarUrl} name={teamName || ''} size={SIZE} ring={isWinner} />
                ) : (
                    <View
                        style={{
                            width: SIZE,
                            height: SIZE,
                            borderRadius: Math.round(SIZE * 0.32),
                            borderWidth: 2,
                            borderColor: isWinner ? C.emeraldRing : 'rgba(255,255,255,0.08)',
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Ionicons name="people" size={24} color={isWinner ? C.emerald : C.textDim} />
                    </View>
                )}
            </View>
            <Text
                numberOfLines={2}
                style={{
                    marginTop: 8,
                    fontSize: 12,
                    lineHeight: 14,
                    fontWeight: '900',
                    textAlign: 'center',
                    color: isWinner ? C.emerald : C.text,
                    letterSpacing: 0.2,
                    paddingHorizontal: 4,
                }}
            >
                {teamName || 'Unknown'}
            </Text>
        </View>
    );
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
    // Which individual game row is expanded. Collapsed by default so a 10-v-10 match
    // reads as a short, scannable list instead of a wall of full-size cards.
    const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
    const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

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
                        // Preserve proposal fields (not in the static type) for the approval flow.
                        proposedByUserId: sm.proposedByUserId ?? sm.ProposedByUserId ?? null,
                        proposedHomeScore: sm.proposedHomeScore ?? sm.ProposedHomeScore ?? null,
                        proposedAwayScore: sm.proposedAwayScore ?? sm.ProposedAwayScore ?? null,
                    } as SubMatchDto;
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
                evidences: raw.evidences || raw.Evidences || [],
                // Approval flag passes through untyped (TeamMatchDetailsDto doesn't list it).
                ...(raw.requireResultApproval !== undefined || raw.RequireResultApproval !== undefined
                    ? { requireResultApproval: raw.requireResultApproval ?? raw.RequireResultApproval ?? false }
                    : {}),
            } as TeamMatchDetailsDto;

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

    // Clear per-match state when switching to a different team match.
    // Modal stays mounted between opens, so without this the previous match's
    // data/scores/evidence/tie-break flash on screen while the new fetch is in flight.
    useEffect(() => {
        setData(null);
        setError(null);
        setScoreInputs({});
        setSelectedImages([]);
        setPreviewImage(null);
        setEditingMatchId(null);
        setTieBreakStatus(null);
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

    // Expand/collapse a game row. Switching rows drops any open edit form + staged images
    // so a half-finished report on one game never bleeds into another.
    const toggleGame = (id: string) => {
        setExpandedGameId((prev) => (prev === id ? null : id));
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

            // Only one row's form is ever open at a time and staged images are cleared on
            // toggle, so any selected images belong to this sub-match — upload them on save.
            if (selectedImages.length > 0) {
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

    const submitDeleteSubMatch = async (subMatch: SubMatchDto) => {
        setSubmittingScoreId(subMatch.matchId);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REVERT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify({ MatchId: subMatch.matchId }),
            });
            if (!response.ok) {
                const text = await response.text().catch(() => 'Failed');
                throw new Error(text);
            }
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

    // Destructive: clears this game's score and reopens it (and the team match, if it was the
    // deciding game). Confirm first; the backend re-checks permissions and the downstream lock.
    const handleDeleteSubMatch = (subMatch: SubMatchDto) => {
        Alert.alert(
            'Delete result?',
            "This clears this game's score and reopens it. If it was the deciding game, the team match reopens too.",
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => submitDeleteSubMatch(subMatch) },
            ],
        );
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
        const userAsHome = data.homeTeam?.members?.some(m => m.userId.toLowerCase() === currentUserId?.toLowerCase());
        const userAsAway = data.awayTeam?.members?.some(m => m.userId.toLowerCase() === currentUserId?.toLowerCase());

        if (userAsHome && data.homeTeam) return data.homeTeam.members || [];
        if (userAsAway && data.awayTeam) return data.awayTeam.members || [];

        if (isHubOwner) {
            return (data.homeTeam?.members || []).concat(data.awayTeam?.members || []);
        }
        return [];
    })();

    // Derived team-level state for the hero pill / outcome footer.
    const teamState: TeamState = deriveTeamState(data, tieBreakStatus);
    const approvalRequired = !!((data as any)?.requireResultApproval ?? (data as any)?.RequireResultApproval);

    // Progress over individual matches — drives the "X of N completed" progress strip.
    const totalSubs = data?.subMatches?.length ?? 0;
    const completedSubs = data?.subMatches?.filter(sm => {
        const hasResult = sm.homeScore !== null && sm.awayScore !== null;
        return hasResult && (sm.status === 'Completed' || sm.status === 2 || sm.status === 3 || !!sm.winnerUserId);
    }).length ?? 0;

    // Hero score colour rules: winner glows emerald, the rest sit muted. Falls back to neutral when tied.
    const homeWins = data?.aggregateScore?.homeTeamWins ?? 0;
    const awayWins = data?.aggregateScore?.awayTeamWins ?? 0;
    const homeIsHeroWinner = homeWins > awayWins;
    const awayIsHeroWinner = awayWins > homeWins;

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View
                style={{
                    flex: 1,
                    backgroundColor: C.bg,
                    paddingTop: Math.max(insets.top, 50),
                    paddingBottom: Math.max(insets.bottom, 20),
                }}
            >
                {/* Top accent — subtle emerald halo that fades into the surface. */}
                <LinearGradient
                    colors={['rgba(16,185,129,0.10)', 'transparent']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
                    pointerEvents="none"
                />

                {/* Header Bar */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 20,
                        paddingBottom: 14,
                        marginBottom: 4,
                    }}
                >
                    <Pressable
                        onPress={onClose}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 999,
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderWidth: 1,
                            borderColor: C.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Ionicons name="close" size={18} color={C.textDim} />
                    </Pressable>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: C.textFaint, letterSpacing: 3, textTransform: 'uppercase' }}>
                            Team Match
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: C.text, letterSpacing: 0.4, marginTop: 2 }}>
                            Match Details
                        </Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {isLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={C.emerald} />
                        <Text style={{ marginTop: 16, color: C.textDim, fontWeight: '800', letterSpacing: 2, fontSize: 10, textTransform: 'uppercase' }}>
                            Loading match data
                        </Text>
                    </View>
                ) : error || !data ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                        <Ionicons name="alert-circle-outline" size={48} color={C.red} />
                        <Text style={{ marginTop: 16, color: C.red, textAlign: 'center', fontWeight: '600' }}>
                            {error || 'Match data unavailable'}
                        </Text>
                        <Button onPress={fetchData} className="mt-6">Retry</Button>
                    </View>
                ) : (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: 48 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ─── HERO CARD ────────────────────────────────────────────── */}
                        <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
                            <View
                                style={{
                                    borderRadius: 28,
                                    overflow: 'hidden',
                                    backgroundColor: C.surfaceRaised,
                                    borderWidth: 1,
                                    borderColor: C.border,
                                    shadowColor: '#000',
                                    shadowOpacity: 0.35,
                                    shadowRadius: 16,
                                    shadowOffset: { width: 0, height: 8 },
                                    elevation: 8,
                                }}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.04)', 'transparent']}
                                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%' }}
                                />

                                {/* Header row inside hero — small label + state pill */}
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        paddingHorizontal: 18,
                                        paddingTop: 16,
                                    }}
                                >
                                    <View
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                            borderWidth: 1,
                                            borderColor: C.border,
                                            paddingHorizontal: 9,
                                            paddingVertical: 4,
                                            borderRadius: 999,
                                        }}
                                    >
                                        <Text style={{ fontSize: 8, fontWeight: '900', color: C.textFaint, letterSpacing: 2, textTransform: 'uppercase' }}>
                                            Best of {totalSubs || '—'}
                                        </Text>
                                    </View>
                                    <StatusPill state={teamState} />
                                </View>

                                {/* Teams + Score */}
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'flex-start',
                                        paddingHorizontal: 16,
                                        paddingTop: 14,
                                        paddingBottom: 16,
                                    }}
                                >
                                    <TeamCrest
                                        avatarUrl={data?.homeTeam?.avatarUrl}
                                        teamName={data?.homeTeam?.teamName}
                                        isWinner={teamState === 'completed' && homeIsHeroWinner}
                                    />

                                    {/* Score block */}
                                    <View style={{ paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', minWidth: 96, paddingTop: 6 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text
                                                style={{
                                                    fontSize: 46,
                                                    lineHeight: 50,
                                                    fontWeight: '900',
                                                    letterSpacing: -1.5,
                                                    color: homeIsHeroWinner ? C.emerald : (homeWins === awayWins ? C.text : 'rgba(255,255,255,0.18)'),
                                                }}
                                            >
                                                {homeWins}
                                            </Text>
                                            <Text style={{ fontSize: 22, fontWeight: '900', color: 'rgba(255,255,255,0.10)', marginHorizontal: 8 }}>
                                                :
                                            </Text>
                                            <Text
                                                style={{
                                                    fontSize: 46,
                                                    lineHeight: 50,
                                                    fontWeight: '900',
                                                    letterSpacing: -1.5,
                                                    color: awayIsHeroWinner ? C.emerald : (homeWins === awayWins ? C.text : 'rgba(255,255,255,0.18)'),
                                                }}
                                            >
                                                {awayWins}
                                            </Text>
                                        </View>
                                    </View>

                                    <TeamCrest
                                        avatarUrl={data?.awayTeam?.avatarUrl}
                                        teamName={data?.awayTeam?.teamName}
                                        isWinner={teamState === 'completed' && awayIsHeroWinner}
                                    />
                                </View>

                                {/* Bottom stat strip — aggregate sub-totals + progress */}
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        paddingHorizontal: 18,
                                        paddingVertical: 12,
                                        borderTopWidth: 1,
                                        borderTopColor: 'rgba(255,255,255,0.04)',
                                        backgroundColor: 'rgba(0,0,0,0.25)',
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Ionicons name="stats-chart" size={11} color={C.textFaint} />
                                        <Text style={{ fontSize: 9, fontWeight: '900', color: C.textFaint, letterSpacing: 2, textTransform: 'uppercase' }}>
                                            Aggregate
                                        </Text>
                                        <Text style={{ fontSize: 11, fontWeight: '900', color: C.textDim, marginLeft: 2 }}>
                                            {data?.aggregateScore?.homeTeamTotalScore ?? 0}
                                            <Text style={{ color: C.textGhost }}>  –  </Text>
                                            {data?.aggregateScore?.awayTeamTotalScore ?? 0}
                                        </Text>
                                    </View>
                                    <Text style={{ fontSize: 10, fontWeight: '900', color: C.textFaint, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                        {completedSubs} / {totalSubs} Done
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* ─── TIE-BREAK ACTION BANNER ──────────────────────────────── */}
                        {tieBreakStatus?.isRequired && !data?.winnerTeamParticipantId && (
                            <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
                                <View
                                    style={{
                                        borderRadius: 24,
                                        overflow: 'hidden',
                                        backgroundColor: C.surfaceRaised,
                                        borderWidth: 1,
                                        borderColor: C.amberRing,
                                    }}
                                >
                                    {/* Amber edge accent */}
                                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.amber }} />
                                    <LinearGradient
                                        colors={['rgba(245,158,11,0.10)', 'transparent']}
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                    />

                                    <View style={{ padding: 18, paddingLeft: 22 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <View
                                                style={{
                                                    width: 32, height: 32, borderRadius: 12,
                                                    backgroundColor: C.amberSoft,
                                                    borderWidth: 1, borderColor: C.amberRing,
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                <Ionicons name="flash" size={16} color={C.amber} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 9, fontWeight: '900', color: C.amber, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                                                    Tie-Break Required
                                                </Text>
                                                <Text style={{ fontSize: 12, fontWeight: '800', color: C.text }}>
                                                    {tieBreakStatus.homeRepresentative && tieBreakStatus.awayRepresentative
                                                        ? TEAM_LABELS.TIE_BREAK_IN_PROGRESS
                                                        : TEAM_LABELS.TIE_BREAK_BANNER}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Reps */}
                                        <View
                                            style={{
                                                backgroundColor: 'rgba(0,0,0,0.30)',
                                                borderRadius: 14,
                                                paddingHorizontal: 12,
                                                paddingVertical: 10,
                                                marginBottom: 12,
                                                borderWidth: 1,
                                                borderColor: 'rgba(255,255,255,0.04)',
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: C.textDim, letterSpacing: 0.5 }}>
                                                    {TEAM_LABELS.HOME_REPRESENTATIVE}
                                                </Text>
                                                <Text style={{ fontSize: 11, fontWeight: '900', color: tieBreakStatus.homeRepresentative ? C.text : C.textFaint }}>
                                                    {tieBreakStatus.homeRepresentative?.username || TEAM_LABELS.WAITING_LABEL}
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: C.textDim, letterSpacing: 0.5 }}>
                                                    {TEAM_LABELS.AWAY_REPRESENTATIVE}
                                                </Text>
                                                <Text style={{ fontSize: 11, fontWeight: '900', color: tieBreakStatus.awayRepresentative ? C.text : C.textFaint }}>
                                                    {tieBreakStatus.awayRepresentative?.username || TEAM_LABELS.WAITING_LABEL}
                                                </Text>
                                            </View>
                                        </View>

                                        {(isCaptainOfEitherTeam || isHubOwner) && !isTieBreakMatchCreated && (
                                            <Pressable
                                                onPress={() => setShowRepPicker(true)}
                                                disabled={isSubmittingRep}
                                                style={{
                                                    backgroundColor: C.amber,
                                                    borderRadius: 14,
                                                    paddingVertical: 11,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                {isSubmittingRep ? (
                                                    <ActivityIndicator size="small" color="#0F172A" />
                                                ) : (
                                                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#0F172A', letterSpacing: 1.6, textTransform: 'uppercase' }}>
                                                        {isHubOwner && !isCaptainOfEitherTeam ? 'Admin: ' : ''}
                                                        {hasSubmittedRep ? 'Change Representative' : String(TEAM_LABELS.SELECT_REPRESENTATIVE)}
                                                    </Text>
                                                )}
                                            </Pressable>
                                        )}

                                        {isCaptainOfEitherTeam && hasSubmittedRep && (
                                            <Text style={{ fontSize: 10, fontWeight: '800', color: C.amber, textAlign: 'center', marginTop: 8, letterSpacing: 0.5 }}>
                                                {TEAM_LABELS.WAITING_FOR_OPPONENT}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* ─── SUB-MATCHES ───────────────────────────────────────────── */}
                        <View style={{ paddingHorizontal: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: '900', color: C.textFaint, letterSpacing: 2.5, textTransform: 'uppercase' }}>
                                    Individual Games
                                </Text>
                                <View
                                    style={{
                                        marginLeft: 10,
                                        backgroundColor: 'rgba(255,255,255,0.04)',
                                        borderWidth: 1, borderColor: C.border,
                                        borderRadius: 999,
                                        paddingHorizontal: 8, paddingVertical: 2,
                                    }}
                                >
                                    <Text style={{ fontSize: 9, fontWeight: '900', color: C.textDim }}>{totalSubs}</Text>
                                </View>
                            </View>

                            {data.subMatches.map((sm, idx) => {
                                const subState: SubState = deriveSubState(sm, approvalRequired);
                                const palette = paletteFor(subState);
                                const hasScore = sm.homeScore !== null && sm.awayScore !== null;
                                const homeWinner = !!sm.winnerUserId && sm.winnerUserId === sm.homePlayer?.userId;
                                const awayWinner = !!sm.winnerUserId && sm.winnerUserId === sm.awayPlayer?.userId;

                                // Action eligibility — same rules as the previous build, kept verbatim so behaviour doesn't drift.
                                const homeId = (sm.homePlayer?.userId || (sm as any).HomePlayer?.userId || '').toLowerCase();
                                const awayId = (sm.awayPlayer?.userId || (sm as any).AwayPlayer?.userId || '').toLowerCase();
                                const me = (currentUserId || '').toLowerCase();
                                const isPlayerOfSub = !!me && (me === homeId || me === awayId);
                                const hasRecordedResult = (sm.homeScore !== null && sm.awayScore !== null) || !!sm.winnerUserId;
                                const canEdit = sm.status !== 'Pending' && isHubOwner;
                                const canDelete = hasRecordedResult && (isHubOwner || (isPlayerOfSub && !approvalRequired));

                                // Pending proposal — surfaced only while approval is required and the sub-match has not yet completed.
                                const proposed = (sm as any).proposedByUserId ?? (sm as any).ProposedByUserId;
                                const subPending = sm.status === 'Pending' || sm.status === 0 || sm.status === 1;
                                const hasProposal = approvalRequired && !!proposed && subPending;
                                const phs = (sm as any).proposedHomeScore ?? (sm as any).ProposedHomeScore ?? 0;
                                const pas = (sm as any).proposedAwayScore ?? (sm as any).ProposedAwayScore ?? 0;
                                const isProposer = hasProposal && !!currentUserId && String(proposed).toLowerCase() === currentUserId.toLowerCase();
                                const isOpponent = hasProposal && !isProposer && (me === homeId || me === awayId);
                                const canDecide = hasProposal && (isOpponent || isHubOwner);

                                const expanded = expandedGameId === sm.matchId;
                                // Owner reports straight from the expanded panel whenever the game has no recorded
                                // result yet (any not-scored status, not just code 0/1) — explicit Edit opens scored ones.
                                const showForm = expanded && (
                                    editingMatchId === sm.matchId ||
                                    (isHubOwner && !hasRecordedResult && !hasProposal && editingMatchId === null)
                                );
                                const hasEvidence = (sm.evidences?.length || 0) > 0;
                                // A row only expands when there's something behind the tap (evidence, a pending
                                // proposal, or owner actions); otherwise it just shows a state dot.
                                const hasExpandableDetail = hasEvidence || hasProposal || canEdit || canDelete || (isHubOwner && !hasRecordedResult);

                                return (
                                    <View
                                        key={sm.matchId}
                                        style={{
                                            marginBottom: 10,
                                            borderRadius: 18,
                                            overflow: 'hidden',
                                            backgroundColor: C.surfaceRaised,
                                            borderWidth: 1,
                                            borderColor: subState === 'completed' ? 'rgba(16,185,129,0.16)' : C.border,
                                            shadowColor: subState === 'completed' ? C.emerald : '#000',
                                            shadowOpacity: subState === 'completed' ? 0.14 : 0.18,
                                            shadowRadius: subState === 'completed' ? 10 : 6,
                                            shadowOffset: { width: 0, height: 3 },
                                            elevation: 3,
                                        }}
                                    >
                                        {/* Left accent strip */}
                                        <View
                                            style={{
                                                position: 'absolute',
                                                left: 0, top: 10, bottom: 10,
                                                width: 3,
                                                borderTopRightRadius: 3,
                                                borderBottomRightRadius: 3,
                                                backgroundColor: palette.accent,
                                                opacity: subState === 'pending' ? 0.5 : 1,
                                            }}
                                        />

                                        {/* Collapsed row — one compact line: players · score · expand. */}
                                        <Pressable
                                            onPress={() => toggleGame(sm.matchId)}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                paddingVertical: 11,
                                                paddingLeft: 12,
                                                paddingRight: 10,
                                            }}
                                        >
                                            {/* Home player */}
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Pressable
                                                    onPress={() => {
                                                        if (sm.homePlayer?.userId) {
                                                            onClose();
                                                            navigation.navigate('PlayerProfile', { id: sm.homePlayer.userId });
                                                        }
                                                    }}
                                                >
                                                    <Avatar url={sm.homePlayer?.avatarUrl} name={sm.homePlayer?.username || '?'} size={24} ring={homeWinner} />
                                                </Pressable>
                                                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontWeight: '800', color: homeWinner ? C.emerald : C.text }}>
                                                    {sm.homePlayer?.username || 'Unknown'}
                                                </Text>
                                            </View>

                                            {/* Center — game label + score / state */}
                                            <View style={{ width: 60, alignItems: 'center', paddingHorizontal: 2 }}>
                                                <Text style={{ fontSize: 7.5, fontWeight: '900', color: sm.isTieBreakMatch ? C.amber : C.textFaint, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 2 }}>
                                                    {sm.isTieBreakMatch ? TEAM_LABELS.TIE_BREAK_LABEL : `Game ${idx + 1}`}
                                                </Text>
                                                {hasScore ? (
                                                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                                        <Text style={{ fontSize: 16, fontWeight: '900', color: (sm.homeScore ?? 0) > (sm.awayScore ?? 0) ? C.emerald : 'rgba(255,255,255,0.30)' }}>
                                                            {sm.homeScore}
                                                        </Text>
                                                        <Text style={{ fontSize: 11, fontWeight: '900', color: C.textGhost, marginHorizontal: 3 }}>:</Text>
                                                        <Text style={{ fontSize: 16, fontWeight: '900', color: (sm.awayScore ?? 0) > (sm.homeScore ?? 0) ? C.emerald : 'rgba(255,255,255,0.30)' }}>
                                                            {sm.awayScore}
                                                        </Text>
                                                    </View>
                                                ) : hasProposal ? (
                                                    <Text style={{ fontSize: 14, fontWeight: '900', color: C.amber }}>
                                                        {phs} : {pas}
                                                    </Text>
                                                ) : (
                                                    <Text style={{ fontSize: 10, fontWeight: '900', color: C.textGhost, letterSpacing: 2 }}>VS</Text>
                                                )}
                                            </View>

                                            {/* Away player */}
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                                <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800', color: awayWinner ? C.emerald : C.text }}>
                                                    {sm.awayPlayer?.username || 'Unknown'}
                                                </Text>
                                                <Pressable
                                                    onPress={() => {
                                                        if (sm.awayPlayer?.userId) {
                                                            onClose();
                                                            navigation.navigate('PlayerProfile', { id: sm.awayPlayer.userId });
                                                        }
                                                    }}
                                                >
                                                    <Avatar url={sm.awayPlayer?.avatarUrl} name={sm.awayPlayer?.username || '?'} size={24} ring={awayWinner} />
                                                </Pressable>
                                            </View>

                                            {/* Expand affordance — chevron when there's detail, otherwise a state dot */}
                                            <View style={{ width: 16, alignItems: 'center', marginLeft: 2 }}>
                                                {hasExpandableDetail ? (
                                                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.textFaint} />
                                                ) : (
                                                    <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: palette.accent, opacity: subState === 'pending' ? 0.6 : 1 }} />
                                                )}
                                            </View>
                                        </Pressable>

                                        {/* Expanded detail panel */}
                                        {expanded && hasExpandableDetail && (
                                        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 12 }}>
                                            {!showForm && (
                                                <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
                                                    <StatusPill state={subState} size="sm" />
                                                </View>
                                            )}

                                        {/* Inline evidence thumbnails — folds the old global Evidence section into context. */}
                                        {(sm.evidences?.length || 0) > 0 && (
                                            <View
                                                style={{
                                                    paddingHorizontal: 14,
                                                    paddingBottom: 12,
                                                    paddingTop: 4,
                                                }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                    <Ionicons name="images-outline" size={11} color={C.indigo} />
                                                    <Text style={{ fontSize: 9, fontWeight: '900', color: C.textFaint, letterSpacing: 2, textTransform: 'uppercase' }}>
                                                        Evidence
                                                    </Text>
                                                    <Text style={{ fontSize: 9, fontWeight: '900', color: C.textGhost }}>
                                                        ({(sm.evidences?.length ?? 0)})
                                                    </Text>
                                                </View>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                    {(sm.evidences ?? []).slice(0, 6).map((url, eIdx) => (
                                                        <Pressable
                                                            key={eIdx}
                                                            onPress={() => setPreviewImage(url)}
                                                            style={{ marginRight: 8 }}
                                                        >
                                                            <View
                                                                style={{
                                                                    borderRadius: 12,
                                                                    overflow: 'hidden',
                                                                    borderWidth: 1, borderColor: C.border,
                                                                    width: 72, height: 72,
                                                                }}
                                                            >
                                                                <Image
                                                                    source={{ uri: getOptimizedCloudinaryUrl(url, 200) }}
                                                                    style={{ width: 72, height: 72 }}
                                                                    resizeMode="cover"
                                                                />
                                                            </View>
                                                        </Pressable>
                                                    ))}
                                                    {(sm.evidences?.length ?? 0) > 6 && (
                                                        <View
                                                            style={{
                                                                width: 72, height: 72, borderRadius: 12,
                                                                backgroundColor: 'rgba(255,255,255,0.04)',
                                                                borderWidth: 1, borderColor: C.border,
                                                                alignItems: 'center', justifyContent: 'center',
                                                            }}
                                                        >
                                                            <Text style={{ color: C.textDim, fontWeight: '900', fontSize: 11 }}>
                                                                +{(sm.evidences?.length ?? 0) - 6}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </ScrollView>
                                            </View>
                                        )}

                                        {/* Awaiting-approval row */}
                                        {hasProposal && (
                                            <View
                                                style={{
                                                    marginHorizontal: 14,
                                                    marginBottom: 14,
                                                    padding: 12,
                                                    backgroundColor: C.amberSoft,
                                                    borderRadius: 14,
                                                    borderWidth: 1,
                                                    borderColor: C.amberRing,
                                                }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: canDecide ? 10 : 0 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Ionicons name="hourglass-outline" size={11} color={C.amber} />
                                                        <Text style={{ fontSize: 9, fontWeight: '900', color: C.amber, letterSpacing: 1.8, textTransform: 'uppercase' }}>
                                                            {isProposer ? 'Awaiting Approval' : 'Result Reported'}
                                                        </Text>
                                                    </View>
                                                    <Text style={{ fontSize: 14, fontWeight: '900', color: C.amber }}>
                                                        {phs} : {pas}
                                                    </Text>
                                                </View>
                                                {canDecide && (
                                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                                        <Pressable
                                                            onPress={() => handleRejectSubMatch(sm)}
                                                            disabled={submittingScoreId === sm.matchId}
                                                            style={{
                                                                flex: 1,
                                                                backgroundColor: C.redSoft,
                                                                borderWidth: 1, borderColor: C.redRing,
                                                                borderRadius: 12,
                                                                paddingVertical: 9,
                                                                alignItems: 'center',
                                                            }}
                                                        >
                                                            {submittingScoreId === sm.matchId ? (
                                                                <ActivityIndicator size="small" color="#F87171" />
                                                            ) : (
                                                                <Text style={{ fontSize: 10, fontWeight: '900', color: '#F87171', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                                                    Reject
                                                                </Text>
                                                            )}
                                                        </Pressable>
                                                        <Pressable
                                                            onPress={() => handleApproveSubMatch(sm)}
                                                            disabled={submittingScoreId === sm.matchId}
                                                            style={{
                                                                flex: 1,
                                                                backgroundColor: C.emerald,
                                                                borderRadius: 12,
                                                                paddingVertical: 9,
                                                                alignItems: 'center',
                                                            }}
                                                        >
                                                            {submittingScoreId === sm.matchId ? (
                                                                <ActivityIndicator size="small" color="#0F172A" />
                                                            ) : (
                                                                <Text style={{ fontSize: 10, fontWeight: '900', color: '#0F172A', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                                                    Approve
                                                                </Text>
                                                            )}
                                                        </Pressable>
                                                    </View>
                                                )}
                                            </View>
                                        )}

                                        {/* Edit mode (score inputs + evidence picker) */}
                                        {showForm ? (
                                            <View
                                                style={{
                                                    marginHorizontal: 14,
                                                    marginBottom: 14,
                                                    padding: 14,
                                                    backgroundColor: 'rgba(0,0,0,0.20)',
                                                    borderRadius: 16,
                                                    borderWidth: 1,
                                                    borderColor: C.border,
                                                }}
                                            >
                                                <Text style={{ fontSize: 9, fontWeight: '900', color: C.textFaint, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
                                                    {sm.status === 'Pending' ? 'Report Result' : 'Edit Result'}
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                                    <TextInput
                                                        style={{
                                                            flex: 1,
                                                            height: 44,
                                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                                            borderRadius: 12,
                                                            borderWidth: 1, borderColor: C.border,
                                                            color: C.text,
                                                            textAlign: 'center',
                                                            fontWeight: '900',
                                                            fontSize: 18,
                                                        }}
                                                        placeholder="0"
                                                        placeholderTextColor={C.textGhost}
                                                        keyboardType="numeric"
                                                        value={scoreInputs[sm.matchId]?.home || ''}
                                                        onChangeText={(v) => handleScoreChange(sm.matchId, 'home', v)}
                                                    />
                                                    <Text style={{ color: C.textFaint, fontWeight: '900', fontSize: 14 }}>:</Text>
                                                    <TextInput
                                                        style={{
                                                            flex: 1,
                                                            height: 44,
                                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                                            borderRadius: 12,
                                                            borderWidth: 1, borderColor: C.border,
                                                            color: C.text,
                                                            textAlign: 'center',
                                                            fontWeight: '900',
                                                            fontSize: 18,
                                                        }}
                                                        placeholder="0"
                                                        placeholderTextColor={C.textGhost}
                                                        keyboardType="numeric"
                                                        value={scoreInputs[sm.matchId]?.away || ''}
                                                        onChangeText={(v) => handleScoreChange(sm.matchId, 'away', v)}
                                                    />
                                                </View>

                                                {/* Evidence section inside edit */}
                                                <View style={{ marginBottom: 14 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Ionicons name="images-outline" size={11} color={C.emerald} />
                                                            <Text style={{ fontSize: 9, fontWeight: '900', color: C.text, letterSpacing: 2, textTransform: 'uppercase' }}>
                                                                Evidence
                                                            </Text>
                                                        </View>
                                                        <Pressable
                                                            onPress={pickImages}
                                                            style={{
                                                                backgroundColor: C.emeraldSoft,
                                                                borderWidth: 1, borderColor: C.emeraldRing,
                                                                paddingHorizontal: 10, paddingVertical: 4,
                                                                borderRadius: 8,
                                                            }}
                                                        >
                                                            <Text style={{ fontSize: 9, fontWeight: '900', color: C.emerald, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                                                + Add
                                                            </Text>
                                                        </Pressable>
                                                    </View>
                                                    {selectedImages.length > 0 ? (
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                            {selectedImages.map((img, ix) => (
                                                                <View key={img.uri + ix} style={{ marginRight: 8 }}>
                                                                    <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                                                                        <Image source={{ uri: img.uri }} style={{ width: 64, height: 64 }} />
                                                                    </View>
                                                                    <Pressable
                                                                        onPress={() => removeImage(img.uri)}
                                                                        style={{
                                                                            position: 'absolute', top: -4, right: -4,
                                                                            width: 18, height: 18, borderRadius: 999,
                                                                            backgroundColor: C.red,
                                                                            alignItems: 'center', justifyContent: 'center',
                                                                            borderWidth: 2, borderColor: C.surfaceRaised,
                                                                        }}
                                                                    >
                                                                        <Ionicons name="close" size={10} color="white" />
                                                                    </Pressable>
                                                                </View>
                                                            ))}
                                                        </ScrollView>
                                                    ) : (
                                                        <Pressable
                                                            onPress={pickImages}
                                                            style={{
                                                                height: 56,
                                                                borderRadius: 12,
                                                                borderWidth: 1,
                                                                borderColor: 'rgba(255,255,255,0.08)',
                                                                borderStyle: 'dashed',
                                                                alignItems: 'center', justifyContent: 'center',
                                                                backgroundColor: 'rgba(255,255,255,0.02)',
                                                            }}
                                                        >
                                                            <Text style={{ fontSize: 10, color: C.textFaint, fontWeight: '700' }}>
                                                                Tap to attach screenshots
                                                            </Text>
                                                        </Pressable>
                                                    )}
                                                </View>

                                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                                    {editingMatchId === sm.matchId && (
                                                        <Pressable
                                                            onPress={handleCancelEdit}
                                                            style={{
                                                                flex: 1,
                                                                backgroundColor: 'rgba(255,255,255,0.04)',
                                                                borderWidth: 1, borderColor: C.border,
                                                                borderRadius: 12,
                                                                paddingVertical: 11,
                                                                alignItems: 'center',
                                                            }}
                                                        >
                                                            <Text style={{ fontSize: 10, fontWeight: '900', color: C.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                                                Cancel
                                                            </Text>
                                                        </Pressable>
                                                    )}
                                                    <Pressable
                                                        onPress={() => handleSubmitScore(sm)}
                                                        disabled={submittingScoreId === sm.matchId || isUploadingEvidence}
                                                        style={{
                                                            flex: 1,
                                                            backgroundColor: C.emerald,
                                                            borderRadius: 12,
                                                            paddingVertical: 11,
                                                            alignItems: 'center',
                                                        }}
                                                    >
                                                        {submittingScoreId === sm.matchId || isUploadingEvidence ? (
                                                            <ActivityIndicator size="small" color="#0F172A" />
                                                        ) : (
                                                            <Text style={{ fontSize: 10, fontWeight: '900', color: '#0F172A', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                                                Save Result
                                                            </Text>
                                                        )}
                                                    </Pressable>
                                                </View>
                                            </View>
                                        ) : (
                                            // Actions row — only shows when there's something to do
                                            (canEdit || canDelete) && (
                                                <View
                                                    style={{
                                                        flexDirection: 'row',
                                                        justifyContent: 'flex-end',
                                                        gap: 8,
                                                        paddingHorizontal: 14,
                                                        paddingBottom: 12,
                                                        paddingTop: 4,
                                                    }}
                                                >
                                                    {canEdit && (
                                                        <Pressable
                                                            onPress={() => handleEditSubMatch(sm)}
                                                            style={{
                                                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                                                backgroundColor: C.emeraldSoft,
                                                                borderWidth: 1, borderColor: C.emeraldRing,
                                                                borderRadius: 10,
                                                                paddingHorizontal: 10, paddingVertical: 6,
                                                            }}
                                                        >
                                                            <Ionicons name="create-outline" size={11} color={C.emerald} />
                                                            <Text style={{ fontSize: 9, fontWeight: '900', color: C.emerald, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                                                                Edit
                                                            </Text>
                                                        </Pressable>
                                                    )}
                                                    {canDelete && (
                                                        <Pressable
                                                            onPress={() => handleDeleteSubMatch(sm)}
                                                            disabled={submittingScoreId === sm.matchId}
                                                            style={{
                                                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                                                backgroundColor: C.redSoft,
                                                                borderWidth: 1, borderColor: C.redRing,
                                                                borderRadius: 10,
                                                                paddingHorizontal: 10, paddingVertical: 6,
                                                            }}
                                                        >
                                                            {submittingScoreId === sm.matchId ? (
                                                                <ActivityIndicator size="small" color="#F87171" />
                                                            ) : (
                                                                <>
                                                                    <Ionicons name="trash-outline" size={11} color="#F87171" />
                                                                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#F87171', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                                                                        Delete
                                                                    </Text>
                                                                </>
                                                            )}
                                                        </Pressable>
                                                    )}
                                                </View>
                                            )
                                        )}
                                        </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>

                        {/* ─── OUTCOME FOOTER ───────────────────────────────────────── */}
                        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                            {teamState === 'completed' && ((homeWins !== awayWins) || data?.winnerTeamParticipantId) ? (
                                (() => {
                                    let winnerIsHome = false;
                                    let isTie = false;
                                    let winnerCalculated = false;

                                    const matchWinsHome = homeWins;
                                    const matchWinsAway = awayWins;
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

                                    const winningTeamName = isTie ? 'Match Draw' : (winnerIsHome ? data?.homeTeam?.teamName : data?.awayTeam?.teamName);
                                    const winningWins = winnerIsHome ? matchWinsHome : matchWinsAway;
                                    const losingWins = winnerIsHome ? matchWinsAway : matchWinsHome;
                                    const winningTotal = winnerIsHome ? totalScoreHome : totalScoreAway;
                                    const losingTotal = winnerIsHome ? totalScoreAway : totalScoreHome;
                                    const isMatchWinsTie = matchWinsHome === matchWinsAway;
                                    const isBigWin = Math.abs(winningWins - losingWins) >= 2;

                                    return (
                                        <View
                                            style={{
                                                borderRadius: 28,
                                                overflow: 'hidden',
                                                borderWidth: 1,
                                                borderColor: C.emeraldRing,
                                                backgroundColor: C.surfaceRaised,
                                                shadowColor: C.emerald,
                                                shadowOpacity: 0.25,
                                                shadowRadius: 18,
                                                shadowOffset: { width: 0, height: 8 },
                                                elevation: 6,
                                            }}
                                        >
                                            <LinearGradient
                                                colors={['rgba(16,185,129,0.18)', 'rgba(16,185,129,0.04)']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                            />
                                            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 }}>
                                                <View
                                                    style={{
                                                        width: 64, height: 64, borderRadius: 22,
                                                        backgroundColor: 'rgba(16,185,129,0.18)',
                                                        borderWidth: 1, borderColor: C.emeraldRing,
                                                        alignItems: 'center', justifyContent: 'center',
                                                        shadowColor: C.emerald, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                                                    }}
                                                >
                                                    <Ionicons name={isTie ? 'shield' : 'trophy'} size={30} color={C.emerald} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(16,185,129,0.7)', letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 4 }}>
                                                        {isTie ? 'Result' : 'Match Winner'}
                                                    </Text>
                                                    <Text
                                                        numberOfLines={1}
                                                        style={{ fontSize: 20, fontWeight: '900', color: C.emerald, letterSpacing: -0.3, marginBottom: 8 }}
                                                    >
                                                        {winningTeamName}
                                                    </Text>
                                                    <View
                                                        style={{
                                                            flexDirection: 'row', alignItems: 'center', gap: 6,
                                                            alignSelf: 'flex-start',
                                                            backgroundColor: 'rgba(16,185,129,0.15)',
                                                            borderWidth: 1, borderColor: C.emeraldRing,
                                                            borderRadius: 10,
                                                            paddingHorizontal: 9, paddingVertical: 4,
                                                        }}
                                                    >
                                                        <Ionicons
                                                            name={isTie ? 'calculator' : (isMatchWinsTie ? 'calculator' : (isBigWin ? 'flame' : 'flag'))}
                                                            size={11}
                                                            color={C.emerald}
                                                        />
                                                        <Text style={{ fontSize: 9, fontWeight: '900', color: C.emerald, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                                                            {isTie
                                                                ? `Draw · ${winningWins} – ${losingWins}`
                                                                : isMatchWinsTie
                                                                    ? `Aggregate Win · ${winningTotal} – ${losingTotal}`
                                                                    : `${isBigWin ? 'Dominant Win' : 'Match Wins'} · ${winningWins} – ${losingWins}`}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })()
                            ) : teamState === 'tieBreak' ? (
                                <View
                                    style={{
                                        borderRadius: 22,
                                        backgroundColor: C.surfaceRaised,
                                        borderWidth: 1, borderColor: C.amberRing,
                                        paddingHorizontal: 20, paddingVertical: 18,
                                        flexDirection: 'row', alignItems: 'center', gap: 12,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: 36, height: 36, borderRadius: 14,
                                            backgroundColor: C.amberSoft,
                                            borderWidth: 1, borderColor: C.amberRing,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Ionicons name="flash" size={16} color={C.amber} />
                                    </View>
                                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '900', color: C.amber, letterSpacing: 1.6, textTransform: 'uppercase' }}>
                                        {TEAM_LABELS.TIE_BREAK_BANNER}
                                    </Text>
                                </View>
                            ) : (
                                // Pending — show progress strip instead of a generic spinner
                                <View
                                    style={{
                                        borderRadius: 22,
                                        backgroundColor: C.surfaceRaised,
                                        borderWidth: 1, borderColor: C.border,
                                        padding: 18,
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View
                                                style={{
                                                    width: 28, height: 28, borderRadius: 10,
                                                    backgroundColor: C.amberSoft,
                                                    borderWidth: 1, borderColor: C.amberRing,
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                <Ionicons name="time-outline" size={14} color={C.amber} />
                                            </View>
                                            <Text style={{ fontSize: 11, fontWeight: '900', color: C.text, letterSpacing: 0.4 }}>
                                                {TEAM_LABELS.AWAITING_RESULTS}
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 11, fontWeight: '900', color: C.amber, letterSpacing: 1.2 }}>
                                            {completedSubs} / {totalSubs}
                                        </Text>
                                    </View>
                                    {/* Progress bar */}
                                    <View
                                        style={{
                                            height: 6,
                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                            borderRadius: 999,
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <View
                                            style={{
                                                height: '100%',
                                                width: totalSubs > 0 ? `${(completedSubs / totalSubs) * 100}%` : '0%',
                                                backgroundColor: C.amber,
                                                borderRadius: 999,
                                            }}
                                        />
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
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={() => setShowRepPicker(false)} />
                        <View
                            style={{
                                width: '100%', maxWidth: 360,
                                borderRadius: 28, overflow: 'hidden',
                                backgroundColor: C.surfaceRaised,
                                borderWidth: 1, borderColor: C.borderStrong,
                            }}
                        >
                            <View style={{ padding: 22, borderBottomWidth: 1, borderBottomColor: C.border }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: C.amber, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 }}>
                                    Tie-Break
                                </Text>
                                <Text style={{ fontSize: 16, fontWeight: '900', color: C.text, textAlign: 'center' }}>
                                    {TEAM_LABELS.SELECT_REPRESENTATIVE}
                                </Text>
                            </View>
                            <ScrollView style={{ maxHeight: 320 }}>
                                {myTeamMembers.map((member) => (
                                    <Pressable
                                        key={member.userId}
                                        onPress={() => handleSelectRepresentative(member)}
                                        disabled={isSubmittingRep}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                            paddingHorizontal: 18, paddingVertical: 14,
                                            borderBottomWidth: 1, borderBottomColor: C.border,
                                        }}
                                    >
                                        <PlayerAvatar src={member.avatarUrl} name={member.username} size="md" />
                                        <Text style={{ flex: 1, color: C.text, fontWeight: '800', fontSize: 14 }}>
                                            {member.username}
                                        </Text>
                                        {member.isCaptain && (
                                            <Ionicons name="shield" size={14} color={C.amber} />
                                        )}
                                        {isSubmittingRep ? (
                                            <ActivityIndicator size="small" color={C.emerald} />
                                        ) : (
                                            <Ionicons name="chevron-forward" size={18} color={C.textGhost} />
                                        )}
                                    </Pressable>
                                ))}
                            </ScrollView>
                            <View style={{ padding: 16 }}>
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
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                        <Pressable
                            onPress={() => setPreviewImage(null)}
                            style={{
                                position: 'absolute', top: 48, right: 24, zIndex: 10,
                                width: 40, height: 40, borderRadius: 999,
                                backgroundColor: 'rgba(255,255,255,0.10)',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <Ionicons name="close" size={22} color="white" />
                        </Pressable>
                        <Image
                            source={{ uri: getOptimizedCloudinaryUrl(previewImage, 800) }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                        />
                    </View>
                </Modal>
            )}
        </Modal>
    );
}
