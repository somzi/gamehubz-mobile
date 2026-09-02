import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    ActivityIndicator,
    Pressable,
    Modal,
    AppState,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { StatusModal } from './StatusModal';
import { useTranslation } from 'react-i18next';
import {
    getMatchDetails,
    getTieBreakStatus,
    submitTieBreakRepresentative,
} from '../../lib/teamApi';
import { getErrorMessage, API_BASE_URL } from '../../lib/api';
import { groupBySeries, normalizeBestOf, seriesBlockLabel, seriesGamesFrom } from '../../lib/series';
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
    /**
     * Drill from a single game into its full match page (chat / stream / result) — the same
     * solo MatchDetailsModal a 1v1 tournament uses. The team modal has no chat of its own, so
     * the parent reshapes the sub-match and opens the solo surface; `tab` picks the entry tab.
     */
    onOpenSubMatch?: (sub: SubMatchDto, tab: 'match' | 'chat') => void;
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
type SubState = 'pending' | 'completed' | 'awaitingApproval' | 'tieBreak' | 'noShow';

function deriveTeamState(data: TeamMatchDetailsDto | null, tieBreak: TieBreakStatusDto | null): TeamState {
    // Backend TeamMatchStatus: Pending=1, Completed=2, TieBreakRequired=3, Processing=4.
    // (Distinct from MatchStatus on sub-matches, where Completed=4 — do not cross-wire.)
    if (tieBreak?.isRequired && !data?.winnerTeamParticipantId) return 'tieBreak';
    if (data?.status === 'TieBreakRequired' || data?.status === 3) return 'tieBreak';
    if (data?.winnerTeamParticipantId || data?.status === 'Completed' || data?.status === 2) return 'completed';
    if (data?.status === 'Processing' || data?.status === 4) return 'live';
    return 'pending';
}

function deriveSubState(sm: SubMatchDto, approvalRequired: boolean): SubState {
    // Backend MatchStatus on sub-matches: Pending=1, Scheduled=2, Live=3, Completed=4, NoShow=5.
    // NoShow = double walkover: the game is closed and counts for neither team (checked before
    // the tie-break shape so a voided tie-break game reads "No Show", not another tie-break).
    if (sm.status === 'NoShow' || sm.status === 5) return 'noShow';
    if (sm.isTieBreakMatch && !sm.winnerUserId && (sm.homeScore === null || sm.awayScore === null)) return 'tieBreak';
    const hasResult = sm.homeScore !== null && sm.awayScore !== null;
    if (hasResult && (sm.status === 'Completed' || sm.status === 4 || !!sm.winnerUserId)) return 'completed';
    const proposed = (sm as any).proposedByUserId ?? (sm as any).ProposedByUserId;
    const subPending = sm.status === 'Pending' || sm.status === 1;
    if (approvalRequired && !!proposed && subPending) return 'awaitingApproval';
    return 'pending';
}

function paletteFor(state: TeamState | SubState) {
    switch (state) {
        case 'completed':
            return { accent: C.emerald, soft: C.emeraldSoft, ring: C.emeraldRing, labelKey: 'status.completed' };
        case 'live':
            return { accent: C.emerald, soft: C.emeraldSoft, ring: C.emeraldRing, labelKey: 'status.live' };
        case 'tieBreak':
            return { accent: C.amber, soft: C.amberSoft, ring: C.amberRing, labelKey: 'status.tieBreak' };
        case 'awaitingApproval':
            return { accent: C.amber, soft: C.amberSoft, ring: C.amberRing, labelKey: 'status.awaitingApproval' };
        case 'noShow':
            // Administratively closed, nobody played — muted slate so it reads as "void", not progress.
            return { accent: '#64748B', soft: 'rgba(100,116,139,0.10)', ring: 'rgba(100,116,139,0.28)', labelKey: 'status.noShow' };
        default:
            return { accent: C.amber, soft: C.amberSoft, ring: C.amberRing, labelKey: 'status.pending' };
    }
}

