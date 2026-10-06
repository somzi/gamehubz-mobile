import { useRequestGate } from '../hooks/useRequestGate';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { PageHeader } from '../components/layout/PageHeader';
import { TournamentBracket } from '../components/bracket/TournamentBracket';
import { LosersBracket } from '../components/bracket/LosersBracket';
import { TournamentGroups } from '../components/bracket/TournamentGroups';
import { BracketMatch, teamProgressFrom, checkInFrom } from '../components/bracket/BracketMatch';
import { matchSeriesFormat } from '../components/bracket/SeriesFormatChip';
import { BracketSectionTitle, ChampionPlate } from '../components/bracket/BracketChrome';

import { Button } from '../components/ui/Button';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { SearchInput } from '../components/ui/SearchInput';
import { Ionicons } from '@expo/vector-icons';
import { cn, getCurrencyLabel, parseUtcDate, formatDateTimeShort } from '../lib/utils';
import { normalizeBestOf } from '../lib/series';
import { compareGroupNames, groupName } from '../lib/groups';
import { ShareTournamentCardModal } from '../components/modals/ShareTournamentCardModal';
import { SourceNotificationsButton } from '../components/ui/SourceNotificationsButton';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgesContext';
import { ENDPOINTS, authenticatedFetch, getErrorMessage } from '../lib/api';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { LinearGradient } from 'expo-linear-gradient';
import { HeroFrame, HeroBanner, CoverPill } from '../components/ui/HeroCard';
import {
    Panel,
    PanelTitle,
    StatCell,
    StatDivider,
    DetailGrid,
    ExpandableText,
    type DetailItem,
} from '../components/ui/Panel';
import { MatchDetailsModal, type MatchModalTab } from '../components/modals/MatchDetailsModal';
import { AdminHelpRequestsModal, AdminHelpRequestItem } from '../components/modals/AdminHelpRequestsModal';
import { decideVerificationPhone, enrollVerificationPhone, fetchPendingVerificationPhones, TournamentPhoneRequest } from '../lib/tournamentVerificationPhones';
import { PendingApprovalsModal, PendingApprovalItem } from '../components/modals/PendingApprovalsModal';
import {
    getTournamentFormatLabel,
    getBracketSeedingModeLabel,
    TournamentRegion,
    MatchStage,
    TournamentFormat,
    BracketSeedingMode,
    type BracketDrawOptions,
    type BracketDrawPlan,
} from '../types/tournament';
import { BracketDrawModal } from '../components/modals/BracketDrawModal';
import { CountryListModal } from '../components/ui/CountryListModal';
import { ParticipantRow } from '../components/tournament/ParticipantRow';
import { TeamRosterRow } from '../components/tournament/TeamRosterRow';
import { StatusModal } from '../components/modals/StatusModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { RoundScheduleModal } from '../components/modals/RoundScheduleModal';
import { ExportBracketModal, type ExportChoice } from '../components/modals/ExportBracketModal';
import { RoundProgressModal } from '../components/modals/RoundProgressModal';
import { COLORS } from '../lib/theme';
import { StatStrip, type StatStripItem } from '../components/ui/StatStrip';
import { TeamRegistrationModal } from '../components/modals/TeamRegistrationModal';
import { TeamMatchDetailModal } from '../components/modals/TeamMatchDetailModal';
import { SwapBracketModal, SwapTeam } from '../components/modals/SwapBracketModal';
import { SwapParticipantModal } from '../components/modals/SwapParticipantModal';
import {
    getPendingTournamentTeams,
    getTournamentTeams,
    joinTeam,
    requestJoinTeam,
    getTeamsToJoin
} from '../lib/teamApi';
import { useTranslation } from 'react-i18next';
import type { TeamDto } from '../types/team';
import { dateLocale } from '../i18n';
import { PrivateBadge, PRIVATE_COLORS } from '../components/ui/PrivateBadge';
import { PrivateInviteCard } from '../components/tournament/PrivateInviteCard';
import { JoinByCodeModal } from '../components/modals/JoinByCodeModal';
import { formatJoinCode } from '../lib/share';
import { isRejectedTournamentJoinCode } from '../lib/tournamentJoinCode';
import { isPlatformAdminToken } from '../lib/platformRole';
import { Skeleton } from '../components/ui/Skeleton';
import { RefreshFailedBanner } from '../components/ui/RefreshFailedBanner';
import { NO_REFRESH_FAILURES, retryFailedRefreshes, withRefreshResult, type RefreshFailures } from '../lib/refreshFailures';
import { LoadFailedState } from '../components/ui/EmptyState';
import { afterScreenTransition, useModalHandoff } from '../lib/modalHandoff';
import { createModalReturn, getRouteOpenVersion } from '../lib/modalReturn';
import { useQueryClient } from '@tanstack/react-query';
import { fetchTournamentResource, tournamentResourceKey, invalidateTournamentLists } from '../lib/queryPolicy';

type TournamentDetailsRouteProp = RouteProp<RootStackParamList, 'TournamentDetails'>;

// The tournament share card's colours: violet into indigo, a gold edge.
const TOURNAMENT_HAIRLINE = ['rgba(167,139,250,0.55)', 'rgba(148,163,184,0.14)', 'rgba(245,158,11,0.45)'] as const;
const TOURNAMENT_BANNER = ['#4C1D95', '#6D28D9', '#4338CA'] as const;
// Secondary text on the violet cover.
const COVER_TEXT = 'rgba(237,233,254,0.88)';
const COVER_MUTED = 'rgba(221,214,254,0.7)';

const STATUS_PILL: Record<number, { labelKey: string; dot: string }> = {
    0: { labelKey: 'details.statusOpen', dot: '#A5B4FC' },
    1: { labelKey: 'details.statusUpcoming', dot: '#A5B4FC' },
    2: { labelKey: 'details.statusRegClosed', dot: '#FBBF24' },
    3: { labelKey: 'details.liveBadge', dot: '#34D399' },
    4: { labelKey: 'details.statusCompleted', dot: '#94A3B8' },
};

// Join codes arrive from a deep link's query string, so anything but exactly six digits is noise.
function normalizeInviteCode(code?: string | null): string | null {
    const digits = String(code ?? '').replace(/\D/g, '');
    return digits.length === 6 ? digits : null;
}

// Backend MatchStatus: Pending=1, Scheduled=2, Live=3, Completed=4, NoShow=5. A fixture is
// "done" once it's Completed or closed as a no-show — anything below still has to be played.
const isMatchDecided = (m: any) => {
    const status = Number(m?.status ?? m?.Status);
    return status === 4 || status === 5;
};

const isMemberOnBench = (m: any) => Boolean(m?.isReserve ?? m?.IsReserve);

/**
 * Splits a team payload into the lineup (the TeamSize players who actually get a fixture) and the
 * optional bench. Once reserves exist, `memberCount >= teamSize` stops being a usable "is this team
 * ready / can I still join" test — a squad of 3 starters + 2 reserves has 5 members for a lineup of
 * 3 — so every team card derives both numbers here instead. Falls back to "everyone is a starter"
 * when the payload predates reserves, which keeps a no-reserves tournament reading exactly as before.
 */
const rosterInfo = (t: any, fallback?: any) => {
    const members: any[] = t?.members || t?.Members || [];
    // Some team endpoints answer without the tournament's roster shape (or with teamSize 0), so fall
    // back to the tournament we already hold rather than silently reading the bench as absent.
    const teamSize = Number(t?.teamSize || t?.TeamSize || fallback?.teamSize || fallback?.TeamSize || 0);
    const allowReserves = Boolean(
        t?.allowReserves ?? t?.AllowReserves ?? fallback?.allowReserves ?? fallback?.AllowReserves
    );
    const maxReserves = allowReserves
        ? Number(t?.maxReserves ?? t?.MaxReserves ?? fallback?.maxReserves ?? fallback?.MaxReserves ?? 0)
        : 0;
    const memberCount = Number(t?.memberCount ?? t?.MemberCount ?? members.length ?? 0);

    const starterCount = Number(
        t?.starterCount ?? t?.StarterCount ?? (members.length > 0 ? members.filter((m) => !isMemberOnBench(m)).length : memberCount)
    );
    const reserveCount = Number(t?.reserveCount ?? t?.ReserveCount ?? members.filter(isMemberOnBench).length);
    const rosterCapacity = teamSize + maxReserves;

    return {
        members,
        teamSize,
        allowReserves,
        maxReserves,
        memberCount,
        starterCount,
        reserveCount,
        rosterCapacity,
        /** The team can field a side — what registration and bracket generation actually require. */
        isLineupFull: teamSize > 0 && starterCount >= teamSize,
        /** A free slot is left anywhere on the roster, lineup or bench. */
        hasRoom: teamSize > 0 && memberCount < rosterCapacity,
    };
};

// Formats where the organiser actually has an opening arrangement to choose (mirrors
// BracketService.SupportedSeedingModes). League and Swiss only ever draw at random, so they skip
// the picker and generate straight away.
const SEEDING_CHOICE_FORMATS = [
    TournamentFormat.SingleElimination,
    TournamentFormat.DoubleElimination,
    TournamentFormat.GroupStageWithKnockout,
];

const stageMatches = (stage: any): any[] => [
    ...(stage?.rounds ?? []).flatMap((r: any) => r?.matches ?? []),
    ...(stage?.groups ?? []).flatMap((g: any) => g?.matches ?? []),
];

/**
 * Stages come back in play order (groups → play-in → knockout), so always landing on index 0
 * meant a Groups+Bracket tournament whose group phase is over still opened on the finished
 * groups table with the live bracket a tap away. Pick the first stage that still has matches
 * left to play; once everything is decided, fall back to the last stage that has content
 * (the final bracket) rather than the groups it started from.
 *
 * Stages with no matches yet are skipped — a knockout stage exists in the structure before the
 * groups finish, and jumping to its empty "waiting for the previous stage" state would be worse
 * than showing the groups still being played.
 */
const pickDefaultStageIndex = (stages: any[]): number => {
    let lastWithContent = 0;
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const matches = stageMatches(stage);
        if (matches.length === 0) continue;
        // A double-elim losers bracket (StageType 5) is a side branch — the title is decided in
        // the winners bracket, so it's never the right stage to land a finished tournament on.
        if (Number(stage?.type ?? stage?.Type) !== 5) lastWithContent = i;
        if (matches.some((m) => !isMatchDecided(m))) return i;
    }
    return lastWithContent;
};

/** Icon per StageType: groups, league, single elimination, winners, losers, Swiss, play-in. */
const STAGE_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
    1: 'grid',
    2: 'list',
    3: 'git-network',
    4: 'trophy',
    5: 'return-down-forward',
    6: 'shuffle',
    7: 'enter',
};

/** A stage's groups in tab order: Group A, Group B, … Group Z, Group AA — see compareGroupNames. */
const sortGroupsForTabs = (stage: any): any[] =>
    [...(stage?.groups ?? stage?.Groups ?? [])].sort((a: any, b: any) =>
        compareGroupNames(a?.name ?? a?.Name, b?.name ?? b?.Name)
    );

/**
 * Tab index of the group the viewer plays in, or -1. Solo rows carry the player's user id; team
 * rows carry none, so they match on the viewer's team instead.
 */
const findViewerGroupIndex = (groups: any[], userId?: string, team?: TeamDto | null): number => {
    const me = userId?.toLowerCase();
    const teamId = (team?.teamId ?? team?.TeamId)?.toLowerCase();
    const teamName = (team?.teamName ?? team?.TeamName)?.trim().toLowerCase();
    if (!me && !teamId && !teamName) return -1;

    return groups.findIndex((g: any) => (g?.standings ?? g?.Standings ?? []).some((s: any) => {
        if (me && String(s?.userId ?? s?.UserId ?? '').toLowerCase() === me) return true;
        if (teamId && String(s?.participantId ?? s?.ParticipantId ?? '').toLowerCase() === teamId) return true;
        return !!teamName && String(s?.name ?? s?.Name ?? '').trim().toLowerCase() === teamName;
    }));
};

/**
 * What a tournament looked like the last time it was open in this app session: the overview, the
 * roster and the teams. Opening it again paints this at once instead of a loading screen, and the
 * focus fetch swaps the fresh data in underneath. Memory only — after a cold start a copy from
 * yesterday could show a tournament that has moved on, so the first open waits for the server.
 */
type TournamentSnapshot = {
    tournament?: any;
    participants?: any[];
    teams?: TeamDto[];
    userTeam?: TeamDto | null;
};
const SNAPSHOT_LIMIT = 20;
const snapshots = new Map<string, TournamentSnapshot>();
// Per viewer: the overview carries their registration and their right to manage it.
const snapshotKey = (userId: string | undefined, tournamentId: string | undefined) =>
    `${userId ?? ''}:${tournamentId ?? ''}`.toLowerCase();

function rememberSnapshot(userId: string | undefined, tournamentId: string | undefined, patch: TournamentSnapshot) {
    if (!userId || !tournamentId) return;
    const key = snapshotKey(userId, tournamentId);
    const next = { ...snapshots.get(key), ...patch };
    // Re-inserted so the Map's order is least recently used first.
    snapshots.delete(key);
    snapshots.set(key, next);
    if (snapshots.size > SNAPSHOT_LIMIT) {
        const oldest = snapshots.keys().next().value;
        if (oldest !== undefined) snapshots.delete(oldest);
    }
}

// First open of a tournament: the page's shape, so the content lands in place instead of
// replacing a loading screen.
function TournamentDetailsSkeleton() {
    return (
        <View>
            <View
                className="mx-4 mt-3"
                style={{
                    borderRadius: 26,
                    padding: 18,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                }}
            >
                <View className="flex-row" style={{ gap: 6 }}>
                    <Skeleton width={86} height={24} radius={12} />
                    <Skeleton width={64} height={24} radius={12} />
                </View>
                <Skeleton width="78%" height={26} radius={8} style={{ marginTop: 14 }} />
                <Skeleton width="42%" height={13} radius={6} style={{ marginTop: 12 }} />
                <Skeleton width="34%" height={13} radius={6} style={{ marginTop: 9 }} />
            </View>
            <View className="px-5 mt-4 mb-4">
                <Skeleton height={46} radius={16} />
            </View>
            <View className="px-4" style={{ gap: 10 }}>
                <Skeleton height={88} radius={20} />
                <Skeleton height={150} radius={20} />
            </View>
        </View>
    );
}

