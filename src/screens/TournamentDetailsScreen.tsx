import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { BracketMatch, teamProgressFrom } from '../components/bracket/BracketMatch';
import { SeriesFormatChip, matchSeriesFormat } from '../components/bracket/SeriesFormatChip';

import { Button } from '../components/ui/Button';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { cn, getCurrencyLabel, parseUtcDate, formatDateTimeShort } from '../lib/utils';
import { normalizeBestOf } from '../lib/series';
import { ShareTournamentCardModal } from '../components/modals/ShareTournamentCardModal';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgesContext';
import { ENDPOINTS, authenticatedFetch, getErrorMessage } from '../lib/api';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { LinearGradient } from 'expo-linear-gradient';
import { CollapsibleCard, InfoRow, QuoteBlock } from '../components/ui/CollapsibleCard';
import { MatchDetailsModal } from '../components/modals/MatchDetailsModal';
import { AdminHelpRequestsModal, AdminHelpRequestItem } from '../components/modals/AdminHelpRequestsModal';
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
import { StatusModal } from '../components/modals/StatusModal';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { RoundScheduleModal } from '../components/modals/RoundScheduleModal';
import { ExportBracketModal } from '../components/modals/ExportBracketModal';
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
import { TEAM_LABELS } from '../lib/teamConstants';
import type { TeamDto } from '../types/team';

type TournamentDetailsRouteProp = RouteProp<RootStackParamList, 'TournamentDetails'>;

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