// Pill with state dot — tightened typography and a slightly larger dot for legibility at glance.
function StatusPill({ state, size = 'md' }: { state: TeamState | SubState; size?: 'sm' | 'md' }) {
    const { t } = useTranslation('match');
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
                {t(p.labelKey)}
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
                <Image
                    source={{ uri: url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                />
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
    const { t: tCommon } = useTranslation('common');
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
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
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
                {teamName || tCommon('unknown')}
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
    onOpenSubMatch,
}: TeamMatchDetailModalProps) {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('team');
    const { t: tCommon } = useTranslation('common');

    const [data, setData] = useState<TeamMatchDetailsDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Tie-break
    const [tieBreakStatus, setTieBreakStatus] = useState<TieBreakStatusDto | null>(null);
    const [showRepPicker, setShowRepPicker] = useState(false);
    const [isSubmittingRep, setIsSubmittingRep] = useState(false);
    // Nomination is confirmed in a second step rather than firing on the tap: the pick that fills
    // the last seat spawns the tie-break match and can no longer be changed. Kept as a swapped-in
    // view INSIDE the picker (not another Modal) — the picker is already a modal inside a modal,
    // and a third layer is exactly where iOS presentation starts misbehaving.
    const [pendingRep, setPendingRep] = useState<{ member: TeamMemberDto; teamName: string; side: 'home' | 'away' } | null>(null);
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
                homeTeamParticipantId: raw.homeTeamParticipantId || raw.HomeTeamParticipantId || null,
                awayTeamParticipantId: raw.awayTeamParticipantId || raw.AwayTeamParticipantId || null,
                winCondition: (() => {
                    const wc = raw.winCondition ?? raw.WinCondition;
                    if (wc === 1 || wc === 'AggregateScore') return 'AggregateScore';
                    if (wc === 0 || wc === 'MatchWins') return 'MatchWins';
                    return null;
                })(),
                homeTeam: home ? {
                    teamId: home.teamId || home.TeamId || '',
                    teamName: home.teamName || home.TeamName || '',
                    members: (home.members || home.Members || []).map((m: any) => ({
                        userId: m.userId || m.UserId || '',
                        username: m.username || m.Username || '',
                        isCaptain: m.isCaptain || m.IsCaptain || false,
                        // Bench players stay eligible as a tie-break representative — it's the
                        // captain's call — but the picker labels them so the choice is informed.
                        isReserve: m.isReserve || m.IsReserve || false,
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
                        // Bench players stay eligible as a tie-break representative — it's the
                        // captain's call — but the picker labels them so the choice is informed.
                        isReserve: m.isReserve || m.IsReserve || false,
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
                        // Each individual game of the tie is its own best-of series. Carried through
                        // so the row can break "2 : 1" down into the games behind it.
                        bestOf: normalizeBestOf(sm.bestOf ?? sm.BestOf),
                        games: seriesGamesFrom(sm),
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
        setTieBreakStatus(null);
        setPendingRep(null);
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

    const handleSelectRepresentative = async (member: TeamMemberDto) => {
        if (!data) return;
        setIsSubmittingRep(true);
        try {
            const status = await submitTieBreakRepresentative(data.teamMatchId, member.userId);
            setTieBreakStatus(status);
            // A manager nominates for BOTH sides, so keep the picker open until both seats are
            // filled — otherwise they'd have to reopen it for the second team.
            const bothSeatsFilled = !!(status.homeRepresentative && status.awayRepresentative);
            setPendingRep(null);
            if (!isManagerPicker || bothSeatsFilled) setShowRepPicker(false);
            fetchData();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            // Close first: the picker is a Modal stacked above this one, and StatusModal would
            // render behind it — which reads as "nothing happened" when a pick is rejected.
            setPendingRep(null);
            setShowRepPicker(false);
            setStatusConfig({ type: 'error', title: t('common:error'), message });
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

    // A manager (hub owner / admin) nominates on behalf of BOTH teams — captains often go
    // inactive mid-fixture. Captains still only ever see their own roster.
    const isManagerPicker = !!isHubOwner && !isCaptainOfEitherTeam;

    // Rosters offered in the rep picker, split per team so a manager can tell the two sides
    // apart (a single flat list of four names says nothing about who plays for whom).
    const repSections: { side: 'home' | 'away'; teamName: string; members: TeamMemberDto[]; currentRepId?: string }[] = (() => {
        if (!data) return [];

        const home = {
            side: 'home' as const,
            teamName: data.homeTeam?.teamName || t('homeRepresentative'),
            members: data.homeTeam?.members || [],
            currentRepId: tieBreakStatus?.homeRepresentative?.userId,
        };
        const away = {
            side: 'away' as const,
            teamName: data.awayTeam?.teamName || t('awayRepresentative'),
            members: data.awayTeam?.members || [],
            currentRepId: tieBreakStatus?.awayRepresentative?.userId,
        };

        if (isManagerPicker) return [home, away];
        if (isCaptainOfHome) return [home];
        if (isCaptainOfAway) return [away];

        // Plain roster member: their own side only (the backend still rejects the submit).
        const userAsHome = data.homeTeam?.members?.some(m => m.userId.toLowerCase() === currentUserId?.toLowerCase());
        if (userAsHome) return [home];
        const userAsAway = data.awayTeam?.members?.some(m => m.userId.toLowerCase() === currentUserId?.toLowerCase());
        if (userAsAway) return [away];

        return [];
    })();

    // Derived team-level state for the hero pill / outcome footer.
    const teamState: TeamState = deriveTeamState(data, tieBreakStatus);
    const approvalRequired = !!((data as any)?.requireResultApproval ?? (data as any)?.RequireResultApproval);

    // Progress over individual matches — drives the "X of N completed" progress strip.
    // NoShow (double-walkover) games are terminal too: they're closed, just worth nothing.
    const totalSubs = data?.subMatches?.length ?? 0;
    const completedSubs = data?.subMatches?.filter(sm => {
        if (sm.status === 'NoShow' || sm.status === 5) return true;
        const hasResult = sm.homeScore !== null && sm.awayScore !== null;
        return hasResult && (sm.status === 'Completed' || sm.status === 4 || !!sm.winnerUserId);
    }).length ?? 0;

    // Voided tie: closed with no winner and not a single game actually played (every game a
    // no-show double walkover). Renders its own footer — "Match Draw" would be wrong here.
    const isVoidedTie = !!data && deriveTeamState(data, tieBreakStatus) === 'completed'
        && !data.winnerTeamParticipantId
        && (data.subMatches?.length ?? 0) > 0
        && (data.subMatches ?? []).every(sm => sm.status === 'NoShow' || sm.status === 5);

    const homeWins = data?.aggregateScore?.homeTeamWins ?? 0;
    const awayWins = data?.aggregateScore?.awayTeamWins ?? 0;
    const homeTotal = data?.aggregateScore?.homeTeamTotalScore ?? 0;
    const awayTotal = data?.aggregateScore?.awayTeamTotalScore ?? 0;

    // Which metric decides this match — the tournament's TeamWinCondition.
    // null (older backend payload without the field) keeps the legacy behavior:
    // wins in the hero, aggregate in the strip, heuristic winner chip.
    const winCondition = data?.winCondition ?? null;
    const isAggregateCondition = winCondition === 'AggregateScore';

    // Single source of truth for "who's ahead / who won". Backend's
    // WinnerTeamParticipantId is authoritative; otherwise mirror the backend rules
    // (BracketService.ProcessTeamMatchResultInner) for the tournament's win condition.
    const winnerSide: 'home' | 'away' | null = (() => {
        const wid = data?.winnerTeamParticipantId ? String(data.winnerTeamParticipantId).toLowerCase() : null;
        if (wid) {
            const homePid = data?.homeTeamParticipantId ? String(data.homeTeamParticipantId).toLowerCase() : null;
            const awayPid = data?.awayTeamParticipantId ? String(data.awayTeamParticipantId).toLowerCase() : null;
            if (homePid && wid === homePid) return 'home';
            if (awayPid && wid === awayPid) return 'away';
            // Older payloads carry team ids only — keep the previous comparison as a fallback.
            if (data?.homeTeam?.teamId && wid === String(data.homeTeam.teamId).toLowerCase()) return 'home';
            if (data?.awayTeam?.teamId && wid === String(data.awayTeam.teamId).toLowerCase()) return 'away';
        }
        if (isAggregateCondition) {
            if (homeTotal !== awayTotal) return homeTotal > awayTotal ? 'home' : 'away';
            if (homeWins !== awayWins) return homeWins > awayWins ? 'home' : 'away';
            return null;
        }
        if (homeWins !== awayWins) return homeWins > awayWins ? 'home' : 'away';
        // Legacy heuristic when the win condition is unknown.
        if (winCondition === null && homeTotal !== awayTotal) return homeTotal > awayTotal ? 'home' : 'away';
        return null;
    })();

    // Hero shows the deciding metric large; the other metric lives in the strip below.
    // A voided tie has no meaningful score — "0 : 0" would read like a played result.
    const heroHomeScore = isVoidedTie ? '—' : (isAggregateCondition ? homeTotal : homeWins);
    const heroAwayScore = isVoidedTie ? '—' : (isAggregateCondition ? awayTotal : awayWins);
    const homeIsHeroWinner = winnerSide === 'home';
    const awayIsHeroWinner = winnerSide === 'away';

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
                            {t('matchModal.eyebrow')}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: C.text, letterSpacing: 0.4, marginTop: 2 }}>
                            {t('matchModal.title')}
                        </Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {isLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={C.emerald} />
                        <Text style={{ marginTop: 16, color: C.textDim, fontWeight: '800', letterSpacing: 2, fontSize: 10, textTransform: 'uppercase' }}>
                            {t('matchModal.loading')}
                        </Text>
                    </View>
                ) : error || !data ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                        <Ionicons name="alert-circle-outline" size={48} color={C.red} />
                        <Text style={{ marginTop: 16, color: C.red, textAlign: 'center', fontWeight: '600' }}>
                            {error || t('matchModal.unavailable')}
                        </Text>
                        <Button onPress={fetchData} className="mt-6">{t('common:retry')}</Button>
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
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                                                {t('match:series.bestOfN', { n: totalSubs || '—' })}
                                            </Text>
                                        </View>
                                        {winCondition !== null && (
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
                                                    {isAggregateCondition ? t('matchModal.aggregateScore') : t('matchModal.matchWins')}
                                                </Text>
                                            </View>
                                        )}
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
                                                    color: homeIsHeroWinner ? C.emerald : (winnerSide === null ? C.text : 'rgba(255,255,255,0.18)'),
                                                }}
                                            >
                                                {heroHomeScore}
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
                                                    color: awayIsHeroWinner ? C.emerald : (winnerSide === null ? C.text : 'rgba(255,255,255,0.18)'),
                                                }}
                                            >
                                                {heroAwayScore}
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
                                            {isAggregateCondition ? t('matchModal.matchWins') : t('matchModal.aggregate')}
                                        </Text>
                                        <Text style={{ fontSize: 11, fontWeight: '900', color: C.textDim, marginLeft: 2 }}>
                                            {isAggregateCondition ? homeWins : homeTotal}
                                            <Text style={{ color: C.textGhost }}>  –  </Text>
                                            {isAggregateCondition ? awayWins : awayTotal}
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
                                                    {t('matchModal.tieBreakRequired')}
                                                </Text>
                                                <Text style={{ fontSize: 12, fontWeight: '800', color: C.text }}>
                                                    {tieBreakStatus.homeRepresentative && tieBreakStatus.awayRepresentative
                                                        ? t('tieBreakInProgress')
                                                        : t('tieBreakBanner')}
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
                                                    {t('homeRepresentative')}
                                                </Text>
                                                <Text style={{ fontSize: 11, fontWeight: '900', color: tieBreakStatus.homeRepresentative ? C.text : C.textFaint }}>
                                                    {tieBreakStatus.homeRepresentative?.username || t('waitingLabel')}
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: C.textDim, letterSpacing: 0.5 }}>
                                                    {t('awayRepresentative')}
                                                </Text>
                                                <Text style={{ fontSize: 11, fontWeight: '900', color: tieBreakStatus.awayRepresentative ? C.text : C.textFaint }}>
                                                    {tieBreakStatus.awayRepresentative?.username || t('waitingLabel')}
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
                                                        {isManagerPicker
                                                            ? t('matchModal.adminSelectRepresentatives')
                                                            : hasSubmittedRep ? t('matchModal.changeRepresentative') : t('selectRepresentative')}
                                                    </Text>
                                                )}
                                            </Pressable>
                                        )}

                                        {isCaptainOfEitherTeam && hasSubmittedRep && (
                                            <Text style={{ fontSize: 10, fontWeight: '800', color: C.amber, textAlign: 'center', marginTop: 8, letterSpacing: 0.5 }}>
                                                {t('waitingForOpponent')}
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
                                    {t('matchModal.individualGames')}
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

                                // A result awaiting approval shows its proposed score (amber) in the summary row;
                                // reporting / approving / editing all happen on the match page (See Details).
                                const proposed = (sm as any).proposedByUserId ?? (sm as any).ProposedByUserId;
                                const subPending = sm.status === 'Pending' || sm.status === 0 || sm.status === 1;
                                const hasProposal = approvalRequired && !!proposed && subPending;
                                const phs = (sm as any).proposedHomeScore ?? (sm as any).ProposedHomeScore ?? 0;
                                const pas = (sm as any).proposedAwayScore ?? (sm as any).ProposedAwayScore ?? 0;

                                // A best-of sub-match shows "2 : 1" for games won, which is meaningless
                                // without the games behind it — list them under the row.
                                const subBestOf = normalizeBestOf((sm as any).bestOf);
                                const subGames = seriesGamesFrom(sm);
                                // A pending proposal keeps its games in ProposedGames until it is approved —
                                // list those instead so the amber headline can be read game by game before
                                // anyone decides on it.
                                const subProposedGames = seriesGamesFrom({ games: (sm as any).proposedGames ?? (sm as any).ProposedGames });
                                const breakdownIsProposed = subGames.length === 0 && hasProposal;
                                const breakdownGames = breakdownIsProposed ? subProposedGames : subGames;

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

                                        {/* Compact summary row — players · score. The whole card opens the full
                                            match page (result · chat · stream), the same surface a solo match uses. */}
                                        <Pressable
                                            onPress={() => onOpenSubMatch?.(sm, 'match')}
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
                                                    {sm.homePlayer?.username || tCommon('unknown')}
                                                </Text>
                                            </View>

                                            {/* Center — game label + score / state */}
                                            <View style={{ width: 60, alignItems: 'center', paddingHorizontal: 2 }}>
                                                <Text style={{ fontSize: 7.5, fontWeight: '900', color: sm.isTieBreakMatch ? C.amber : C.textFaint, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 2 }}>
                                                    {sm.isTieBreakMatch ? t('tieBreakLabel') : t('matchModal.game', { number: idx + 1 })}
                                                    {subBestOf > 1 ? ` · BO${subBestOf}` : ''}
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
                                                ) : subState === 'noShow' ? (
                                                    <Text style={{ fontSize: 14, fontWeight: '900', color: C.textFaint, letterSpacing: 2 }}>—</Text>
                                                ) : (
                                                    <Text style={{ fontSize: 10, fontWeight: '900', color: C.textGhost, letterSpacing: 2 }}>VS</Text>
                                                )}
                                            </View>

                                            {/* Away player */}
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                                <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800', color: awayWinner ? C.emerald : C.text }}>
                                                    {sm.awayPlayer?.username || tCommon('unknown')}
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
                                        </Pressable>

                                        {/* Per-game breakdown of a series sub-match. Without it the row's
                                            "2 : 1" is indistinguishable from a single game's score. */}
                                        {breakdownGames.length > 0 && subBestOf > 1 && (
                                            <View
                                                style={{
                                                    flexDirection: 'row',
                                                    flexWrap: 'wrap',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    paddingHorizontal: 14,
                                                    paddingBottom: 8,
                                                }}
                                            >
                                                {groupBySeries(breakdownGames).map(block => (
                                                    <View key={block.seriesNumber} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        {block.seriesNumber > 1 && (
                                                            <Text style={{ fontSize: 8, fontWeight: '900', color: C.amber, letterSpacing: 1, textTransform: 'uppercase' }}>
                                                                {seriesBlockLabel(block.seriesNumber)}
                                                            </Text>
                                                        )}
                                                        {block.games.map((g, gi) => (
                                                            <Text key={gi} style={{ fontSize: 10, fontWeight: '800', color: breakdownIsProposed ? C.amber : C.textFaint }}>
                                                                {g.homeScore}:{g.awayScore}
                                                            </Text>
                                                        ))}
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* See Details — opens the match page where result reporting, edit / delete,
                                            evidence, chat & stream all live now. */}
                                        <Pressable
                                            onPress={() => onOpenSubMatch?.(sm, 'match')}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                paddingHorizontal: 14,
                                                paddingVertical: 11,
                                                borderTopWidth: 1,
                                                borderTopColor: 'rgba(255,255,255,0.05)',
                                            }}
                                        >
                                            <StatusPill state={subState} size="sm" />
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <Text style={{ fontSize: 10, fontWeight: '900', color: C.emerald, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                                                    {t('matchModal.seeDetails')}
                                                </Text>
                                                <Ionicons name="chevron-forward" size={14} color={C.emerald} />
                                            </View>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>

                        {/* ─── OUTCOME FOOTER ───────────────────────────────────────── */}
                        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                            {isVoidedTie ? (
                                // Voided tie — nobody played a single game. Muted slate, deliberately
                                // NOT the emerald winner card and NOT "Match Draw".
                                <View
                                    style={{
                                        borderRadius: 22,
                                        backgroundColor: C.surfaceRaised,
                                        borderWidth: 1, borderColor: 'rgba(100,116,139,0.28)',
                                        paddingHorizontal: 20, paddingVertical: 18,
                                        flexDirection: 'row', alignItems: 'center', gap: 12,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: 36, height: 36, borderRadius: 14,
                                            backgroundColor: 'rgba(100,116,139,0.10)',
                                            borderWidth: 1, borderColor: 'rgba(100,116,139,0.28)',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Ionicons name="ban" size={16} color="#64748B" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 3 }}>
                                            {t('matchModal.voidedTitle')}
                                        </Text>
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.textFaint, lineHeight: 15 }}>
                                            {t('matchModal.voidedBody')}
                                        </Text>
                                    </View>
                                </View>
                            ) : teamState === 'completed' ? (
                                (() => {
                                    // winnerSide already folds in the backend winner id and the
                                    // tournament's win condition — this block only shapes the labels.
                                    const isTie = winnerSide === null;
                                    const winnerIsHome = winnerSide === 'home';

                                    const winningTeamName = isTie ? t('matchModal.matchDraw') : (winnerIsHome ? data?.homeTeam?.teamName : data?.awayTeam?.teamName);
                                    const winningWins = winnerIsHome ? homeWins : awayWins;
                                    const losingWins = winnerIsHome ? awayWins : homeWins;
                                    const winningTotal = winnerIsHome ? homeTotal : awayTotal;
                                    const losingTotal = winnerIsHome ? awayTotal : homeTotal;
                                    // Name the metric that actually decided the match. Under the
                                    // aggregate condition, totals decide unless tied (then wins broke
                                    // the tie); under match wins — wins. Unknown condition keeps the
                                    // old heuristic: wins tied → the aggregate must have decided.
                                    const decidedByAggregate = isAggregateCondition
                                        ? winningTotal !== losingTotal
                                        : winCondition === null && winningWins === losingWins;
                                    const isBigWin = !decidedByAggregate && Math.abs(winningWins - losingWins) >= 2;

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
                                                        {isTie ? t('matchModal.result') : t('matchModal.matchWinner')}
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
                                                            name={isTie || decidedByAggregate ? 'calculator' : (isBigWin ? 'flame' : 'flag')}
                                                            size={11}
                                                            color={C.emerald}
                                                        />
                                                        <Text style={{ fontSize: 9, fontWeight: '900', color: C.emerald, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                                                            {isTie
                                                                ? t('matchModal.drawWith', { score: isAggregateCondition ? `${winningTotal} – ${losingTotal}` : `${winningWins} – ${losingWins}` })
                                                                : decidedByAggregate
                                                                    ? t('matchModal.aggregateWin', { score: `${winningTotal} – ${losingTotal}` })
                                                                    : t(isBigWin ? 'matchModal.dominantWin' : 'matchModal.matchWinsWith', { score: `${winningWins} – ${losingWins}` })}
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
                                        {t('tieBreakBanner')}
                                    </Text>
                                </View>
                            ) : null /* Pending — progress is already shown by the "X / N DONE" line + aggregate in the hero card up top, no need to repeat it as a footer strip. */}
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
                        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={() => { setPendingRep(null); setShowRepPicker(false); }} />
                        <View
                            style={{
                                width: '100%', maxWidth: 360,
                                borderRadius: 28, overflow: 'hidden',
                                backgroundColor: C.surfaceRaised,
                                borderWidth: 1, borderColor: C.borderStrong,
                            }}
                        >
                        {pendingRep ? (() => {
                            // The nomination locks in only once BOTH seats are taken — that submit
                            // spawns the 1v1 match and the endpoint refuses any further change.
                            const otherSeatFilled = pendingRep.side === 'home'
                                ? !!tieBreakStatus?.awayRepresentative
                                : !!tieBreakStatus?.homeRepresentative;

                            return (
                                <>
                                    <View style={{ padding: 22, borderBottomWidth: 1, borderBottomColor: C.border }}>
                                        <Text style={{ fontSize: 9, fontWeight: '900', color: C.amber, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 }}>
                                            {t('tieBreakLabel')}
                                        </Text>
                                        <Text style={{ fontSize: 16, fontWeight: '900', color: C.text, textAlign: 'center' }}>
                                            {t('confirmRepresentative')}
                                        </Text>
                                    </View>

                                    <View style={{ padding: 22, alignItems: 'center' }}>
                                        <PlayerAvatar src={pendingRep.member.avatarUrl} name={pendingRep.member.username} size="lg" />
                                        <Text style={{ fontSize: 18, fontWeight: '900', color: C.text, marginTop: 12, textAlign: 'center' }}>
                                            {pendingRep.member.username}
                                        </Text>
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.textDim, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                                            {t('willPlayTieBreakFor')}
                                        </Text>
                                        <Text style={{ fontSize: 13, fontWeight: '900', color: C.amber, marginTop: 2, textAlign: 'center' }} numberOfLines={2}>
                                            {pendingRep.teamName}
                                        </Text>

                                        {otherSeatFilled && (
                                            <View
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center', gap: 8,
                                                    backgroundColor: C.amberSoft,
                                                    borderWidth: 1, borderColor: C.amberRing,
                                                    borderRadius: 14,
                                                    paddingHorizontal: 12, paddingVertical: 10,
                                                    marginTop: 16,
                                                }}
                                            >
                                                <Ionicons name="warning" size={14} color={C.amber} />
                                                <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: C.textDim, lineHeight: 16 }}>
                                                    {t('tieBreakLockWarning')}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <View style={{ padding: 16, paddingTop: 0, flexDirection: 'row', gap: 10 }}>
                                        <View style={{ flex: 1 }}>
                                            <Button
                                                variant="outline"
                                                onPress={() => setPendingRep(null)}
                                                disabled={isSubmittingRep}
                                                className="w-full"
                                            >
                                                {t('common:back')}
                                            </Button>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Button
                                                onPress={() => handleSelectRepresentative(pendingRep.member)}
                                                disabled={isSubmittingRep}
                                                loading={isSubmittingRep}
                                                className="w-full"
                                            >
                                                {t('common:confirm')}
                                            </Button>
                                        </View>
                                    </View>
                                </>
                            );
                        })() : (
                        <>
                            <View style={{ padding: 22, borderBottomWidth: 1, borderBottomColor: C.border }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: C.amber, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 }}>
                                    {t('tieBreakLabel')}
                                </Text>
                                <Text style={{ fontSize: 16, fontWeight: '900', color: C.text, textAlign: 'center' }}>
                                    {isManagerPicker
                                        ? t('selectRepresentatives')
                                        : t('selectRepresentative')}
                                </Text>
                                {isManagerPicker && (
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.textDim, textAlign: 'center', marginTop: 6 }}>
                                        {t('managerPickHint')}
                                    </Text>
                                )}
                            </View>
                            <ScrollView style={{ maxHeight: 380 }}>
                                {repSections.map((section) => (
                                    <View key={section.side}>
                                        {/* Team header — only a manager sees more than one roster, but keeping
                                            it for captains too labels whose team they are picking from. */}
                                        <View
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                                paddingHorizontal: 18, paddingVertical: 10,
                                                backgroundColor: 'rgba(255,255,255,0.03)',
                                                borderBottomWidth: 1, borderBottomColor: C.border,
                                            }}
                                        >
                                            <Text style={{ flex: 1, fontSize: 9, fontWeight: '900', color: C.textDim, letterSpacing: 1.6, textTransform: 'uppercase' }} numberOfLines={1}>
                                                {section.teamName}
                                            </Text>
                                            <Text style={{ fontSize: 9, fontWeight: '900', color: section.currentRepId ? C.emerald : C.textFaint, letterSpacing: 1 }}>
                                                {section.side === 'home' ? 'HOME' : 'AWAY'}
                                            </Text>
                                        </View>

                                        {section.members.map((member) => {
                                            const isCurrentRep = !!section.currentRepId &&
                                                section.currentRepId.toLowerCase() === member.userId.toLowerCase();
                                            return (
                                                <Pressable
                                                    key={`${section.side}-${member.userId}`}
                                                    onPress={() => setPendingRep({ member, teamName: section.teamName, side: section.side })}
                                                    disabled={isSubmittingRep}
                                                    style={{
                                                        flexDirection: 'row', alignItems: 'center', gap: 12,
                                                        paddingHorizontal: 18, paddingVertical: 14,
                                                        borderBottomWidth: 1, borderBottomColor: C.border,
                                                        backgroundColor: isCurrentRep ? C.emeraldSoft : 'transparent',
                                                    }}
                                                >
                                                    <PlayerAvatar src={member.avatarUrl} name={member.username} size="md" />
                                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <Text style={{ color: C.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                                                            {member.username}
                                                        </Text>
                                                        {member.isReserve && (
                                                            <View
                                                                style={{
                                                                    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
                                                                    backgroundColor: 'rgba(129,140,248,0.14)',
                                                                    borderWidth: 1, borderColor: 'rgba(129,140,248,0.28)',
                                                                }}
                                                            >
                                                                <Text style={{ color: '#A5B4FC', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 }}>
                                                                    RESERVE
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    {member.isCaptain && (
                                                        <Ionicons name="shield" size={14} color={C.amber} />
                                                    )}
                                                    {isSubmittingRep ? (
                                                        <ActivityIndicator size="small" color={C.emerald} />
                                                    ) : isCurrentRep ? (
                                                        <Ionicons name="checkmark-circle" size={18} color={C.emerald} />
                                                    ) : (
                                                        <Ionicons name="chevron-forward" size={18} color={C.textGhost} />
                                                    )}
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                ))}
                            </ScrollView>
                            <View style={{ padding: 16 }}>
                                <Button
                                    variant="outline"
                                    onPress={() => setShowRepPicker(false)}
                                    className="w-full"
                                >
                                    {t('common:cancel')}
                                </Button>
                            </View>
                        </>
                        )}
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

        </Modal>
    );
}