export default function TournamentDetailsScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const { t } = useTranslation('tournament');
    const { t: tCommon } = useTranslation('common');
    const { t: tTeam } = useTranslation('team');
    const route = useRoute<TournamentDetailsRouteProp>();
    const { id } = route.params;
    const routeParamsRef = useRef(route.params);
    routeParamsRef.current = route.params;
    const requests = useRequestGate(id);
    const { user, token } = useAuth();
    const queryClient = useQueryClient();
    // Opened earlier in this session: paint from the snapshot, refresh underneath.
    const [snapshot] = useState(() => snapshots.get(snapshotKey(user?.id, id)));
    // A private tournament's join code, when the player arrived holding one — through the
    // organiser's invite link (`?code=`) or the join-with-code sheet. It rides along with the
    // registration; without it a private tournament asks for the code before signing anyone up.
    const [inviteCode, setInviteCode] = useState<string | null>(() => normalizeInviteCode(route.params.code));
    const inviteTournamentIdRef = useRef(id);
    useEffect(() => {
        const next = normalizeInviteCode(route.params.code);
        if (inviteTournamentIdRef.current !== id) {
            inviteTournamentIdRef.current = id;
            setInviteCode(next);
        } else if (next) {
            setInviteCode(next);
        }
    }, [id, route.params.code]);
    // The "enter this tournament's code" sheet (solo sign-up to a private tournament).
    const [showCodePrompt, setShowCodePrompt] = useState(false);
    const { tournamentApprovals, refresh: refreshBadges } = useBadges();
    // Pending team/solo registrations awaiting the organizer's approval — cascaded from the
    // Hubs-tab badge so the Teams/Players tab + Requests sub-tab show a dot before you open them.
    const pendingRegCount = tournamentApprovals(id)?.registrations ?? 0;
    // Open admin-help requests live in the bracket → badge the Bracket tab with them.
    const adminHelpCount = tournamentApprovals(id)?.adminHelp ?? 0;
    const phoneRequestCount = tournamentApprovals(id)?.verificationPhones ?? 0;
    // Matches with a proposed result awaiting the organizer's approval. Sourced from the
    // BadgesContext cascade so the Bracket tab pill can render without firing GET_PENDING_APPROVALS
    // on every screen focus — the full list is still fetched on demand when the modal opens.
    const pendingApprovalsBadgeCount = tournamentApprovals(id)?.resultApprovals ?? 0;
    const [activeTab, setActiveTab] = useState('overview');
    // Mirror activeTab into a ref so the focus effect can read the live tab without taking
    // it as a dependency (which would refire the overview fetch on every tab switch).
    const activeTabRef = useRef(activeTab);
    activeTabRef.current = activeTab;
    const [teamsTab, setTeamsTab] = useState('confirmed');
    const [playersTab, setPlayersTab] = useState<'confirmed' | 'registrations'>('confirmed');
    // Filters whichever Players sub-tab is open. Both lists arrive whole, so it stays local.
    const [playerSearch, setPlayerSearch] = useState('');
    const [openTeams, setOpenTeams] = useState<TeamDto[]>([]);
    // The *Loaded flags say a list has been fetched once. Only before that does a list show its
    // spinner; a later refresh keeps the rows on screen while it runs.
    const [openTeamsLoaded, setOpenTeamsLoaded] = useState(false);
    // The last load of a list failed. With no rows to show, that list says so (and retries)
    // instead of reading "nobody registered yet".
    const [openTeamsError, setOpenTeamsError] = useState(false);
    const [tournament, setTournament] = useState<any>(snapshot?.tournament ?? null);
    const [isLoading, setIsLoading] = useState(!snapshot?.tournament);
    const [isRefreshing, setIsRefreshing] = useState(false);
    // Background refreshes that failed while the page was showing, by resource: the page stays, with
    // a banner on top until every one of them has gone through again.
    const [failedRefreshes, setFailedRefreshes] = useState<RefreshFailures>(NO_REFRESH_FAILURES);
    // The banner's own retry spinner: driving the pull-to-refresh flag instead would drop the page
    // by the control's height on iOS without a pull.
    const [isRetryingRefresh, setIsRetryingRefresh] = useState(false);
    // The fetchers outlive the render that made them (the focus effect keeps the first one), so they
    // read "is something on screen" from here rather than from a stale closure.
    const tournamentRef = useRef(tournament);
    tournamentRef.current = tournament;
    // Open / close registration in flight: spins its own button, the page stays.
    const [isTogglingRegistration, setIsTogglingRegistration] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stages, setStages] = useState<any[]>([]);
    // Tournament-wide series settings from the structure payload. Drives the "Default (BoN)" chip in
    // the round-format editor and tells it whether a level series can go to a tiebreak at all.
    const [tournamentBestOf, setTournamentBestOf] = useState(1);
    const [tournamentHasKnockout, setTournamentHasKnockout] = useState(false);
    const [selectedStageIndex, setSelectedStageIndex] = useState(0);
    // Which tournament we've already auto-selected a stage for. The default only applies to the
    // first structure load per tournament — later refetches (focus, result submit, SignalR) must
    // not yank the user off a stage they picked by hand.
    const autoSelectedStageForId = useRef<string | null>(null);
    // Null follows the viewer's group as bracket/team data arrives. A manual choice wins until
    // the next stage switch, so refreshes never move the viewer away from a group they picked.
    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
    const groupStripRef = useRef<ScrollView>(null);
    const groupChipX = useRef<Record<string, number>>({});
    const [loadingBracket, setLoadingBracket] = useState(false);
    const [bracketError, setBracketError] = useState<string | null>(null);
    // Until the first structure response the bracket tab has nothing to say yet, not "no bracket".
    const [bracketLoaded, setBracketLoaded] = useState(false);
    const bracketLoadedRef = useRef(bracketLoaded);
    bracketLoadedRef.current = bracketLoaded;
    const [isThirdPlaceExpanded, setIsThirdPlaceExpanded] = useState(false);

    // Swapping knockout seeds is platform-admin only: tournament staff live with the automatic draw.
    const isPlatformAdmin = useMemo(() => isPlatformAdminToken(token), [token]);
    const [isRegistering, setIsRegistering] = useState(false);
    const [participants, setParticipants] = useState<any[]>(snapshot?.participants ?? []);
    const [participantsLoaded, setParticipantsLoaded] = useState(!!snapshot?.participants);
    const [participantsError, setParticipantsError] = useState(false);
    const [pendingRegistrations, setPendingRegistrations] = useState<any[]>([]);
    const [isLoadingPending, setIsLoadingPending] = useState(false);
    const [pendingLoaded, setPendingLoaded] = useState(false);
    const [pendingError, setPendingError] = useState(false);

    // The confirmed row keeps the seed it was served with: that number is the entrant's position
    // in the list the backend ordered, not a row counter, so filtering must not renumber it.
    const filteredParticipants = useMemo(() => {
        const seeded = participants.map((p, i) => ({ p, seed: i + 1 }));
        const query = playerSearch.trim().toLowerCase();
        if (!query) return seeded;
        return seeded.filter(({ p }) => (p.username || p.Username || '').toLowerCase().startsWith(query));
    }, [participants, playerSearch]);

    // Stable across renders so ParticipantRow's memo actually holds — an inline arrow
    // here would give every row a new prop on each keystroke in the search box.
    const openPlayerProfile = useCallback((userId: string) => {
        navigation.navigate('PlayerProfile', { id: userId });
    }, [navigation]);

    const filteredRegistrations = useMemo(() => {
        const query = playerSearch.trim().toLowerCase();
        if (!query) return pendingRegistrations;
        return pendingRegistrations.filter((r) => (r.username || r.Username || '').toLowerCase().startsWith(query));
    }, [pendingRegistrations, playerSearch]);

    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isCreatingBracket, setIsCreatingBracket] = useState(false);
    const [isResettingBracket, setIsResettingBracket] = useState(false);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [isSwapping, setIsSwapping] = useState(false);
    // Participant hand-over (a member takes an entrant's spot). Distinct from showSwapModal above,
    // which re-seeds two teams already in the bracket. Non-null target = sheet open.
    const [participantSwapTarget, setParticipantSwapTarget] = useState<{
        userId: string;
        username: string;
        avatarUrl?: string | null;
    } | null>(null);
    // The sheet stays hidden until its data is in; meanwhile the tapped row's swap button spins.
    const [participantSwapLoading, setParticipantSwapLoading] = useState(false);
    // Ejecting a participant wipes their entry and any results with it, so it asks first.
    const [removeParticipantTarget, setRemoveParticipantTarget] = useState<{
        userId: string;
        username: string;
    } | null>(null);
    // Bracket draw picker (random / manual / seeded / pots) shown before generation.
    const [showDrawModal, setShowDrawModal] = useState(false);
    const [drawOptions, setDrawOptions] = useState<BracketDrawOptions | null>(null);
    const [isLoadingDrawOptions, setIsLoadingDrawOptions] = useState(false);
    const [drawOptionsError, setDrawOptionsError] = useState<string | null>(null);
    // Formats with no draw choice (League, Swiss) skip the picker, so their confirmation lives here.
    const [showStartConfirm, setShowStartConfirm] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<any>(null);
    // Seeded the way fetchTournamentDetails sets it, so a snapshot paint shows the right button.
    const [isUserRegistered, setIsUserRegistered] = useState(() => {
        const status = snapshot?.tournament?.status;
        return (status === 0 || status === 1) && !!snapshot?.tournament?.hasUserRegistered;
    });
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusModalConfig, setStatusModalConfig] = useState<{
        type: 'success' | 'error' | 'info';
        title: string;
        message: string;
    }>({ type: 'success', title: '', message: '' });
    const [hubOwnerId, setHubOwnerId] = useState<string | undefined>(undefined);
    const [bracketCanManage, setBracketCanManage] = useState(false);
    const [bracketRequireResultApproval, setBracketRequireResultApproval] = useState(false);
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);
    // Share deep-link: confirm prompt before joining/requesting the shared team.
    const [joinPrompt, setJoinPrompt] = useState<{ teamId: string; teamName: string; requiresApproval: boolean } | null>(null);
    const [pendingPrivateTeamJoin, setPendingPrivateTeamJoin] = useState<{ teamId: string; requiresApproval: boolean } | null>(null);

    // Owner-level permission for this tournament: hub owner, hub admin or platform admin.
    // Resolved by the v2 overview/structure endpoints (tournament.canManage / bracketCanManage).
    const canManage: boolean = !!((tournament as any)?.canManage || bracketCanManage);

    // Before the tournament starts (status 0/1/2). Once it's LIVE (3) or Completed (4)
    // the roster is locked into the bracket — no new join requests and no team removal.
    const isPreStart: boolean = (tournament?.status ?? 99) < 3;

    // Scheduled registration that hasn't opened yet: status 0 plus a stored opening time. The
    // server rejects every sign-up until the sweep flips it, so no Join button and nothing to
    // close — the only action is the organiser's "open it now" override. An opening time on any
    // other status is just a record of the schedule and changes nothing.
    const isWaitingToOpen: boolean =
        Number(tournament?.status) === 0 && !!(tournament as any)?.registrationOpensAt;

    // Whether this tournament was created with "results require approval" on. When it's
    // off there is nothing to approve, so the Approvals pill and the Bracket-tab badge are
    // hidden entirely. Known from the overview payload, so it resolves before the bracket loads.
    const requiresApproval: boolean = !!(
        bracketRequireResultApproval ||
        (tournament as any)?.requireResultApproval ||
        (tournament as any)?.RequireResultApproval
    );

    const [showDeadlineModal, setShowDeadlineModal] = useState(false);
    const [selectedRoundForDeadline, setSelectedRoundForDeadline] = useState<{ roundNumber: number, currentDeadline?: string | null, roundOpenAt?: string | null, stageId?: string | null, bestOf?: number | null, tiebreakBestOf?: number | null } | null>(null);

    // Admin-help requests (problematic matches) — admins only
    const [adminHelpRequests, setAdminHelpRequests] = useState<AdminHelpRequestItem[]>([]);
    const [showAdminHelpModal, setShowAdminHelpModal] = useState(false);
    const [isLoadingAdminHelp, setIsLoadingAdminHelp] = useState(false);
    const [phoneRequests, setPhoneRequests] = useState<TournamentPhoneRequest[]>([]);
    const [adminHelpError, setAdminHelpError] = useState<string | null>(null);

    // Matches with a reported result awaiting approval — admins only
    const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalItem[]>([]);
    const [showApprovalsModal, setShowApprovalsModal] = useState(false);
    const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
    // Round-by-round completion overview — admins only. Reads the bracket already in state,
    // so it needs no fetch and no loading flag.
    const [showProgressModal, setShowProgressModal] = useState(false);
    // Which tab MatchDetailsModal should open on. Bumped to 'chat' when an admin
    // enters via the help-requests inbox, set to the tab it was left on when it reopens after a
    // player's profile, and reset to 'match' for every other entry.
    const [matchModalDefaultTab, setMatchModalDefaultTab] = useState<MatchModalTab>('match');
    // The match modal was opened from a push with only the match id: it holds one loading state
    // until the match and this tournament are both in (see MatchDetailsModal holdUntilReady).
    const [matchFromLink, setMatchFromLink] = useState(false);
    // A covered match returns on Back with its tab and inputs; explicit navigation overrides it.
    type ReturnModal = { kind: 'match'; id: string; tab: MatchModalTab } | { kind: 'team'; id: string };
    const [modalReturn] = useState(() => createModalReturn<ReturnModal>());
    const matchActiveTabRef = useRef<MatchModalTab>('match');
    // What happens after a match modal closes (a profile, the other match modal) waits until it is
    // down, so the two never animate over each other — see lib/modalHandoff.
    const matchModalHandoff = useModalHandoff();
    const teamModalHandoff = useModalHandoff();
    const joinPromptHandoff = useModalHandoff();

    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [shareCardVisible, setShareCardVisible] = useState(false);

    // Team tournament states
    const [showTeamRegistration, setShowTeamRegistration] = useState(false);
    const [tournamentTeams, setTournamentTeams] = useState<TeamDto[]>(snapshot?.teams ?? []);
    // Doubles as "do we know the viewer's team yet": the register button waits for it.
    const [teamsLoaded, setTeamsLoaded] = useState(!!snapshot?.teams);
    const [teamsError, setTeamsError] = useState(false);
    const [userTeam, setUserTeam] = useState<TeamDto | null>(snapshot?.userTeam ?? null);
    const [showTeamMatchDetail, setShowTeamMatchDetail] = useState(false);
    const [selectedTeamMatchId, setSelectedTeamMatchId] = useState<string | null>(null);
    // When a single game is opened from the team overview, remember the parent team match so
    // closing the solo match page drops the user back onto the team modal (drill-in / drill-out).
    const [returnToTeamMatchId, setReturnToTeamMatchId] = useState<string | null>(null);
    const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);

    // Collapsible section states
    const [showCountriesModal, setShowCountriesModal] = useState(false);

    // `codeOverride` is the code the prompt just verified — state set in the same tick isn't visible
    // to this closure yet. A press event is not a code, hence the typeof guard.
    // Records the phone that joined, without a biometric prompt (see enrollVerificationPhone).
    const enrollPhoneAfterJoin = async () => {
        if (!id || !(tournament?.requireResultVerification ?? tournament?.RequireResultVerification)) return null;
        return enrollVerificationPhone(id);
    };

    const handleJoin = async (codeOverride?: string | null) => {
        if (!id || !user?.id) return;

        const joinCode = typeof codeOverride === 'string' ? codeOverride : inviteCode;

        setIsRegistering(true);
        try {
            const payload = {
                TournamentId: id,
                UserId: user.id,
                Status: 0,
                // Private tournaments only; the server ignores it on every other tournament.
                ...(tournament?.isPrivate && joinCode ? { JoinCode: joinCode } : {}),
            };

            const response = await authenticatedFetch(ENDPOINTS.REGISTER_TOURNAMENT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (isRejectedTournamentJoinCode(errorData)) setInviteCode(null);
                // The server's error body is PascalCase ("Message"); reading only `message` used to
                // replace every reason (region, full, closed…) with the generic "join failed".
                throw new Error(errorData.message || errorData.Message || t('details.joinFailed'));
            }

            const phoneStatus = await enrollPhoneAfterJoin();
            await invalidateTournamentLists(queryClient);
            setStatusModalConfig({
                type: 'success',
                title: t('details.congratulations'),
                message: phoneStatus === 'pending'
                    ? `${t('details.registeredSuccess')}\n${t('match:verification.phoneApprovalPending')}`
                    : t('details.registeredSuccess')
            });
            setShowStatusModal(true);
            fetchTournamentDetails(true); // Refresh details
            // The roster decides "joined" vs "pending approval" under the cover.
            fetchParticipants();
        } catch (err: any) {
            setStatusModalConfig({
                type: 'error',
                title: t('details.joinFailedTitle'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setIsRegistering(false);
        }
    };

    // "Invite code 482 913 applied" under the join button, so the player knows the link did its job.
    const renderInviteCodeApplied = () => (
        <View key="code-applied" className="flex-row items-center justify-center gap-1.5 -mt-1">
            <Ionicons name="lock-open" size={12} color="#34D399" />
            <Text className="text-[11px] font-semibold text-emerald-300">
                {t('joinCode.codeApplied', { code: formatJoinCode(inviteCode) })}
            </Text>
        </View>
    );

    const handleJoinTeam = async (teamId: string, requiresApproval?: boolean, codeOverride?: string) => {
        if (!tournament || joiningTeamId) return;
        const joinCode = codeOverride ?? inviteCode;
        if (tournament?.isPrivate && !canManage && !joinCode) {
            setPendingPrivateTeamJoin({ teamId, requiresApproval: !!requiresApproval });
            return;
        }
        setJoiningTeamId(teamId);
        try {
            if (requiresApproval) {
                await requestJoinTeam(teamId, tournament?.isPrivate ? joinCode : null);
                setStatusModalConfig({
                    type: 'success',
                    title: t('details.requestSent'),
                    message: t('details.requestSentMessage')
                });
            } else {
                await joinTeam(teamId, tournament?.isPrivate ? joinCode : null);
                const phoneStatus = await enrollPhoneAfterJoin();
                setStatusModalConfig({
                    type: 'success',
                    title: t('details.successExclaim'),
                    message: phoneStatus === 'pending'
                        ? `${t('details.joinedTeam')}\n${t('match:verification.phoneApprovalPending')}`
                        : t('details.joinedTeam')
                });
            }
            setShowStatusModal(true);
            await invalidateTournamentLists(queryClient);
            fetchTournamentDetails(true); // silent refresh
            if (activeTab === 'teams' && teamsTab === 'open') {
                fetchOpenTeams();
            }
        } catch (err: unknown) {
            if (isRejectedTournamentJoinCode(err)) setInviteCode(null);
            setStatusModalConfig({
                type: 'error',
                title: requiresApproval ? t('details.requestFailed') : t('details.joinFailedTitle'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setJoiningTeamId(null);
        }
    };

    // Shared download + native share pipeline for every export variant. Only the URL, the
    // filename and the mime type differ between them.
    const downloadAndShareExport = async (
        url: string,
        fileName: string,
        mimeType: string,
        dialogTitle: string,
        uti: string,
    ) => {
        setIsExportingPdf(true);
        try {
            const token = await SecureStore.getItemAsync('access_token');
            const destFile = new FSFile(Paths.cache, fileName);
            // Remove stale cache file so downloadFileAsync never hits "Destination already exists"
            if (destFile.exists) {
                destFile.delete();
            }
            const downloaded = await FSFile.downloadFileAsync(
                url,
                destFile,
                token ? { headers: { Authorization: `Bearer ${token}` } } : {}
            );
            const canShare = await Sharing.isAvailableAsync();
            if (!canShare) {
                Alert.alert(t('details.sharingNotAvailable'), t('details.sharingNotAvailableMessage'));
                return;
            }
            await Sharing.shareAsync(downloaded.uri, { mimeType, dialogTitle, UTI: uti });
        } catch (err: any) {
            Alert.alert(t('details.exportFailed'), err.message || t('details.exportFailedMessage'));
        } finally {
            setIsExportingPdf(false);
        }
    };

    const exportFileStem = () =>
        (tournament?.name ?? id ?? 'tournament')
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_\-]/g, '');

    const handleExportBracketPdf = async (includeSchedule = false) => {
        if (!id) return;
        const suffix = includeSchedule ? '_schedule' : '';
        await downloadAndShareExport(
            ENDPOINTS.EXPORT_BRACKET_PDF(id, includeSchedule),
            `${exportFileStem()}_bracket${suffix}.pdf`,
            'application/pdf',
            t('details.shareBracketPdf'),
            'com.adobe.pdf',
        );
    };

    const handleExportCsv = async (dataset: 'standings' | 'matches') => {
        if (!id) return;
        await downloadAndShareExport(
            ENDPOINTS.EXPORT_TOURNAMENT_CSV(id, dataset),
            `${exportFileStem()}_${dataset}.csv`,
            'text/csv',
            dataset === 'standings' ? t('details.shareRankingsCsv') : t('details.shareResultsCsv'),
            'public.comma-separated-values-text',
        );
    };

    const handleExportSelect = (choice: ExportChoice) => {
        if (choice.format === 'csv') handleExportCsv(choice.dataset);
        else handleExportBracketPdf(choice.includeSchedule);
    };

    // The PDF schedule option only changes the file for group-stage / league tournaments (it adds
    // round-by-round fixture pages there); a pure bracket would export an identical PDF either way.
    const scheduleAffectsExport = stages.some((s: any) => {
        const t = s.type ?? s.Type;
        return t === 1 || t === 2; // StageType.GroupStage, StageType.League
    });

    // Only table-based stages produce a standings CSV — Swiss included, unlike the PDF schedule
    // option above. A pure bracket would download a header-only file, so hide the option there.
    const hasStandingsTables = stages.some((s: any) => {
        const t = s.type ?? s.Type;
        return t === 1 || t === 2 || t === 6; // GroupStage, League, Swiss
    });

    const handleExportPress = () => setShowExportModal(true);

    const handleShare = () => {
        if (!tournament) return;
        setShareCardVisible(true);
    };

    // Kept as a fallback for older tournaments where v3 hasn't been rolled out to the server
    // yet — normally the v3 overview response now carries HasUserRegistered inline so this
    // second round-trip isn't needed. Callers below only invoke it defensively.
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

    const fetchTournamentDetails = async (silent = false, force = true) => {
        const isCurrent = requests.begin('fetchTournamentDetails');
        if (!id) return;
        if (!silent) setIsLoading(true);
        setError(null);
        try {
            // v3 = v2 + HasUserRegistered (folds the CHECK_REGISTRATION round-trip inline).
            const url = ENDPOINTS.GET_TOURNAMENT_OVERVIEW_V3(id);
            const data = await fetchTournamentResource(queryClient, tournamentResourceKey(id, user?.id, 'overview'), async (signal) => {
                const response = await authenticatedFetch(url, { signal });
                if (!response.ok) {
                    // Links and notifications can outlive the tournament they point at.
                    throw new Error(response.status === 404
                        ? t('details.tournamentGone')
                        : t('details.fetchTournamentFailed', { status: response.status }));
                }
                return response.json();
            }, force);
            if (!isCurrent()) return;
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
                canManage: rawData.canManage ?? rawData.CanManage ?? false,
                groupsCount: rawData.groupsCount || rawData.GroupsCount,
                qualifiersPerGroup: rawData.qualifiersPerGroup || rawData.QualifiersPerGroup,
                // How the bracket was drawn. Null on tournaments generated before the draw picker
                // shipped (all of those were random) and on ones not yet generated.
                bracketSeedingMode: rawData.bracketSeedingMode ?? rawData.BracketSeedingMode ?? null,
                prize: rawData.prize || rawData.Prize,
                prizeCurrency: rawData.prizeCurrency || rawData.PrizeCurrency,
                startDate: rawData.startDate || rawData.StartDate,
                region: rawData.region !== undefined ? rawData.region : rawData.Region,
                countries: rawData.countries || rawData.Countries || null,
                countryNames: rawData.countryNames || rawData.CountryNames || null,
                countryFlags: rawData.countryFlags || rawData.CountryFlags || null,
                description: rawData.description || rawData.Description,
                rules: rawData.rules || rawData.Rules,
                registrationDeadline: rawData.registrationDeadline || rawData.RegistrationDeadLine || rawData.registrationDeadLine,
                // Scheduled opening. Null on every tournament whose registration was open from the
                // start; paired with status 0 it means "waiting to open", not "draft nobody finished".
                registrationOpensAt: rawData.registrationOpensAt || rawData.RegistrationOpensAt || null,
                hubId: rawData.hubId || rawData.HubId,
                hubName: rawData.hubName || rawData.HubName,
                isTeamTournament: rawData.isTeamTournament ?? rawData.IsTeamTournament ?? false,
                teamSize: rawData.teamSize ?? rawData.TeamSize ?? null,
                // Bench slots on top of the lineup. False/null on every tournament created before
                // reserves shipped, which reads as "the roster is the lineup".
                allowReserves: rawData.allowReserves ?? rawData.AllowReserves ?? false,
                maxReserves: rawData.maxReserves ?? rawData.MaxReserves ?? null,
                // TeamWinCondition enum: MatchWins=0, AggregateScore=1 (null when omitted).
                teamWinCondition: rawData.teamWinCondition ?? rawData.TeamWinCondition ?? null,
                isExclusive: rawData.isExclusive ?? rawData.IsExclusive ?? false,
                // Invite-only: hidden from every list, reachable by code or share link. Omitted by the
                // server when false.
                isPrivate: rawData.isPrivate ?? rawData.IsPrivate ?? false,
                // Server (v2 overview) tells us whether the caller passes the exclusivity gate.
                // Omitted (=> false) when the user lacks access; non-exclusive tournaments don't use it.
                hasExclusiveAccess: rawData.hasExclusiveAccess ?? rawData.HasExclusiveAccess ?? false,
                // v3 tells us whether the caller is already registered so we don't need the
                // separate CHECK_REGISTRATION round-trip. Field is omitted when false.
                hasUserRegistered: rawData.hasUserRegistered ?? rawData.HasUserRegistered ?? false,
            };

            setTournament(normalizedTournament);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'overview', true));
            rememberSnapshot(user?.id, id, { tournament: normalizedTournament });

            // Fold the registration flag from the v3 overview so the Join / Registered button
            // renders correctly without a follow-up call. Only relevant while registration is
            // still open (status 0/1); other statuses hide the button anyway.
            if (normalizedTournament.status === 0 || normalizedTournament.status === 1) {
                setIsUserRegistered(!!normalizedTournament.hasUserRegistered);
            }

            // Only team tournaments still fetch in parallel — the registration status now
            // comes inline via the overview response.
            if (normalizedTournament.isTeamTournament) {
                await fetchTournamentTeams(id, force);
            }
        } catch (err: any) {
            if (!isCurrent()) return;
            console.error('Tournament fetch error:', err);
            // Only a load with nothing on screen becomes the error page. A refresh that fails over
            // a loaded tournament (focus, pull, after an action) used to replace it with that page.
            if (silent && tournamentRef.current) setFailedRefreshes((failures) => withRefreshResult(failures, 'overview', false));
            else setError(getErrorMessage(err));
        } finally {
            if (!isCurrent()) return;
            setIsLoading(false);
        }
    };

    // `silent` keeps the currently rendered bracket on screen while it refreshes underneath —
    // used by the focus refetch and pull-to-refresh, where blanking to a spinner (or to an error
    // screen over a transient blip) would be worse than briefly showing slightly stale cards.
    const fetchBracket = async (silent = false, force = true) => {
        const isCurrent = requests.begin('fetchBracket');
        if (!id) return;
        const showLoadError = !silent || !bracketLoadedRef.current;
        if (!silent) {
            setLoadingBracket(true);
            setBracketError(null);
        }
        try {
            const url = ENDPOINTS.GET_TOURNAMENT_STRUCTURE_V3(id);
            console.log('Fetching bracket from:', url);
            const data = await fetchTournamentResource(queryClient, tournamentResourceKey(id, user?.id, 'bracket'), async (signal) => {
                const response = await authenticatedFetch(url, { signal });
                if (!response.ok) throw new Error(t('details.fetchBracketFailed', { status: response.status }));
                return response.json();
            }, force);
            if (!isCurrent()) return;
            setBracketError(null);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'bracket', true));
            const nextStages = data.stages || [];
            setStages(nextStages);
            setTournamentBestOf(normalizeBestOf(data.bestOf ?? data.BestOf));
            // Any elimination-shaped stage (3 = single-elim, 4/5 = DE brackets, 6 = play-in) means a
            // level series has to be replayed somewhere in this tournament.
            setTournamentHasKnockout(nextStages.some((s: any) => {
                const type = s?.type ?? s?.Type;
                return type === 3 || type === 4 || type === 5 || type === 6;
            }));

            // Open on the stage that's actually being played (see pickDefaultStageIndex).
            if (autoSelectedStageForId.current !== id && nextStages.length > 0) {
                autoSelectedStageForId.current = id;
                const defaultStage = pickDefaultStageIndex(nextStages);
                setSelectedStageIndex(defaultStage);
                setSelectedGroupIndex(null);
            }

            // Extract hubOwnerId from bracket response
            if (data.hubOwnerId || data.HubOwnerId) {
                setHubOwnerId(data.hubOwnerId || data.HubOwnerId);
            }

            // v2 exposes whether the current user may manage (hub owner / hub admin / platform admin)
            setBracketCanManage(data.canManage ?? data.CanManage ?? false);

            // Tournament-level approval flag is mirrored on the structure response so the
            // bracket UI can render the right submit / approve flow per match without an extra fetch.
            setBracketRequireResultApproval(data.requireResultApproval ?? data.RequireResultApproval ?? false);
        } catch (err) {
            if (!isCurrent()) return;
            console.error('Bracket fetch error:', err);
            if (showLoadError) setBracketError(t('details.bracketLoadFailed'));
            setFailedRefreshes((failures) => withRefreshResult(failures, 'bracket', false));
        } finally {
            if (!isCurrent()) return;
            setLoadingBracket(false);
            setBracketLoaded(true);
        }
    };

    const fetchAdminHelpRequests = async () => {
        const isCurrent = requests.begin('fetchAdminHelpRequests');
        if (!id) return;
        setIsLoadingAdminHelp(true);
        setAdminHelpError(null);
        const loadHelpRequests = async (): Promise<AdminHelpRequestItem[]> => {
            const response = await authenticatedFetch(ENDPOINTS.GET_ADMIN_HELP_REQUESTS(id));
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            return (Array.isArray(data) ? data : []).map((it: any) => ({
                matchId: it.matchId || it.MatchId,
                teamMatchId: it.teamMatchId ?? it.TeamMatchId ?? null,
                roundNumber: it.roundNumber ?? it.RoundNumber ?? null,
                groupName: it.groupName ?? it.GroupName ?? null,
                homeTeamName: it.homeTeamName ?? it.HomeTeamName ?? null,
                awayTeamName: it.awayTeamName ?? it.AwayTeamName ?? null,
                status: it.status ?? it.Status ?? 0,
                scheduledStartTime: it.scheduledStartTime ?? it.ScheduledStartTime ?? null,
                requestedByUserId: it.requestedByUserId ?? it.RequestedByUserId ?? null,
                requestedByUsername: it.requestedByUsername ?? it.RequestedByUsername ?? null,
                requestedOn: it.requestedOn ?? it.RequestedOn ?? null,
                homeUserId: it.homeUserId ?? it.HomeUserId ?? null,
                homeUsername: it.homeUsername ?? it.HomeUsername ?? null,
                homeAvatarUrl: it.homeAvatarUrl ?? it.HomeAvatarUrl ?? null,
                awayUserId: it.awayUserId ?? it.AwayUserId ?? null,
                awayUsername: it.awayUsername ?? it.AwayUsername ?? null,
                awayAvatarUrl: it.awayAvatarUrl ?? it.AwayAvatarUrl ?? null,
            }));
        };

        // Two lists that stand on their own: one failing must not hide the other.
        const [help, phones] = await Promise.allSettled([loadHelpRequests(), fetchPendingVerificationPhones(id)]);
        if (!isCurrent()) return;
        if (help.status === 'fulfilled') setAdminHelpRequests(help.value);
        if (phones.status === 'fulfilled') setPhoneRequests(phones.value);
        const failure = help.status === 'rejected' ? help.reason : phones.status === 'rejected' ? phones.reason : null;
        if (failure) setAdminHelpError(getErrorMessage(failure) || t('phoneRequests.failed'));
        setIsLoadingAdminHelp(false);
    };

    const handlePhoneDecision = async (request: TournamentPhoneRequest, approve: boolean) => {
        const isCurrent = requests.begin(`phoneDecision:${request.id}`);
        try {
            await decideVerificationPhone(id, request, approve);
            if (!isCurrent()) return;
            setPhoneRequests(items => items.filter(item => item.id !== request.id || item.requestedPhone.userDeviceId !== request.requestedPhone.userDeviceId));
            refreshBadges();
        } catch (error) {
            if (isCurrent()) {
                await fetchAdminHelpRequests();
                if (isCurrent()) setAdminHelpError(getErrorMessage(error) || t('phoneRequests.failed'));
            }
            throw error;
        }
    };

    const fetchPendingApprovals = async () => {
        const isCurrent = requests.begin('fetchPendingApprovals');
        if (!id || !canManage || !requiresApproval) return;
        setIsLoadingApprovals(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PENDING_APPROVALS(id));
            if (!isCurrent()) return;
            if (!response.ok) return;
            const data = await response.json();
            if (!isCurrent()) return;
            const normalized: PendingApprovalItem[] = (Array.isArray(data) ? data : []).map((it: any) => ({
                matchId: it.matchId || it.MatchId,
                roundNumber: it.roundNumber ?? it.RoundNumber ?? null,
                groupName: it.groupName ?? it.GroupName ?? null,
                homeTeamName: it.homeTeamName ?? it.HomeTeamName ?? null,
                awayTeamName: it.awayTeamName ?? it.AwayTeamName ?? null,
                status: it.status ?? it.Status ?? 0,
                scheduledStartTime: it.scheduledStartTime ?? it.ScheduledStartTime ?? null,
                proposedHomeScore: it.proposedHomeScore ?? it.ProposedHomeScore ?? null,
                proposedAwayScore: it.proposedAwayScore ?? it.ProposedAwayScore ?? null,
                proposedByUserId: it.proposedByUserId ?? it.ProposedByUserId ?? null,
                proposedByUsername: it.proposedByUsername ?? it.ProposedByUsername ?? null,
                homeUserId: it.homeUserId ?? it.HomeUserId ?? null,
                homeUsername: it.homeUsername ?? it.HomeUsername ?? null,
                homeAvatarUrl: it.homeAvatarUrl ?? it.HomeAvatarUrl ?? null,
                awayUserId: it.awayUserId ?? it.AwayUserId ?? null,
                awayUsername: it.awayUsername ?? it.AwayUsername ?? null,
                awayAvatarUrl: it.awayAvatarUrl ?? it.AwayAvatarUrl ?? null,
            }));
            setPendingApprovals(normalized);
            // Reconcile the pill/tab badge with the authoritative list just fetched. The badge
            // cascade normally updates via the BadgesUpdated push, but that push is lost when
            // the SignalR connection is down (e.g. after an API restart exhausts the automatic
            // reconnect attempts) — leaving a stale count that this fetch proves wrong.
            refreshBadges();
        } catch (err) {
            if (!isCurrent()) return;
            console.error('Pending approvals fetch error:', err);
        } finally {
            if (!isCurrent()) return;
            setIsLoadingApprovals(false);
        }
    };

    // A bracket reset / regeneration can shrink the stage list under a selection made earlier,
    // which would leave the bracket tab blank (renderStages bails on a missing stage).
    useEffect(() => {
        if (stages.length > 0 && selectedStageIndex >= stages.length) {
            setSelectedStageIndex(0);
            setSelectedGroupIndex(null);
        }
    }, [stages, selectedStageIndex]);

    // Admins see the help-request inbox on the bracket tab; refresh whenever it opens.
    useEffect(() => {
        if (activeTab === 'bracket' && canManage) {
            fetchAdminHelpRequests();
        }
    }, [id, activeTab, canManage]);

    // The pending-approval count for the pill / tab badge now comes from BadgesContext
    // (kept in sync by the BadgesUpdated SignalR push), so we no longer eagerly fetch the
    // full list on every tab switch. The list itself is still fetched on demand when the
    // organizer taps the approvals pill (handled inline where showApprovalsModal is opened).

    // The admin picked a problematic match — open it like a regular bracket match so
    // the chat tab and the resolve action are available. Land on the chat tab since
    // that's where the conversation that triggered the help request lives.
    // Team-tournament sub-matches use the same solo modal: item.matchId is the sub-match
    // id, and the modal resolves the pairing/score out of the parent team-match DTO that
    // /api/match/{id}/details returns. The team modal has no chat/stream/resolve, so the
    // solo modal is the right surface for handling a help request.
    const handleHelpRequestSelect = (item: AdminHelpRequestItem) => {
        setShowAdminHelpModal(false);
        setSelectedMatch({
            id: item.matchId,
            status: item.status,
            roundName: [item.groupName, item.roundNumber ? t('details.roundNumber', { number: item.roundNumber }) : null]
                .filter(Boolean)
                .join(' · ') || t('details.match'),
            startTime: item.scheduledStartTime,
            home: item.homeUserId
                ? { userId: item.homeUserId, username: item.homeUsername || tCommon('player'), score: null }
                : null,
            away: item.awayUserId
                ? { userId: item.awayUserId, username: item.awayUsername || tCommon('player'), score: null }
                : null,
            canRevert: false,
            isRoundLocked: false,
        });
        setMatchModalDefaultTab('chat');
        setShowReportModal(true);
    };

    // The admin tapped a match awaiting result approval — open it on the match tab,
    // where the proposed score and the approve / reject actions live.
    const handleApprovalSelect = (item: PendingApprovalItem) => {
        setShowApprovalsModal(false);
        setSelectedMatch({
            id: item.matchId,
            status: item.status,
            roundName: [item.groupName, item.roundNumber ? t('details.roundNumber', { number: item.roundNumber }) : null]
                .filter(Boolean)
                .join(' · ') || t('details.match'),
            startTime: item.scheduledStartTime,
            home: item.homeUserId
                ? { userId: item.homeUserId, username: item.homeUsername || tCommon('player'), score: null }
                : null,
            away: item.awayUserId
                ? { userId: item.awayUserId, username: item.awayUsername || tCommon('player'), score: null }
                : null,
            canRevert: false,
            isRoundLocked: false,
        });
        setMatchModalDefaultTab('match');
        setShowReportModal(true);
    };

    // Drill from the team overview into one individual game's full match page. The team modal
    // has no chat/stream of its own, so we reshape the sub-match into the solo MatchDetailsModal
    // (which resolves the pairing/score out of the parent team-match DTO and renders chat /
    // stream / result). We stash the parent team match so closing the game returns to it.
    const handleOpenSubMatchFromTeam = (sub: any, tab: 'match' | 'chat') => {
        // Backend MatchStatus enum (mirrored in the team-match payload): 1 Pending, 2 Scheduled,
        // 3 Live, 4 Completed, 5 NoShow. Only Completed (or an explicit winner — a draw can be
        // Completed without one) means the game has a result; everything else is still in play.
        // Don't infer "done" from non-null scores: revert/edit can leave 0:0 ghosts on a Pending
        // row, which used to flip a never-played game into the Final Score / Edit-Delete view.
        const isDone =
            !!sub?.winnerUserId ||
            sub?.status === 'Completed' ||
            sub?.status === 4;

        // The solo modal derives its 'completed'/'ready_phase' status from a NUMERIC code (3 =
        // completed → result + edit/delete; 2 = ready → the report/submit form). Passing a string
        // here falls through to the default and wrongly shows the submit form on a played game.
        const numericStatus = isDone ? 3 : 2;

        // Players keep edit/delete on their own finished game when no approval gate is in play;
        // hub owners/admins already get them via the modal's privileged path.
        const me = user?.id?.toLowerCase();
        const isPlayerOfSub = !!me && (
            sub?.homePlayer?.userId?.toLowerCase() === me ||
            sub?.awayPlayer?.userId?.toLowerCase() === me
        );
        const approvalRequired = bracketRequireResultApproval
            || (tournament as any)?.requireResultApproval
            || (tournament as any)?.RequireResultApproval
            || false;

        setReturnToTeamMatchId(selectedTeamMatchId);
        setShowTeamMatchDetail(false);
        const game = {
            id: sub.matchId,
            status: numericStatus,
            roundName: t('details.teamMatch'),
            home: sub.homePlayer
                ? { userId: sub.homePlayer.userId, username: sub.homePlayer.username, score: sub.homeScore ?? null }
                : null,
            away: sub.awayPlayer
                ? { userId: sub.awayPlayer.userId, username: sub.awayPlayer.username, score: sub.awayScore ?? null }
                : null,
            canRevert: isDone && isPlayerOfSub && !approvalRequired,
            isRoundLocked: false,
        };
        // The game's page comes up once the team overview is down.
        teamModalHandoff.after(() => {
            if (!navigation.isFocused()) return;
            setSelectedMatch(game);
            setMatchModalDefaultTab(tab);
            setShowReportModal(true);
        });
    };

    // Deep links. Push notifications land here with openAdminHelp / focusMatchId;
    // a shared /team/{id} link lands here with focusTeamId. We act once, then clear
    // the params so the action doesn't replay on the next render/focus.
    const { openAdminHelp, focusMatchId, focusTeamMatchId, focusMatchTab, focusTeamId, focusTeamName, focusTeamRequiresApproval } = route.params;
    useFocusEffect(useCallback(() => {
        // Match deep links (incl. team-tournament sub-matches): open the solo match modal on
        // the requested tab. The push carries the sub-match id in focusMatchId; the modal
        // resolves the pairing & score out of the parent team-match DTO, so chat/stream/result
        // all work here — unlike the team modal, which has neither chat nor a help-resolve action.
        // The modal comes up once this screen has finished sliding in (not over the push), and it
        // is presented over the loading page if the tournament is not in yet.
        if (focusMatchId) {
            let cancelled = false;
            modalReturn.clear();
            setSelectedMatch({ id: focusMatchId, canRevert: false, isRoundLocked: false });
            setMatchModalDefaultTab(focusMatchTab === 'match' ? 'match' : 'chat');
            setMatchFromLink(true);
            setReturnToTeamMatchId(null);
            const open = () => {
                if (cancelled || !navigation.isFocused()) return;
                setShowReportModal(true);
                navigation.setParams({ focusMatchId: undefined, focusTeamMatchId: undefined, focusMatchTab: undefined });
            };
            const cancel = afterScreenTransition(() => {
                if (cancelled || !navigation.isFocused()) return;
                if (showTeamMatchDetail) {
                    setShowTeamMatchDetail(false);
                    teamModalHandoff.after(open);
                } else open();
            });
            return () => { cancelled = true; cancel(); };
        }
        // Fallback: a team-match id with no specific sub-match — open the team overview modal.
        if (focusTeamMatchId) {
            let cancelled = false;
            modalReturn.clear();
            setSelectedTeamMatchId(focusTeamMatchId);
            setReturnToTeamMatchId(null);
            const open = () => {
                if (cancelled || !navigation.isFocused()) return;
                setShowTeamMatchDetail(true);
                navigation.setParams({ focusTeamMatchId: undefined, focusMatchTab: undefined });
            };
            const cancel = afterScreenTransition(() => {
                if (cancelled || !navigation.isFocused()) return;
                if (showReportModal) {
                    setShowReportModal(false);
                    matchModalHandoff.after(open);
                } else open();
            });
            return () => { cancelled = true; cancel(); };
        }
        if (focusTeamId) {
            modalReturn.clear();
            setShowReportModal(false); setShowTeamMatchDetail(false);
            // Land on the Teams → open tab so the team is in context behind the prompt.
            setActiveTab('teams');
            setTeamsTab('open');
            fetchOpenTeams();
            setJoinPrompt({
                teamId: focusTeamId,
                teamName: focusTeamName || t('details.thisTeam'),
                requiresApproval: !!focusTeamRequiresApproval,
            });
            navigation.setParams({ focusTeamId: undefined, focusTeamName: undefined, focusTeamRequiresApproval: undefined });
            return;
        }
        if (openAdminHelp) {
            modalReturn.clear();
            setShowReportModal(false); setShowTeamMatchDetail(false);
            setShowAdminHelpModal(true);
            fetchAdminHelpRequests();
            navigation.setParams({ openAdminHelp: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openAdminHelp, focusMatchId, focusTeamMatchId, focusMatchTab, focusTeamId, focusTeamName, focusTeamRequiresApproval]));

    // Confirm → reuse the existing join/request flow, then close the prompt.
    const handleJoinPromptConfirm = async () => {
        if (!joinPrompt) return;
        const { teamId, requiresApproval } = joinPrompt;
        if (tournament?.isPrivate && !canManage && !inviteCode) {
            // The code sheet is a second native Modal. Present it only once this prompt has
            // animated out — iOS drops a Modal presented while another one is still dismissing,
            // which would leave the player with nothing on screen after tapping Join.
            setJoinPrompt(null);
            joinPromptHandoff.after(() => {
                if (navigation.isFocused()) setPendingPrivateTeamJoin({ teamId, requiresApproval });
            });
            return;
        }
        await handleJoinTeam(teamId, requiresApproval);
        setJoinPrompt(null);
    };

    // Guards the entrant count before we bother the organiser with the draw picker (or the server)
    // — Double Elimination can't build a losers bracket with fewer than 4.
    const entrantCountTooLowMessage = (): string | null => {
        const entrantCount = Number(tournament?.numberOfParticipants ?? 0);
        if (tournament?.format === TournamentFormat.DoubleElimination && entrantCount > 0 && entrantCount < 4) {
            return t('details.doubleElimMinParticipants', { count: entrantCount });
        }
        return null;
    };

    const fetchDrawOptions = async () => {
        const isCurrent = requests.begin('fetchDrawOptions');
        if (!id) return;
        setIsLoadingDrawOptions(true);
        setDrawOptionsError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.BRACKET_DRAW_OPTIONS(id));
            if (!isCurrent()) return;
            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
            if (!isCurrent()) return;
                throw new Error(text);
            }
            const data = await response.json();
            if (!isCurrent()) return;
            setDrawOptions(data?.result || data);
        } catch (err: any) {
            if (!isCurrent()) return;
            console.error('Draw options fetch error:', err);
            setDrawOptions(null);
            setDrawOptionsError(getErrorMessage(err));
        } finally {
            if (!isCurrent()) return;
            setIsLoadingDrawOptions(false);
        }
    };

    // Formats with a real choice open the picker; the rest (League, Swiss) generate straight away
    // with the random draw they've always used.
    const handleStartBracket = () => {
        const tooLow = entrantCountTooLowMessage();
        if (tooLow) {
            setStatusModalConfig({ type: 'error', title: t('details.cannotCreateBracket'), message: tooLow });
            setShowStatusModal(true);
            return;
        }

        if (!SEEDING_CHOICE_FORMATS.includes(Number(tournament?.format))) {
            // No draw to set up — but starting the tournament still notifies everyone, so confirm.
            setShowStartConfirm(true);
            return;
        }

        setDrawOptions(null);
        setShowDrawModal(true);
        fetchDrawOptions();
    };

    const handleCreateBracket = async (
        seedingMode: BracketSeedingMode = BracketSeedingMode.Random,
        drawPlan: BracketDrawPlan | null = null,
    ) => {
        if (!id) return;

        const tooLow = entrantCountTooLowMessage();
        if (tooLow) {
            setStatusModalConfig({ type: 'error', title: t('details.cannotCreateBracket'), message: tooLow });
            setShowStatusModal(true);
            return;
        }

        setIsCreatingBracket(true);
        try {
            const isGroupStage = tournament?.format === TournamentFormat.GroupStageWithKnockout;

            const payload: any = {
                TournamentId: id,
                GroupsCount: isGroupStage ? (tournament.groupsCount || null) : null,
                QualifiersPerGroup: isGroupStage ? (tournament.qualifiersPerGroup || null) : null,
                SeedingMode: seedingMode,
                DrawPlan: drawPlan,
            };

            const response = await authenticatedFetch(ENDPOINTS.CREATE_BRACKET, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
            }

            await invalidateTournamentLists(queryClient);
            setShowDrawModal(false);
            setStatusModalConfig({
                type: 'success',
                title: tCommon('success'),
                message: t('details.bracketCreated')
            });
            setShowStatusModal(true);
            fetchBracket(); // Refresh the bracket view
            fetchTournamentDetails(true); // Refresh details to update status if needed
        } catch (err: any) {
            console.error('Create bracket error:', err);
            // The picker stays open on failure so a rejected plan can be corrected in place.
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setIsCreatingBracket(false);
        }
    };

    // Admin: draw (or re-draw) the knockout bracket from the finished group standings on demand.
    // Shown after a reset, or whenever the groups are complete but the bracket hasn't been drawn.
    const handleDrawBracket = async () => {
        if (!id) return;
        setIsResettingBracket(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DRAW_BRACKET(id), { method: 'POST' });
            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
            }
            await invalidateTournamentLists(queryClient);
            setStatusModalConfig({
                type: 'success',
                title: t('details.bracketDrawn'),
                message: t('details.bracketDrawnMessage')
            });
            setShowStatusModal(true);
            fetchBracket();
            fetchTournamentDetails(true);
        } catch (err: any) {
            setStatusModalConfig({ type: 'error', title: tCommon('error'), message: getErrorMessage(err) });
            setShowStatusModal(true);
        } finally {
            setIsResettingBracket(false);
        }
    };

    const performResetBracket = async () => {
        if (!id) return;
        setIsResettingBracket(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.RESET_BRACKET(id), { method: 'POST' });
            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
            }
            await invalidateTournamentLists(queryClient);
            setStatusModalConfig({
                type: 'success',
                title: t('details.bracketResetTitle'),
                message: t('details.bracketResetMessage')
            });
            setShowStatusModal(true);
            fetchBracket();
            fetchTournamentDetails(true);
        } catch (err: any) {
            setStatusModalConfig({ type: 'error', title: tCommon('error'), message: getErrorMessage(err) });
            setShowStatusModal(true);
        } finally {
            setIsResettingBracket(false);
        }
    };

    // Destructive — confirm first, surfacing how many fixtures will be deleted.
    // Only reachable when no knockout match has been played (front + back guards),
    // so the wording no longer mentions discarding results.
    const handleResetBracket = (knockoutMatchCount: number) => {
        Alert.alert(
            t('details.resetBracketConfirmTitle'),
            t('details.resetBracketConfirmMessage', { suffix: knockoutMatchCount > 0 ? t('details.resetBracketMatchCount', { count: knockoutMatchCount }) : '' }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                { text: t('details.resetBracketAction'), style: 'destructive', onPress: performResetBracket },
            ]
        );
    };

    // First-round knockout teams a manual swap can touch: both teams of an unplayed real match, plus
    // teams sitting on a bye (the backend moves them together with the match the bye advanced them
    // into). Real matches already under way are left out; the backend has the final say (it also
    // refuses pending proposals, evidence and a bye team whose next match was played).
    const getSwappableBracketTeams = (): SwapTeam[] => {
        const norm = (s: any) => s.type ?? s.Type;
        const out: SwapTeam[] = [];
        const seen = new Set<string>();
        const add = (p: any) => {
            const pid = p?.participantId ?? p?.ParticipantId;
            if (!pid || seen.has(pid)) return;
            seen.add(pid);
            out.push({ id: pid, name: p.teamName ?? p.username ?? p.Username ?? p.name ?? tCommon('app.tbd'), seed: p.seed ?? p.Seed });
        };
        stages
            .filter((s: any) => norm(s) === 3 || norm(s) === 4) // single-elim / DE winners bracket
            .forEach((s: any) => (s.rounds ?? s.Rounds ?? []).forEach((r: any) => (r.matches ?? r.Matches ?? []).forEach((m: any) => {
                const round = m.round ?? m.Round ?? 1;
                if (round !== 1) return;
                const status = m.status ?? m.Status;
                const home = m.home ?? m.Home;
                const away = m.away ?? m.Away;
                if (home && away) {
                    // Live, Completed, or a level series waiting for its tiebreak (TieBreakRequired).
                    if (status === 3 || status === 4 || status === 6) return;
                    add(home);
                    add(away);
                } else {
                    add(home ?? away); // bye — include the lone team
                }
            })));
        return out;
    };

    const handleSwapBracket = async (aId: string, bId: string) => {
        if (!id) return;
        setIsSwapping(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.SWAP_BRACKET(id), {
                method: 'POST',
                body: JSON.stringify({ ParticipantAId: aId, ParticipantBId: bId }),
            });
            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
            }
            await invalidateTournamentLists(queryClient);
            setShowSwapModal(false);
            setStatusModalConfig({ type: 'success', title: t('details.positionsSwapped'), message: t('details.positionsSwappedMessage') });
            setShowStatusModal(true);
            fetchBracket();
        } catch (err: any) {
            setStatusModalConfig({ type: 'error', title: tCommon('error'), message: getErrorMessage(err) });
            setShowStatusModal(true);
        } finally {
            setIsSwapping(false);
        }
    };

    const handleCloseRegistration = async () => {
        if (!id) return;
        setIsTogglingRegistration(true);
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
                title: tCommon('success'),
                message: t('details.registrationClosed')
            });
            await invalidateTournamentLists(queryClient);
            setShowStatusModal(true);
            fetchTournamentDetails(true); // Refresh details
        } catch (err: any) {
            console.error('Close registration error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setIsTogglingRegistration(false);
        }
    };

    const handleOpenRegistration = async () => {
        if (!id) return;
        setIsTogglingRegistration(true);
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
                title: tCommon('success'),
                message: t('details.registrationOpened')
            });
            await invalidateTournamentLists(queryClient);
            setShowStatusModal(true);
            fetchTournamentDetails(true); // Refresh details
        } catch (err: any) {
            console.error('Open registration error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setIsTogglingRegistration(false);
        }
    };

    const fetchPendingRegistrations = async () => {
        const isCurrent = requests.begin('fetchPendingRegistrations');
        if (!id) return;
        setIsLoadingPending(true);
        try {
            const url = ENDPOINTS.GET_PENDING_REGISTRATIONS(id);
            const response = await authenticatedFetch(url);
            if (!isCurrent()) return;
            if (!response.ok) throw new Error(t('details.fetchPendingFailed'));
            const data = await response.json();
            if (!isCurrent()) return;
            setPendingRegistrations(data.result || data || []);
            setPendingError(false);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'pending', true));
        } catch (err) {
            if (!isCurrent()) return;
            console.error('Pending registrations fetch error:', err);
            setPendingError(true);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'pending', false));
        } finally {
            if (!isCurrent()) return;
            setIsLoadingPending(false);
            setPendingLoaded(true);
        }
    };

    const fetchParticipants = async (force = true) => {
        const isCurrent = requests.begin('fetchParticipants');
        if (!id) return;
        try {
            const url = ENDPOINTS.GET_TOURNAMENT_PARTICIPANTS(id);
            const data = await fetchTournamentResource(queryClient, tournamentResourceKey(id, user?.id, 'participants'), async (signal) => {
                const response = await authenticatedFetch(url, { signal });
                if (!response.ok) throw new Error(t('details.fetchParticipantsFailed'));
                return response.json();
            }, force);
            if (!isCurrent()) return;
            const list = data.result || data || [];
            // Guard against duplicate participant rows for the same user (legacy data). The list
            // is keyed by user id, so duplicates would crash rendering with duplicate React keys.
            const seen = new Set<string>();
            const deduped = Array.isArray(list)
                ? list.filter((p: any) => {
                    const uid = (p.userId || p.UserId || p.id || '').toString().toLowerCase();
                    if (!uid) return true;
                    if (seen.has(uid)) return false;
                    seen.add(uid);
                    return true;
                })
                : list;
            setParticipants(deduped);
            setParticipantsError(false);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'participants', true));
            if (Array.isArray(deduped)) rememberSnapshot(user?.id, id, { participants: deduped });
        } catch (err) {
            if (!isCurrent()) return;
            console.error('Participants fetch error:', err);
            setParticipantsError(true);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'participants', false));
        } finally {
            if (!isCurrent()) return;
            setParticipantsLoaded(true);
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

            await invalidateTournamentLists(queryClient);
            setStatusModalConfig({
                type: 'success',
                title: t('details.approvedTitle'),
                message: t('details.approvedMessage')
            });
            setShowStatusModal(true);
            fetchPendingRegistrations();
            fetchParticipants(); // Refresh participants list
            fetchTournamentDetails(true);
        } catch (err: any) {
            console.error('[Approve] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setProcessingId(null);
        }
    };

    const handleRemoveParticipant = async (participantUserId: string) => {
        if (!id) return;
        // The confirmation stays up with a spinner and is dismissed in the finally, so the sheet
        // can't be tapped twice while the request is in flight.
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
                title: tCommon('success'),
                message: t('details.participantRemoved')
            });
            await invalidateTournamentLists(queryClient);
            setShowStatusModal(true);
            fetchParticipants(); // Refresh list
            fetchTournamentDetails(true); // Update participant count
        } catch (err: any) {
            console.error('[RemoveParticipant] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setProcessingId(null);
            setRemoveParticipantTarget(null);
        }
    };

    // A swap rewrites the roster label on every match the outgoing player was in, so the bracket /
    // standings have to be re-read too — the participant list alone would still show the old name
    // inside the fixtures.
    const handleParticipantSwapped = (incomingUsername: string) => {
        void invalidateTournamentLists(queryClient);
        setParticipantSwapTarget(null);
        setStatusModalConfig({
            type: 'success',
            title: t('details.playerReplaced'),
            message: t('details.playerReplacedMessage', { username: incomingUsername })
        });
        setShowStatusModal(true);
        fetchParticipants();
        fetchTournamentDetails(true);
        fetchBracket(true);
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

            await invalidateTournamentLists(queryClient);
            setStatusModalConfig({
                type: 'success',
                title: t('details.rejectedTitle'),
                message: t('details.rejectedMessage')
            });
            setShowStatusModal(true);
            fetchPendingRegistrations();
        } catch (err: any) {
            console.error('[Reject] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
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
                    // A complete LINEUP is what makes a team approvable — reserves are optional, so
                    // counting the whole roster would let a squad with a short side through.
                    return rosterInfo(reg, tournament).isLineupFull;
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
                title: tCommon('success'),
                message: t('details.allApproved')
            });
            await invalidateTournamentLists(queryClient);
            setShowStatusModal(true);
            fetchPendingRegistrations();
            fetchParticipants();
            fetchTournamentDetails(true);
        } catch (err: any) {
            console.error('[ApproveAll] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
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

        // Scope the schedule to the stage being viewed. In double-elimination the Winners and
        // Losers brackets are separate stages that share round numbers, so without the stageId
        // the backend would apply the deadline to both brackets' round N.
        const stageId = stages[selectedStageIndex]?.stageId ?? null;

        // Round format lives on the matches, so read it off the first one. They are stamped
        // together, and an unstamped match reports the tournament default rather than an override.
        const firstMatch = typeof roundOrMatchday === 'object' ? roundOrMatchday.matches?.[0] : null;
        const roundBestOf = firstMatch ? (firstMatch.bestOf ?? firstMatch.BestOf ?? null) : null;
        const roundTiebreakBestOf = firstMatch ? (firstMatch.tiebreakBestOf ?? firstMatch.TiebreakBestOf ?? null) : null;

        setSelectedRoundForDeadline({
            roundNumber,
            currentDeadline,
            roundOpenAt,
            stageId,
            // A match echoes the tournament default when it has no override of its own, so treat a
            // value equal to the default as "inherit" — otherwise every round would look pinned.
            bestOf: roundBestOf === tournamentBestOf ? null : roundBestOf,
            tiebreakBestOf: roundTiebreakBestOf,
        });
        setShowDeadlineModal(true);
    };

    const handleSaveSchedule = async (
        openAtStr: string | null,
        deadlineStr: string | null,
        format?: { bestOf: number | null; tiebreakBestOf: number | null; changed: boolean },
    ) => {
        if (!id || !selectedRoundForDeadline) return;

        setShowDeadlineModal(false);

        try {
            const payload = {
                RoundNumber: selectedRoundForDeadline.roundNumber,
                Deadline: deadlineStr ? new Date(deadlineStr.replace(' ', 'T')).toISOString() : null,
                RoundStart: openAtStr ? new Date(openAtStr.replace(' ', 'T')).toISOString() : null,
                StageId: selectedRoundForDeadline.stageId ?? null,
                // Declarative save: an empty field in the modal means "no open time" (round is
                // open) / "no deadline" — without these flags the backend treats null as "keep".
                ClearRoundStart: !openAtStr,
                ClearDeadline: !deadlineStr
            };

            const response = await authenticatedFetch(ENDPOINTS.SET_ROUND_SCHEDULE(id), {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
            }

            await invalidateTournamentLists(queryClient);
            // Format is a separate endpoint (it has its own "already reported" rules), and only
            // called when the organizer actually changed it.
            let formatNote = '';
            if (format?.changed) {
                const formatResponse = await authenticatedFetch(ENDPOINTS.SET_ROUND_BEST_OF(id), {
                    method: 'PUT',
                    body: JSON.stringify({
                        RoundNumber: selectedRoundForDeadline.roundNumber,
                        StageId: selectedRoundForDeadline.stageId ?? null,
                        BestOf: format.bestOf,
                        TiebreakBestOf: format.tiebreakBestOf,
                        // Null Best-of means "drop the override and follow the tournament default".
                        ClearBestOf: format.bestOf == null,
                    }),
                });

                if (!formatResponse.ok) {
                    const text = await formatResponse.text().catch(() => 'No response body');
                    throw new Error(text);
                }

                // Matches already reported keep their format — say so rather than implying the
                // whole round changed.
                const result = await formatResponse.json().catch(() => null);
                const skipped = result?.skippedLockedMatches ?? result?.SkippedLockedMatches ?? 0;
                if (skipped > 0) {
                    // Name the way out too: deleting a result puts that match back on the round's
                    // current format, which is otherwise impossible to discover.
                    formatNote = t('details.formatNote', { count: skipped });
                }
            }

            setStatusModalConfig({
                type: 'success',
                title: tCommon('success'),
                message: t('details.roundScheduleUpdated', { note: formatNote })
            });
            setShowStatusModal(true);

            fetchBracket();
        } catch (err: any) {
            console.error('[SetDeadline] Error:', err);
            setStatusModalConfig({
                type: 'error',
                title: tCommon('error'),
                message: getErrorMessage(err)
            });
            setShowStatusModal(true);
        } finally {
            setSelectedRoundForDeadline(null);
        }
    };

    const fetchTournamentTeams = async (tournamentId: string, force = true) => {
        const isCurrent = requests.begin('fetchTournamentTeams');
        try {
            // Populate confirmed list
            const finalTeams = await fetchTournamentResource(queryClient, tournamentResourceKey(tournamentId, user?.id, 'teams'),
                () => getTournamentTeams(tournamentId), force);
            if (!isCurrent()) return;
            setTournamentTeams(finalTeams);
            setTeamsError(false);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'teams', true));
            rememberSnapshot(user?.id, tournamentId, { teams: finalTeams });

            // Find user's team from all teams (including pending) like before
            if (user?.id) {
                try {
                    const allTeams = await fetchTournamentResource(queryClient, tournamentResourceKey(tournamentId, user?.id, 'pending-teams'),
                        () => getPendingTournamentTeams(tournamentId), force);
            if (!isCurrent()) return;
                    const myTeam = allTeams.find(teamRow =>
                        teamRow.members && teamRow.members.some(m => (m.userId || m.UserId)?.toLowerCase() === user.id.toLowerCase())
                    );
                    setUserTeam(myTeam || null);
                    rememberSnapshot(user.id, tournamentId, { userTeam: myTeam || null });
                    setFailedRefreshes((failures) => withRefreshResult(failures, 'pending-teams', true));
                } catch (checkErr) {
            if (!isCurrent()) return;
                    console.error('Error verifying user team status:', checkErr);
                    setFailedRefreshes((failures) => withRefreshResult(failures, 'pending-teams', false));
                }
            }
        } catch (err) {
            if (!isCurrent()) return;
            console.error('Error fetching tournament teams:', err);
            setTeamsError(true);
            setFailedRefreshes((failures) => withRefreshResult(failures, 'teams', false));
        } finally {
            if (!isCurrent()) return;
            setTeamsLoaded(true);
        }
    };

    const handleTeamJoined = (team: TeamDto) => {
        void invalidateTournamentLists(queryClient);
        setUserTeam(team);
        setShowTeamRegistration(false);
        if (tournament?.isTeamTournament) {
            fetchTournamentTeams(id);
        }
    };

    const handleRemoveTeam = (teamId: string, teamName: string) => {
        Alert.alert(
            t('details.removeTeamTitle'),
            t('details.removeTeamMessage', { teamName }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: tCommon('remove'),
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
                                const text = await response.text().catch(() => t('details.removeTeamFailed'));
                                throw new Error(text);
                            }
                            setStatusModalConfig({
                                type: 'success',
                                title: t('details.teamRemovedTitle'),
                                message: t('details.teamRemovedMessage', { teamName })
                            });
                            setShowStatusModal(true);
                            await invalidateTournamentLists(queryClient);
                            setTournamentTeams(prev => prev.filter(teamRow => (teamRow.teamId || teamRow.TeamId) !== teamId));
                            // The optimistic filter above already removed the row; the authoritative
                            // reload comes from fetchTournamentDetails, which refetches the teams for
                            // a team tournament itself. Calling both raced two identical requests.
                            fetchTournamentDetails(true);
                        } catch (err: any) {
                            setStatusModalConfig({
                                type: 'error',
                                title: tCommon('error'),
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

    // Params can change while this route stays focused. Consume each push once; Back still reuses cache.
    const notificationRefreshKey = route.params.notificationRefreshKey;
    const consumedNotification = useRef<number | undefined>(undefined);
    const refreshTournamentOnFocus = useCallback(() => {
            // First time it mounts, isLoading is already true by default, so silent doesn't matter visually,
            // but for subsequent focuses, silent=true prevents the screen from going blank
            // Normal Back reuses fresh resources. A notification explicitly asks for current data.
            const params = routeParamsRef.current;
            const freshNotification = notificationRefreshKey !== undefined && consumedNotification.current !== notificationRefreshKey;
            consumedNotification.current = notificationRefreshKey;
            const fromNotification = freshNotification || !!(params.focusMatchId || params.focusTeamMatchId);
            fetchTournamentDetails(true, fromNotification);
            // The participants list only feeds the Overview join button and the Players tab.
            // Skip the extra round-trip on refocus when we're on bracket/teams/registrations,
            // which don't use it. The tab-switch effect still fetches it when Players is opened.
            const tab = activeTabRef.current;
            if (tab === 'overview' || tab === 'players') fetchParticipants(fromNotification);
            // The bracket is fetched by the tab-switch effect, which does NOT re-run on refocus —
            // so without this, coming back to an already-open bracket showed whatever was loaded
            // when the tab was first opened, including stale live team scores.
            if (tab === 'bracket' || freshNotification) fetchBracket(true, fromNotification);
        }, [id, user?.id, notificationRefreshKey]);
    useFocusEffect(refreshTournamentOnFocus);

    // Pull-to-refresh: same set as the focus refetch, but always refreshes the data behind the
    // tab actually on screen, and reports progress through the pull spinner instead of silently.
    const handleRefresh = useCallback(async () => {
        if (!id) return;
        setIsRefreshing(true);
        try {
            const tab = activeTabRef.current;
            await Promise.all([
                // Teams are deliberately absent here: fetchTournamentDetails already refetches them
                // itself for a team tournament. Listing them again meant pull-to-refresh on the teams
                // tab fired two identical requests in parallel, and whichever landed second won — so a
                // team the first response had already dropped could flicker back in.
                fetchTournamentDetails(true),
                tab === 'bracket' ? fetchBracket(true) : null,
                tab === 'overview' || tab === 'players' ? fetchParticipants() : null,
            ]);
        } finally {
            setIsRefreshing(false);
        }
    }, [id]);

    // `tab` lets a caller land straight on the chat (the Round Progress list uses it to open
    // the conversation with the two players who haven't played yet). Every other call site
    // passes one argument and keeps the previous behaviour.
    const handleMatchPress = (match: any, tab: 'match' | 'chat' = 'match') => {

        // Only allow if match has participants
        if (!match.home || !match.away) return;

        // Allow Pending (1), Live (2), Completed (3, 4), NoShow (5) and TieBreakRequired (6).
        // A no-show is terminal but reversible — the modal is where an admin undoes the double
        // walkover or enters the real result the players played late, so it must stay openable.
        // TieBreakRequired matches BracketMatch's own canShowDetails, which already renders them
        // pressable: without it the card looked tappable and then did nothing.
        if (match.status !== 1 && match.status !== 2 && match.status !== 3 && match.status !== 4
            && match.status !== 5 && match.status !== 6) return;

        const isCreator = canManage;

        if (match.isRoundLocked && !isCreator) {
            Alert.alert(t('details.roundLocked'), t('details.roundLockedMessage'));
            return;
        }

        const backendCanRevert = match.canRevert ?? match.CanRevert ?? false;
        setSelectedMatch({ ...match, canRevert: backendCanRevert });
        setMatchModalDefaultTab(tab);
        setShowReportModal(true);
    };

    // A player tap inside the match modal: hide the modal so the pushed profile is visible, and
    // bring it back on the same tab (same selectedMatch) when the viewer returns. Hidden directly,
    // not through the modal's onClose — that path means the viewer is done with this game and
    // hands them back to the team overview it came from. The hand-off still happens, once the
    // reopened modal is genuinely dismissed.
    const handleOpenProfileFromMatch = (userId: string, fromTab: MatchModalTab) => {
        modalReturn.remember({ kind: 'match', id: selectedMatch.id, tab: fromTab }, getRouteOpenVersion(route.key));
        setShowReportModal(false);
        // Only if the viewer is still here: back pressed while the modal was going down cancels it.
        matchModalHandoff.after(() => {
            if (navigation.isFocused() && modalReturn.peek(getRouteOpenVersion(route.key))) navigation.navigate('PlayerProfile', { id: userId });
        });
    };

    // Same trip from the team overview. It stays mounted while hidden (selectedTeamMatchId is kept),
    // which is also what lets iOS report when it is down.
    const handleOpenProfileFromTeamMatch = (userId: string) => {
        if (!selectedTeamMatchId) return;
        modalReturn.remember({ kind: 'team', id: selectedTeamMatchId }, getRouteOpenVersion(route.key));
        setShowTeamMatchDetail(false);
        teamModalHandoff.after(() => {
            if (navigation.isFocused() && modalReturn.peek(getRouteOpenVersion(route.key))) navigation.navigate('PlayerProfile', { id: userId });
        });
    };

    // Read the current modal on blur, including a notification that covered the tournament.
    const modalViewRef = useRef({ showReportModal, showTeamMatchDetail, selectedMatch, selectedTeamMatchId });
    modalViewRef.current = { showReportModal, showTeamMatchDetail, selectedMatch, selectedTeamMatchId };
    const handleModalFocus = useCallback(() => {
        const version = getRouteOpenVersion(route.key);
        const cancel = modalReturn.peek(version) ? afterScreenTransition(() => {
            if (!navigation.isFocused()) return;
            const pending = modalReturn.take(getRouteOpenVersion(route.key));
            const view = modalViewRef.current;
            if (pending?.kind === 'match' && pending.id === view.selectedMatch?.id) {
                setMatchModalDefaultTab(pending.tab);
                setShowTeamMatchDetail(false);
                setShowReportModal(true);
            } else if (pending?.kind === 'team' && pending.id === view.selectedTeamMatchId) {
                setShowReportModal(false);
                setShowTeamMatchDetail(true);
            }
        }) : undefined;
        return () => {
            cancel?.();
            const view = modalViewRef.current;
            if (view.showReportModal && view.selectedMatch?.id) {
                modalReturn.remember({ kind: 'match', id: view.selectedMatch.id, tab: matchActiveTabRef.current }, getRouteOpenVersion(route.key));
            } else if (view.showTeamMatchDetail && view.selectedTeamMatchId) {
                modalReturn.remember({ kind: 'team', id: view.selectedTeamMatchId }, getRouteOpenVersion(route.key));
            }
            setShowReportModal(false);
            setShowTeamMatchDetail(false);
        };
    }, [route.key, modalReturn, navigation]);
    useFocusEffect(handleModalFocus);

    useEffect(() => {
        if (activeTab === 'bracket') {
            fetchBracket(true, false);
        } else if (activeTab === 'registrations') {
            fetchPendingRegistrations();
        } else if (activeTab === 'players') {
            if (playersTab === 'confirmed') fetchParticipants(false);
            else if (playersTab === 'registrations' && pendingRegistrations.length === 0) fetchPendingRegistrations();
        } else if (activeTab === 'teams' && tournament?.isTeamTournament) {
            if (teamsTab === 'open' && openTeams.length === 0) fetchOpenTeams();
            else if (teamsTab === 'registrations' && pendingRegistrations.length === 0) fetchPendingRegistrations();
            else if (teamsTab === 'confirmed') fetchTournamentTeams(id, false);
        }
    }, [id, activeTab, teamsTab, playersTab]);

    const fetchOpenTeams = async () => {
        const isCurrent = requests.begin('fetchOpenTeams');
        if (!id) return;
        try {
            const data = await getTeamsToJoin(id);
            if (!isCurrent()) return;
            setOpenTeams(data);
            setOpenTeamsError(false);
        } catch (err) {
            if (!isCurrent()) return;
            console.error('Fetch open teams error:', err);
            setOpenTeamsError(true);
        } finally {
            if (!isCurrent()) return;
            setOpenTeamsLoaded(true);
        }
    };

    const tabs: PremiumTabItem[] = [
        { label: t('details.tabOverview'), value: 'overview', icon: 'grid-outline' },
        {
            label: t('details.tabBracket'),
            value: 'bracket',
            icon: 'git-merge-outline',
            // Result approvals (when required) + open admin-help requests both live in the bracket.
            // Both counts come from BadgesContext (SignalR-fed) so this stays live without any
            // extra fetching. The old Math.max(badgeCount, pendingApprovals.length) fallback
            // caused the same staleness bug as the Approvals pill — after approve, the badge
            // drops but the loaded list still holds the old rows, and Math.max shipped the
            // stale count until the modal was reopened.
            badge: (
                (canManage && requiresApproval ? pendingApprovalsBadgeCount : 0)
                + adminHelpCount
                + phoneRequestCount
            ) || undefined,
            badgeTone: 'alert',
        },
        ...(tournament?.isTeamTournament
            ? [{
                label: t('details.tabTeams'), value: 'teams', icon: 'people-outline' as const,
                badge: canManage && pendingRegCount > 0 ? pendingRegCount : undefined,
                badgeTone: 'alert' as const,
            }]
            : [{
                label: t('details.tabPlayers'), value: 'players', icon: 'people-outline' as const,
                badge: canManage && pendingRegCount > 0 ? pendingRegCount : undefined,
                badgeTone: 'alert' as const,
            }]),
    ];

    const getStatusText = (status: number) => {
        switch (status) {
            case 0: return t('details.statusOpen');
            case 1: return t('details.statusUpcoming');
            case 2: return t('details.statusRegClosed');
            case 3: return t('details.statusLive');
            case 4: return t('details.statusCompleted');
            default: return t('details.statusIdle');
        }
    };

    // Tournament-wide completion, just enough to number the Progress cell. The modal does the
    // full per-round / per-group breakdown when it opens; this stays a single cheap pass so the
    // header doesn't recompute a 1600-fixture league on every render.
    const progressSummary = useMemo(() => {
        let done = 0;
        let total = 0;
        const tally = (matches: any[] | undefined) => {
            for (const m of matches ?? []) {
                total += 1;
                const status = m.status ?? m.Status;
                // Completed (4) or NoShow (5) — the two ways a fixture ends up with a result.
                if (status === 4 || status === 5) done += 1;
            }
        };
        for (const stage of stages ?? []) {
            for (const round of (stage.rounds ?? stage.Rounds ?? [])) tally(round.matches ?? round.Matches);
            for (const group of (stage.groups ?? stage.Groups ?? [])) tally(group.matches ?? group.Matches);
        }
        return { done, total, remaining: total - done };
    }, [stages]);

    // The organizer's three numbers, as one aligned strip rather than three pills of different
    // widths that wrapped onto a second line. Cells appear only when they mean something, and
    // whatever is left divides the width equally.
    //
    // Approvals reads from the BadgesContext count, which gets a live SignalR push — deliberately
    // NOT Math.max'd with the locally loaded pendingApprovals list: after an approve, the push
    // drops the badge but the stale list (only refreshed when the cell is tapped) would keep the
    // old higher number on screen.
    // Not memoized on purpose: the cells carry onPress handlers that close over the fetchers,
    // and a memo would freeze the first render's closures. Three array pushes cost nothing —
    // progressSummary above is the only part worth caching.
    const adminStripItems: StatStripItem[] = (() => {
        if (!canManage) return [];

        const items: StatStripItem[] = [];

        if (progressSummary.total > 0) {
            items.push({
                key: 'progress',
                icon: progressSummary.remaining > 0 ? 'stats-chart' : 'checkmark-done',
                value: `${Math.round((progressSummary.done / progressSummary.total) * 100)}%`,
                label: t('details.progress'),
                progress: progressSummary.done / progressSummary.total,
                tone: progressSummary.remaining > 0 ? 'info' : 'primary',
                onPress: () => setShowProgressModal(true),
            });
        }

        items.push({
            key: 'help',
            icon: adminHelpCount + phoneRequestCount > 0 ? 'hand-left' : 'hand-left-outline',
            value: String(adminHelpCount + phoneRequestCount),
            label: t('phoneRequests.inboxTitle'),
            tone: adminHelpCount + phoneRequestCount > 0 ? 'warning' : 'muted',
            onPress: () => {
                setShowAdminHelpModal(true);
                fetchAdminHelpRequests();
            },
        });

        if (requiresApproval) {
            items.push({
                key: 'approvals',
                icon: pendingApprovalsBadgeCount > 0 ? 'checkmark-done' : 'checkmark-done-outline',
                value: String(pendingApprovalsBadgeCount),
                label: t('details.approvals'),
                tone: pendingApprovalsBadgeCount > 0 ? 'primary' : 'muted',
                onPress: () => {
                    setShowApprovalsModal(true);
                    fetchPendingApprovals();
                },
            });
        }

        return items;
    })();

    // Shares the bracket header row with the zoom controls, and gets a row of its own on the
    // group / league view — the strip fills whatever width it is given either way.
    const adminPills = adminStripItems.length > 0 ? <StatStrip items={adminStripItems} /> : null;

    // Admin-only bracket controls for the Groups + Bracket format:
    //  • Reset Bracket  — visible once the knockout is drawn; tears it down so a group result can be fixed.
    //  • Draw Bracket   — visible when the groups are complete but the knockout is empty (e.g. after a reset).
    //  • Swap Seeds     — platform admin only; the backend refuses it for tournament staff.
    const renderBracketAdminActions = () => {
        if (!canManage || stages.length === 0) return null;

        const norm = (s: any) => s.type ?? s.Type;
        const hasGroupStage = stages.some((s: any) => norm(s) === 1); // StageType.GroupStage
        if (!hasGroupStage) return null;

        // Knockout stages: SingleEliminationBracket (3), DE Winners Bracket (4), DE Losers Bracket (5).
        // Include LB so a played LB fixture on a DE tournament also disables Reset.
        const knockoutMatches = stages
            .filter((s: any) => norm(s) === 3 || norm(s) === 4 || norm(s) === 5)
            .flatMap((s: any) => (s.rounds ?? s.Rounds ?? []).flatMap((r: any) => r.matches ?? r.Matches ?? []));
        const knockoutDrawn = knockoutMatches.length > 0;

        // Any 2-sided knockout match past Pending — Live (3), Completed (4) or NoShow (5) —
        // means the result is either in flight or already recorded, so a reset would silently
        // discard it. Byes have one side null and hold a Completed status from the draw;
        // excluding them via home/away guards keeps the button live right after a fresh draw.
        // Backend enforces the same rule authoritatively.
        const anyKnockoutPlayed = knockoutMatches.some((m: any) => {
            const home = m.home ?? m.Home;
            const away = m.away ?? m.Away;
            const st = m.status ?? m.Status;
            return home && away && (st === 3 || st === 4 || st === 5);
        });

        const groupStage = stages.find((s: any) => norm(s) === 1);
        const groupMatches = (groupStage?.groups ?? groupStage?.Groups ?? [])
            .flatMap((g: any) => g.matches ?? g.Matches ?? []);
        // NoShow (5) counts as played-out here: nobody is ever going to play that fixture, so it
        // must not hold the group stage open and hide the Draw Bracket button (the backend's own
        // round-completion check treats NoShow as terminal).
        const groupComplete = groupMatches.length > 0
            && groupMatches.every((m: any) => { const st = m.status ?? m.Status; return st === 3 || st === 4 || st === 5; });

        const showReset = knockoutDrawn && !anyKnockoutPlayed;
        const showDraw = !knockoutDrawn && groupComplete;
        const canSwap = isPlatformAdmin && knockoutDrawn && getSwappableBracketTeams().length >= 2;
        if (!showReset && !showDraw) return null;

        return (
            <View className="px-4 mb-4 gap-2">
                {showDraw && (
                    <Button className="w-full" onPress={handleDrawBracket} loading={isResettingBracket}>
                        {t('details.drawBracket')}
                    </Button>
                )}
                {canSwap && (
                    <Pressable
                        onPress={() => setShowSwapModal(true)}
                        className="w-full flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-white/10 bg-white/[0.04] active:opacity-70"
                    >
                        <Ionicons name="swap-horizontal" size={16} color={COLORS.slate300} />
                        <Text className="text-sm font-bold text-slate-200">{t('details.swapSeeds')}</Text>
                    </Pressable>
                )}
                {showReset && (
                    <>
                        <Pressable
                            onPress={() => handleResetBracket(knockoutMatches.length)}
                            disabled={isResettingBracket}
                            className="w-full flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/30 bg-red-500/10 active:opacity-70"
                        >
                            {isResettingBracket
                                ? <ActivityIndicator size="small" color="#F87171" />
                                : <Ionicons name="refresh" size={16} color="#F87171" />}
                            <Text className="text-sm font-bold text-red-400">{t('details.resetBracketBtn')}</Text>
                        </Pressable>
                        <Text className="text-[11px] text-slate-500 text-center">
                            {t('details.resetBracketHint')}
                        </Text>
                    </>
                )}
            </View>
        );
    };

    // Everything renderStages() derives from the loaded bracket, hoisted out of it. The function is
    // called as a plain function from JSX, so this ran on *every* render of this screen — and the
    // screen consumes useBadges(), whose SignalR pushes re-render it on any badge change anywhere in
    // the tournament. Each pass did a flatMap over every match in the stage, three full .find() scans
    // over that flattened list, and a rebuild of every round object. On a 256-entrant bracket that is
    // 255 matches walked four times per push, for a result that only changes when the bracket, the
    // selected stage, or the tournament format does.
    const stageDerivation = useMemo(() => {
        const currentStage = stages[selectedStageIndex];
        if (!currentStage) return null;

        // Stage type mirrors GameHubz.DataModels.Enums.StageType:
        //   3 = SingleEliminationBracket, 4 = DE Winners Bracket, 5 = DE Losers Bracket,
        //   6 = Swiss (renders as groups), 7 = Play-In (renders as a one-round bracket).
        const stageType = currentStage.type ?? currentStage.Type;
        const isLosersBracket = stageType === 5;

        // Swiss qualification zones for the standings table: top D direct to knockout (green),
        // D+1 .. D+2(N-D) into the play-in (amber). Pure Swiss (no knockout) highlights nothing.
        const swissKnockoutSize = Number(tournament?.swissKnockoutQualifiers ?? 0) || 0;
        const swissDirectCount = swissKnockoutSize > 0
            ? Math.min(Number(tournament?.swissDirectQualifiers ?? swissKnockoutSize), swissKnockoutSize)
            : 0;
        const swissPlayInEnd = swissKnockoutSize > 0
            ? swissDirectCount + 2 * (swissKnockoutSize - swissDirectCount)
            : 0;
        const swissZones = stageType === 6
            ? { direct: swissDirectCount, playInEnd: swissPlayInEnd }
            : undefined;

        // Classic group stage: top N per group advance to the knockout, N = QualifiersPerGroup.
        // direct === playInEnd → green zone only, no amber play-in row. Missing/0 value falls
        // back to the legacy top-2 highlight inside TournamentGroups.
        const groupQualifiers = Number(tournament?.qualifiersPerGroup ?? 0) || 0;
        const groupZones = stageType === 1 && groupQualifiers > 0
            ? { direct: groupQualifiers, playInEnd: groupQualifiers }
            : undefined;

        // Total Swiss rounds for the "Round X of Y" header — mirrors backend GetSwissTotalRounds:
        // configured value (clamped to the no-rematch maximum) or ceil(log2(N)). N comes from the
        // Swiss group's standings (the exact participant count); maxPlayers is only a last-resort
        // fallback since it is the registration cap, not the real entrant count.
        const swissParticipantCount = currentStage.groups?.[0]?.standings?.length
            || Number(tournament?.numberOfParticipants ?? 0)
            || Number(tournament?.maxPlayers ?? 0)
            || 0;
        const swissMaxRounds = swissParticipantCount >= 2
            ? (swissParticipantCount % 2 === 0 ? swissParticipantCount - 1 : swissParticipantCount)
            : 0;
        const swissConfiguredRounds = Number(tournament?.swissRoundsCount ?? 0)
            || (swissParticipantCount >= 2 ? Math.ceil(Math.log2(swissParticipantCount)) : 0);
        const swissTotalRounds = stageType === 6 && swissMaxRounds > 0
            ? Math.max(1, Math.min(swissConfiguredRounds, swissMaxRounds))
            : undefined;

        // The binary-tree bracket can't place a third-place play-off or a Grand Final inline
        // (the GF is fed by the LB winner from a different stage, not by another WB feeder),
        // so we pull both out of the round list and render them on their own below.
        const stageRounds = currentStage.rounds || [];
        const allStageMatches = stageRounds.flatMap((r: any) => r.matches || []);
        const thirdPlaceMatch = allStageMatches.find((m: any) => m.stage === MatchStage.ThirdPlace);
        const grandFinalMatch = allStageMatches.find((m: any) => m.stage === MatchStage.GrandFinal);
        // Reset Grand Final exists only when the LB champion won the first GF (true double-elim).
        const grandFinalResetMatch = allStageMatches.find((m: any) => m.stage === MatchStage.GrandFinalReset);

        const bracketRounds = (thirdPlaceMatch || grandFinalMatch || grandFinalResetMatch)
            ? stageRounds
                .map((r: any) => ({
                    ...r,
                    matches: (r.matches || []).filter(
                        (m: any) => m.stage !== MatchStage.ThirdPlace
                            && m.stage !== MatchStage.GrandFinal
                            && m.stage !== MatchStage.GrandFinalReset
                    ),
                }))
                .filter((r: any) => r.matches.length > 0)
            : stageRounds;

        return { currentStage, stageType, isLosersBracket, swissZones, groupZones, swissTotalRounds, stageRounds, thirdPlaceMatch, grandFinalMatch, grandFinalResetMatch, bracketRounds };
    }, [stages, selectedStageIndex, tournament]);

    // Badge pushes also render this screen. Count phase progress only when bracket data changes.
    const stageTiles = useMemo(() => stages.map((stage: any, idx: number) => {
        let total = 0;
        let done = 0;
        for (const match of stageMatches(stage)) {
            const decided = isMatchDecided(match);
            const home = match.home ?? match.Home;
            const away = match.away ?? match.Away;
            // A settled bye was never a game, so it doesn't contribute to phase progress.
            if (decided && !home !== !away) continue;
            total++;
            if (decided) done++;
        }
        return { stage, idx, type: Number(stage?.type ?? stage?.Type), total, done };
    }), [stages]);

    // Resolve the default in the same render as the stage change, rather than mounting Group A
    // and replacing it in an effect. Late bracket/team data uses this same path without a tap.
    const groupSelection = useMemo(() => {
        const stage = stages[selectedStageIndex];
        const groups = sortGroupsForTabs(stage);
        const viewerGroupIndex = findViewerGroupIndex(groups, user?.id, userTeam);
        return {
            key: `${id}:${stage?.stageId ?? stage?.StageId ?? selectedStageIndex}`,
            groups,
            viewerGroupIndex,
            activeGroupIndex: selectedGroupIndex !== null && groups[selectedGroupIndex]
                ? selectedGroupIndex
                : Math.max(0, viewerGroupIndex),
        };
    }, [stages, selectedStageIndex, selectedGroupIndex, id, user?.id, userTeam]);

    const handleStagePress = (stageIndex: number) => {
        if (stageIndex === selectedStageIndex) return;
        setSelectedStageIndex(stageIndex);
        setSelectedGroupIndex(null);
    };

    // Chips already laid out won't fire onLayout when late team data changes the selection.
    // This only scrolls the strip; it never triggers another render of the group contents.
    useEffect(() => {
        const x = groupChipX.current[`${groupSelection.key}:${groupSelection.activeGroupIndex}`];
        if (x == null) return;
        const frame = requestAnimationFrame(() => groupStripRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: false }));
        return () => cancelAnimationFrame(frame);
    }, [groupSelection.key, groupSelection.activeGroupIndex]);

    const renderStages = () => {
        // Not fetched yet, or the fetch failed: neither means there is no bracket, and the empty
        // state below offered an organiser "Create bracket" over one that already exists.
        if (stages.length === 0 && (!bracketLoaded || loadingBracket)) {
            return (
                <View className="py-20 items-center justify-center">
                    <ActivityIndicator size="small" color="#10B981" />
                </View>
            );
        }
        if (stages.length === 0 && bracketError) {
            return (
                <View className="py-20 items-center justify-center px-6">
                    <Ionicons name="cloud-offline-outline" size={44} color="#71717A" />
                    <Text className="text-muted-foreground mt-4 text-center">{bracketError}</Text>
                    <Button className="mt-6" onPress={() => fetchBracket()} loading={loadingBracket}>
                        {t('common:retry')}
                    </Button>
                </View>
            );
        }
        if (stages.length === 0) {
            const isCreator = canManage;
            const isRegClosed = tournament?.status === 2;

            return (
                <View className="py-20 items-center justify-center px-6">
                    <Ionicons name="trophy-outline" size={48} color="#71717A" />
                    <Text className="text-muted-foreground mt-4 text-center">
                        {isCreator
                            ? (isRegClosed
                                ? t('details.bracketReadyHint')
                                : t('details.bracketNotReadyHint'))
                            : t('details.bracketNotAvailable')}
                    </Text>

                    {isCreator && isRegClosed && (
                        <Button
                            className="mt-6 w-full"
                            onPress={handleStartBracket}
                            loading={isCreatingBracket}
                        >
                            {t('details.createBracket')}
                        </Button>
                    )}
                </View>
            );
        }

        if (!stageDerivation) return null;
        const { currentStage, stageType, isLosersBracket, swissZones, groupZones, swissTotalRounds, stageRounds, thirdPlaceMatch, grandFinalMatch, grandFinalResetMatch, bracketRounds } = stageDerivation;

        // A match outside the tree (grand final, reset, third place), full width under its heading.
        const renderStandaloneMatch = (match: any) => (
            <BracketMatch
                home={match.home}
                away={match.away}
                startTime={match.startTime}
                status={match.status}
                onPress={() => (tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress)(match)}
                currentUserId={user?.id}
                currentUsername={user?.username}
                isAdmin={canManage}
                isTeamTournament={tournament?.isTeamTournament}
                proposedByUserId={match.proposedByUserId ?? match.ProposedByUserId ?? null}
                teamProgress={teamProgressFrom(match)}
                checkIn={checkInFrom(match)}
            />
        );

        return (
            <View key={currentStage.stageId || selectedStageIndex} className="mb-8">
                {stages.length > 1 && (() => {
                    // Each phase as a tile: what it is, and how far through its matches it is.
                    const renderTile = (tile: (typeof stageTiles)[number], stretch: boolean) => {
                        const active = selectedStageIndex === tile.idx;
                        const waiting = tile.total === 0;
                        const finished = !waiting && tile.done === tile.total;
                        return (
                            <Pressable
                                key={tile.stage.stageId || tile.idx}
                                onPress={() => handleStagePress(tile.idx)}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                                className={cn(
                                    "flex-row items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-2xl border",
                                    stretch ? "flex-1" : "w-[176px]",
                                    active
                                        ? "bg-emerald-500/[0.08] border-emerald-400/35"
                                        : "bg-card border-white/[0.06] active:bg-white/[0.04]"
                                )}
                            >
                                <View className={cn(
                                    "w-[34px] h-[34px] rounded-[11px] items-center justify-center",
                                    active ? "bg-emerald-500/[0.16]" : "bg-white/[0.05]"
                                )}>
                                    <Ionicons name={STAGE_ICONS[tile.type] ?? 'layers'} size={16} color={active ? '#34D399' : COLORS.slate400} />
                                </View>
                                <View className="flex-1">
                                    <Text
                                        className={cn("text-[14px] font-bold", active ? "text-white" : "text-slate-300")}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.8}
                                    >
                                        {tile.stage.name || t('details.stageNumber', { number: tile.idx + 1 })}
                                    </Text>
                                    <View className="flex-row items-center mt-1.5" style={{ gap: 6 }}>
                                        {waiting && <Ionicons name="hourglass-outline" size={11} color={COLORS.slate500} />}
                                        <View className="flex-1 h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                                            {!waiting && (
                                                <View
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${Math.round((tile.done / tile.total) * 100)}%`,
                                                        backgroundColor: active || finished ? '#34D399' : 'rgba(52,211,153,0.55)',
                                                    }}
                                                />
                                            )}
                                        </View>
                                        {finished ? (
                                            <Ionicons name="checkmark-circle" size={13} color="#34D399" />
                                        ) : !waiting ? (
                                            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-[11px] font-semibold text-slate-400">
                                                {tile.done}/{tile.total}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            </Pressable>
                        );
                    };
                    return stages.length <= 2 ? (
                        <View className="flex-row px-4 mb-5" style={{ gap: 10 }}>
                            {stageTiles.map((tile) => renderTile(tile, true))}
                        </View>
                    ) : (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="mb-5"
                            contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
                        >
                            {stageTiles.map((tile) => renderTile(tile, false))}
                        </ScrollView>
                    );
                })()}

                {stageRounds.length > 0 ? (
                    <>
                        {isLosersBracket ? (
                            <LosersBracket
                                rounds={bracketRounds}
                                onMatchPress={tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress}
                                currentUserId={user?.id}
                                currentUsername={user?.username}
                                isAdmin={canManage}
                                onEditDeadline={handleEditDeadline}
                                tournamentStatus={tournament?.status}
                                isTeamTournament={tournament?.isTeamTournament}
                                headerLeft={adminPills}
                            />
                        ) : (
                            <TournamentBracket
                                rounds={bracketRounds}
                                onMatchPress={tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress}
                                currentUserId={user?.id}
                                currentUsername={user?.username}
                                isAdmin={canManage}
                                onEditDeadline={handleEditDeadline}
                                tournamentStatus={tournament?.status}
                                isTeamTournament={tournament?.isTeamTournament}
                                headerLeft={adminPills}
                                showChampion={stageType === 3 && !grandFinalMatch}
                            />
                        )}
                        {grandFinalMatch && (
                            <View className="px-4 mt-6">
                                <BracketSectionTitle
                                    icon="trophy"
                                    color="#FBBF24"
                                    title={t('details.grandFinal')}
                                    format={matchSeriesFormat(grandFinalMatch)}
                                    isTeamTournament={tournament?.isTeamTournament}
                                />
                                {renderStandaloneMatch(grandFinalMatch)}
                            </View>
                        )}
                        {grandFinalResetMatch && (
                            <View className="px-4 mt-6">
                                <BracketSectionTitle
                                    icon="trophy"
                                    color="#FBBF24"
                                    title={t('details.grandFinalReset')}
                                    format={matchSeriesFormat(grandFinalResetMatch)}
                                    isTeamTournament={tournament?.isTeamTournament}
                                />
                                {renderStandaloneMatch(grandFinalResetMatch)}
                            </View>
                        )}
                        {grandFinalMatch && (() => {
                            // The reset, when the losers-bracket side forced one, is what crowns.
                            const decider = grandFinalResetMatch ?? grandFinalMatch;
                            const champion = decider.status === 4
                                ? (decider.home?.isWinner ? decider.home : decider.away?.isWinner ? decider.away : null)
                                : null;
                            return (
                                <View className="px-4 mt-4">
                                    <ChampionPlate champion={champion} isTeamTournament={tournament?.isTeamTournament} />
                                </View>
                            );
                        })()}
                        {thirdPlaceMatch && (thirdPlaceMatch.home || thirdPlaceMatch.away) && (
                            <View className="px-4 mt-6">
                                <BracketSectionTitle
                                    icon="medal"
                                    color="#D4925A"
                                    title={t('details.thirdPlaceMatch')}
                                    format={matchSeriesFormat(thirdPlaceMatch)}
                                    isTeamTournament={tournament?.isTeamTournament}
                                    expanded={isThirdPlaceExpanded}
                                    onToggle={() => setIsThirdPlaceExpanded(prev => !prev)}
                                />
                                {isThirdPlaceExpanded && renderStandaloneMatch(thirdPlaceMatch)}
                            </View>
                        )}
                    </>
                ) : currentStage.groups && currentStage.groups.length > 0 ? (
                    <View>
                        {/* Group stages have no zoom-controls row — show the admin pills on their own */}
                        {adminPills && (
                            <View className="px-4 mb-4 flex-row">{adminPills}</View>
                        )}
                        {(() => {
                            const { groups: sortedGroups, viewerGroupIndex, activeGroupIndex, key: groupKey } = groupSelection;
                            return (
                                <>
                                    <ScrollView
                                        ref={groupStripRef}
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        className="mb-5"
                                        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
                                    >
                                        {sortedGroups.map((group: any, idx: number) => {
                                            const active = activeGroupIndex === idx;
                                            return (
                                                <Pressable
                                                    key={group.groupId || idx}
                                                    onPress={() => setSelectedGroupIndex(idx)}
                                                    // The viewer's group can sit far down the strip — bring it into view
                                                    // when the tab opens on it.
                                                    onLayout={(e) => {
                                                        groupChipX.current[`${groupKey}:${idx}`] = e.nativeEvent.layout.x;
                                                        if (active) groupStripRef.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 16), animated: false });
                                                    }}
                                                    accessibilityRole="tab"
                                                    accessibilityState={{ selected: active }}
                                                    className={cn(
                                                        "h-9 flex-row items-center gap-1.5 px-4 rounded-full border",
                                                        active
                                                            ? "bg-emerald-500/[0.14] border-emerald-400/40"
                                                            : "bg-card border-white/[0.06] active:bg-white/[0.05]"
                                                    )}
                                                >
                                                    {/* Where the viewer plays */}
                                                    {idx === viewerGroupIndex && (
                                                        <View className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    )}
                                                    <Text className={cn(
                                                        "text-[13px] font-bold",
                                                        active ? "text-emerald-300" : "text-slate-400"
                                                    )}>
                                                        {group.name || groupName(idx, sortedGroups.length)}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>

                                    {sortedGroups[activeGroupIndex] && (
                                        <TournamentGroups
                                            groups={[sortedGroups[activeGroupIndex]]}
                                            onMatchPress={tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress}
                                            currentUserId={user?.id}
                                            currentUsername={user?.username}
                                            isAdmin={canManage}
                                            onEditDeadline={handleEditDeadline}
                                            tournamentStatus={tournament?.status}
                                            qualificationZones={swissZones ?? groupZones}
                                            totalRounds={swissTotalRounds}
                                            isTeamTournament={tournament?.isTeamTournament}
                                        />
                                    )}
                                </>
                            );
                        })()}
                    </View>
                ) : (
                    <View className="py-12 items-center justify-center px-6">
                        <Ionicons name="time-outline" size={32} color="#475569" />
                        <Text className="text-sm font-bold text-slate-400 mt-3 text-center">
                            {stageType === 7
                                ? t('details.waitingSwiss')
                                : stageType === 3 && (stages.length > 1)
                                    ? (stages.some((s: any) => (s.type ?? s.Type) === 7)
                                        ? t('details.waitingPlayIn')
                                        : t('details.waitingPreviousStage'))
                                    : t('details.noRoundsOrGroups')}
                        </Text>
                        <Text className="text-xs text-slate-600 mt-1 text-center">
                            {t('details.matchesAppearLater')}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    // One element for every state of the page below. It sits at the same place in all three, so
    // a match opened from a push is presented over the loading page and stays the same modal when
    // the tournament lands — instead of the page loading first and the modal sliding up after it.
    const matchDetailsModal = (
        <MatchDetailsModal
            visible={showReportModal}
            holdUntilReady={matchFromLink}
            contextReady={!!tournament || !!error}
            onClose={() => {
                modalReturn.clear();
                setShowReportModal(false);
                setMatchFromLink(false);
                // If this game was opened from a team match, drop back onto the team overview.
                // Defer + guard with isFocused: the solo modal also calls onClose right before
                // navigating to a player's profile, and we must not re-raise the team modal on
                // top of that pushed screen — only restore it on a genuine dismiss.
                if (returnToTeamMatchId) {
                    const back = returnToTeamMatchId;
                    setReturnToTeamMatchId(null);
                    matchModalHandoff.after(() => {
                        if (navigation.isFocused()) {
                            setSelectedTeamMatchId(back);
                            setShowTeamMatchDetail(true);
                        }
                    });
                }
            }}
            onDismiss={matchModalHandoff.onDismiss}
            matchId={selectedMatch?.id}
            tournamentId={id}
            tournamentName={tournament?.name}
            roundName={selectedMatch?.roundName || t('details.matchDetails')}
            opponentName={selectedMatch?.away?.username}
            // formatDateTimeShort parses as UTC (backend timestamps carry no Z suffix, so raw
            // parsing reads the UTC clock as local and shows a shifted kick-off time) and
            // stacks the clock under the date for the narrow Match Time tile.
            scheduledTime={selectedMatch?.startTime ? formatDateTimeShort(selectedMatch.startTime, '\n') : undefined}
            // Bracket matches already carry their round deadline, so the modal can show it
            // immediately instead of waiting for the details round-trip to fill it in.
            deadline={selectedMatch?.roundDeadline ?? selectedMatch?.RoundDeadline ?? undefined}
            status={
                // NoShow (5) maps to 'completed' too: it's a terminal, admin-set outcome, so the
                // modal shows the result view (with its no-show framing) and its Edit / Delete
                // actions instead of an empty "report your score" form.
                selectedMatch?.status === 3 || selectedMatch?.status === 4 || selectedMatch?.status === 5 ? 'completed' :
                    selectedMatch?.status === 2 ? 'ready_phase' :
                        selectedMatch?.status === 1 ? 'scheduled' :
                            selectedMatch?.status === 0 ? 'pending_availability' : 'ready_phase'
            }
            home={selectedMatch?.home}
            away={selectedMatch?.away}
            evidences={selectedMatch?.evidences}
            hubOwnerId={hubOwnerId}
            canManage={canManage}
            isRoundLocked={selectedMatch?.isRoundLocked}
            canRevert={selectedMatch?.canRevert}
            stage={selectedMatch?.stage ?? selectedMatch?.Stage}
            nextMatchId={selectedMatch?.nextMatchId ?? selectedMatch?.NextMatchId}
            nextMatchLoserBracketId={selectedMatch?.nextMatchLoserBracketId ?? selectedMatch?.NextMatchLoserBracketId}
            requireResultApproval={bracketRequireResultApproval || (tournament as any)?.requireResultApproval || (tournament as any)?.RequireResultApproval || false}
            tournamentStatus={tournament?.status !== undefined ? Number(tournament.status) : undefined}
            defaultTab={matchModalDefaultTab}
            onTabChange={tab => { matchActiveTabRef.current = tab; }}
            onOpenProfile={handleOpenProfileFromMatch}
            onMatchUpdate={(freshStructure?: any) => {
                void invalidateTournamentLists(queryClient);
                // Backend now returns the refreshed bracket structure inline on
                // matchResult / approve / reject, so we can update local state directly
                // without a follow-up GET_TOURNAMENT_STRUCTURE round-trip. Falls back to
                // fetchBracket() for actions that don't (yet) piggy-back the structure.
                if (freshStructure) {
                    requests.begin('fetchBracket');
                    void queryClient.cancelQueries({ queryKey: tournamentResourceKey(id, user?.id, 'bracket'), exact: true });
                    queryClient.setQueryData(tournamentResourceKey(id, user?.id, 'bracket'), freshStructure);
                    setLoadingBracket(false);
                    setBracketLoaded(true);
                    setBracketError(null);
                    setFailedRefreshes((failures) => withRefreshResult(failures, 'bracket', true));
                    setStages(freshStructure.stages || []);
                    if (freshStructure.hubOwnerId || freshStructure.HubOwnerId) {
                        setHubOwnerId(freshStructure.hubOwnerId || freshStructure.HubOwnerId);
                    }
                    setBracketCanManage(freshStructure.canManage ?? freshStructure.CanManage ?? false);
                    setBracketRequireResultApproval(freshStructure.requireResultApproval ?? freshStructure.RequireResultApproval ?? false);
                } else {
                    fetchBracket();
                }
                // Pill counts (approvals / admin help) come from the BadgesContext cascade.
                // The SignalR push covers participants, but an organizer approving someone
                // else's result isn't pushed on every path — invalidate eagerly so the
                // bracket-tab pill drops the moment the action lands instead of after the
                // next background refetch. The lists themselves stay on-demand (pill tap).
                refreshBadges();
                // The HELP REQUESTS pill renders from this locally fetched list (not the
                // cascade), and resolving from the match modal doesn't re-enter the bracket
                // tab — refetch it here or the resolved request keeps its pill count.
                if (canManage) fetchAdminHelpRequests();
            }}
        />
    );

    // Mounted for as long as a team match is selected, so it can be hidden for a game's page or a
    // profile and come back as it was — and, like the match modal, presented over the loading page.
    const teamMatchModal = selectedTeamMatchId ? (
        <TeamMatchDetailModal
            visible={showTeamMatchDetail}
            onClose={() => { modalReturn.clear(); setShowTeamMatchDetail(false); setSelectedTeamMatchId(null); }}
            onDismiss={teamModalHandoff.onDismiss}
            onOpenProfile={handleOpenProfileFromTeamMatch}
            matchId={selectedTeamMatchId}
            tournamentId={id}
            hubOwnerId={hubOwnerId}
            canManage={canManage}
            currentUserId={user?.id}
            onOpenSubMatch={handleOpenSubMatchFromTeam}
            onMatchUpdate={() => {
                void invalidateTournamentLists(queryClient);
                fetchBracket();
                if (tournament?.isTeamTournament) fetchTournamentTeams(id);
            }}
        />
    ) : null;

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title={t('details.headerTournament')} showBack />
                <View accessibilityLabel={t('details.loadingTournament')} accessibilityRole="progressbar">
                    <TournamentDetailsSkeleton />
                </View>
                {matchDetailsModal}
                {teamMatchModal}
            </SafeAreaView>
        );
    }

    if (error || !tournament) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <PageHeader title={t('details.headerTournament')} showBack />
                <View className="flex-1 items-center justify-center px-6">
                    <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text className="text-destructive mt-4 text-center font-medium">{error || t('details.tournamentNotFound')}</Text>
                    <Button onPress={() => fetchTournamentDetails()} className="mt-6">{t('common:retry')}</Button>
                </View>
                {matchDetailsModal}
                {teamMatchModal}
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title={t('details.headerTournament')}
                showBack
                rightElement={
                    <View className="flex-row items-center gap-2">
                        {activeTab === 'bracket' && stages.length > 0 && (
                            <Pressable
                                onPress={handleExportPress}
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
                        {/* Nothing more is sent about a finished or cancelled tournament, so nothing to mute. */}
                        {Number(tournament.status) < 4 && (
                            <SourceNotificationsButton
                                kind="tournaments"
                                id={id}
                                name={tournament.name || t('details.headerTournament')}
                                avatarUrl={(tournament as any).hubAvatarUrl ?? (tournament as any).HubAvatarUrl}
                                hubId={tournament.hubId}
                                hubName={tournament.hubName}
                                // Same "your tournaments" as Settings → Notifications: organising, playing or signed up.
                                involved={canManage || isUserRegistered || !!userTeam || (!!user?.username && participants.some(p =>
                                    (p.username || p.Username)?.toLowerCase() === user.username.toLowerCase()))}
                            />
                        )}
                        <Pressable
                            onPress={handleShare}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                            accessibilityLabel={t('details.shareTournament')}
                        >
                            <Ionicons name="share-outline" size={20} color="#FAFAFA" />
                        </Pressable>
                        {canManage && (
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
            <ScrollView
                className="flex-1 bg-background"
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor="#10B981"
                        colors={['#10B981']}
                        progressBackgroundColor="#111827"
                    />
                }
            >
                <View className="animate-slide-up">
                    {failedRefreshes.size > 0 && (
                        <RefreshFailedBanner
                            className="mx-4 mt-3"
                            retrying={isRetryingRefresh}
                            onRetry={async () => {
                                setIsRetryingRefresh(true);
                                try {
                                    // What failed, and only that: a stale bracket is retried even
                                    // when the overview is fine, and the other way round.
                                    await retryFailedRefreshes(failedRefreshes, {
                                        overview: () => fetchTournamentDetails(true),
                                        bracket: () => fetchBracket(true),
                                        participants: () => fetchParticipants(),
                                        pending: () => fetchPendingRegistrations(),
                                        teams: () => fetchTournamentTeams(id),
                                        'pending-teams': () => failedRefreshes.has('teams') ? Promise.resolve() : fetchTournamentTeams(id),
                                    });
                                } finally {
                                    setIsRetryingRefresh(false);
                                }
                            }}
                        />
                    )}

                    {/* Hero: the tournament's cover, in its share card's violet and gold. Status and
                        access pills, the name, how many are in and the hub hosting it; the sign-up
                        actions sit under the cover. */}
                    {(() => {
                        const isCreator = canManage;
                        const isParticipant = participants.some(p =>
                            (p.username || p.Username)?.toLowerCase() === user?.username?.toLowerCase()
                        );
                        const isOpenOrUpcoming = (tournament.status === 0 || tournament.status === 1) && !isWaitingToOpen;
                        const attendeeCount = tournament?.isTeamTournament ? tournamentTeams.length : (tournament.numberOfParticipants || 0);
                        const currentAttendeeCount = attendeeCount;
                        const isFull = tournament.maxPlayers > 0 && currentAttendeeCount >= tournament.maxPlayers;

                        // Region/country eligibility — mirrors the backend feed filter so the
                        // hub-navigation path can't surface a Join button the user can't use.
                        const tournamentCountries: string[] = tournament.countries || [];
                        const isCountryScoped = tournamentCountries.length > 0;
                        const isRegionCountryEligible = isCountryScoped
                            ? (!!user?.country && tournamentCountries.includes(user.country))
                            : (tournament.region === TournamentRegion.Global || tournament.region === user?.region);
                        // Exclusive tournaments need an Exclusive-or-higher hub role; the server
                        // reports this via hasExclusiveAccess so plain members don't see Join.
                        const isExclusiveEligible = !tournament.isExclusive || tournament.hasExclusiveAccess === true;
                        const isEligible = isRegionCountryEligible && isExclusiveEligible;
                        const restrictionLabel = !isExclusiveEligible
                            ? t('details.exclusiveMembersOfHub')
                            : isCountryScoped
                                ? (tournamentCountries.length <= 3
                                    ? `${(tournament.countryFlags || []).join(' ')} ${(tournament.countryNames || tournamentCountries).join(', ')}`.trim()
                                    : t('details.countriesCount', { count: tournamentCountries.length }))
                                : t('details.thisRegion');

                        const buttons = [];

                        // Surface a "restricted" note (instead of a join button) when the user
                        // would otherwise be able to join but isn't eligible by region/country.
                        const wouldJoin = !isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull
                            && (!tournament.isTeamTournament ? true : (!userTeam && teamsLoaded));

                        if (wouldJoin && !isEligible) {
                            buttons.push(
                                <View key="restricted" className="w-full bg-[#0D1525] border border-white/[0.06] rounded-2xl p-4 flex-row items-center gap-3">
                                    <Ionicons name="lock-closed" size={18} color="#64748B" />
                                    <Text className="flex-1 text-slate-400 text-sm font-medium">
                                        {t('details.restrictedNotice', { restriction: restrictionLabel })}
                                    </Text>
                                </View>
                            );
                        } else if (participantsLoaded && !isParticipant && isUserRegistered && isOpenOrUpcoming && !tournament.isTeamTournament) {
                            // HasUserRegistered is also true for a confirmed player, so this waits for the
                            // roster: before it lands, every confirmed player saw "pending" flash.
                            buttons.push(
                                <View key="pending-approval" className="w-full bg-[#1A1607] border border-amber-500/20 rounded-2xl p-4 flex-row items-center gap-3">
                                    <View className="w-9 h-9 rounded-xl bg-amber-500/10 items-center justify-center">
                                        <Ionicons name="hourglass-outline" size={18} color="#F59E0B" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-amber-300 text-sm font-black tracking-tight">
                                            {t('details.pendingApproval')}
                                        </Text>
                                        <Text className="text-slate-400 text-xs mt-0.5">
                                            {t('details.pendingApprovalHint')}
                                        </Text>
                                    </View>
                                </View>
                            );
                        } else if (tournament.isTeamTournament) {
                            // Show nothing until the viewer's team is known (prevents flash of register button)
                            if (!teamsLoaded) {
                                // render nothing — button appears smoothly once data resolves
                            } else if (!userTeam && !isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull && isEligible) {
                                buttons.push(
                                    <Button
                                        key="team-register"
                                        className="w-full"
                                        onPress={() => setShowTeamRegistration(true)}
                                    >
                                        {tTeam('registerCreateJoin')}
                                    </Button>
                                );
                                // Private: the team sheet asks for the code when the captain
                                // doesn't already hold one, so only the "applied" note lives here.
                                if (tournament.isPrivate && !canManage && inviteCode) {
                                    buttons.push(renderInviteCodeApplied());
                                }
                            }
                        } else {
                            // Solo tournament: existing flow
                            if (!isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull && isEligible) {
                                // Private tournament without a code in hand: the button asks for
                                // it first (the sheet then signs the player up in one go).
                                const needsCode = !!tournament.isPrivate && !canManage && !inviteCode;
                                buttons.push(
                                    <Button
                                        key="join"
                                        className="w-full"
                                        onPress={() => (needsCode ? setShowCodePrompt(true) : handleJoin())}
                                        loading={isRegistering}
                                    >
                                        {needsCode ? t('details.enterCodeToJoin') : t('details.joinTournament')}
                                    </Button>
                                );
                                if (needsCode) {
                                    buttons.push(
                                        <View key="private-hint" className="flex-row items-center justify-center gap-1.5 -mt-1">
                                            <Ionicons name="lock-closed" size={12} color={PRIVATE_COLORS.icon} />
                                            <Text className="text-[11px] font-semibold" style={{ color: PRIVATE_COLORS.text }}>
                                                {t('details.privateJoinHint')}
                                            </Text>
                                        </View>
                                    );
                                } else if (tournament.isPrivate && !canManage && inviteCode) {
                                    buttons.push(renderInviteCodeApplied());
                                }
                            }
                        }

                        const statusPill = STATUS_PILL[Number(tournament.status)];

                        return (
                            <HeroFrame className="mx-4 mt-3" hairline={TOURNAMENT_HAIRLINE}>
                                <HeroBanner colors={TOURNAMENT_BANNER} watermark="trophy">
                                    <View style={{ padding: 18 }}>
                                        {/* Clear of the trophy in the top-right corner */}
                                        <View className="flex-row flex-wrap items-center" style={{ gap: 6, paddingRight: 64 }}>
                                            {statusPill && (
                                                <CoverPill
                                                    dotColor={statusPill.dot}
                                                    glow={Number(tournament.status) === 3}
                                                    label={t(statusPill.labelKey)}
                                                />
                                            )}
                                            {tournament.isPrivate && <PrivateBadge size="pill" />}
                                            {tournament.isExclusive && (
                                                <CoverPill icon="sparkles" iconColor="#F0ABFC" label={t('hub:role.exclusive')} tint="rgba(232,121,249,0.16)" border="rgba(232,121,249,0.4)" />
                                            )}
                                        </View>

                                        <Text
                                            className="text-[26px] leading-[31px] font-black text-white tracking-tight mt-3"
                                            numberOfLines={3}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.75}
                                        >
                                            {tournament.name}
                                        </Text>

                                        <View className="flex-row items-center mt-2" style={{ gap: 6 }}>
                                            <Ionicons name="people" size={14} color={COVER_MUTED} />
                                            <Text className="text-[13px] font-semibold" style={{ color: COVER_TEXT }}>
                                                {tournament?.isTeamTournament
                                                    ? t('details.teamsCount', { count: tournamentTeams.length })
                                                    : t('details.participantsCount', { count: tournament.numberOfParticipants || 0 })}
                                            </Text>
                                        </View>

                                        {!!tournament.hubName && !!tournament.hubId && (
                                            <Pressable
                                                onPress={() => navigation.navigate('HubProfile', { id: tournament.hubId })}
                                                accessibilityRole="link"
                                                hitSlop={6}
                                                className="flex-row items-center self-start mt-1.5 gap-1.5 active:opacity-70"
                                            >
                                                <Ionicons name="planet" size={14} color={COVER_MUTED} />
                                                <Text className="text-[13px] font-bold text-white shrink" numberOfLines={1}>
                                                    {tournament.hubName}
                                                </Text>
                                                <Ionicons name="chevron-forward" size={13} color={COVER_MUTED} />
                                            </Pressable>
                                        )}
                                    </View>
                                </HeroBanner>

                                {buttons.length > 0 && <View className="p-4 gap-3">{buttons}</View>}
                            </HeroFrame>
                        );
                    })()}

                    <View className="px-5 mt-4 mb-4">
                        <PremiumTabs
                            tabs={tabs}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                        />
                    </View>

                    {activeTab === 'overview' && (() => {
                        const status = Number(tournament.status);
                        const isTeam = !!tournament?.isTeamTournament;
                        const started = status === 3 || status === 4;
                        const attendees = isTeam ? tournamentTeams.length : (tournament.numberOfParticipants || 0);
                        const max = Number(tournament.maxPlayers) || 0;
                        const hasPrize = !!tournament.prize && Number(tournament.prize) > 0;

                        // Everything the old General Info listed, two per row. Prize, player count and
                        // format sit in the numbers row above; the hub is on the cover. Each group starts a
                        // new row: the deadline and the start date share one, the bracket draw closes the list.
                        const opensGroup: DetailItem[] = [];
                        const dateGroup: DetailItem[] = [];
                        const drawGroup: DetailItem[] = [];
                        const details: DetailItem[] = [
                            {
                                key: 'mode',
                                icon: 'game-controller',
                                color: '#34D399',
                                label: t('details.modeLabel'),
                                value: isTeam ? tTeam('modeTeam') : tTeam('modeSolo'),
                            },
                        ];
                        if (isTeam) {
                            details.push({
                                key: 'teamSize',
                                icon: 'people-circle',
                                color: '#F472B6',
                                label: t('details.teamSizeLabel'),
                                value: `${tournament.teamSize || '?'}v${tournament.teamSize || '?'}`,
                            });
                        }
                        if (tournament.countries && tournament.countries.length === 1) {
                            details.push({
                                key: 'region',
                                icon: 'flag',
                                color: '#34D399',
                                label: t('details.countryLabel'),
                                value: `${tournament.countryFlags?.[0] ? tournament.countryFlags[0] + ' ' : ''}${tournament.countryNames?.[0] ?? tournament.countries[0]}`,
                            });
                        } else if (tournament.countries && tournament.countries.length > 1) {
                            details.push({
                                key: 'region',
                                icon: 'flag',
                                color: '#34D399',
                                label: t('details.countriesLabel'),
                                value: t('details.countriesCount', { count: tournament.countries.length }),
                                onPress: () => setShowCountriesModal(true),
                            });
                        } else {
                            details.push({
                                key: 'region',
                                icon: 'globe',
                                color: '#34D399',
                                label: t('details.regionLabel'),
                                value: tournament.region === TournamentRegion.Europe ? 'EU'
                                    : tournament.region === TournamentRegion.NorthAmerica ? 'NA'
                                        : tournament.region === TournamentRegion.Asia ? 'Asia'
                                            : tournament.region === TournamentRegion.SouthAmerica ? 'SA'
                                                : tournament.region === TournamentRegion.Africa ? 'AFR'
                                                    : tournament.region === TournamentRegion.Oceania ? 'OCE'
                                                        : t('details.regionGlobal'),
                            });
                        }
                        // Only once the bracket exists (InProgress / Completed). A started tournament
                        // with no recorded mode predates the draw picker, and every one of those was
                        // drawn at random.
                        if (started) {
                            drawGroup.push({
                                key: 'draw',
                                icon: 'git-network',
                                color: '#22D3EE',
                                label: t('details.bracketDrawLabel'),
                                value: getBracketSeedingModeLabel(tournament.bracketSeedingMode, t),
                            });
                        }
                        // Dates side by side. A scheduled opening shows while sign-ups wait for it, and
                        // the deadline turns amber for as long as sign-ups are open.
                        if (isWaitingToOpen) {
                            opensGroup.push({
                                key: 'opens',
                                icon: 'lock-open-outline',
                                color: '#818CF8',
                                label: t('details.registrationOpensLabel'),
                                value: formatDateTimeShort(tournament.registrationOpensAt),
                                valueColor: '#A5B4FC',
                            });
                        }
                        if (tournament.registrationDeadline) {
                            dateGroup.push({
                                key: 'deadline',
                                icon: 'time-outline',
                                color: '#EF4444',
                                label: t('details.regDeadlineLabel'),
                                value: formatDateTimeShort(tournament.registrationDeadline),
                                valueColor: (status === 0 || status === 1) ? '#FBBF24' : undefined,
                            });
                        }
                        dateGroup.push({
                            key: 'start',
                            icon: 'calendar',
                            color: '#60A5FA',
                            label: t('details.startDateLabel'),
                            value: tournament.startDate
                                ? new Date(tournament.startDate).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
                                : tCommon('app.tbd'),
                        });
                        if (isTeam && tournament.teamWinCondition !== null) {
                            details.push({
                                key: 'winCondition',
                                icon: 'podium',
                                color: '#FBBF24',
                                label: t('details.winConditionLabel'),
                                value: (tournament.teamWinCondition === 1 || tournament.teamWinCondition === 'AggregateScore')
                                    ? t('teamWinCondition.aggregateScore')
                                    : t('teamWinCondition.matchWins'),
                            });
                        }
                        if (tournament.isPrivate) {
                            details.push({
                                key: 'visibility',
                                icon: 'lock-closed',
                                color: PRIVATE_COLORS.icon,
                                label: t('details.visibilityLabel'),
                                value: t('details.privateInviteOnly'),
                                valueColor: PRIVATE_COLORS.text,
                            });
                        }
                        if (tournament.isExclusive) {
                            details.push({
                                key: 'access',
                                icon: 'sparkles',
                                color: '#E879F9',
                                label: t('details.accessLabel'),
                                value: t('details.exclusiveMembers'),
                                valueColor: '#F0ABFC',
                            });
                        }

                        return (
                            <View className="px-4 pb-12" style={{ gap: 10 }}>
                                {/* Private tournament: the organiser's code + share, while players can
                                    still get in. Nothing announces a private tournament, so this card is
                                    how it reaches anyone at all. */}
                                {canManage && tournament.isPrivate && isPreStart && (
                                    <PrivateInviteCard tournamentId={id} tournamentName={tournament.name} />
                                )}

                                {/* Hub Owner Close Registration Button — nothing to close while a
                                    scheduled tournament is still waiting for its opening time. */}
                                {canManage &&
                                    (tournament?.status === 0 || tournament?.status === 1) &&
                                    !isWaitingToOpen && (
                                        <Button
                                            className="w-full bg-destructive"
                                            onPress={handleCloseRegistration}
                                            loading={isTogglingRegistration}
                                        >
                                            {t('details.closeRegistration')}
                                        </Button>
                                    )}

                                {/* Hub Owner Open Registration Button. Also the "open early" override for
                                    a scheduled tournament (status 0 + an opening time), which the server
                                    accepts as the same transition. */}
                                {canManage &&
                                    (tournament?.status === 2 || isWaitingToOpen) && (
                                        <Button
                                            className="w-full bg-primary"
                                            onPress={handleOpenRegistration}
                                            loading={isTogglingRegistration}
                                        >
                                            {tournament?.status === 2 ? t('details.openRegistration') : t('details.openRegistrationNow')}
                                        </Button>
                                    )}

                                {/* My Team — an action, so it comes before the facts */}
                                {tournament.isTeamTournament && userTeam && (
                                    <Pressable
                                        onPress={() => navigation.navigate('TeamDashboard', { teamId: userTeam.teamId, tournamentId: id, teamSize: tournament?.teamSize, tournamentStatus: tournament?.status })}
                                        accessibilityRole="button"
                                        className="bg-card border border-team/30 rounded-[20px] px-4 py-3 flex-row items-center gap-3 active:opacity-80"
                                    >
                                        <View className="w-10 h-10 bg-team/10 rounded-2xl items-center justify-center border border-team/20">
                                            <Ionicons name="shield-half" size={20} color="#00E5A0" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white font-black text-base tracking-wide">{tTeam('myTeamButton')}</Text>
                                            <Text className="text-team/80 text-[10px] font-bold tracking-widest uppercase mt-0.5">{t('details.manageYourRoster')}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color="#00E5A0" />
                                    </Pressable>
                                )}

                                {/* ─── Info: the numbers, then every detail in two columns ─── */}
                                <Panel style={{ paddingTop: 14, paddingBottom: 16 }}>
                                    <View className="flex-row items-center" style={{ paddingHorizontal: 4 }}>
                                        <StatCell
                                            icon="trophy"
                                            iconColor="rgba(251,191,36,0.85)"
                                            value={hasPrize ? `${tournament.prize} ${getCurrencyLabel(tournament.prizeCurrency)}` : '–'}
                                            label={t('details.prizePool')}
                                            valueColor={hasPrize ? '#FBBF24' : COLORS.slate600}
                                            valueSize={hasPrize ? 20 : 22}
                                        />
                                        <StatDivider />
                                        <StatCell
                                            icon="people"
                                            iconColor="rgba(129,140,248,0.8)"
                                            value={max > 0 ? `${attendees}/${max}` : String(attendees)}
                                            label={isTeam ? tCommon('share.teams') : tCommon('share.players')}
                                        />
                                        <StatDivider />
                                        <StatCell
                                            icon="list"
                                            iconColor="rgba(167,139,250,0.8)"
                                            value={getTournamentFormatLabel(Number(tournament.format), t)}
                                            label={t('details.formatLabel')}
                                            valueSize={14}
                                            lines={2}
                                        />
                                    </View>

                                    {/* How full it is, while spots can still fill up */}
                                    {max > 0 && !started && (
                                        <View className="mx-4 mt-3.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                            <LinearGradient
                                                colors={['#818CF8', '#C084FC']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={{ width: `${Math.min(100, (attendees / max) * 100)}%`, height: '100%', borderRadius: 999 }}
                                            />
                                        </View>
                                    )}

                                    <View className="mx-4 my-4 h-px bg-white/[0.06]" />
                                    <View style={{ paddingHorizontal: 16 }}>
                                        <DetailGrid groups={[details, opensGroup, dateGroup, drawGroup]} />
                                    </View>
                                </Panel>

                                {/* ─── Description ─── */}
                                <Panel style={{ padding: 16 }}>
                                    <PanelTitle icon="document-text" color="#FBBF24" title={t('details.descriptionTitle')} />
                                    <ExpandableText text={tournament.description || t('details.descriptionFallback')} collapsedLines={4} accentColor="#C4B5FD" />
                                </Panel>

                                {/* ─── Rules ─── */}
                                <Panel style={{ padding: 16 }}>
                                    <PanelTitle icon="shield-checkmark" color="#A78BFA" title={t('details.rulesTitle')} />
                                    <ExpandableText text={tournament.rules || t('details.rulesFallback')} collapsedLines={4} accentColor="#C4B5FD" />
                                </Panel>
                            </View>
                        );
                    })()}

                    {activeTab === 'bracket' && (
                        <View className="py-4 pb-12">
                            {renderBracketAdminActions()}
                            {renderStages()}
                        </View>
                    )}

                    {/* Teams Tab (team tournaments only) */}
                    {activeTab === 'teams' && tournament?.isTeamTournament && (
                        <View className="px-4 py-4 gap-3 pb-12">
                            <View className="flex-row items-center gap-2 mb-4">
                                <Ionicons name="people-outline" size={20} color="#00E5A0" />
                                <Text className="text-lg font-bold text-white">{tTeam('teamsSectionTitle')}</Text>
                            </View>

                            {/* Sub Tabs */}
                            <View className="mb-4">
                                <PremiumTabs
                                    tabs={[
                                        { value: 'confirmed', label: t('details.tabConfirmed'), icon: 'checkmark-circle-outline' },
                                        ...((tournament?.status ?? 99) < 3 ? [{ value: 'open', label: t('details.tabOpen'), icon: 'open-outline' as const }] : []),
                                        ...(canManage && isPreStart ? [{
                                            value: 'registrations', label: t('details.tabRequests'), icon: 'hourglass-outline' as const,
                                            badge: pendingRegCount > 0 ? pendingRegCount : undefined,
                                            badgeTone: 'alert' as const,
                                        }] : []),
                                    ]}
                                    activeTab={teamsTab}
                                    onTabChange={setTeamsTab}
                                />
                            </View>

                            {/* Confirmed Teams — one panel, a row per team; tapping a row opens its roster */}
                            {teamsTab === 'confirmed' && (
                                !teamsLoaded ? (
                                    <ActivityIndicator size="small" color="#00E5A0" />
                                ) : teamsError && tournamentTeams.length === 0 ? (
                                    <LoadFailedState onRetry={() => fetchTournamentTeams(id)} />
                                ) : tournamentTeams.length === 0 ? (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">{tTeam('noTeamsRegistered')}</Text>
                                    </View>
                                ) : (
                                    <Panel>
                                        {tournamentTeams.map((teamRow, index) => {
                                            const teamId = teamRow.teamId || teamRow.TeamId;
                                            const teamName = teamRow.teamName || teamRow.TeamName;
                                            const roster = rosterInfo(teamRow, tournament);
                                            const isExpanded = expandedTeamId === teamId;
                                            const isPending = teamRow.userRequestStatus === 'Pending' || teamRow.UserRequestStatus === 'Pending';
                                            const needsApproval = !!(teamRow.requiresApproval || teamRow.RequiresApproval);

                                            return (
                                                <TeamRosterRow
                                                    key={teamId || index.toString()}
                                                    tone="confirmed"
                                                    teamName={teamName}
                                                    roster={roster}
                                                    captainUserId={teamRow.captainUserId || teamRow.CaptainUserId}
                                                    first={index === 0}
                                                    expanded={isExpanded}
                                                    onToggle={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                    onOpenProfile={openPlayerProfile}
                                                    isOnBench={isMemberOnBench}
                                                    openSlots={roster.teamSize > 0 ? roster.rosterCapacity - roster.members.length : 0}
                                                    // Remove Team — organiser only, and only before the start: once LIVE the
                                                    // roster is locked into the bracket and removing a team would orphan fixtures.
                                                    actions={canManage && isPreStart ? (
                                                        <Pressable
                                                            onPress={() => handleRemoveTeam(teamId as string, teamName as string)}
                                                            disabled={removingTeamId === teamId}
                                                            accessibilityRole="button"
                                                            className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-60"
                                                        >
                                                            {removingTeamId === teamId ? (
                                                                <ActivityIndicator size="small" color="#EF4444" />
                                                            ) : (
                                                                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                                            )}
                                                        </Pressable>
                                                    ) : undefined}
                                                    // Room anywhere on the roster counts — a full lineup can still take
                                                    // bench players, so gate on capacity, not on the lineup.
                                                    footer={(!userTeam && !isUserRegistered && roster.hasRoom) ? (
                                                        <Button
                                                            className={needsApproval ? 'bg-blue-500 py-3 rounded-2xl w-full mt-1' : 'bg-team py-3 rounded-2xl w-full mt-1'}
                                                            onPress={() => handleJoinTeam(teamId as string, needsApproval)}
                                                            loading={joiningTeamId === teamId}
                                                            disabled={joiningTeamId !== null || isPending}
                                                        >
                                                            <Text numberOfLines={1} className={needsApproval ? 'text-white font-black uppercase tracking-widest text-sm text-center w-full' : 'text-primary-foreground font-black uppercase tracking-widest text-sm text-center w-full'}>
                                                                {isPending
                                                                    ? t('details.requestPending')
                                                                    : needsApproval ? t('details.requestToJoin') : t('details.joinThisTeam')}
                                                            </Text>
                                                        </Button>
                                                    ) : undefined}
                                                />
                                            );
                                        })}
                                    </Panel>
                                )
                            )}

                            {/* Open Teams */}
                            {teamsTab === 'open' && tournament?.status < 3 && (
                                !openTeamsLoaded ? (
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                ) : openTeamsError && openTeams.length === 0 ? (
                                    <LoadFailedState className="mt-2" onRetry={fetchOpenTeams} />
                                ) : openTeams.length === 0 ? (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center mt-2">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">{t('details.noOpenTeams')}</Text>
                                    </View>
                                ) : (
                                    <Panel>
                                        {openTeams.map((teamRow, index) => {
                                            const teamId = teamRow.teamId || teamRow.TeamId;
                                            const teamName = teamRow.teamName || teamRow.TeamName;
                                            const roster = rosterInfo(teamRow, tournament);
                                            const isExpanded = expandedTeamId === teamId;
                                            const needsApproval = !!(teamRow.requiresApproval || teamRow.RequiresApproval);
                                            const isApproved = teamRow.userRequestStatus === 'Approved' || teamRow.UserRequestStatus === 'Approved' || (teamRow.userRequestStatus as any) === 1 || (teamRow.UserRequestStatus as any) === 1;
                                            const isPending = teamRow.userRequestStatus === 'Pending' || teamRow.UserRequestStatus === 'Pending' || (teamRow.userRequestStatus as any) === 0 || (teamRow.UserRequestStatus as any) === 0;
                                            // If the user has no team (they may have been kicked), trust userTeam state.
                                            // Per-team isApproved prevents rejoining a team they're already "approved" in.
                                            // Capacity, not lineup: a full side can still take bench players.
                                            const showJoin = !userTeam && !isUserRegistered && !isApproved && roster.hasRoom;

                                            return (
                                                <TeamRosterRow
                                                    key={teamId || index.toString()}
                                                    tone="open"
                                                    teamName={teamName}
                                                    roster={roster}
                                                    captainUserId={teamRow.captainUserId || teamRow.CaptainUserId}
                                                    first={index === 0}
                                                    expanded={isExpanded}
                                                    onToggle={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                    onOpenProfile={openPlayerProfile}
                                                    isOnBench={isMemberOnBench}
                                                    openSlots={roster.teamSize > 0 ? roster.rosterCapacity - roster.members.length : 0}
                                                    footer={showJoin ? (
                                                        <Button
                                                            className={needsApproval ? 'bg-blue-500 py-3 rounded-2xl w-full mt-1' : 'bg-team py-3 rounded-2xl w-full mt-1'}
                                                            onPress={() => handleJoinTeam(teamId as string, needsApproval)}
                                                            loading={joiningTeamId === teamId}
                                                            disabled={joiningTeamId !== null || isPending}
                                                        >
                                                            <Text numberOfLines={1} className={needsApproval ? 'text-white font-black uppercase tracking-widest text-sm text-center w-full' : 'text-primary-foreground font-black uppercase tracking-widest text-sm text-center w-full'}>
                                                                {isPending
                                                                    ? t('details.requestPending')
                                                                    : needsApproval ? t('details.requestToJoin') : t('details.joinThisTeam')}
                                                            </Text>
                                                        </Button>
                                                    ) : undefined}
                                                />
                                            );
                                        })}
                                    </Panel>
                                )
                            )}

                            {/* Requests — pending team registrations, approve / reject on each row */}
                            {teamsTab === 'registrations' && canManage && isPreStart && (() => {
                                // One row per team: a team registration can arrive once per member.
                                const teamRequests = pendingRegistrations.reduce((acc: any[], current: any) => {
                                    const teamId = current.teamId || current.TeamId;
                                    if (teamId) {
                                        const exists = acc.find(item => (item.teamId || item.TeamId) === teamId);
                                        if (!exists) acc.push(current);
                                    } else {
                                        acc.push(current);
                                    }
                                    return acc;
                                }, []).filter((reg: any) => reg.isTeamRegistration || reg.IsTeamRegistration);

                                return (
                                    <View style={{ gap: 10 }}>
                                        {teamRequests.length > 0 && (
                                            <View className="flex-row justify-end">
                                                <Button
                                                    size="sm"
                                                    onPress={handleApproveAll}
                                                    loading={isLoadingPending}
                                                    className="bg-primary"
                                                >
                                                    {t('details.approveAll')}
                                                </Button>
                                            </View>
                                        )}

                                        {!pendingLoaded ? (
                                            <ActivityIndicator size="small" color="#F59E0B" />
                                        ) : pendingError && teamRequests.length === 0 ? (
                                            <LoadFailedState onRetry={fetchPendingRegistrations} />
                                        ) : teamRequests.length === 0 ? (
                                            <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                                <Ionicons name="checkmark-circle-outline" size={48} color="#F59E0B" />
                                                <Text className="text-slate-400 mt-4 text-center">{t('details.noPendingRequests')}</Text>
                                            </View>
                                        ) : (
                                            <Panel style={{ borderColor: 'rgba(245,158,11,0.22)' }}>
                                                {teamRequests.map((reg: any, index: number) => {
                                                    const regId = reg.id || reg.registrationId || reg.Id;
                                                    const teamId = reg.teamId || reg.TeamId;
                                                    const roster = rosterInfo(reg, tournament);
                                                    const isExpanded = expandedTeamId === teamId;

                                                    return (
                                                        <TeamRosterRow
                                                            key={teamId || regId || index.toString()}
                                                            tone="request"
                                                            teamName={reg.teamName || reg.TeamName}
                                                            roster={roster}
                                                            captainUserId={reg.captainUserId || reg.CaptainUserId}
                                                            first={index === 0}
                                                            expanded={isExpanded}
                                                            onToggle={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                            onOpenProfile={openPlayerProfile}
                                                            isOnBench={isMemberOnBench}
                                                            openSlots={roster.teamSize > 0 ? roster.teamSize - roster.members.length : 0}
                                                            actions={
                                                                <>
                                                                    <Pressable
                                                                        onPress={() => handleReject(regId)}
                                                                        disabled={processingId !== null}
                                                                        accessibilityRole="button"
                                                                        accessibilityLabel={t('details.decline')}
                                                                        className="w-9 h-9 rounded-xl items-center justify-center bg-red-500/10 border border-red-500/25 active:opacity-60"
                                                                    >
                                                                        <Ionicons name="close" size={17} color="#F87171" />
                                                                    </Pressable>
                                                                    <Pressable
                                                                        onPress={() => handleApprove(regId)}
                                                                        disabled={processingId !== null}
                                                                        accessibilityRole="button"
                                                                        accessibilityLabel={t('details.approve')}
                                                                        className="w-9 h-9 rounded-xl items-center justify-center bg-primary active:opacity-80"
                                                                    >
                                                                        {processingId === regId ? (
                                                                            <ActivityIndicator size="small" color="#0F172A" />
                                                                        ) : (
                                                                            <Ionicons name="checkmark" size={18} color="#0F172A" />
                                                                        )}
                                                                    </Pressable>
                                                                </>
                                                            }
                                                        />
                                                    );
                                                })}
                                            </Panel>
                                        )}
                                    </View>
                                );
                            })()}

                        </View>
                    )}

                    {/* Pending Registrations Admin Tab (Solo Only) - now merged into players tab */}

                    {activeTab === 'players' && (
                        <View className="px-4 py-4 gap-3 pb-12">
                            {/* Header */}
                            <View className="flex-row items-center justify-between mb-1">
                                <View className="flex-row items-center gap-2">
                                    <Ionicons name="people-outline" size={20} color="#3B82F6" />
                                    <Text className="text-lg font-black text-white">{t('details.playersTitle')}</Text>
                                </View>
                            </View>

                            {/* Sub-tabs */}
                            <View className="mb-2">
                                <PremiumTabs
                                    tabs={[
                                        { value: 'confirmed', label: t('details.tabConfirmed'), icon: 'checkmark-circle-outline' },
                                        ...(canManage ? [{
                                            value: 'registrations',
                                            label: t('details.tabRegistrations'),
                                            icon: 'hourglass-outline' as const,
                                            // Use the live list length once it's been fetched, but fall back to the
                                            // cascaded approval count so the badge shows immediately — before the
                                            // sub-tab is opened (matching the Teams "Requests" sub-tab).
                                            badge: (pendingRegistrations.length || pendingRegCount) > 0
                                                ? (pendingRegistrations.length || pendingRegCount)
                                                : undefined,
                                        }] : []),
                                    ]}
                                    activeTab={playersTab}
                                    onTabChange={(val) => {
                                        setPlayersTab(val as 'confirmed' | 'registrations');
                                        // A term carried across sub-tabs reads as an empty list rather
                                        // than as a filter, so each sub-tab opens unfiltered.
                                        setPlayerSearch('');
                                        if (val === 'registrations' && pendingRegistrations.length === 0) {
                                            fetchPendingRegistrations();
                                        }
                                    }}
                                />
                            </View>

                            {/* Only offered once there is a list to narrow - on an empty tab it is noise. */}
                            {(playersTab === 'confirmed' ? participants.length : pendingRegistrations.length) > 0 && (
                                <SearchInput
                                    value={playerSearch}
                                    onChange={setPlayerSearch}
                                    placeholder={playersTab === 'confirmed' ? t('details.searchConfirmed') : t('details.searchRegistrations')}
                                    className="mb-1"
                                />
                            )}

                            {/* Confirmed Players */}
                            {playersTab === 'confirmed' && (
                                !participantsLoaded ? (
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                ) : participantsError && participants.length === 0 ? (
                                    <LoadFailedState onRetry={fetchParticipants} />
                                ) : participants.length === 0 ? (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">{t('details.noConfirmedPlayers')}</Text>
                                    </View>
                                ) : filteredParticipants.length === 0 ? (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="search-outline" size={40} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">{t('details.noConfirmedMatch', { query: playerSearch.trim() })}</Text>
                                    </View>
                                ) : (
                                    // One roster panel, a row per player — a 128-player field reads as a
                                    // table instead of a stack of cards.
                                    <Panel>
                                        {filteredParticipants.map(({ p, seed }, index) => {
                                            const pUserId = p.userId || p.UserId || p.id;
                                            return (
                                                <ParticipantRow
                                                    key={`${p.participantId || p.id || pUserId || 'p'}-${seed}`}
                                                    participant={p}
                                                    seed={seed}
                                                    first={index === 0}
                                                    isCurrentUser={user?.id?.toLowerCase() === pUserId?.toLowerCase()}
                                                    // Swapping stays available once the tournament is LIVE (3) — that's the whole
                                                    // point of it. Whether this particular player has played too much to still be
                                                    // replaced is the backend's call, shown inside the sheet.
                                                    canSwap={canManage
                                                        && !tournament?.isTeamTournament
                                                        && (tournament?.status ?? 99) <= 3}
                                                    canRemove={canManage && (tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2)}
                                                    isProcessing={processingId === pUserId}
                                                    isOpeningSwap={participantSwapLoading && participantSwapTarget?.userId === pUserId}
                                                    actionsDisabled={processingId !== null || participantSwapLoading}
                                                    onOpenProfile={openPlayerProfile}
                                                    onSwap={setParticipantSwapTarget}
                                                    onRemove={setRemoveParticipantTarget}
                                                />
                                            );
                                        })}
                                    </Panel>
                                )
                            )}

                            {/* Registrations (admin, solo) */}
                            {playersTab === 'registrations' && canManage && (
                                <>
                                    {/* Approve All button. Hidden while a search is narrowing the list:
                                        it approves every pending registration, not the visible ones, and
                                        next to three filtered rows that reads as "approve these three". */}
                                    {pendingRegistrations.length > 0 && !playerSearch.trim() && (
                                        <View className="flex-row justify-end mb-1">
                                            <Button
                                                size="sm"
                                                onPress={handleApproveAll}
                                                loading={isLoadingPending}
                                                className="bg-primary"
                                            >
                                                {t('details.approveAll')}
                                            </Button>
                                        </View>
                                    )}
                                    {!pendingLoaded ? (
                                        <ActivityIndicator size="small" color="#F59E0B" />
                                    ) : pendingError && pendingRegistrations.length === 0 ? (
                                        <LoadFailedState onRetry={fetchPendingRegistrations} />
                                    ) : pendingRegistrations.length === 0 ? (
                                        <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                            <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                                            <Text className="text-slate-400 mt-4 text-center">{t('details.noPendingRegistrations')}</Text>
                                        </View>
                                    ) : filteredRegistrations.length === 0 ? (
                                        <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                            <Ionicons name="search-outline" size={40} color="#71717A" />
                                            <Text className="text-slate-400 mt-4 text-center">{t('details.noRegistrationMatch', { query: playerSearch.trim() })}</Text>
                                        </View>
                                    ) : (
                                        // Requests in one amber-edged panel, approve / reject on each row.
                                        <Panel style={{ borderColor: 'rgba(245,158,11,0.22)' }}>
                                            {filteredRegistrations.map((reg, index) => {
                                                const regId = reg.id || reg.registrationId || reg.Id;
                                                // Registration id ≠ user id — TournamentRegistrationOverview carries both.
                                                // The repo projects UserId with a `?? Guid.Empty` fallback, and the empty
                                                // guid is a truthy string, so screen it out the same way TournamentGroups does.
                                                const regUserIdRaw = reg.userId || reg.UserId;
                                                const regUserId = regUserIdRaw && regUserIdRaw !== '00000000-0000-0000-0000-000000000000'
                                                    ? regUserIdRaw
                                                    : null;
                                                return (
                                                    <View
                                                        key={regId || `reg-${index}`}
                                                        className={`flex-row items-center pl-4 pr-3 py-2.5 ${index === 0 ? '' : 'border-t border-white/[0.05]'}`}
                                                    >
                                                        {/* Avatar + name open the profile so the organizer can vet the player
                                                            before approving. The approve/reject buttons stay outside it. */}
                                                        <Pressable
                                                            onPress={() => { if (regUserId) navigation.navigate('PlayerProfile', { id: regUserId }); }}
                                                            disabled={!regUserId}
                                                            className="flex-1 flex-row items-center active:opacity-70"
                                                        >
                                                            <View>
                                                                <View style={{ borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.55)', borderRadius: 999, padding: 1.5 }}>
                                                                    <PlayerAvatar src={reg.avatarUrl || reg.AvatarUrl} name={reg.username || reg.Username || tCommon('unknown')} size="md" className="border-0" />
                                                                </View>
                                                                <View
                                                                    className="absolute items-center justify-center"
                                                                    style={{ bottom: -2, right: -2, width: 16, height: 16, borderRadius: 999, backgroundColor: '#F59E0B', borderWidth: 2, borderColor: COLORS.card }}
                                                                >
                                                                    <Ionicons name="hourglass" size={8} color="#0F172A" />
                                                                </View>
                                                            </View>
                                                            <View className="flex-1 ml-3 justify-center">
                                                                <View className="flex-row items-center gap-1">
                                                                    <Text className="font-black text-[15px] text-white flex-shrink" numberOfLines={1}>{reg.username || reg.Username}</Text>
                                                                    {!!regUserId && <Ionicons name="chevron-forward" size={13} color="#64748B" />}
                                                                </View>
                                                                <View className="flex-row items-center gap-1 mt-0.5">
                                                                    <Ionicons name="person-add" size={10} color="#FBBF24" />
                                                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px]" style={{ color: '#FCD34D' }} numberOfLines={1}>{t('details.wantsToJoin')}</Text>
                                                                </View>
                                                            </View>
                                                        </Pressable>
                                                        <View className="flex-row items-center ml-2" style={{ gap: 6 }}>
                                                            <Pressable
                                                                onPress={() => handleReject(regId)}
                                                                disabled={processingId !== null}
                                                                accessibilityRole="button"
                                                                className="w-9 h-9 rounded-xl items-center justify-center bg-red-500/10 border border-red-500/25 active:opacity-60"
                                                            >
                                                                {processingId === regId ? (
                                                                    <ActivityIndicator size="small" color="#EF4444" />
                                                                ) : (
                                                                    <Ionicons name="close" size={17} color="#F87171" />
                                                                )}
                                                            </Pressable>
                                                            <Pressable
                                                                onPress={() => handleApprove(regId)}
                                                                disabled={processingId !== null}
                                                                accessibilityRole="button"
                                                                className="w-9 h-9 rounded-xl items-center justify-center bg-primary active:opacity-80"
                                                            >
                                                                {processingId === regId ? (
                                                                    <ActivityIndicator size="small" color="#0F172A" />
                                                                ) : (
                                                                    <Ionicons name="checkmark" size={18} color="#0F172A" />
                                                                )}
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </Panel>
                                    )}
                                </>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            {matchDetailsModal}
            {teamMatchModal}

            <AdminHelpRequestsModal
                visible={showAdminHelpModal}
                onClose={() => setShowAdminHelpModal(false)}
                requests={adminHelpRequests}
                isLoading={isLoadingAdminHelp}
                onSelect={handleHelpRequestSelect}
                phoneRequests={phoneRequests}
                onPhoneDecision={handlePhoneDecision}
                error={adminHelpError}
                onRefresh={fetchAdminHelpRequests}
                onOpenProfile={userId => { setShowAdminHelpModal(false); openPlayerProfile(userId); }}
            />

            <PendingApprovalsModal
                visible={showApprovalsModal}
                onClose={() => setShowApprovalsModal(false)}
                items={pendingApprovals}
                isLoading={isLoadingApprovals}
                onSelect={handleApprovalSelect}
            />

            <RoundProgressModal
                visible={showProgressModal}
                onClose={() => setShowProgressModal(false)}
                stages={stages}
                isTeamTournament={tournament?.isTeamTournament}
                onOpenMatch={(match) => {
                    // Hand the fixture to the same handlers the bracket uses, so the guards
                    // (round locked, missing participants) and the team / solo split stay in
                    // one place. Closing first keeps the two sheets from stacking.
                    setShowProgressModal(false);
                    if (tournament?.isTeamTournament) handleTeamMatchPress(match);
                    else handleMatchPress(match);
                }}
                canManage={canManage}
                // Silent: the sheet stays open on the round that was just closed, and re-reading
                // the structure is what turns it green — a loading flash would hide the outcome.
                onRefresh={() => fetchBracket(true)}
            />

            {/* Shared team link → confirm before joining / requesting. */}
            <ConfirmationModal
                visible={!!joinPrompt}
                onDismiss={joinPromptHandoff.onDismiss}
                onClose={() => setJoinPrompt(null)}
                onConfirm={handleJoinPromptConfirm}
                isDestructive={false}
                title={joinPrompt?.requiresApproval ? t('details.requestToJoin') : t('details.joinTeam')}
                message={
                    joinPrompt?.requiresApproval
                        ? t('details.joinPromptRequest', { teamName: joinPrompt?.teamName })
                        : t('details.joinPromptDirect', { teamName: joinPrompt?.teamName })
                }
                confirmText={joinPrompt?.requiresApproval ? t('details.requestToJoin') : t('details.joinThisTeam')}
                isLoading={!tournament || (joiningTeamId !== null && joiningTeamId === joinPrompt?.teamId)}
                stacked
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
                initialBestOf={selectedRoundForDeadline?.bestOf ?? null}
                initialTiebreakBestOf={selectedRoundForDeadline?.tiebreakBestOf ?? null}
                tournamentBestOf={tournamentBestOf}
                hasKnockout={tournamentHasKnockout}
            />

            {/* Team Registration Modal */}
            {showTeamRegistration && (
                <TeamRegistrationModal
                    visible={showTeamRegistration}
                    onClose={() => setShowTeamRegistration(false)}
                    tournamentId={id}
                    onTeamJoined={handleTeamJoined}
                    availableTeams={tournamentTeams}
                    requiresCode={!!tournament?.isPrivate && !canManage}
                    joinCode={inviteCode}
                    onCodeRejected={() => setInviteCode(null)}
                    onCodeAccepted={setInviteCode}
                />
            )}

            {/* Private tournament, solo: prove you hold the code, then the sign-up goes straight
                through — the sheet stays up until the registration answers. */}
            <JoinByCodeModal
                visible={showCodePrompt}
                onClose={() => setShowCodePrompt(false)}
                tournamentId={id}
                confirmLabel={t('details.joinTournament')}
                onVerified={async (code) => {
                    setInviteCode(code);
                    await handleJoin(code);
                }}
            />

            {/* A team roster is part of a private tournament too. Verify the code only after
                the player chooses Join/Request, then let them confirm that specific action. */}
            <JoinByCodeModal
                visible={!!pendingPrivateTeamJoin}
                onClose={() => setPendingPrivateTeamJoin(null)}
                tournamentId={id}
                confirmLabel={pendingPrivateTeamJoin?.requiresApproval ? t('details.requestToJoin') : t('details.joinThisTeam')}
                onVerified={async (code) => {
                    if (!pendingPrivateTeamJoin) return;
                    setInviteCode(code);
                    await handleJoinTeam(pendingPrivateTeamJoin.teamId, pendingPrivateTeamJoin.requiresApproval, code);
                }}
            />

            {/* Eligible countries (expanded from the General Info summary) */}
            <CountryListModal
                visible={showCountriesModal}
                onClose={() => setShowCountriesModal(false)}
                codes={tournament?.countries || []}
                title={t('details.eligibleCountries')}
            />


            <ConfirmationModal
                visible={showStartConfirm}
                onClose={() => setShowStartConfirm(false)}
                onConfirm={() => { setShowStartConfirm(false); handleCreateBracket(); }}
                title={t('details.startTournamentTitle')}
                message={t('details.startTournamentMessage', { format: getTournamentFormatLabel(Number(tournament?.format), t) })}
                confirmText={t('details.generateBracket')}
                isDestructive={false}
                stacked
            />

            <BracketDrawModal
                visible={showDrawModal}
                onClose={() => setShowDrawModal(false)}
                options={drawOptions}
                loading={isLoadingDrawOptions}
                error={drawOptionsError}
                busy={isCreatingBracket}
                onRetry={fetchDrawOptions}
                onConfirm={(mode, plan) => handleCreateBracket(mode, plan)}
            />

            <SwapBracketModal
                visible={showSwapModal}
                onClose={() => setShowSwapModal(false)}
                teams={showSwapModal ? getSwappableBracketTeams() : []}
                onConfirm={handleSwapBracket}
                busy={isSwapping}
            />

            <SwapParticipantModal
                visible={!!participantSwapTarget}
                onClose={() => setParticipantSwapTarget(null)}
                tournamentId={id}
                outgoing={participantSwapTarget}
                onSwapped={handleParticipantSwapped}
                onLoadingChange={setParticipantSwapLoading}
            />

            {/* Removing an entrant deletes their spot outright — unlike a swap, nothing inherits it. */}
            <ConfirmationModal
                visible={!!removeParticipantTarget}
                onClose={() => setRemoveParticipantTarget(null)}
                onConfirm={() => removeParticipantTarget && handleRemoveParticipant(removeParticipantTarget.userId)}
                title={t('details.removePlayerTitle')}
                message={t('details.removePlayerMessage', { username: removeParticipantTarget?.username })}
                confirmText={t('details.removePlayer')}
                isLoading={processingId === removeParticipantTarget?.userId}
                stacked
            />

            <ExportBracketModal
                visible={showExportModal}
                onClose={() => setShowExportModal(false)}
                onSelect={handleExportSelect}
                showScheduleOption={scheduleAffectsExport}
                showStandingsOption={hasStandingsTables}
            />

            {tournament && (
                <ShareTournamentCardModal
                    visible={shareCardVisible}
                    onClose={() => setShareCardVisible(false)}
                    tournamentId={id}
                    name={tournament.name || t('details.headerTournament')}
                    status={Number(tournament.status)}
                    isTeam={!!tournament.isTeamTournament}
                    participants={tournament.isTeamTournament ? tournamentTeams.length : (tournament.numberOfParticipants || 0)}
                    teamSize={tournament.teamSize}
                    prize={tournament.prize && Number(tournament.prize) > 0 ? tournament.prize : null}
                    prizeCurrency={tournament.prizeCurrency}
                    format={tournament.format}
                    startDate={tournament.startDate}
                    region={tournament.region}
                    countries={tournament.countries}
                    countryFlags={tournament.countryFlags}
                    hubName={tournament.hubName || null}
                    isPrivate={!!tournament.isPrivate}
                    canInvite={canManage}
                />
            )}
        </SafeAreaView>
    );
}