export default function TournamentDetailsScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const route = useRoute<TournamentDetailsRouteProp>();
    const { id } = route.params;
    const { tournamentApprovals, refresh: refreshBadges } = useBadges();
    // Pending team/solo registrations awaiting the organizer's approval — cascaded from the
    // Hubs-tab badge so the Teams/Players tab + Requests sub-tab show a dot before you open them.
    const pendingRegCount = tournamentApprovals(id)?.registrations ?? 0;
    // Open admin-help requests live in the bracket → badge the Bracket tab with them.
    const adminHelpCount = tournamentApprovals(id)?.adminHelp ?? 0;
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
    const [openTeams, setOpenTeams] = useState<TeamDto[]>([]);
    const [isLoadingOpenTeams, setIsLoadingOpenTeams] = useState(false);
    const [tournament, setTournament] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
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
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
    const [loadingBracket, setLoadingBracket] = useState(false);
    const [bracketError, setBracketError] = useState<string | null>(null);
    const [isThirdPlaceExpanded, setIsThirdPlaceExpanded] = useState(false);

    const { user } = useAuth();
    const [isRegistering, setIsRegistering] = useState(false);
    const [participants, setParticipants] = useState<any[]>([]);
    const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
    const [pendingRegistrations, setPendingRegistrations] = useState<any[]>([]);
    const [isLoadingPending, setIsLoadingPending] = useState(false);
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
    const [isUserRegistered, setIsUserRegistered] = useState(false);
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

    // Matches with a reported result awaiting approval — admins only
    const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalItem[]>([]);
    const [showApprovalsModal, setShowApprovalsModal] = useState(false);
    const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
    // Which tab MatchDetailsModal should open on. Bumped to 'chat' when an admin
    // enters via the help-requests inbox; reset to 'match' for every other entry.
    const [matchModalDefaultTab, setMatchModalDefaultTab] = useState<'match' | 'chat'>('match');

    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [shareCardVisible, setShareCardVisible] = useState(false);

    // Team tournament states
    const [showTeamRegistration, setShowTeamRegistration] = useState(false);
    const [tournamentTeams, setTournamentTeams] = useState<TeamDto[]>([]);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [userTeam, setUserTeam] = useState<TeamDto | null>(null);
    const [showTeamMatchDetail, setShowTeamMatchDetail] = useState(false);
    const [selectedTeamMatchId, setSelectedTeamMatchId] = useState<string | null>(null);
    // When a single game is opened from the team overview, remember the parent team match so
    // closing the solo match page drops the user back onto the team modal (drill-in / drill-out).
    const [returnToTeamMatchId, setReturnToTeamMatchId] = useState<string | null>(null);
    const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);

    // Collapsible section states
    const [isGeneralInfoOpen, setIsGeneralInfoOpen] = useState(true);
    const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [showCountriesModal, setShowCountriesModal] = useState(false);

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

    const handleExportBracketPdf = async (includeSchedule = false) => {
        if (!id) return;
        setIsExportingPdf(true);
        try {
            const token = await SecureStore.getItemAsync('access_token');
            const safeName = (tournament?.name ?? id)
                .replace(/\s+/g, '_')
                .replace(/[^a-zA-Z0-9_\-]/g, '');
            const suffix = includeSchedule ? '_schedule' : '';
            const destFile = new FSFile(Paths.cache, `${safeName}_bracket${suffix}.pdf`);
            // Remove stale cache file so downloadFileAsync never hits "Destination already exists"
            if (destFile.exists) {
                destFile.delete();
            }
            const downloaded = await FSFile.downloadFileAsync(
                ENDPOINTS.EXPORT_BRACKET_PDF(id, includeSchedule),
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

    // The schedule option only changes the PDF for group-stage / league tournaments (it adds
    // round-by-round fixture pages there); a pure bracket would export an identical file either
    // way. So only offer the chooser when it actually matters — otherwise export directly.
    const scheduleAffectsExport = stages.some((s: any) => {
        const t = s.type ?? s.Type;
        return t === 1 || t === 2; // StageType.GroupStage, StageType.League
    });

    const handleExportPress = () => {
        if (scheduleAffectsExport) setShowExportModal(true);
        else handleExportBracketPdf(false);
    };

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

    const fetchTournamentDetails = async (silent = false) => {
        if (!id) return;
        if (!silent) setIsLoading(true);
        setError(null);
        try {
            // v3 = v2 + HasUserRegistered (folds the CHECK_REGISTRATION round-trip inline).
            const url = ENDPOINTS.GET_TOURNAMENT_OVERVIEW_V3(id);
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
                // Server (v2 overview) tells us whether the caller passes the exclusivity gate.
                // Omitted (=> false) when the user lacks access; non-exclusive tournaments don't use it.
                hasExclusiveAccess: rawData.hasExclusiveAccess ?? rawData.HasExclusiveAccess ?? false,
                // v3 tells us whether the caller is already registered so we don't need the
                // separate CHECK_REGISTRATION round-trip. Field is omitted when false.
                hasUserRegistered: rawData.hasUserRegistered ?? rawData.HasUserRegistered ?? false,
            };

            setTournament(normalizedTournament);

            // Fold the registration flag from the v3 overview so the Join / Registered button
            // renders correctly without a follow-up call. Only relevant while registration is
            // still open (status 0/1); other statuses hide the button anyway.
            if (normalizedTournament.status === 0 || normalizedTournament.status === 1) {
                setIsUserRegistered(!!normalizedTournament.hasUserRegistered);
            }

            // Only team tournaments still fetch in parallel — the registration status now
            // comes inline via the overview response.
            if (normalizedTournament.isTeamTournament) {
                await fetchTournamentTeams(id);
            }
        } catch (err: any) {
            console.error('Tournament fetch error:', err);
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    // `silent` keeps the currently rendered bracket on screen while it refreshes underneath —
    // used by the focus refetch and pull-to-refresh, where blanking to a spinner (or to an error
    // screen over a transient blip) would be worse than briefly showing slightly stale cards.
    const fetchBracket = async (silent = false) => {
        if (!id) return;
        if (!silent) {
            setLoadingBracket(true);
            setBracketError(null);
        }
        try {
            const url = ENDPOINTS.GET_TOURNAMENT_STRUCTURE_V3(id);
            console.log('Fetching bracket from:', url);
            const response = await authenticatedFetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch bracket: ${response.status}`);
            }
            const data = await response.json();
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
                if (defaultStage > 0) {
                    setSelectedStageIndex(defaultStage);
                    setSelectedGroupIndex(0);
                }
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
            console.error('Bracket fetch error:', err);
            if (!silent) setBracketError('Failed to load bracket structure');
        } finally {
            if (!silent) setLoadingBracket(false);
        }
    };

    const fetchAdminHelpRequests = async () => {
        if (!id) return;
        setIsLoadingAdminHelp(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_ADMIN_HELP_REQUESTS(id));
            if (!response.ok) return;
            const data = await response.json();
            const normalized: AdminHelpRequestItem[] = (Array.isArray(data) ? data : []).map((it: any) => ({
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
            setAdminHelpRequests(normalized);
        } catch (err) {
            console.error('Admin help requests fetch error:', err);
        } finally {
            setIsLoadingAdminHelp(false);
        }
    };

    const fetchPendingApprovals = async () => {
        if (!id || !canManage || !requiresApproval) return;
        setIsLoadingApprovals(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_PENDING_APPROVALS(id));
            if (!response.ok) return;
            const data = await response.json();
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
            console.error('Pending approvals fetch error:', err);
        } finally {
            setIsLoadingApprovals(false);
        }
    };

    // A bracket reset / regeneration can shrink the stage list under a selection made earlier,
    // which would leave the bracket tab blank (renderStages bails on a missing stage).
    useEffect(() => {
        if (stages.length > 0 && selectedStageIndex >= stages.length) {
            setSelectedStageIndex(0);
            setSelectedGroupIndex(0);
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
            roundName: [item.groupName, item.roundNumber ? `Round ${item.roundNumber}` : null]
                .filter(Boolean)
                .join(' · ') || 'Match',
            startTime: item.scheduledStartTime,
            home: item.homeUserId
                ? { userId: item.homeUserId, username: item.homeUsername || 'Player', score: null }
                : null,
            away: item.awayUserId
                ? { userId: item.awayUserId, username: item.awayUsername || 'Player', score: null }
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
            roundName: [item.groupName, item.roundNumber ? `Round ${item.roundNumber}` : null]
                .filter(Boolean)
                .join(' · ') || 'Match',
            startTime: item.scheduledStartTime,
            home: item.homeUserId
                ? { userId: item.homeUserId, username: item.homeUsername || 'Player', score: null }
                : null,
            away: item.awayUserId
                ? { userId: item.awayUserId, username: item.awayUsername || 'Player', score: null }
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
        setSelectedMatch({
            id: sub.matchId,
            status: numericStatus,
            roundName: 'Team Match',
            home: sub.homePlayer
                ? { userId: sub.homePlayer.userId, username: sub.homePlayer.username, score: sub.homeScore ?? null }
                : null,
            away: sub.awayPlayer
                ? { userId: sub.awayPlayer.userId, username: sub.awayPlayer.username, score: sub.awayScore ?? null }
                : null,
            canRevert: isDone && isPlayerOfSub && !approvalRequired,
            isRoundLocked: false,
        });
        setMatchModalDefaultTab(tab);
        setShowReportModal(true);
    };

    // Deep links. Push notifications land here with openAdminHelp / focusMatchId;
    // a shared /team/{id} link lands here with focusTeamId. We act once, then clear
    // the params so the action doesn't replay on the next render/focus.
    const { openAdminHelp, focusMatchId, focusTeamMatchId, focusMatchTab, focusTeamId, focusTeamName, focusTeamRequiresApproval } = route.params;
    useEffect(() => {
        // Match deep links (incl. team-tournament sub-matches): open the solo match modal on
        // the requested tab. The push carries the sub-match id in focusMatchId; the modal
        // resolves the pairing & score out of the parent team-match DTO, so chat/stream/result
        // all work here — unlike the team modal, which has neither chat nor a help-resolve action.
        if (focusMatchId) {
            setSelectedMatch({ id: focusMatchId, canRevert: false, isRoundLocked: false });
            setMatchModalDefaultTab(focusMatchTab === 'match' ? 'match' : 'chat');
            setShowReportModal(true);
            navigation.setParams({ focusMatchId: undefined, focusTeamMatchId: undefined, focusMatchTab: undefined });
            return;
        }
        // Fallback: a team-match id with no specific sub-match — open the team overview modal.
        if (focusTeamMatchId) {
            setSelectedTeamMatchId(focusTeamMatchId);
            setShowTeamMatchDetail(true);
            navigation.setParams({ focusTeamMatchId: undefined, focusMatchTab: undefined });
            return;
        }
        if (focusTeamId) {
            // Land on the Teams → open tab so the team is in context behind the prompt.
            setActiveTab('teams');
            setTeamsTab('open');
            fetchOpenTeams();
            setJoinPrompt({
                teamId: focusTeamId,
                teamName: focusTeamName || 'this team',
                requiresApproval: !!focusTeamRequiresApproval,
            });
            navigation.setParams({ focusTeamId: undefined, focusTeamName: undefined, focusTeamRequiresApproval: undefined });
            return;
        }
        if (openAdminHelp) {
            setShowAdminHelpModal(true);
            fetchAdminHelpRequests();
            navigation.setParams({ openAdminHelp: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openAdminHelp, focusMatchId, focusTeamMatchId, focusMatchTab, focusTeamId, focusTeamName, focusTeamRequiresApproval]);

    // Confirm → reuse the existing join/request flow, then close the prompt.
    const handleJoinPromptConfirm = async () => {
        if (!joinPrompt) return;
        const { teamId, requiresApproval } = joinPrompt;
        await handleJoinTeam(teamId, requiresApproval);
        setJoinPrompt(null);
    };

    // Guards the entrant count before we bother the organiser with the draw picker (or the server)
    // — Double Elimination can't build a losers bracket with fewer than 4.
    const entrantCountTooLowMessage = (): string | null => {
        const entrantCount = Number(tournament?.numberOfParticipants ?? 0);
        if (tournament?.format === TournamentFormat.DoubleElimination && entrantCount > 0 && entrantCount < 4) {
            return `Double Elimination requires at least 4 participants (currently ${entrantCount}).`;
        }
        return null;
    };

    const fetchDrawOptions = async () => {
        if (!id) return;
        setIsLoadingDrawOptions(true);
        setDrawOptionsError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.BRACKET_DRAW_OPTIONS(id));
            if (!response.ok) {
                const text = await response.text().catch(() => 'No response body');
                throw new Error(text);
            }
            const data = await response.json();
            setDrawOptions(data?.result || data);
        } catch (err: any) {
            console.error('Draw options fetch error:', err);
            setDrawOptions(null);
            setDrawOptionsError(getErrorMessage(err));
        } finally {
            setIsLoadingDrawOptions(false);
        }
    };

    // Formats with a real choice open the picker; the rest (League, Swiss) generate straight away
    // with the random draw they've always used.
    const handleStartBracket = () => {
        const tooLow = entrantCountTooLowMessage();
        if (tooLow) {
            setStatusModalConfig({ type: 'error', title: 'Cannot Create Bracket', message: tooLow });
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
            setStatusModalConfig({ type: 'error', title: 'Cannot Create Bracket', message: tooLow });
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

            setShowDrawModal(false);
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
            // The picker stays open on failure so a rejected plan can be corrected in place.
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
            setStatusModalConfig({
                type: 'success',
                title: 'Bracket Drawn',
                message: 'The knockout bracket has been drawn from the group standings.'
            });
            setShowStatusModal(true);
            fetchBracket();
            fetchTournamentDetails();
        } catch (err: any) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
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
            setStatusModalConfig({
                type: 'success',
                title: 'Bracket Reset',
                message: 'The knockout bracket was cleared. Fix any group result if needed, then draw the bracket again.'
            });
            setShowStatusModal(true);
            fetchBracket();
            fetchTournamentDetails();
        } catch (err: any) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
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
            'Reset bracket?',
            `This deletes the current knockout bracket${knockoutMatchCount > 0 ? ` (${knockoutMatchCount} matches)` : ''}. Group standings are kept — you can then correct a group result and re-draw the bracket.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset bracket', style: 'destructive', onPress: performResetBracket },
            ]
        );
    };

    // First-round knockout teams a manual swap can touch: both teams of an unplayed real match, plus
    // teams sitting on a bye (the backend re-seeds those via a regenerate). Played real matches are
    // excluded — the swap only works before play.
    const getSwappableBracketTeams = (): SwapTeam[] => {
        const norm = (s: any) => s.type ?? s.Type;
        const out: SwapTeam[] = [];
        const seen = new Set<string>();
        const add = (p: any) => {
            const pid = p?.participantId ?? p?.ParticipantId;
            if (!pid || seen.has(pid)) return;
            seen.add(pid);
            out.push({ id: pid, name: p.teamName ?? p.username ?? p.Username ?? p.name ?? 'Team', seed: p.seed ?? p.Seed });
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
                    if (status === 3 || status === 4) return; // real match already played
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
            setShowSwapModal(false);
            setStatusModalConfig({ type: 'success', title: 'Positions Swapped', message: 'The two teams have switched places in the bracket.' });
            setShowStatusModal(true);
            fetchBracket();
        } catch (err: any) {
            setStatusModalConfig({ type: 'error', title: 'Error', message: getErrorMessage(err) });
            setShowStatusModal(true);
        } finally {
            setIsSwapping(false);
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
            setRemoveParticipantTarget(null);
        }
    };

    // A swap rewrites the roster label on every match the outgoing player was in, so the bracket /
    // standings have to be re-read too — the participant list alone would still show the old name
    // inside the fixtures.
    const handleParticipantSwapped = (incomingUsername: string) => {
        setParticipantSwapTarget(null);
        setStatusModalConfig({
            type: 'success',
            title: 'Player replaced',
            message: `${incomingUsername} has taken over the spot, with every result so far.`
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
        setIsLoading(true);

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
                    formatNote = ` ${skipped} already-reported ${skipped === 1 ? 'match keeps its' : 'matches keep their'} format`
                        + ` — delete ${skipped === 1 ? 'its result' : 'their results'} to re-format ${skipped === 1 ? 'it' : 'them'}.`;
                }
            }

            setStatusModalConfig({
                type: 'success',
                title: 'Success',
                message: `Round schedule updated successfully!${formatNote}`
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
            // The participants list only feeds the Overview join button and the Players tab.
            // Skip the extra round-trip on refocus when we're on bracket/teams/registrations,
            // which don't use it. The tab-switch effect still fetches it when Players is opened.
            const tab = activeTabRef.current;
            if (tab === 'overview' || tab === 'players') fetchParticipants();
            // The bracket is fetched by the tab-switch effect, which does NOT re-run on refocus —
            // so without this, coming back to an already-open bracket showed whatever was loaded
            // when the tab was first opened, including stale live team scores.
            if (tab === 'bracket') fetchBracket(true);
        }, [id])
    );

    // Pull-to-refresh: same set as the focus refetch, but always refreshes the data behind the
    // tab actually on screen, and reports progress through the pull spinner instead of silently.
    const handleRefresh = useCallback(async () => {
        if (!id) return;
        setIsRefreshing(true);
        try {
            const tab = activeTabRef.current;
            await Promise.all([
                fetchTournamentDetails(true),
                tab === 'bracket' ? fetchBracket(true) : null,
                tab === 'overview' || tab === 'players' ? fetchParticipants() : null,
                tab === 'teams' && tournament?.isTeamTournament ? fetchTournamentTeams(id) : null,
            ]);
        } finally {
            setIsRefreshing(false);
        }
    }, [id, tournament?.isTeamTournament]);

    const handleMatchPress = (match: any) => {

        // Only allow if match has participants
        if (!match.home || !match.away) return;

        // Allow Pending (1), Live (2), Completed (3, 4) and NoShow (5) matches. A no-show is
        // terminal but reversible — the modal is where an admin undoes the double walkover or
        // enters the real result the players played late, so it must stay openable.
        if (match.status !== 1 && match.status !== 2 && match.status !== 3 && match.status !== 4 && match.status !== 5) return;

        const isCreator = canManage;

        if (match.isRoundLocked && !isCreator) {
            Alert.alert("Round Locked", "Unlocks when all matches in the previous round are completed");
            return;
        }

        const backendCanRevert = match.canRevert ?? match.CanRevert ?? false;
        setSelectedMatch({ ...match, canRevert: backendCanRevert });
        setMatchModalDefaultTab('match');
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

    const tabs: PremiumTabItem[] = [
        { label: 'Overview', value: 'overview', icon: 'grid-outline' },
        {
            label: 'Bracket',
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
            ) || undefined,
            badgeTone: 'alert',
        },
        ...(tournament?.isTeamTournament
            ? [{
                label: 'Teams', value: 'teams', icon: 'people-outline' as const,
                badge: canManage && pendingRegCount > 0 ? pendingRegCount : undefined,
                badgeTone: 'alert' as const,
            }]
            : [{
                label: 'Players', value: 'players', icon: 'people-outline' as const,
                badge: canManage && pendingRegCount > 0 ? pendingRegCount : undefined,
                badgeTone: 'alert' as const,
            }]),
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

    // Admin inbox for player help requests — rendered inline with the bracket's
    // zoom controls (left side of the same row).
    const helpRequestsPill = canManage ? (
        <Pressable
            onPress={() => {
                setShowAdminHelpModal(true);
                fetchAdminHelpRequests();
            }}
            className={cn(
                "flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border active:opacity-70 self-start",
                adminHelpRequests.length > 0
                    ? "bg-warning/10 border-warning/30"
                    : "bg-white/[0.04] border-white/[0.08]"
            )}
        >
            <Ionicons
                name={adminHelpRequests.length > 0 ? "hand-left" : "hand-left-outline"}
                size={12}
                color={adminHelpRequests.length > 0 ? "#F59E0B" : "#64748B"}
            />
            <Text className={cn(
                "text-[10px] font-black uppercase tracking-wide",
                adminHelpRequests.length > 0 ? "text-warning" : "text-slate-500"
            )}>
                Help Requests
            </Text>
            {adminHelpRequests.length > 0 && (
                <View className="min-w-[16px] h-4 px-1 rounded-full bg-warning items-center justify-center">
                    <Text className="text-[9px] font-black text-primary-foreground">{adminHelpRequests.length}</Text>
                </View>
            )}
        </Pressable>
    ) : null;

    // Admin inbox for results awaiting approval — sits next to the help-requests pill.
    // Only shown when the tournament was created with result approval enabled. The
    // BadgesContext count is the single source of truth for the pill — it gets a live
    // SignalR push whenever the count changes. Deliberately NOT Math.max'd with the
    // locally loaded pendingApprovals list: after an approve, the push drops the badge
    // but the stale list (only refreshed when the pill is tapped) would keep the old
    // higher number on screen.
    const approvalsPillCount = pendingApprovalsBadgeCount;
    const approvalsPill = canManage && requiresApproval ? (
        <Pressable
            onPress={() => {
                setShowApprovalsModal(true);
                fetchPendingApprovals();
            }}
            className={cn(
                "flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border active:opacity-70 self-start",
                approvalsPillCount > 0
                    ? "bg-primary/10 border-primary/30"
                    : "bg-white/[0.04] border-white/[0.08]"
            )}
        >
            <Ionicons
                name={approvalsPillCount > 0 ? "checkmark-done" : "checkmark-done-outline"}
                size={12}
                color={approvalsPillCount > 0 ? "#10B981" : "#64748B"}
            />
            <Text className={cn(
                "text-[10px] font-black uppercase tracking-wide",
                approvalsPillCount > 0 ? "text-primary" : "text-slate-500"
            )}>
                Approvals
            </Text>
            {approvalsPillCount > 0 && (
                <View className="min-w-[16px] h-4 px-1 rounded-full bg-primary items-center justify-center">
                    <Text className="text-[9px] font-black text-primary-foreground">{approvalsPillCount}</Text>
                </View>
            )}
        </Pressable>
    ) : null;

    // Both admin pills share the bracket header row (and the league / groups header).
    // Compact so they sit side by side next to the zoom controls; flex-wrap is only a
    // last-resort fallback on very narrow screens.
    const adminPills = canManage ? (
        <View className="flex-row items-center gap-1.5 flex-wrap">
            {helpRequestsPill}
            {approvalsPill}
        </View>
    ) : null;

    // Admin-only bracket controls for the Groups + Bracket format:
    //  • Reset Bracket  — visible once the knockout is drawn; tears it down so a group result can be fixed.
    //  • Draw Bracket   — visible when the groups are complete but the knockout is empty (e.g. after a reset).
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
        const canSwap = knockoutDrawn && getSwappableBracketTeams().length >= 2;
        if (!showReset && !showDraw) return null;

        return (
            <View className="px-4 mb-4 gap-2">
                {showDraw && (
                    <Button className="w-full" onPress={handleDrawBracket} loading={isResettingBracket}>
                        Draw Bracket
                    </Button>
                )}
                {canSwap && (
                    <Pressable
                        onPress={() => setShowSwapModal(true)}
                        className="w-full flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 active:opacity-70"
                    >
                        <Ionicons name="swap-horizontal" size={16} color="#818CF8" />
                        <Text className="text-sm font-bold text-indigo-300">Swap Seeds</Text>
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
                            <Text className="text-sm font-bold text-red-400">Reset Bracket</Text>
                        </Pressable>
                        <Text className="text-[11px] text-slate-500 text-center">
                            Clears the knockout so you can correct a group result. Group standings are kept.
                        </Text>
                    </>
                )}
            </View>
        );
    };

    const renderStages = () => {
        if (stages.length === 0) {
            const isCreator = canManage;
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
                            onPress={handleStartBracket}
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
                            />
                        )}
                        {grandFinalMatch && (
                            <View className="px-4 mt-6">
                                <View className="flex-row items-center mb-3" style={{ gap: 6 }}>
                                    <Ionicons name="trophy" size={16} color="#FBBF24" />
                                    <Text className="text-sm font-bold text-white">Grand Final</Text>
                                    {matchSeriesFormat(grandFinalMatch) && (
                                        <SeriesFormatChip
                                            format={matchSeriesFormat(grandFinalMatch)!}
                                            isTeamTournament={tournament?.isTeamTournament}
                                            style={{ marginLeft: 2 }}
                                        />
                                    )}
                                </View>
                                <View style={{ maxWidth: 320 }}>
                                    <BracketMatch
                                        home={grandFinalMatch.home}
                                        away={grandFinalMatch.away}
                                        startTime={grandFinalMatch.startTime}
                                        status={grandFinalMatch.status}
                                        onPress={() => (tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress)(grandFinalMatch)}
                                        currentUserId={user?.id}
                                        currentUsername={user?.username}
                                        isAdmin={canManage}
                                        isTeamTournament={tournament?.isTeamTournament}
                                        teamProgress={teamProgressFrom(grandFinalMatch)}
                                    />
                                </View>
                            </View>
                        )}
                        {grandFinalResetMatch && (
                            <View className="px-4 mt-6">
                                <View className="flex-row items-center mb-3" style={{ gap: 6 }}>
                                    <Ionicons name="trophy" size={16} color="#FBBF24" />
                                    <Text className="text-sm font-bold text-white">Grand Final (Reset)</Text>
                                    {matchSeriesFormat(grandFinalResetMatch) && (
                                        <SeriesFormatChip
                                            format={matchSeriesFormat(grandFinalResetMatch)!}
                                            isTeamTournament={tournament?.isTeamTournament}
                                            style={{ marginLeft: 2 }}
                                        />
                                    )}
                                </View>
                                <View style={{ maxWidth: 320 }}>
                                    <BracketMatch
                                        home={grandFinalResetMatch.home}
                                        away={grandFinalResetMatch.away}
                                        startTime={grandFinalResetMatch.startTime}
                                        status={grandFinalResetMatch.status}
                                        onPress={() => (tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress)(grandFinalResetMatch)}
                                        currentUserId={user?.id}
                                        currentUsername={user?.username}
                                        isAdmin={canManage}
                                        isTeamTournament={tournament?.isTeamTournament}
                                        teamProgress={teamProgressFrom(grandFinalResetMatch)}
                                    />
                                </View>
                            </View>
                        )}
                        {thirdPlaceMatch && (thirdPlaceMatch.home || thirdPlaceMatch.away) && (
                            <View className="px-4 mt-4">
                                <Pressable
                                    onPress={() => setIsThirdPlaceExpanded(prev => !prev)}
                                    className="flex-row items-center justify-between mb-3"
                                >
                                    <View className="flex-row items-center" style={{ gap: 6 }}>
                                        <Ionicons name="medal-outline" size={16} color="#CD7F32" />
                                        <Text className="text-sm font-bold text-white">Third Place Match</Text>
                                        {matchSeriesFormat(thirdPlaceMatch) && (
                                            <SeriesFormatChip
                                                format={matchSeriesFormat(thirdPlaceMatch)!}
                                                isTeamTournament={tournament?.isTeamTournament}
                                                style={{ marginLeft: 2 }}
                                            />
                                        )}
                                    </View>
                                    <Ionicons
                                        name={isThirdPlaceExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={16}
                                        color="#94A3B8"
                                    />
                                </Pressable>
                                {isThirdPlaceExpanded && (
                                    <View style={{ maxWidth: 320 }}>
                                        <BracketMatch
                                            home={thirdPlaceMatch.home}
                                            away={thirdPlaceMatch.away}
                                            startTime={thirdPlaceMatch.startTime}
                                            status={thirdPlaceMatch.status}
                                            onPress={() => (tournament?.isTeamTournament ? handleTeamMatchPress : handleMatchPress)(thirdPlaceMatch)}
                                            currentUserId={user?.id}
                                            currentUsername={user?.username}
                                            isAdmin={canManage}
                                            isTeamTournament={tournament?.isTeamTournament}
                                            teamProgress={teamProgressFrom(thirdPlaceMatch)}
                                        />
                                    </View>
                                )}
                            </View>
                        )}
                    </>
                ) : currentStage.groups && currentStage.groups.length > 0 ? (
                    <View>
                        {/* Group stages have no zoom-controls row — show the admin pills on their own */}
                        {adminPills && (
                            <View className="px-4 mb-4 flex-row">{adminPills}</View>
                        )}
                        {/* Sort groups alphabetically by name (Group A, Group B, …) */}
                        {(() => {
                            const sortedGroups = [...currentStage.groups].sort((a: any, b: any) => {
                                const nameA = (a.name || '').toLowerCase();
                                const nameB = (b.name || '').toLowerCase();
                                return nameA.localeCompare(nameB);
                            });
                            return (
                                <>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        className="px-4 mb-6"
                                        contentContainerStyle={{ gap: 8 }}
                                    >
                                        {sortedGroups.map((group: any, idx: number) => (
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

                                    {sortedGroups[selectedGroupIndex] && (
                                        <TournamentGroups
                                            groups={[sortedGroups[selectedGroupIndex]]}
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
                                ? 'Waiting for the Swiss rounds to finish'
                                : stageType === 3 && (stages.length > 1)
                                    ? (stages.some((s: any) => (s.type ?? s.Type) === 7)
                                        ? 'Waiting for the play-in matches to finish'
                                        : 'Waiting for the previous stage to finish')
                                    : 'No rounds or groups found for this stage'}
                        </Text>
                        <Text className="text-xs text-slate-600 mt-1 text-center">
                            Matches will appear here once the previous stage completes.
                        </Text>
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
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title="Tournament"
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
                        <Pressable
                            onPress={handleShare}
                            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:opacity-60"
                            accessibilityLabel="Share tournament"
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
                    {/* Hero Section */}
                    <View className="px-4 py-6 bg-background">
                        <View className="mb-4">
                            <View className="flex-row items-start justify-between mb-2">
                                <Text className="text-3xl font-black text-white leading-tight flex-1 mr-3">{tournament.name}</Text>
                                {(() => {
                                    const s = Number(tournament.status);
                                    if (s === 3) return (
                                        <View className="bg-emerald-900 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-primary/20 mt-1">
                                            <View className="w-2 h-2 rounded-full bg-primary" />
                                            <Text className="text-[10px] font-black text-primary uppercase tracking-tighter">LIVE</Text>
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
                                ? 'exclusive members of this hub'
                                : isCountryScoped
                                    ? (tournamentCountries.length <= 3
                                        ? `${(tournament.countryFlags || []).join(' ')} ${(tournament.countryNames || tournamentCountries).join(', ')}`.trim()
                                        : `${tournamentCountries.length} countries`)
                                    : 'this region';

                            const buttons = [];

                            // Surface a "restricted" note (instead of a join button) when the user
                            // would otherwise be able to join but isn't eligible by region/country.
                            const wouldJoin = !isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull
                                && (!tournament.isTeamTournament ? true : (!userTeam && !isLoadingTeams));

                            if (wouldJoin && !isEligible) {
                                buttons.push(
                                    <View key="restricted" className="w-full bg-[#0D1525] border border-white/[0.06] rounded-2xl p-4 flex-row items-center gap-3">
                                        <Ionicons name="lock-closed" size={18} color="#64748B" />
                                        <Text className="flex-1 text-slate-400 text-sm font-medium">
                                            Restricted to {restrictionLabel} — you're not eligible to join.
                                        </Text>
                                    </View>
                                );
                            } else if (!isParticipant && isUserRegistered && isOpenOrUpcoming && !tournament.isTeamTournament) {
                                buttons.push(
                                    <View key="pending-approval" className="w-full bg-[#1A1607] border border-amber-500/20 rounded-2xl p-4 flex-row items-center gap-3">
                                        <View className="w-9 h-9 rounded-xl bg-amber-500/10 items-center justify-center">
                                            <Ionicons name="hourglass-outline" size={18} color="#F59E0B" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-amber-300 text-sm font-black tracking-tight">
                                                Pending approval
                                            </Text>
                                            <Text className="text-slate-400 text-xs mt-0.5">
                                                Your registration is waiting for hub review.
                                            </Text>
                                        </View>
                                    </View>
                                );
                            } else if (tournament.isTeamTournament) {
                                // Show nothing while teams are still loading (prevents flash of register button)
                                if (isLoadingTeams) {
                                    // render nothing — button appears smoothly once data resolves
                                } else if (!userTeam && !isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull && isEligible) {
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
                                if (!isParticipant && !isUserRegistered && isOpenOrUpcoming && !isFull && isEligible) {
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

                    <View className="px-5 mt-2 mb-4">
                        <PremiumTabs
                            tabs={tabs}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                        />
                    </View>

                    {activeTab === 'overview' && (
                        <View className="px-4 py-4 pb-12">

                            {/* Hub Owner Close Registration Button — nothing to close while a
                                scheduled tournament is still waiting for its opening time. */}
                            {canManage &&
                                (tournament?.status === 0 || tournament?.status === 1) &&
                                !isWaitingToOpen && (
                                    <Button
                                        className="w-full mb-4 bg-destructive"
                                        onPress={handleCloseRegistration}
                                        loading={isLoading}
                                    >
                                        Close Registration
                                    </Button>
                                )}

                            {/* Hub Owner Open Registration Button. Also the "open early" override for
                                a scheduled tournament (status 0 + an opening time), which the server
                                accepts as the same transition. */}
                            {canManage &&
                                (tournament?.status === 2 || isWaitingToOpen) && (
                                    <Button
                                        className="w-full mb-4 bg-primary"
                                        onPress={handleOpenRegistration}
                                        loading={isLoading}
                                    >
                                        {tournament?.status === 2 ? 'Open Registration' : 'Open Registration Now'}
                                    </Button>
                                )}

                            {/* Waiting-to-open banner — replaces the Join button until the sweep opens it. */}
                            {isWaitingToOpen && (
                                <View className="w-full bg-[#101625]/80 p-4 rounded-2xl border border-indigo-400/20 flex-row items-center gap-3 mb-4">
                                    <View className="w-10 h-10 rounded-xl bg-indigo-400/10 items-center justify-center">
                                        <Ionicons name="lock-open-outline" size={20} color="#818CF8" />
                                    </View>
                                    <View className="flex-1 gap-0.5">
                                        <Text className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Registration Opens</Text>
                                        <Text className="text-base font-black text-white">
                                            {(() => {
                                                const d = new Date(tournament.registrationOpensAt);
                                                return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
                                            })()}
                                        </Text>
                                        <Text className="text-[11px] text-slate-400 mt-0.5">
                                            You'll get a notification the moment sign-ups open.
                                        </Text>
                                    </View>
                                </View>
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
                                    className="mb-4 bg-gradient-to-r from-[#1A233A] to-[#131B2E] border border-team/30 rounded-[24px] overflow-hidden"
                                >
                                    <View className="px-5 py-4 flex-row items-center justify-between">
                                        <View className="flex-row items-center gap-4">
                                            <View className="w-12 h-12 bg-team/10 rounded-2xl items-center justify-center shadow-sm shadow-team/20 border border-team/20">
                                                <Ionicons name="shield-half" size={24} color="#00E5A0" />
                                            </View>
                                            <View>
                                                <Text className="text-white font-black text-lg tracking-wide">{TEAM_LABELS.MY_TEAM_BUTTON}</Text>
                                                <Text className="text-team/80 text-[11px] font-bold tracking-widest uppercase mt-0.5">Manage Your Roster</Text>
                                            </View>
                                        </View>
                                        <View className="w-10 h-10 bg-white/5 border border-white/5 rounded-full items-center justify-center">
                                            <Ionicons name="chevron-forward" size={18} color="#00E5A0" />
                                        </View>
                                    </View>
                                </Pressable>
                            )}

                            {/* General Info */}
                            <CollapsibleCard
                                icon="information-circle"
                                iconColor="#F59E0B"
                                title="General Info"
                                isOpen={isGeneralInfoOpen}
                                onToggle={() => setIsGeneralInfoOpen(!isGeneralInfoOpen)}
                            >
                                <InfoRow
                                    icon="trophy"
                                    iconColor="#F59E0B"
                                    label="Prize Pool"
                                    value={tournament.prize && Number(tournament.prize) > 0
                                        ? `${tournament.prize} ${getCurrencyLabel(tournament.prizeCurrency)}`
                                        : 'No Prize'}
                                />
                                <InfoRow
                                    icon="people"
                                    iconColor="#818CF8"
                                    label="Max Players"
                                    value={String(tournament.maxPlayers || 'No Limit')}
                                />
                                <InfoRow
                                    icon="list"
                                    iconColor="#A78BFA"
                                    label="Format"
                                    value={getTournamentFormatLabel(Number(tournament.format))}
                                />
                                {/* Only once the bracket exists (InProgress / Completed). A started
                                    tournament with no recorded mode predates the draw picker, and
                                    every one of those was drawn at random. */}
                                {(Number(tournament.status) === 3 || Number(tournament.status) === 4) && (
                                    <InfoRow
                                        icon="git-network"
                                        iconColor="#22D3EE"
                                        label="Bracket Draw"
                                        value={getBracketSeedingModeLabel(tournament.bracketSeedingMode)}
                                    />
                                )}
                                <InfoRow
                                    icon="game-controller"
                                    iconColor="#34D399"
                                    label="Mode"
                                    value={tournament.isTeamTournament ? 'Team' : 'Solo'}
                                />
                                {tournament.isTeamTournament && (
                                    <InfoRow
                                        icon="people-circle"
                                        iconColor="#F472B6"
                                        label="Team Size"
                                        value={`${tournament.teamSize || '?'}v${tournament.teamSize || '?'}`}
                                    />
                                )}
                                {tournament.isTeamTournament && tournament.teamWinCondition !== null && (
                                    <InfoRow
                                        icon="podium"
                                        iconColor="#FBBF24"
                                        label="Win Condition"
                                        value={(tournament.teamWinCondition === 1 || tournament.teamWinCondition === 'AggregateScore')
                                            ? 'Aggregate Score'
                                            : 'Match Wins'}
                                    />
                                )}
                                <InfoRow
                                    icon="calendar"
                                    iconColor="#60A5FA"
                                    label="Start Date"
                                    value={tournament.startDate ? new Date(tournament.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}
                                />
                                {tournament.registrationDeadline && (
                                    <InfoRow
                                        icon="time-outline"
                                        iconColor="#EF4444"
                                        label="Reg. Deadline"
                                        value={(() => {
                                            const d = new Date(tournament.registrationDeadline);
                                            return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
                                        })()}
                                    />
                                )}
                                {(tournament.countries && tournament.countries.length > 0) ? (
                                    tournament.countries.length === 1 ? (
                                        <InfoRow
                                            icon="flag"
                                            iconColor="#34D399"
                                            label="Country"
                                            value={`${tournament.countryFlags?.[0] ? tournament.countryFlags[0] + ' ' : ''}${tournament.countryNames?.[0] ?? tournament.countries[0]}`}
                                        />
                                    ) : (
                                        <InfoRow
                                            icon="flag"
                                            iconColor="#34D399"
                                            label="Countries"
                                            value={`${tournament.countries.length} countries`}
                                            onPress={() => setShowCountriesModal(true)}
                                        />
                                    )
                                ) : (
                                    <InfoRow
                                        icon="globe"
                                        iconColor="#34D399"
                                        label="Region"
                                        value={
                                            tournament.region === TournamentRegion.Europe ? 'EU'
                                                : tournament.region === TournamentRegion.NorthAmerica ? 'NA'
                                                    : tournament.region === TournamentRegion.Asia ? 'Asia'
                                                        : tournament.region === TournamentRegion.SouthAmerica ? 'SA'
                                                            : tournament.region === TournamentRegion.Africa ? 'AFR'
                                                                : tournament.region === TournamentRegion.Oceania ? 'OCE'
                                                                    : 'Global'
                                        }
                                    />
                                )}
                                {tournament.isExclusive && (
                                    <InfoRow
                                        icon="sparkles"
                                        iconColor="#E879F9"
                                        label="Access"
                                        value={
                                            <Text className="text-[14px] font-black text-fuchsia-300" numberOfLines={1}>
                                                Exclusive members
                                            </Text>
                                        }
                                    />
                                )}
                                {tournament.hubName && tournament.hubId && (
                                    <InfoRow
                                        icon="home"
                                        iconColor="#A5B4FC"
                                        label="Hub"
                                        value={
                                            <Text className="text-[14px] font-black text-emerald-300 text-right" numberOfLines={2}>
                                                {tournament.hubName}
                                            </Text>
                                        }
                                        onPress={() => navigation.navigate('HubProfile', { id: tournament.hubId })}
                                    />
                                )}
                            </CollapsibleCard>

                            {/* Description */}
                            <CollapsibleCard
                                icon="document-text"
                                iconColor="#FBBF24"
                                title="Description"
                                isOpen={isDescriptionOpen}
                                onToggle={() => setIsDescriptionOpen(!isDescriptionOpen)}
                            >
                                <QuoteBlock accentColor="#FBBF24">
                                    {tournament.description || 'Join this competitive tournament and prove your skills to climb the leaderboard.'}
                                </QuoteBlock>
                            </CollapsibleCard>

                            {/* Rules & Regulations */}
                            <CollapsibleCard
                                icon="shield-checkmark"
                                iconColor="#A78BFA"
                                title="Rules & Regulations"
                                isOpen={isRulesOpen}
                                onToggle={() => setIsRulesOpen(!isRulesOpen)}
                            >
                                <QuoteBlock accentColor="#A78BFA">
                                    {tournament.rules || '• Fair play is mandatory\n• No toxic behavior\n• Tournament organizers\' decisions are final.'}
                                </QuoteBlock>
                            </CollapsibleCard>
                        </View>
                    )}

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
                                <Text className="text-lg font-bold text-white">{TEAM_LABELS.TEAMS_SECTION_TITLE}</Text>
                            </View>

                            {/* Sub Tabs */}
                            <View className="mb-4">
                                <PremiumTabs
                                    tabs={[
                                        { value: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' },
                                        ...((tournament?.status ?? 99) < 3 ? [{ value: 'open', label: 'Open', icon: 'open-outline' as const }] : []),
                                        ...(canManage && isPreStart ? [{
                                            value: 'registrations', label: 'Requests', icon: 'hourglass-outline' as const,
                                            badge: pendingRegCount > 0 ? pendingRegCount : undefined,
                                            badgeTone: 'alert' as const,
                                        }] : []),
                                    ]}
                                    activeTab={teamsTab}
                                    onTabChange={setTeamsTab}
                                />
                            </View>

                            {/* Confirmed Teams */}
                            {teamsTab === 'confirmed' && (
                                isLoadingTeams ? (
                                    <ActivityIndicator size="small" color="#00E5A0" />
                                ) : tournamentTeams.length === 0 ? (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">{TEAM_LABELS.NO_TEAMS_REGISTERED}</Text>
                                    </View>
                                ) : (
                                    tournamentTeams.map((t, index) => {
                                        const teamId = t.teamId || t.TeamId;
                                        const teamName = t.teamName || t.TeamName;
                                        const roster = rosterInfo(t, tournament);
                                        const { memberCount, teamSize } = roster;
                                        const captainUserId = t.captainUserId || t.CaptainUserId;

                                        const membersList = roster.members;
                                        const captain = membersList.find((m: any) =>
                                            m.userId?.toLowerCase() === captainUserId?.toLowerCase() ||
                                            m.UserId?.toLowerCase() === captainUserId?.toLowerCase()
                                        );

                                        const isExpanded = expandedTeamId === teamId;

                                        return (
                                            <View key={teamId || index.toString()} className="flex-row items-start gap-3 mb-2">
                                                <Pressable
                                                    onPress={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                    className={`flex-1 bg-card p-5 rounded-[24px] border overflow-hidden ${isExpanded ? 'border-team/30' : 'border-white/[0.06]'}`}
                                                >
                                                    <LinearGradient
                                                        colors={['rgba(255,255,255,0.05)', 'transparent']}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 0.9, y: 0.7 }}
                                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                                    />
                                                    <View className="flex-row items-center gap-4">
                                                        <View className="w-12 h-12 rounded-2xl bg-team/10 items-center justify-center border border-team/20 shadow-sm shadow-team/20">
                                                            <Ionicons name="shield-half-outline" size={24} color="#00E5A0" />
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="font-black text-lg text-white" numberOfLines={1}>
                                                                {teamName || 'Unknown Team'}
                                                            </Text>
                                                            <View className="flex-row items-center gap-2 mt-1">
                                                                {/* "Full" now means the whole roster is taken. Without reserves the
                                                                    capacity IS the lineup, so this reads exactly as it always did. */}
                                                                {(memberCount >= roster.rosterCapacity && teamSize > 0) ? (
                                                                    <View className="bg-team/10 px-2 py-0.5 rounded-full border border-team/20 flex-shrink-0">
                                                                        <Text className="text-[9px] font-black text-team uppercase">
                                                                            {TEAM_LABELS.TEAM_FULL}
                                                                        </Text>
                                                                    </View>
                                                                ) : (
                                                                    <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex-shrink-0">
                                                                        {roster.starterCount} / {teamSize > 0 ? teamSize : '?'} {TEAM_LABELS.MEMBERS_LABEL}
                                                                    </Text>
                                                                )}
                                                                {roster.allowReserves && roster.reserveCount > 0 && (
                                                                    <View
                                                                        className="px-2 py-0.5 rounded-full flex-shrink-0"
                                                                        style={{ backgroundColor: 'rgba(129,140,248,0.12)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.26)' }}
                                                                    >
                                                                        <Text className="text-[9px] font-black uppercase" style={{ color: '#A5B4FC' }}>
                                                                            +{roster.reserveCount} bench
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                                {captain && (
                                                                    <View className="flex-row items-center gap-1 bg-warning/10 px-2 rounded-full py-0.5 border border-warning/20 flex-shrink">
                                                                        <Ionicons name="shield" size={10} color="#F59E0B" />
                                                                        <Text className="text-[9px] text-warning font-black uppercase flex-shrink" numberOfLines={1}>
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
                                                        <View className="mt-4 pt-4 border-t border-white/5 gap-3">
                                                            {membersList.length > 0 ? (
                                                                membersList.map((m: any, mIdx: number) => {
                                                                    const isMemberCaptain = (m.userId || m.UserId)?.toLowerCase() === captainUserId?.toLowerCase();
                                                                    return (
                                                                        <Pressable
                                                                            key={(m.userId || m.UserId) || mIdx.toString()}
                                                                            onPress={() => navigation.navigate('PlayerProfile', { id: m.userId || m.UserId })}
                                                                            className={`flex-row items-center gap-3 p-3 rounded-2xl border active:opacity-70 ${isMemberCaptain ? 'bg-warning/[0.08] border-warning/25' : 'bg-white/[0.04] border-white/[0.08]'}`}
                                                                        >
                                                                            <View className={`rounded-full p-[2.5px] ${isMemberCaptain ? 'border-2 border-warning/50' : 'border border-white/10'}`}>
                                                                                <PlayerAvatar name={m.username || m.Username} src={m.avatarUrl || m.AvatarUrl} size="sm" />
                                                                            </View>
                                                                            <View className="flex-1">
                                                                                <View className="flex-row items-center gap-2">
                                                                                    <Text className="text-white font-bold text-sm" numberOfLines={1}>{m.username || m.Username}</Text>
                                                                                    {isMemberOnBench(m) && (
                                                                                        <View
                                                                                            className="px-1.5 py-[1px] rounded-full"
                                                                                            style={{ backgroundColor: 'rgba(129,140,248,0.14)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.28)' }}
                                                                                        >
                                                                                            <Text className="text-[8px] font-black uppercase tracking-wider" style={{ color: '#A5B4FC' }}>
                                                                                                Reserve
                                                                                            </Text>
                                                                                        </View>
                                                                                    )}
                                                                                </View>
                                                                                {isMemberCaptain ? (
                                                                                    <View className="flex-row items-center gap-1 mt-0.5">
                                                                                        <Ionicons name="shield-checkmark" size={10} color="#F59E0B" />
                                                                                        <Text className="text-[9px] font-black text-warning uppercase tracking-wider">Captain</Text>
                                                                                    </View>
                                                                                ) : (
                                                                                    <Text className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                                                                        {isMemberOnBench(m) ? 'Not playing' : 'Player'}
                                                                                    </Text>
                                                                                )}
                                                                            </View>
                                                                            <Ionicons name="chevron-forward" size={14} color="#475569" />
                                                                        </Pressable>
                                                                    );
                                                                })
                                                            ) : (
                                                                <Text className="text-slate-500 text-center text-xs py-2 italic">No members found</Text>
                                                            )}

                                                            {teamSize > 0 && Array.from({ length: Math.max(0, roster.rosterCapacity - membersList.length) }).map((_, si) => (
                                                                <View
                                                                    key={`empty-${si}`}
                                                                    className="flex-row items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.02]"
                                                                    style={{ borderStyle: 'dashed' }}
                                                                >
                                                                    <View
                                                                        className="w-8 h-8 rounded-full border border-white/15 items-center justify-center"
                                                                        style={{ borderStyle: 'dashed' }}
                                                                    >
                                                                        <Ionicons name="person-add-outline" size={14} color="#475569" />
                                                                    </View>
                                                                    <Text className="text-slate-600 text-xs font-semibold">Open slot</Text>
                                                                </View>
                                                            ))}

                                                            {/* Join Button inside Expanded View */}
                                                            {/* Room anywhere on the roster counts — a full lineup can still take
                                                                bench players, so gate on capacity, not on the lineup. */}
                                                            {(!userTeam && !isUserRegistered && roster.hasRoom) && (
                                                                <Button
                                                                    className={t.requiresApproval || t.RequiresApproval ? "bg-blue-500 py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-blue-500/20" : "bg-team py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-team/20"}
                                                                    onPress={() => handleJoinTeam(teamId as string, t.requiresApproval || t.RequiresApproval)}
                                                                    loading={joiningTeamId === teamId}
                                                                    disabled={joiningTeamId !== null || t.userRequestStatus === 'Pending' || t.UserRequestStatus === 'Pending'}
                                                                >
                                                                    <Text numberOfLines={1} className={t.requiresApproval || t.RequiresApproval ? "text-white font-black uppercase tracking-widest text-sm text-center w-full" : "text-primary-foreground font-black uppercase tracking-widest text-sm text-center w-full"}>
                                                                        {(t.userRequestStatus === 'Pending' || t.UserRequestStatus === 'Pending')
                                                                            ? 'Request Pending'
                                                                            : (t.requiresApproval || t.RequiresApproval) ? 'Request to Join' : 'Join This Team'}
                                                                    </Text>
                                                                </Button>
                                                            )}
                                                        </View>
                                                    )}
                                                </Pressable>

                                                {/* Remove Team Button — Creator Only (Outside Card).
                                                    Hidden once the tournament is LIVE/Completed: the roster is
                                                    locked into the bracket and removing a team would orphan fixtures. */}
                                                {canManage && isPreStart && (
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
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center mt-2">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">No open teams looking for players right now.</Text>
                                    </View>
                                ) : (
                                    openTeams.map((t, index) => {
                                        const teamId = t.teamId || t.TeamId;
                                        const teamName = t.teamName || t.TeamName;
                                        const roster = rosterInfo(t, tournament);
                                        const { memberCount, teamSize } = roster;
                                        const captainUserId = t.captainUserId || t.CaptainUserId;
                                        const membersList = roster.members;
                                        const captain = membersList.find((m: any) =>
                                            m.userId?.toLowerCase() === captainUserId?.toLowerCase() ||
                                            m.UserId?.toLowerCase() === captainUserId?.toLowerCase()
                                        );

                                        const isExpanded = expandedTeamId === teamId;

                                        return (
                                            <View key={teamId || index.toString()} className="flex-row items-start gap-3 mb-2">
                                                <Pressable
                                                    onPress={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                    className={`flex-1 bg-card p-5 rounded-[24px] border overflow-hidden ${isExpanded ? 'border-blue-500/30' : 'border-white/[0.06]'}`}
                                                >
                                                    <LinearGradient
                                                        colors={['rgba(255,255,255,0.05)', 'transparent']}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 0.9, y: 0.7 }}
                                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                                    />
                                                    <View className="flex-row items-center gap-4">
                                                        <View className="w-12 h-12 rounded-2xl bg-blue-500/10 items-center justify-center border border-blue-500/20 shadow-sm shadow-blue-500/20">
                                                            <Ionicons name="game-controller-outline" size={24} color="#3B82F6" />
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="font-black text-lg text-white" numberOfLines={1}>
                                                                {teamName || 'Unknown Team'}
                                                            </Text>
                                                            <View className="flex-row items-center gap-2 mt-1">
                                                                {(memberCount >= roster.rosterCapacity && teamSize > 0) ? (
                                                                    <View className="bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 flex-shrink-0">
                                                                        <Text className="text-[9px] font-black text-blue-500 uppercase">
                                                                            {TEAM_LABELS.TEAM_FULL}
                                                                        </Text>
                                                                    </View>
                                                                ) : (
                                                                    <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex-shrink-0">
                                                                        {roster.starterCount} / {teamSize > 0 ? teamSize : '?'} {TEAM_LABELS.MEMBERS_LABEL}
                                                                    </Text>
                                                                )}
                                                                {roster.allowReserves && roster.reserveCount > 0 && (
                                                                    <View
                                                                        className="px-2 py-0.5 rounded-full flex-shrink-0"
                                                                        style={{ backgroundColor: 'rgba(129,140,248,0.12)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.26)' }}
                                                                    >
                                                                        <Text className="text-[9px] font-black uppercase" style={{ color: '#A5B4FC' }}>
                                                                            +{roster.reserveCount} bench
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                                {captain && (
                                                                    <View className="flex-row items-center gap-1 bg-warning/10 px-2 rounded-full py-0.5 border border-warning/20 flex-shrink">
                                                                        <Ionicons name="shield" size={10} color="#F59E0B" />
                                                                        <Text className="text-[9px] text-warning font-black uppercase flex-shrink" numberOfLines={1}>
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
                                                        <View className="mt-4 pt-4 border-t border-white/5 gap-3">
                                                            {membersList.length > 0 ? (
                                                                membersList.map((m: any, mIdx: number) => {
                                                                    const isMemberCaptain = (m.userId || m.UserId)?.toLowerCase() === captainUserId?.toLowerCase();
                                                                    return (
                                                                        <Pressable
                                                                            key={(m.userId || m.UserId) || mIdx.toString()}
                                                                            onPress={() => navigation.navigate('PlayerProfile', { id: m.userId || m.UserId })}
                                                                            className={`flex-row items-center gap-3 p-3 rounded-2xl border active:opacity-70 ${isMemberCaptain ? 'bg-warning/[0.08] border-warning/25' : 'bg-white/[0.04] border-white/[0.08]'}`}
                                                                        >
                                                                            <View className={`rounded-full p-[2.5px] ${isMemberCaptain ? 'border-2 border-warning/50' : 'border border-white/10'}`}>
                                                                                <PlayerAvatar name={m.username || m.Username} src={m.avatarUrl || m.AvatarUrl} size="sm" />
                                                                            </View>
                                                                            <View className="flex-1">
                                                                                <View className="flex-row items-center gap-2">
                                                                                    <Text className="text-white font-bold text-sm" numberOfLines={1}>{m.username || m.Username}</Text>
                                                                                    {isMemberOnBench(m) && (
                                                                                        <View
                                                                                            className="px-1.5 py-[1px] rounded-full"
                                                                                            style={{ backgroundColor: 'rgba(129,140,248,0.14)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.28)' }}
                                                                                        >
                                                                                            <Text className="text-[8px] font-black uppercase tracking-wider" style={{ color: '#A5B4FC' }}>
                                                                                                Reserve
                                                                                            </Text>
                                                                                        </View>
                                                                                    )}
                                                                                </View>
                                                                                {isMemberCaptain ? (
                                                                                    <View className="flex-row items-center gap-1 mt-0.5">
                                                                                        <Ionicons name="shield-checkmark" size={10} color="#F59E0B" />
                                                                                        <Text className="text-[9px] font-black text-warning uppercase tracking-wider">Captain</Text>
                                                                                    </View>
                                                                                ) : (
                                                                                    <Text className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                                                                        {isMemberOnBench(m) ? 'Not playing' : 'Player'}
                                                                                    </Text>
                                                                                )}
                                                                            </View>
                                                                            <Ionicons name="chevron-forward" size={14} color="#475569" />
                                                                        </Pressable>
                                                                    );
                                                                })
                                                            ) : (
                                                                <Text className="text-slate-500 text-center text-xs py-2 italic">No members found</Text>
                                                            )}

                                                            {teamSize > 0 && Array.from({ length: Math.max(0, roster.rosterCapacity - membersList.length) }).map((_, si) => (
                                                                <View
                                                                    key={`empty-${si}`}
                                                                    className="flex-row items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.02]"
                                                                    style={{ borderStyle: 'dashed' }}
                                                                >
                                                                    <View
                                                                        className="w-8 h-8 rounded-full border border-white/15 items-center justify-center"
                                                                        style={{ borderStyle: 'dashed' }}
                                                                    >
                                                                        <Ionicons name="person-add-outline" size={14} color="#475569" />
                                                                    </View>
                                                                    <Text className="text-slate-600 text-xs font-semibold">Open slot</Text>
                                                                </View>
                                                            ))}

                                                            {/* Join Button inside Expanded View */}
                                                            {(() => {
                                                                const isApproved = t.userRequestStatus === 'Approved' || t.UserRequestStatus === 'Approved' || (t.userRequestStatus as any) === 1 || (t.UserRequestStatus as any) === 1;
                                                                const isPending = t.userRequestStatus === 'Pending' || t.UserRequestStatus === 'Pending' || (t.userRequestStatus as any) === 0 || (t.UserRequestStatus as any) === 0;
                                                                // If the user has no team (they may have been kicked), trust userTeam state.
                                                                // Per-team isApproved prevents rejoining a team they're already "approved" in.
                                                                // Capacity, not lineup: a full side can still take bench players.
                                                                const showButton = !userTeam && !isUserRegistered && !isApproved && roster.hasRoom;

                                                                if (!showButton) return null;

                                                                return (
                                                                    <Button
                                                                        className={t.requiresApproval || t.RequiresApproval ? "bg-blue-500 py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-blue-500/20" : "bg-team py-3.5 rounded-2xl w-full mt-3 shadow-md shadow-team/20"}
                                                                        onPress={() => handleJoinTeam(teamId as string, t.requiresApproval || t.RequiresApproval)}
                                                                        loading={joiningTeamId === teamId}
                                                                        disabled={joiningTeamId !== null || isPending}
                                                                    >
                                                                        <Text numberOfLines={1} className={t.requiresApproval || t.RequiresApproval ? "text-white font-black uppercase tracking-widest text-sm text-center w-full" : "text-primary-foreground font-black uppercase tracking-widest text-sm text-center w-full"}>
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

                            {/* Requests — pending team registrations (same card design as the other tabs) */}
                            {teamsTab === 'registrations' && canManage && isPreStart && (
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

                                            return displayedRegistrations.length > 0 && (
                                                <Button
                                                    size="sm"
                                                    onPress={handleApproveAll}
                                                    loading={isLoadingPending}
                                                    className="bg-primary"
                                                >
                                                    Approve All
                                                </Button>
                                            );
                                        })()}
                                    </View>

                                    {isLoadingPending ? (
                                        <ActivityIndicator size="small" color="#F59E0B" />
                                    ) : pendingRegistrations.length === 0 ? (
                                        <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                            <Ionicons name="checkmark-circle-outline" size={48} color="#F59E0B" />
                                            <Text className="text-slate-400 mt-4 text-center">No pending requests.</Text>
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
                                        }, []).map((reg, index) => {
                                            const isTeam = reg.isTeamRegistration || reg.IsTeamRegistration;
                                            if (!isTeam) return null;

                                            const regId = reg.id || reg.registrationId || reg.Id;
                                            const teamId = reg.teamId || reg.TeamId;
                                            const teamName = reg.teamName || reg.TeamName;
                                            const roster = rosterInfo(reg, tournament);
                                            const { teamSize, memberCount } = roster;
                                            const captainUserId = reg.captainUserId || reg.CaptainUserId;
                                            const membersList = roster.members;
                                            const captain = membersList.find((m: any) =>
                                                m.userId?.toLowerCase() === captainUserId?.toLowerCase() ||
                                                m.UserId?.toLowerCase() === captainUserId?.toLowerCase()
                                            );

                                            const isExpanded = expandedTeamId === teamId;

                                            return (
                                                <View key={teamId || regId || index.toString()} className="mb-3">
                                                    <Pressable
                                                        onPress={() => setExpandedTeamId(isExpanded ? null : (teamId || null))}
                                                        className={`bg-card p-5 rounded-[24px] border overflow-hidden ${isExpanded ? 'border-warning/30' : 'border-white/[0.06]'}`}
                                                    >
                                                        <LinearGradient
                                                            colors={['rgba(255,255,255,0.05)', 'transparent']}
                                                            start={{ x: 0, y: 0 }}
                                                            end={{ x: 0.9, y: 0.7 }}
                                                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                                        />
                                                        <View className="flex-row items-center gap-4">
                                                            <View className="w-12 h-12 rounded-2xl bg-warning/10 items-center justify-center border border-warning/20 shadow-sm shadow-warning/20">
                                                                <Ionicons name="shield-half-outline" size={24} color="#F59E0B" />
                                                            </View>
                                                            <View className="flex-1">
                                                                <Text className="font-black text-lg text-white" numberOfLines={1}>
                                                                    {teamName || 'Unknown Team'}
                                                                </Text>
                                                                <View className="flex-row items-center gap-2 mt-1">
                                                                    {(memberCount >= roster.rosterCapacity && teamSize > 0) ? (
                                                                        <View className="bg-warning/10 px-2 py-0.5 rounded-full border border-warning/20 flex-shrink-0">
                                                                            <Text className="text-[9px] font-black text-warning uppercase">
                                                                                {TEAM_LABELS.TEAM_FULL}
                                                                            </Text>
                                                                        </View>
                                                                    ) : (
                                                                        <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex-shrink-0">
                                                                            {roster.starterCount} / {teamSize > 0 ? teamSize : '?'} {TEAM_LABELS.MEMBERS_LABEL}
                                                                        </Text>
                                                                    )}
                                                                    {roster.allowReserves && roster.reserveCount > 0 && (
                                                                        <View
                                                                            className="px-2 py-0.5 rounded-full flex-shrink-0"
                                                                            style={{ backgroundColor: 'rgba(129,140,248,0.12)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.26)' }}
                                                                        >
                                                                            <Text className="text-[9px] font-black uppercase" style={{ color: '#A5B4FC' }}>
                                                                                +{roster.reserveCount} bench
                                                                            </Text>
                                                                        </View>
                                                                    )}
                                                                    {captain && (
                                                                        <View className="flex-row items-center gap-1 bg-warning/10 px-2 rounded-full py-0.5 border border-warning/20 flex-shrink">
                                                                            <Ionicons name="shield" size={10} color="#F59E0B" />
                                                                            <Text className="text-[9px] text-warning font-black uppercase flex-shrink" numberOfLines={1}>
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
                                                            <View className="mt-4 pt-4 border-t border-white/5 gap-3">
                                                                {membersList.length > 0 ? (
                                                                    membersList.map((m: any, mIdx: number) => {
                                                                        const isMemberCaptain = (m.userId || m.UserId)?.toLowerCase() === captainUserId?.toLowerCase();
                                                                        return (
                                                                            <Pressable
                                                                                key={(m.userId || m.UserId) || mIdx.toString()}
                                                                                onPress={() => navigation.navigate('PlayerProfile', { id: m.userId || m.UserId })}
                                                                                className={`flex-row items-center gap-3 p-3 rounded-2xl border active:opacity-70 ${isMemberCaptain ? 'bg-warning/[0.08] border-warning/25' : 'bg-white/[0.04] border-white/[0.08]'}`}
                                                                            >
                                                                                <View className={`rounded-full p-[2.5px] ${isMemberCaptain ? 'border-2 border-warning/50' : 'border border-white/10'}`}>
                                                                                    <PlayerAvatar name={m.username || m.Username} src={m.avatarUrl || m.AvatarUrl} size="sm" />
                                                                                </View>
                                                                                <View className="flex-1">
                                                                                    <Text className="text-white font-bold text-sm" numberOfLines={1}>{m.username || m.Username}</Text>
                                                                                    {isMemberCaptain ? (
                                                                                        <View className="flex-row items-center gap-1 mt-0.5">
                                                                                            <Ionicons name="shield-checkmark" size={10} color="#F59E0B" />
                                                                                            <Text className="text-[9px] font-black text-warning uppercase tracking-wider">Captain</Text>
                                                                                        </View>
                                                                                    ) : (
                                                                                        <Text className="text-[10px] font-semibold text-slate-500 mt-0.5">Player</Text>
                                                                                    )}
                                                                                </View>
                                                                                <Ionicons name="chevron-forward" size={14} color="#475569" />
                                                                            </Pressable>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <Text className="text-slate-500 text-center text-xs py-2 italic">No members found</Text>
                                                                )}

                                                                {teamSize > 0 && Array.from({ length: Math.max(0, teamSize - membersList.length) }).map((_, si) => (
                                                                    <View
                                                                        key={`empty-${si}`}
                                                                        className="flex-row items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.02]"
                                                                        style={{ borderStyle: 'dashed' }}
                                                                    >
                                                                        <View
                                                                            className="w-8 h-8 rounded-full border border-white/15 items-center justify-center"
                                                                            style={{ borderStyle: 'dashed' }}
                                                                        >
                                                                            <Ionicons name="person-add-outline" size={14} color="#475569" />
                                                                        </View>
                                                                        <Text className="text-slate-600 text-xs font-semibold">Open slot</Text>
                                                                    </View>
                                                                ))}
                                                            </View>
                                                        )}

                                                        {/* Approve / Reject — footer action bar inside the card */}
                                                        <View className="flex-row items-center gap-2.5 mt-4 pt-4 border-t border-white/5">
                                                            <Pressable
                                                                onPress={() => handleApprove(regId)}
                                                                disabled={processingId !== null}
                                                                className="flex-1 flex-row items-center justify-center gap-2 h-11 rounded-2xl bg-primary/15 border border-primary/30 active:opacity-60"
                                                            >
                                                                {processingId === regId ? (
                                                                    <ActivityIndicator size="small" color="#10B981" />
                                                                ) : (
                                                                    <>
                                                                        <Ionicons name="checkmark" size={18} color="#10B981" />
                                                                        <Text className="text-primary font-bold text-sm">Approve</Text>
                                                                    </>
                                                                )}
                                                            </Pressable>
                                                            <Pressable
                                                                onPress={() => handleReject(regId)}
                                                                disabled={processingId !== null}
                                                                className="flex-row items-center justify-center gap-2 h-11 px-5 rounded-2xl bg-red-500/10 border border-red-500/20 active:opacity-60"
                                                            >
                                                                <Ionicons name="close" size={18} color="#EF4444" />
                                                                <Text className="text-red-400 font-bold text-sm">Decline</Text>
                                                            </Pressable>
                                                        </View>
                                                    </Pressable>
                                                </View>
                                            );
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
                            <View className="mb-2">
                                <PremiumTabs
                                    tabs={[
                                        { value: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' },
                                        ...(canManage ? [{
                                            value: 'registrations',
                                            label: 'Registrations',
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
                                        if (val === 'registrations' && pendingRegistrations.length === 0) {
                                            fetchPendingRegistrations();
                                        }
                                    }}
                                />
                            </View>

                            {/* Confirmed Players */}
                            {playersTab === 'confirmed' && (
                                isLoadingParticipants ? (
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                ) : participants.length === 0 ? (
                                    <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                        <Ionicons name="people-outline" size={48} color="#71717A" />
                                        <Text className="text-slate-400 mt-4 text-center">No confirmed players yet.</Text>
                                    </View>
                                ) : (
                                    participants.map((p, i) => {
                                        const pUserId = p.userId || p.UserId || p.id;
                                        const isCreator = canManage;
                                        const canRemove = isCreator && (tournament?.status === 0 || tournament?.status === 1 || tournament?.status === 2);
                                        // Swapping stays available once the tournament is LIVE (3) — that's the whole
                                        // point of it. Whether this particular player has played too much to still be
                                        // replaced is the backend's call, shown inside the sheet.
                                        const canSwapPlayer = isCreator
                                            && !tournament?.isTeamTournament
                                            && (tournament?.status ?? 99) <= 3;
                                        const isCurrentUser = user?.id?.toLowerCase() === pUserId?.toLowerCase();

                                        return (
                                            <View key={`${p.participantId || p.id || pUserId || 'p'}-${i}`} className="flex-row items-center gap-2.5">
                                                <Pressable
                                                    onPress={() => { if (pUserId) navigation.navigate('PlayerProfile', { id: pUserId }); }}
                                                    className="flex-1 active:opacity-80"
                                                >
                                                    <View
                                                        className="rounded-[22px] overflow-hidden"
                                                        style={{
                                                            backgroundColor: '#131B2E',
                                                            shadowColor: isCurrentUser ? '#10B981' : '#000000',
                                                            shadowOpacity: isCurrentUser ? 0.18 : 0.22,
                                                            shadowRadius: 12,
                                                            shadowOffset: { width: 0, height: 5 },
                                                            elevation: 4,
                                                        }}
                                                    >
                                                        <LinearGradient
                                                            colors={[isCurrentUser ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.035)', 'transparent']}
                                                            start={{ x: 0, y: 0 }}
                                                            end={{ x: 0.85, y: 0 }}
                                                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                                        />
                                                        <View
                                                            pointerEvents="none"
                                                            className="absolute inset-0 rounded-[22px]"
                                                            style={{ borderWidth: 1, borderColor: isCurrentUser ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.06)' }}
                                                        />
                                                        {isCurrentUser && (
                                                            <View
                                                                style={{
                                                                    position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
                                                                    backgroundColor: '#10B981', borderTopRightRadius: 3, borderBottomRightRadius: 3,
                                                                    shadowColor: '#10B981', shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                                                                }}
                                                            />
                                                        )}
                                                        <View className="flex-row items-center p-3.5 pl-4">
                                                            <View
                                                                className="w-8 h-8 rounded-xl items-center justify-center mr-3"
                                                                style={{
                                                                    backgroundColor: isCurrentUser ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                                                                    borderWidth: 1,
                                                                    borderColor: isCurrentUser ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)',
                                                                }}
                                                            >
                                                                <Text className="font-black text-[13px]" style={{ color: isCurrentUser ? '#34D399' : '#64748B' }}>{i + 1}</Text>
                                                            </View>
                                                            <View style={{ shadowColor: '#10B981', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 2 } }}>
                                                                <View style={{ borderWidth: 1.5, borderColor: isCurrentUser ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 2 }}>
                                                                    <PlayerAvatar src={p.avatarUrl || p.AvatarUrl} name={p.username || p.Username || 'Player'} size="md" />
                                                                </View>
                                                                <View
                                                                    className="absolute items-center justify-center"
                                                                    style={{ bottom: -2, right: -2, width: 18, height: 18, borderRadius: 999, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#131B2E' }}
                                                                >
                                                                    <Ionicons name="checkmark" size={9} color="#0F172A" />
                                                                </View>
                                                            </View>
                                                            <View className="flex-1 ml-3 justify-center">
                                                                <View className="flex-row items-center gap-2">
                                                                    <Text className="font-black text-base text-white" numberOfLines={1}>{p.username || p.Username}</Text>
                                                                    {isCurrentUser && (
                                                                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                                                                            <Text className="text-[9px] font-black uppercase tracking-wider text-emerald-300">You</Text>
                                                                        </View>
                                                                    )}
                                                                </View>
                                                                <View className="flex-row items-center gap-1 mt-1">
                                                                    <View className="w-1 h-1 rounded-full" style={{ backgroundColor: '#10B981' }} />
                                                                    <Text className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: 'rgba(16,185,129,0.8)' }}>Confirmed</Text>
                                                                </View>
                                                            </View>
                                                            <View
                                                                className="w-8 h-8 rounded-full items-center justify-center ml-2"
                                                                style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}
                                                            >
                                                                <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                                                            </View>
                                                        </View>
                                                    </View>
                                                </Pressable>
                                                {canSwapPlayer && (
                                                    <Pressable
                                                        onPress={() => setParticipantSwapTarget({
                                                            userId: pUserId,
                                                            username: p.username || p.Username || 'Player',
                                                            avatarUrl: p.avatarUrl || p.AvatarUrl,
                                                        })}
                                                        disabled={processingId !== null}
                                                        className="w-11 h-11 rounded-2xl items-center justify-center active:opacity-60"
                                                        style={{
                                                            backgroundColor: 'rgba(129,140,248,0.10)',
                                                            borderWidth: 1,
                                                            borderColor: 'rgba(129,140,248,0.22)',
                                                        }}
                                                    >
                                                        <Ionicons name="swap-horizontal" size={18} color="#818CF8" />
                                                    </Pressable>
                                                )}
                                                {canRemove && (
                                                    <Pressable
                                                        onPress={() => setRemoveParticipantTarget({
                                                            userId: pUserId,
                                                            username: p.username || p.Username || 'this player',
                                                        })}
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
                            {playersTab === 'registrations' && canManage && (
                                <>
                                    {/* Approve All button */}
                                    {pendingRegistrations.length > 0 && (
                                        <View className="flex-row justify-end mb-1">
                                            <Button
                                                size="sm"
                                                onPress={handleApproveAll}
                                                loading={isLoadingPending}
                                                className="bg-primary"
                                            >
                                                Approve All
                                            </Button>
                                        </View>
                                    )}
                                    {isLoadingPending ? (
                                        <ActivityIndicator size="small" color="#F59E0B" />
                                    ) : pendingRegistrations.length === 0 ? (
                                        <View className="bg-card/50 p-8 rounded-3xl border border-white/5 items-center justify-center">
                                            <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                                            <Text className="text-slate-400 mt-4 text-center">No pending registrations.</Text>
                                        </View>
                                    ) : (
                                        pendingRegistrations.map((reg) => {
                                            const regId = reg.id || reg.registrationId || reg.Id;
                                            // Registration id ≠ user id — TournamentRegistrationOverview carries both.
                                            // The repo projects UserId with a `?? Guid.Empty` fallback, and the empty
                                            // guid is a truthy string, so screen it out the same way TournamentGroups does.
                                            const regUserIdRaw = reg.userId || reg.UserId;
                                            const regUserId = regUserIdRaw && regUserIdRaw !== '00000000-0000-0000-0000-000000000000'
                                                ? regUserIdRaw
                                                : null;
                                            return (
                                                <View key={regId || Math.random().toString()} className="rounded-[22px] overflow-hidden" style={{ backgroundColor: '#131B2E', shadowColor: '#F59E0B', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 }}>
                                                    <LinearGradient
                                                        colors={['rgba(245,158,11,0.14)', 'transparent']}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 0.85, y: 0 }}
                                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                                    />
                                                    <View
                                                        pointerEvents="none"
                                                        className="absolute inset-0 rounded-[22px]"
                                                        style={{ borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' }}
                                                    />
                                                    <View
                                                        style={{
                                                            position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
                                                            backgroundColor: '#F59E0B', borderTopRightRadius: 3, borderBottomRightRadius: 3,
                                                            shadowColor: '#F59E0B', shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                                                        }}
                                                    />
                                                    <View className="flex-row items-center p-3.5 pl-4">
                                                        {/* Avatar + name open the profile so the organizer can vet the player
                                                            before approving. The approve/reject buttons stay outside it. */}
                                                        <Pressable
                                                            onPress={() => { if (regUserId) navigation.navigate('PlayerProfile', { id: regUserId }); }}
                                                            disabled={!regUserId}
                                                            className="flex-1 flex-row items-center active:opacity-70"
                                                        >
                                                            <View style={{ shadowColor: '#F59E0B', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
                                                                <View style={{ borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.5)', borderRadius: 999, padding: 2 }}>
                                                                    <PlayerAvatar src={reg.avatarUrl || reg.AvatarUrl} name={reg.username || reg.Username || 'Unknown'} size="md" />
                                                                </View>
                                                                <View
                                                                    className="absolute items-center justify-center"
                                                                    style={{ bottom: -2, right: -2, width: 18, height: 18, borderRadius: 999, backgroundColor: '#F59E0B', borderWidth: 2, borderColor: '#131B2E' }}
                                                                >
                                                                    <Ionicons name="hourglass" size={9} color="#0F172A" />
                                                                </View>
                                                            </View>
                                                            <View className="flex-1 ml-3 justify-center">
                                                                <View className="flex-row items-center gap-1">
                                                                    <Text className="font-black text-base text-white flex-shrink" numberOfLines={1}>{reg.username || reg.Username}</Text>
                                                                    {!!regUserId && <Ionicons name="chevron-forward" size={13} color="#64748B" />}
                                                                </View>
                                                                <View className="flex-row items-center gap-1 mt-1">
                                                                    <Ionicons name="person-add" size={11} color="#FBBF24" />
                                                                    <Text className="text-[10px] font-bold uppercase tracking-[1px]" style={{ color: '#FCD34D' }}>Wants to join</Text>
                                                                </View>
                                                            </View>
                                                        </Pressable>
                                                        <View className="flex-row gap-2 items-center">
                                                            <Pressable
                                                                onPress={() => handleReject(regId)}
                                                                disabled={processingId !== null}
                                                                className="w-11 h-11 rounded-2xl items-center justify-center active:opacity-60"
                                                                style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}
                                                            >
                                                                {processingId === regId ? (
                                                                    <ActivityIndicator size="small" color="#EF4444" />
                                                                ) : (
                                                                    <Ionicons name="close" size={18} color="#F87171" />
                                                                )}
                                                            </Pressable>
                                                            <Pressable
                                                                onPress={() => handleApprove(regId)}
                                                                disabled={processingId !== null}
                                                                className="w-11 h-11 rounded-2xl items-center justify-center active:opacity-80"
                                                                style={{ backgroundColor: '#10B981', shadowColor: '#10B981', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
                                                            >
                                                                {processingId === regId ? (
                                                                    <ActivityIndicator size="small" color="#0F172A" />
                                                                ) : (
                                                                    <Ionicons name="checkmark" size={20} color="#0F172A" />
                                                                )}
                                                            </Pressable>
                                                        </View>
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
                onClose={() => {
                    setShowReportModal(false);
                    // If this game was opened from a team match, drop back onto the team overview.
                    // Defer + guard with isFocused: the solo modal also calls onClose right before
                    // navigating to a player's profile, and we must not re-raise the team modal on
                    // top of that pushed screen — only restore it on a genuine dismiss.
                    if (returnToTeamMatchId) {
                        const back = returnToTeamMatchId;
                        setReturnToTeamMatchId(null);
                        setTimeout(() => {
                            if (navigation.isFocused()) {
                                setSelectedTeamMatchId(back);
                                setShowTeamMatchDetail(true);
                            }
                        }, 320);
                    }
                }}
                matchId={selectedMatch?.id}
                tournamentId={id}
                tournamentName={tournament?.name}
                roundName={selectedMatch?.roundName || 'Match Details'}
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
                onMatchUpdate={(freshStructure?: any) => {
                    // Backend now returns the refreshed bracket structure inline on
                    // matchResult / approve / reject, so we can update local state directly
                    // without a follow-up GET_TOURNAMENT_STRUCTURE round-trip. Falls back to
                    // fetchBracket() for actions that don't (yet) piggy-back the structure.
                    if (freshStructure) {
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

            <AdminHelpRequestsModal
                visible={showAdminHelpModal}
                onClose={() => setShowAdminHelpModal(false)}
                requests={adminHelpRequests}
                isLoading={isLoadingAdminHelp}
                onSelect={handleHelpRequestSelect}
            />

            <PendingApprovalsModal
                visible={showApprovalsModal}
                onClose={() => setShowApprovalsModal(false)}
                items={pendingApprovals}
                isLoading={isLoadingApprovals}
                onSelect={handleApprovalSelect}
            />

            {/* Shared team link → confirm before joining / requesting. */}
            <ConfirmationModal
                visible={!!joinPrompt}
                onClose={() => setJoinPrompt(null)}
                onConfirm={handleJoinPromptConfirm}
                isDestructive={false}
                title={joinPrompt?.requiresApproval ? 'Request to Join' : 'Join Team'}
                message={
                    joinPrompt?.requiresApproval
                        ? `Send a request to join ${joinPrompt?.teamName}? The captain will need to approve it.`
                        : `Join ${joinPrompt?.teamName}?`
                }
                confirmText={joinPrompt?.requiresApproval ? 'Request to Join' : 'Join This Team'}
                isLoading={joiningTeamId !== null && joiningTeamId === joinPrompt?.teamId}
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
                />
            )}

            {/* Eligible countries (expanded from the General Info summary) */}
            <CountryListModal
                visible={showCountriesModal}
                onClose={() => setShowCountriesModal(false)}
                codes={tournament?.countries || []}
                title="Eligible Countries"
            />

            {/* Team Match Detail Modal */}
            {showTeamMatchDetail && (
                <TeamMatchDetailModal
                    visible={showTeamMatchDetail}
                    onClose={() => { setShowTeamMatchDetail(false); setSelectedTeamMatchId(null); }}
                    matchId={selectedTeamMatchId}
                    tournamentId={tournament?.id}
                    hubOwnerId={hubOwnerId}
                    canManage={canManage}
                    currentUserId={user?.id}
                    onOpenSubMatch={handleOpenSubMatchFromTeam}
                    onMatchUpdate={() => {
                        fetchBracket();
                        if (tournament?.isTeamTournament) fetchTournamentTeams(id);
                    }}
                />
            )}

            <ConfirmationModal
                visible={showStartConfirm}
                onClose={() => setShowStartConfirm(false)}
                onConfirm={() => { setShowStartConfirm(false); handleCreateBracket(); }}
                title="Start the tournament?"
                message={`The ${getTournamentFormatLabel(Number(tournament?.format))} schedule is generated from a random draw.\n\nEveryone registered gets a notification and the tournament goes live.`}
                confirmText="Generate bracket"
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
            />

            {/* Removing an entrant deletes their spot outright — unlike a swap, nothing inherits it. */}
            <ConfirmationModal
                visible={!!removeParticipantTarget}
                onClose={() => setRemoveParticipantTarget(null)}
                onConfirm={() => removeParticipantTarget && handleRemoveParticipant(removeParticipantTarget.userId)}
                title="Remove this player?"
                message={`${removeParticipantTarget?.username} is taken out of the tournament along with their registration.\n\nTo hand their spot to someone else instead — keeping the seed and any results — use the swap button.`}
                confirmText="Remove player"
                isLoading={processingId === removeParticipantTarget?.userId}
                stacked
            />

            <ExportBracketModal
                visible={showExportModal}
                onClose={() => setShowExportModal(false)}
                onSelect={handleExportBracketPdf}
            />

            {tournament && (
                <ShareTournamentCardModal
                    visible={shareCardVisible}
                    onClose={() => setShareCardVisible(false)}
                    tournamentId={id}
                    name={tournament.name || 'Tournament'}
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
                />
            )}
        </SafeAreaView>
    );
}


