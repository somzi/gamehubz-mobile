import { useRequestGate } from '../../hooks/useRequestGate';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HourlyAvailabilityPicker } from './HourlyAvailabilityPicker';
import { MatchTimingStrip, MatchDeadlineBar } from './MatchTimingStrip';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { MatchCheckInPanel, MatchCheckInBar, type MatchCheckInState } from './MatchCheckInPanel';
import { PlayerIdentity, hasNickname } from './PlayerIdentity';
import { EvidenceSection } from './EvidenceSection';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { RaisedCard } from '../ui/RaisedCard';
import { COLORS } from '../../lib/theme';
import { cn, parseUtcDate } from '../../lib/utils';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgesContext';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import * as ImagePicker from 'expo-image-picker';
import { PendingEvidenceStrip } from './PendingEvidenceStrip';
import { MatchChatPanel } from './MatchChatPanel';
import { ChatWorkspace } from '../../lib/chatWorkspace';
import { createSingleFlight } from '../../lib/singleFlight';
import { EvidenceThumb } from './EvidenceThumb';
import { EvidencePreviewModal } from './EvidencePreviewModal';
import { ResultVerificationCard } from './ResultVerificationCard';
import { VerifyResultSheet } from './VerifyResultSheet';
import { useResultVerification } from '../../hooks/useResultVerification';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import {
    EvidenceItem,
    PreparedEvidence,
    normalizeEvidenceItems,
    pickEvidenceAssets,
    prepareEvidenceForUpload,
    isImageWithinLimit,
    MAX_VIDEO_DURATION_SECONDS,
} from '../../lib/evidence';
import { RootStackParamList } from '../../types/navigation';
import { MAX_FILE_SIZE, formatFileSize } from '../../lib/image';
import { AdminHelpSection } from './AdminHelpSection';
import { MatchStreamPanel } from './MatchStreamPanel';
import { MatchInsightsPanel, type MatchInsightPlayer } from './MatchInsightsPanel';
import { SeriesScoreEntry } from './SeriesScoreEntry';
import { SeriesBreakdown } from './SeriesBreakdown';
import {
    SeriesFormat,
    SeriesGame,
    SeriesOutcome,
    normalizeBestOf,
    normalizeCondition,
    seriesGamesFrom,
} from '../../lib/series';
import { MatchStream, MatchStreamStatus } from '../../types/stream';
import { scrollRowIntoView } from '../../lib/scrollIntoView';
import { dateLocale } from '../../i18n';
import { afterScreenTransition, useModalHandoff } from '../../lib/modalHandoff';

type MatchStatus = 'pending_availability' | 'scheduled' | 'ready_phase' | 'completed';

interface MatchScheduleCardProps {
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    roundName: string;
    opponentName: string;
    opponentAvatarUrl?: string;
    opponentNickname?: string;
    userNickname?: string;
    status: MatchStatus;
    /**
     * Ready-check state straight off the match list, so the card face can run its countdown (and
     * offer the button) without opening the match. Absent on hosts that don't send it — the card
     * then only learns about the check when the modal fetches details.
     */
    checkIn?: {
        enabled?: boolean;
        graceMinutes?: number | null;
        /** Which side the viewer plays; null when they are neither. */
        isHome?: boolean | null;
    } & MatchCheckInState;
    /** Round deadline as a raw backend timestamp (MatchOverviewDto.roundDeadline). */
    deadline?: string;
    scheduledTime?: string;
    /** Raw backend timestamp behind `scheduledTime` — lets the timing strip render the
     *  kick-off as clock + date instead of one pre-localized blob. */
    scheduledTimeIso?: string | null;
    opponentAvailability?: string[];
    onMatchUpdate?: (tournamentId: string) => void;
    onPress?: () => void;
    variant?: 'default' | 'compact';
    isRoundLocked?: boolean;
    /** Unread chat messages for the current user — drives the per-match chat badge. */
    unreadMessages?: number;
    /** Series format from the match list, so the collapsed card can show "BO3" before it is opened. */
    bestOf?: number;
}

// Card-face colour per status. It follows the Home section the match sits in: no agreed time is
// amber (Needs Attention), a booked kick-off is emerald (Active Matches). `text` is the shade that
// reads on the dark card.
const FACE_TONES: Record<MatchStatus, { accent: string; text: string }> = {
    pending_availability: { accent: COLORS.warning, text: '#FBBF24' },
    scheduled: { accent: COLORS.primary, text: COLORS.primaryBright },
    ready_phase: { accent: '#6366F1', text: '#A5B4FC' },
    completed: { accent: COLORS.slate500, text: COLORS.slate400 },
};

const TABULAR = { fontVariant: ['tabular-nums' as const] };

// 24-hour, like the Match Time box inside the sheet.
const formatKickOffClock = (d: Date) =>
    d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });

// The kick-off date on the clock tile's band: day and short month in the locale's order
// ("30. sep", "Sep 30").
const formatKickOffDate = (d: Date) =>
    d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

/**
 * The card itself. Exported below wrapped in React.memo — see the note there; call sites import
 * the memoized `MatchScheduleCard`, not this.
 */
function MatchScheduleCardBase({
    matchId,
    tournamentId,
    tournamentName,
    roundName,
    opponentName,
    opponentAvatarUrl,
    opponentNickname,
    userNickname,
    status: initialStatus,
    checkIn,
    deadline = 'TBD',
    scheduledTime: initialScheduledTime,
    scheduledTimeIso,
    opponentAvailability: initialOpponentAvailability = [],
    onMatchUpdate,
    onPress,
    variant = 'default',
    isRoundLocked = false,
    unreadMessages = 0,
    bestOf: bestOfProp,
}: MatchScheduleCardProps) {
    const { t } = useTranslation('match');
    const { t: tCommon } = useTranslation('common');
    const { user } = useAuth();
    const { refresh: refreshBadges } = useBadges();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const requests = useRequestGate(matchId);
    // Native Modal unmounts its children on close. A profile trip keeps this card alive,
    // so it owns the draft and outbox until the match itself leaves the list.
    const chatWorkspace = React.useMemo(() => new ChatWorkspace(), [matchId]);
    const insets = useSafeAreaInsets();

    // The shared chat updates the cached unread count after the read succeeds.
    // New badge pushes refetch it, so later unread messages appear again.
    const showUnreadBadge = unreadMessages > 0 && initialStatus !== 'completed';

    const [modalVisible, setModalVisible] = useState(false);

    // The modal root already pads the safe-area bottom, so the content only has to be
    // lifted by the rest of the keyboard. Measured on both platforms — see the hook for
    // why KeyboardAvoidingView cannot do this from inside a modal. Only subscribed while
    // the modal is open: these cards render one per match in a list.
    const keyboardInset = useKeyboardInset(insets.bottom, modalVisible);

    const [currentStatus, setCurrentStatus] = useState<MatchStatus>(initialStatus);
    const [matchTime, setMatchTime] = useState(initialScheduledTime);
    const [matchTimeIso, setMatchTimeIso] = useState<string | undefined>(scheduledTimeIso ?? undefined);
    useEffect(() => { setCurrentStatus(initialStatus); }, [initialStatus]);
    useEffect(() => {
        setMatchTime(initialScheduledTime);
        setMatchTimeIso(scheduledTimeIso ?? undefined);
    }, [initialScheduledTime, scheduledTimeIso]);
    const [localDeadline, setLocalDeadline] = useState<string>(deadline);
    /** "We already agreed outside the app" is a one-way skip of the whole availability step —
     *  it schedules the match for BOTH sides — so it goes through a confirmation first. */
    const [confirmMarkScheduled, setConfirmMarkScheduled] = useState(false);
    /** Null means the tournament setting is unknown. Scheduling choices appear together after
     *  details and availability load, so adding this shortcut never moves the calendar card. */
    const [allowScheduleOutsideApp, setAllowScheduleOutsideApp] = useState<boolean | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Slots state
    const [mySlots, setMySlots] = useState<string[]>([]);
    const [opponentSlots, setOpponentSlots] = useState<string[]>(initialOpponentAvailability);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

    // Result reporting state
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');
    const [dbHomeUserId, setDbHomeUserId] = useState<string | null>(null);
    const [dbAwayUserId, setDbAwayUserId] = useState<string | null>(null);
    const [dbHomeUsername, setDbHomeUsername] = useState<string | null>(null);
    const [dbAwayUsername, setDbAwayUsername] = useState<string | null>(null);
    const [requireResultApproval, setRequireResultApproval] = useState(false);
    const [proposedHomeScore, setProposedHomeScore] = useState<number | null>(null);
    const [proposedAwayScore, setProposedAwayScore] = useState<number | null>(null);
    const [proposedByUserId, setProposedByUserId] = useState<string | null>(null);
    const [hubOwnerUserId, setHubOwnerUserId] = useState<string | null>(null);
    const [existingEvidences, setExistingEvidences] = useState<EvidenceItem[]>([]);
    const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);
    const [adminHelpRequested, setAdminHelpRequested] = useState(false);
    const [adminHelpRequestedByUserId, setAdminHelpRequestedByUserId] = useState<string | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [isEditingProposal, setIsEditingProposal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Series state. Format is resolved server-side (match override, else tournament default) and
    // arrives with the match details; a backend that predates the feature simply reports Bo1, which
    // keeps the old single-score form. `seriesGames` is held in VISUAL order (logged-in user on the
    // left) and mapped to the DB's home/away roles at submit time, exactly like the single scores.
    const [seriesFormat, setSeriesFormat] = useState<SeriesFormat>({ bestOf: 1, tiebreakBestOf: null, condition: 0 });
    const [reportedGames, setReportedGames] = useState<SeriesGame[]>([]);
    // Games behind a result that is still awaiting approval — they sit in their own list until it
    // is approved, so both the proposal panel and the edit form have to read them from here.
    const [proposedGames, setProposedGames] = useState<SeriesGame[]>([]);
    const [seriesGames, setSeriesGames] = useState<SeriesGame[]>([]);
    const [seriesOutcome, setSeriesOutcome] = useState<SeriesOutcome | null>(null);
    const [isSeriesComplete, setIsSeriesComplete] = useState(false);
    // Solo knockout is the only place a level series waits for a tiebreak; everywhere else it is
    // either a draw (league / group / Swiss) or settled by the team tie one level up.
    const [allowsTiebreak, setAllowsTiebreak] = useState(false);
    // The series format arrives with the match details, which are fetched after the modal opens.
    // Until they land, the format is unknown — rendering anyway would draw the single-score form
    // for a best-of match and then swap it out, which reads as the modal reopening itself.
    const [detailsLoaded, setDetailsLoaded] = useState(false);

    // Ready check on this fixture. Null state = the tournament runs no check, or this match has no
    // agreed kick-off to turn up for; the panel renders nothing either way.
    const [checkInEnabled, setCheckInEnabled] = useState(Boolean(checkIn?.enabled));
    const [checkInGraceMinutes, setCheckInGraceMinutes] = useState<number | null>(checkIn?.graceMinutes ?? null);
    const [checkInState, setCheckInState] = useState<MatchCheckInState>({
        homeCheckedInOn: checkIn?.homeCheckedInOn ?? null,
        awayCheckedInOn: checkIn?.awayCheckedInOn ?? null,
        checkInOpensAt: checkIn?.checkInOpensAt ?? null,
        checkInDeadline: checkIn?.checkInDeadline ?? null,
    });

    // Result verification. The setting arrives with the details the sheet fetches on open; the panel
    // is only fetched while the sheet is open and the tournament requires it — a list of these cards
    // costs nothing extra.
    const [requireResultVerification, setRequireResultVerification] = useState(false);
    // Records already on the match keep the card up after an organizer switches the setting off.
    const [hasResultVerifications, setHasResultVerifications] = useState(false);
    const showVerification = requireResultVerification || hasResultVerifications;
    const verification = useResultVerification(matchId, modalVisible && showVerification);
    const [showVerifySheet, setShowVerifySheet] = useState(false);

    // The card outlives a list refetch (same key), so a check-in the opponent made in the
    // meantime has to reach it — the same reason the deadline is synced above.
    useEffect(() => {
        if (!checkIn) return;
        setCheckInEnabled(Boolean(checkIn.enabled));
        setCheckInGraceMinutes(checkIn.graceMinutes ?? null);
        setCheckInState({
            homeCheckedInOn: checkIn.homeCheckedInOn ?? null,
            awayCheckedInOn: checkIn.awayCheckedInOn ?? null,
            checkInOpensAt: checkIn.checkInOpensAt ?? null,
            checkInDeadline: checkIn.checkInDeadline ?? null,
        });
    }, [checkIn?.enabled, checkIn?.graceMinutes, checkIn?.homeCheckedInOn, checkIn?.awayCheckedInOn,
        checkIn?.checkInOpensAt, checkIn?.checkInDeadline]);


    const isSeriesMatch = seriesFormat.bestOf > 1 || reportedGames.length > 0 || proposedGames.length > 0;

    // The card face renders before the modal has fetched details, so it falls back to the Best-of
    // the match list already carries; once details are in, they win (a match override beats the list).
    const cardBestOf = seriesFormat.bestOf > 1 ? seriesFormat.bestOf : normalizeBestOf(bestOfProp);

    // Reported games arrive in DB home/away order; the form shows the logged-in player on the left.
    // Flip once here so the entry component only ever deals in visual order (the submit path flips
    // back). Until the DB home id is known, leaving them unflipped is the same assumption the
    // single-score path makes.
    const isUserDbHomeSide = !!dbHomeUserId && !!user?.id
        && dbHomeUserId.toLowerCase() === user.id.toLowerCase();

    const flipToVisual = React.useCallback(
        (games: SeriesGame[]) => (isUserDbHomeSide
            ? games
            : games.map(g => ({ ...g, homeScore: g.awayScore, awayScore: g.homeScore }))),
        [isUserDbHomeSide],
    );

    const visualReportedGames = React.useMemo(() => flipToVisual(reportedGames), [reportedGames, flipToVisual]);
    const visualProposedGames = React.useMemo(() => flipToVisual(proposedGames), [proposedGames, flipToVisual]);
    // What the entry form opens with. Editing a pending proposal has nothing in `reportedGames`
    // yet — it used to open blank and silently drop every game the reporter had entered.
    const visualEntrySeedGames = visualReportedGames.length > 0 ? visualReportedGames : visualProposedGames;
    // Upload-ready files, not raw picks: clips are transcoded when chosen so the send is a
    // plain POST. Mirrors MatchDetailsModal, which feeds the same endpoint.
    const [selectedImages, setSelectedImages] = useState<PreparedEvidence[]>([]);
    const [isPreparingMedia, setIsPreparingMedia] = useState(false);
    // See MatchDetailsModal: a silent spinner through a 30s transcode reads as a hang.
    const [compressionProgress, setCompressionProgress] = useState(0);

    // Comments state
    const mainScrollViewRef = useRef<ScrollView>(null);
    // Live scroll offset, kept in a ref so tracking it costs no re-renders.
    const mainScrollY = useRef(0);
    // Collapsible sections state. Evidence starts closed: it's the tallest block on the screen,
    // empty most of the time, and open it pushed "Need Help?" below the fold.
    const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);
    const [isChatExpanded, setIsChatExpanded] = useState(true);
    const [isAvailabilityExpanded, setIsAvailabilityExpanded] = useState(true);
    const [activeModalTab, setActiveModalTab] = useState<'match' | 'insights' | 'chat' | 'stream'>('match');

    // Streaming — both opponents can stream, so we track a list.
    const [streams, setStreams] = useState<MatchStream[]>([]);

    const isMatchParticipant = !!user?.id && (
        (!!dbHomeUserId && dbHomeUserId.toLowerCase() === user.id.toLowerCase()) ||
        (!!dbAwayUserId && dbAwayUserId.toLowerCase() === user.id.toLowerCase())
    );

    // Which side the viewer plays. The list says so outright; inside the modal it is resolved
    // from the details fetch, which is the only source once the card is open.
    //
    // Null means "not resolved yet" and never "away": guessing the away side for any participant
    // (which is what this did) puts the "(you)" marker on the wrong row for every home player
    // until the details land. Unknown is honest, and the panel simply holds its button until the
    // fetch answers.
    const checkInSide: boolean | null = checkIn?.isHome ?? (
        !!dbHomeUserId && !!user?.id
            ? dbHomeUserId.toLowerCase() === user.id.toLowerCase()
            : null
    );

    // Stats tab — head-to-head plus the opponent's recent form, the same panel the bracket's
    // match modal shows. The list row has no opponent id (it arrives with the details fetch the
    // modal runs on open), but every row here is the viewer's own match with both sides filled,
    // so the tab is drawn from the first frame and only the panel waits for the id — gating the
    // tab on the fetch drew three tabs and then re-flowed the bar to four. It is dropped only if
    // the details come back with no opponent (a failed fetch, a team game missing a player).
    const opponentUserId = isUserDbHomeSide ? dbAwayUserId : isMatchParticipant ? dbHomeUserId : null;
    const showInsightsTab = !!user?.id && (opponentUserId
        ? opponentUserId.toLowerCase() !== user.id.toLowerCase()
        : !detailsLoaded);
    const insightMe: MatchInsightPlayer = {
        id: user?.id || '',
        name: user?.username || t('card.you'),
        avatarUrl: user?.avatarUrl ?? null,
    };
    const insightOpponent: MatchInsightPlayer = {
        id: opponentUserId || '',
        name: opponentName,
        avatarUrl: opponentAvatarUrl ?? null,
    };

    // A fourth tab has to share the row, so the labels drop a size — the same rule
    // MatchDetailsModal applies to its own tab bar.
    const modalTabCount = 2 + (showInsightsTab ? 1 : 0) + (currentStatus !== 'pending_availability' ? 1 : 0);
    const modalTabLabelClass = modalTabCount >= 4
        ? 'text-[10px] font-black uppercase tracking-wider'
        : 'text-xs font-black uppercase tracking-widest';

    // Never leave the Stats tab selected once there is nothing for it to show.
    useEffect(() => {
        if (activeModalTab === 'insights' && !showInsightsTab) setActiveModalTab('match');
    }, [activeModalTab, showInsightsTab]);

    // A player tap has to close the sheet — it is a native Modal and would sit on top of the pushed
    // profile — and coming back reopens it where it was left. The tab survives the close on its
    // own, and so do the typed Bo1 scores and the picked evidence (they live in this component).
    // The rest is handled here: the details stay on screen instead of dropping behind the loading
    // gate (see the open/close effect), and an unsubmitted best-of draft is handed back to the
    // form, which otherwise rebuilds from the server's games when it mounts again.
    const reopenOnFocusRef = useRef(false);
    const [seriesDraftToRestore, setSeriesDraftToRestore] = useState<SeriesGame[] | null>(null);

    // The profile slides in once the sheet is down, and the sheet comes back once the profile has
    // slid away — one movement at a time (see lib/modalHandoff).
    const sheetHandoff = useModalHandoff();
    const openPlayerProfile = (userId?: string | null, seriesDraft?: SeriesGame[]) => {
        if (!userId) return;
        reopenOnFocusRef.current = true;
        setSeriesDraftToRestore(seriesDraft?.length ? seriesDraft : null);
        setModalVisible(false);
        // Only if the viewer is still on this list: leaving it while the sheet went down cancels it.
        sheetHandoff.after(() => {
            if (navigation.isFocused()) navigation.navigate('PlayerProfile', { id: userId });
            else reopenOnFocusRef.current = false;
        });
    };

    useFocusEffect(
        React.useCallback(() => {
            const cancel = reopenOnFocusRef.current ? afterScreenTransition(() => {
                reopenOnFocusRef.current = false;
                setModalVisible(true);
            }) : undefined;
            return () => { cancel?.(); setModalVisible(false); };
        }, [])
    );

    // The card outlives a list refetch (same key), so pick up a deadline the admin moved
    // instead of showing the one this card mounted with.
    useEffect(() => {
        setLocalDeadline(deadline);
    }, [deadline]);

    const fetchAvailability = async () => {
        const isCurrent = requests.begin('fetchAvailability');
        if (!user?.id || !matchId) return;
        setIsLoadingAvailability(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_AVAILABILITY(matchId, user.id));
            if (!isCurrent()) return;
            if (response.ok) {
                const data = await response.json();
            if (!isCurrent()) return;
                if (data.mySlots) setMySlots(data.mySlots);
                if (data.opponentSlots) setOpponentSlots(data.opponentSlots);
                if (data.matchDeadline) {
                    setLocalDeadline(data.matchDeadline);
                }
                if (data.confirmedTime) {
                    // parseUtcDate, not new Date(): the backend serializes without a Z suffix,
                    // so raw parsing reads the UTC clock as local and shifts the time.
                    const confirmedDate = parseUtcDate(data.confirmedTime);
                    setMatchTime(confirmedDate.toLocaleString(dateLocale()));
                    setMatchTimeIso(data.confirmedTime);
                    setCurrentStatus('scheduled');
                }
            }
        } catch (error) {
            if (!isCurrent()) return;
            console.error('Error fetching availability:', error);
        } finally {
            if (!isCurrent()) return;
            setIsLoadingAvailability(false);
        }
    };

    const fetchStreams = async () => {
        const isCurrent = requests.begin('fetchStreams');
        if (!matchId) return;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_STREAMS(matchId));
            if (!isCurrent()) return;
            if (response.ok) {
                const data = await response.json();
            if (!isCurrent()) return;
                setStreams(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            if (!isCurrent()) return;
            console.error('Error fetching streams:', error);
        }
    };

    const detailsRead = React.useMemo(() => createSingleFlight<string | null>(), [matchId]);
    const fetchDbHomeUserId = (force = false): Promise<string | null> => detailsRead(async () => {
        const isCurrent = requests.begin('fetchDbHomeUserId');
        if (!matchId) {
            // Nothing to wait for, and the gate below must not strand the form behind a spinner:
            // callers build this id defensively (`match.id || match.matchId || ''`).
            setAllowScheduleOutsideApp(null);
            setDetailsLoaded(true);
            return null;
        }
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS(matchId));
            if (!isCurrent()) return null;
            if (response.ok) {
                const data = await response.json();
            if (!isCurrent()) return null;

                // For a team sub-match, GET_MATCH_DETAILS returns the whole team-match DTO,
                // which has no top-level homeUserId/awayUserId — the home/away roles (and the
                // proposal) live on the individual sub-match. Without resolving them here,
                // dbHomeUserId stays null, isUserDbHome is always false in handleSubmitResult,
                // and the score mapping silently swaps home/away whenever the reporter is the
                // DB home player. Fall back to the matching sub-match so team scores aren't flipped.
                let homeUserId = data.homeUserId || data.HomeUserId || null;
                let awayUserId = data.awayUserId || data.AwayUserId || null;
                let homeUsername = data.homeUser || data.HomeUser || null;
                let awayUsername = data.awayUser || data.AwayUser || null;
                let proposedHome = data.proposedHomeScore ?? data.ProposedHomeScore ?? null;
                let proposedAway = data.proposedAwayScore ?? data.ProposedAwayScore ?? null;
                let proposedBy = data.proposedByUserId ?? data.ProposedByUserId ?? null;
                let evidences = normalizeEvidenceItems(
                    data.evidenceItems || data.EvidenceItems,
                    data.evidences || data.Evidences,
                );

                // Series format + games. On a team sub-match these live on the sub-match row, and
                // the win condition on the parent DTO, so both are re-read in the sub-match branch.
                let bestOf = data.bestOf ?? data.BestOf ?? 1;
                let tiebreakBestOf = data.tiebreakBestOf ?? data.TiebreakBestOf ?? null;
                const condition = normalizeCondition(data.seriesWinCondition ?? data.SeriesWinCondition);
                let games = seriesGamesFrom(data);
                let proposed = seriesGamesFrom({ games: data.proposedGames ?? data.ProposedGames });
                // Only a solo knockout match can park in a tiebreak; the server says which.
                let allowsTie = Boolean(data.allowsTieBreak ?? data.AllowsTieBreak ?? false);
                // Per game on a team tie, like the evidence it points at.
                let hasVerifications = Boolean(data.hasResultVerifications ?? data.HasResultVerifications ?? false);

                if (!homeUserId) {
                    const subs = data.subMatches || data.SubMatches || [];
                    const sub = subs.find(
                        (s: any) => (s.matchId || s.MatchId || '').toLowerCase() === matchId.toLowerCase()
                    );
                    if (sub) {
                        const hp = sub.homePlayer || sub.HomePlayer;
                        const ap = sub.awayPlayer || sub.AwayPlayer;
                        homeUserId = hp?.userId || hp?.UserId || null;
                        awayUserId = ap?.userId || ap?.UserId || null;
                        homeUsername = hp?.username || hp?.Username || homeUsername;
                        awayUsername = ap?.username || ap?.Username || awayUsername;
                        proposedHome = sub.proposedHomeScore ?? sub.ProposedHomeScore ?? proposedHome;
                        proposedAway = sub.proposedAwayScore ?? sub.ProposedAwayScore ?? proposedAway;
                        proposedBy = sub.proposedByUserId ?? sub.ProposedByUserId ?? proposedBy;
                        // Unconditional: this card is showing one game of the tie, so its evidence
                        // is the sub-match's. Falling back to the parent when the sub has none
                        // would show the other games' screenshots under this one.
                        evidences = normalizeEvidenceItems(
                            sub.evidenceItems || sub.EvidenceItems,
                            sub.evidences || sub.Evidences,
                        );
                        // Each individual game of a tie is its own series, reported on the sub-match.
                        bestOf = sub.bestOf ?? sub.BestOf ?? bestOf;
                        tiebreakBestOf = sub.tiebreakBestOf ?? sub.TiebreakBestOf ?? tiebreakBestOf;
                        games = seriesGamesFrom(sub);
                        proposed = seriesGamesFrom({ games: sub.proposedGames ?? sub.ProposedGames });
                        // A level sub-match is never replayed — the tie resolves it one level up.
                        allowsTie = false;
                        hasVerifications = Boolean(sub.hasResultVerifications ?? sub.HasResultVerifications ?? false);
                    }
                }

                setSeriesFormat({
                    bestOf: normalizeBestOf(bestOf),
                    tiebreakBestOf: tiebreakBestOf == null ? null : normalizeBestOf(tiebreakBestOf),
                    // A team sub-match takes the win condition from the parent team-match DTO,
                    // where it is reported as seriesWinCondition alongside the tie's own condition.
                    condition: normalizeCondition(data.seriesWinCondition ?? data.SeriesWinCondition ?? condition),
                });
                setReportedGames(games);
                setProposedGames(proposed);
                setAllowsTiebreak(allowsTie);

                // Ready check. The setting is tournament-wide (parent DTO on a team tie); the
                // state belongs to the individual game, which is what this card shows.
                const checkInSource = data.homeCheckedInOn !== undefined || data.checkInDeadline !== undefined
                    ? data
                    : (data.subMatches || data.SubMatches || []).find(
                        (s: any) => (s.matchId || s.MatchId || '').toLowerCase() === (matchId || '').toLowerCase()
                    ) ?? {};

                setCheckInEnabled(Boolean(data.requireMatchCheckIn ?? data.RequireMatchCheckIn ?? false));
                setCheckInGraceMinutes(data.checkInGraceMinutes ?? data.CheckInGraceMinutes ?? null);
                // Tournament-wide, so on a team game it is read off the parent DTO like the ready check.
                setRequireResultVerification(Boolean(data.requireResultVerification ?? data.RequireResultVerification ?? false));
                // Tournament-wide as well — the parent DTO on a team tie carries it. Only an explicit
                // false turns it off, so a server that predates the setting keeps the shortcut.
                setAllowScheduleOutsideApp((data.allowScheduleOutsideApp ?? data.AllowScheduleOutsideApp) !== false);
                setHasResultVerifications(hasVerifications);
                setCheckInState({
                    homeCheckedInOn: checkInSource.homeCheckedInOn ?? checkInSource.HomeCheckedInOn ?? null,
                    awayCheckedInOn: checkInSource.awayCheckedInOn ?? checkInSource.AwayCheckedInOn ?? null,
                    checkInOpensAt: checkInSource.checkInOpensAt ?? checkInSource.CheckInOpensAt ?? null,
                    checkInDeadline: checkInSource.checkInDeadline ?? checkInSource.CheckInDeadline ?? null,
                });

                setDbHomeUserId(homeUserId);
                setDbAwayUserId(awayUserId);
                setDbHomeUsername(homeUsername);
                setDbAwayUsername(awayUsername);
                setRequireResultApproval(Boolean(data.requireResultApproval ?? data.RequireResultApproval ?? false));
                setProposedHomeScore(proposedHome);
                setProposedAwayScore(proposedAway);
                setProposedByUserId(proposedBy);
                setHubOwnerUserId(data.hubOwnerUserId ?? data.HubOwnerUserId ?? null);
                setExistingEvidences(evidences);
                setAdminHelpRequested(Boolean(data.adminHelpRequested ?? data.AdminHelpRequested ?? false));
                setAdminHelpRequestedByUserId(data.adminHelpRequestedByUserId ?? data.AdminHelpRequestedByUserId ?? null);
                return homeUserId;
            }
            setAllowScheduleOutsideApp(null);
        } catch (error) {
            if (!isCurrent()) return null;
            // A failed refresh must not reuse an earlier permission to skip the calendar.
            setAllowScheduleOutsideApp(null);
            console.error('[MatchScheduleCard] Error fetching match details for home/away mapping:', error);
        } finally {
            if (!isCurrent()) return null;
            // Settled either way: a failed fetch must not leave the form hidden behind a spinner.
            setDetailsLoaded(true);
        }
        return null;
    }, force);

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
                throw new Error(text || t('card.approveFailed'));
            }
            setModalVisible(false);
            // The consumed proposal drops both this user's "result to confirm" badge and the
            // organizer pill cascade — refresh eagerly instead of relying on the SignalR push.
            refreshBadges();
            if (onMatchUpdate) onMatchUpdate(tournamentId);
        } catch (err: any) {
            console.error('[MatchScheduleCard] Approve error:', err);
            setError(err.message || t('card.approveError'));
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
                throw new Error(text || t('card.rejectFailed'));
            }
            // Refresh details so the modal returns to the empty-score state and the proposer can resubmit.
            await fetchDbHomeUserId(true);
            refreshBadges();
            if (onMatchUpdate) onMatchUpdate(tournamentId);
        } catch (err: any) {
            console.error('[MatchScheduleCard] Reject error:', err);
            setError(err.message || t('card.rejectError'));
        } finally {
            setIsRejecting(false);
        }
    };

    // Match details load on opening; chat loads only on its own tab.
    useEffect(() => {
        if (!modalVisible) {
            // A trip to a player's profile is not a real close: the sheet comes straight back on
            // this match, so it keeps showing what it had while the fetches below refresh it.
            if (!reopenOnFocusRef.current) setDetailsLoaded(false);
            // A verification is always started fresh; it never survives the sheet it was opened from.
            setShowVerifySheet(false);
            // The preview lives inside the sheet now: left set, it would be back up on the next opening.
            setPreviewItem(null);
            return;
        }

        if (currentStatus === 'pending_availability') {
            fetchAvailability();
        }

        // Fetch DB home/away roles so we can correctly map scores on submit AND so the chat
        // can tell participants from admins (admin messages get a badge + their own avatar,
        // never the opponent's). Needed in every state the chat is viewable, including completed.
        fetchDbHomeUserId();

        // Stream availability — relevant once a match is scheduled, in ready phase, or completed (replay).
        if (currentStatus === 'scheduled' || currentStatus === 'ready_phase' || currentStatus === 'completed') {
            fetchStreams();
        }
    }, [modalVisible, matchId]); // Removed currentStatus from dependencies to prevent re-fetching on status changes

    // While a ready check is open, the opponent's confirmation arrives without this user touching
    // anything — and it is what unlocks the result form. Poll for it instead of leaving them on a
    // stale "waiting" panel. Stops the moment both are in.
    useEffect(() => {
        if (!modalVisible || !checkInEnabled) return;
        if (!checkInState.checkInDeadline) return;
        if (checkInState.homeCheckedInOn && checkInState.awayCheckedInOn) return;

        const id = setInterval(() => { fetchDbHomeUserId(); }, 20000);
        return () => clearInterval(id);
    }, [modalVisible, matchId, checkInEnabled, checkInState.checkInDeadline, checkInState.homeCheckedInOn, checkInState.awayCheckedInOn]);

    const handleAvailabilitySubmit = async (slots: string[], dateTimeSlots: string[]) => {
        try {
            setIsSubmitting(true);
            if (!matchId) return;

            const payload = {
                matchId: matchId,
                selectedSlots: dateTimeSlots,
            };

            const response = await authenticatedFetch(ENDPOINTS.SUBMIT_MATCH_AVAILABILITY, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            // Rethrown below so the picker rolls back its optimistic "Availability sent".
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || t('schedule.submitFailed'));
            }

            if (response.ok) {
                const result = await response.json();

                setMySlots(dateTimeSlots);

                // Check if match was scheduled
                if (result.data?.confirmedTime) {
                    const confirmedDate = parseUtcDate(result.data.confirmedTime);
                    setMatchTime(confirmedDate.toLocaleString(dateLocale()));
                    setMatchTimeIso(result.data.confirmedTime);
                    setCurrentStatus('scheduled');
                }

                // Notify parent to refresh immediately
                if (onMatchUpdate) {
                    onMatchUpdate(tournamentId);
                }
            }
        } catch (error) {
            console.error('Error submitting availability:', error);
            throw error;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMarkScheduled = async () => {
        try {
            setIsSubmitting(true);
            if (!matchId) return;

            const response = await authenticatedFetch(ENDPOINTS.SET_MATCH_SCHEDULED(matchId), {
                method: 'POST',
            });

            if (response.ok) {
                setCurrentStatus('scheduled');
                setMatchTime(t('card.agreedOutsideApp'));
                // No agreed timestamp in this path — clear the raw one so the strip shows the text.
                setMatchTimeIso(undefined);
                
                if (onMatchUpdate) {
                    onMatchUpdate(tournamentId);
                }
            } else {
                const errorText = await response.text().catch(() => t('card.markScheduledFailed'));
                setError(errorText);
            }
        } catch (error: any) {
            console.error('Error marking scheduled:', error);
            setError(error.message || t('card.genericError'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const pickImages = async () => {
        try {
            const { status: pStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (pStatus !== 'granted') {
                setError(t('card.cameraRollPermission'));
                return;
            }

            const assets = await pickEvidenceAssets();
            if (!assets) return;

            // Only stills are judged on picked size. A clip is about to shrink by an order of
            // magnitude, so rejecting it here would throw away files that end up perfectly fine.
            const oversized = assets.filter(asset => !isImageWithinLimit(asset));
            const usable = assets.filter(asset => isImageWithinLimit(asset));

            if (oversized.length > 0) {
                const oversizedNames = oversized.map(a => a.fileName || t('card.imageFallbackName')).join(', ');
                setError(t('card.imagesTooLarge', { names: oversizedNames, max: formatFileSize(MAX_FILE_SIZE) }));
            }

            if (usable.length === 0) return;

            if (usable.some(a => a.type === 'video')) {
                setCompressionProgress(0);
                setIsPreparingMedia(true);
            }

            try {
                const { prepared, rejected } = await prepareEvidenceForUpload(
                    usable,
                    (_index, progress) => setCompressionProgress(progress),
                );

                if (rejected.length > 0) {
                    const tooLong = rejected.filter(r => r.reason === 'tooLong');
                    const unsupported = rejected.filter(r => r.reason === 'unsupported');
                    setError(
                        tooLong.length > 0
                            ? t('card.videoTooLong', {
                                names: tooLong.map(r => r.name).join(', '),
                                seconds: MAX_VIDEO_DURATION_SECONDS,
                            })
                            : unsupported.length > 0
                                ? t('card.videoNotSupportedHere')
                                : t('card.videoPrepareFailed', {
                                    names: rejected.map(r => r.name).join(', '),
                                }));
                }

                if (prepared.length > 0) {
                    setSelectedImages(prev => [...prev, ...prepared]);
                }
            } finally {
                setIsPreparingMedia(false);
            }
        } catch (err) {
            console.error('Error picking evidence:', err);
            setError(t('card.pickImagesFailed'));
        }
    };

    const removeImage = (uri: string) => {
        setSelectedImages(prev => prev.filter(img => img.uri !== uri));
    };

    const handleSubmitResult = async () => {
        console.log('[MatchScheduleCard] handleSubmitResult called');
        console.log('[MatchScheduleCard] matchId:', matchId);
        console.log('[MatchScheduleCard] tournamentId:', tournamentId);
        console.log('[MatchScheduleCard] homeScore:', homeScore);
        console.log('[MatchScheduleCard] awayScore:', awayScore);

        if (!matchId || !tournamentId) {
            console.log('[MatchScheduleCard] Missing matchId or tournamentId');
            return;
        }

        if (isSeriesMatch) {
            if (seriesGames.length === 0) {
                setError(t('card.enterAtLeastOneGame'));
                return;
            }
            if (!isSeriesComplete) {
                setError(t('card.enterRemainingGames'));
                return;
            }
        } else if (homeScore === '' || awayScore === '') {
            console.log('[MatchScheduleCard] Missing scores');
            setError(t('card.enterBothScores'));
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Determine if the logged-in user is the real DB Home or Away participant.
            // The UI always shows the logged-in user on the left (visual home), but that
            // does not necessarily match the database home/away role.
            // If we don't yet know the DB home id, fetch it now so we never guess the
            // mapping and silently swap the scores.
            let resolvedHomeUserId = dbHomeUserId;
            if (resolvedHomeUserId == null) {
                resolvedHomeUserId = await fetchDbHomeUserId();
            }

            // Still unknown after a retry means the details fetch is failing. Reporting anyway
            // would pick a side by assumption, and picking wrong records the match with the
            // scores reversed — a far worse outcome than asking for another go.
            if (resolvedHomeUserId == null) {
                setError(t('card.loadMatchFailed'));
                setIsSubmitting(false);
                return;
            }

            const isUserDbHome =
                resolvedHomeUserId != null &&
                user?.id != null &&
                resolvedHomeUserId.toLowerCase() === user.id.toLowerCase();

            // The entry form works in visual order (logged-in user on the left); both payloads
            // below flip into the DB's home/away roles here, in one place.
            const endpoint = isSeriesMatch ? ENDPOINTS.REPORT_MATCH_SERIES_RESULT : ENDPOINTS.REPORT_MATCH_RESULT;

            const payload = isSeriesMatch
                ? {
                    MatchId: matchId,
                    TournamentId: tournamentId,
                    Games: seriesGames.map(g => ({
                        HomeScore: isUserDbHome ? g.homeScore : g.awayScore,
                        AwayScore: isUserDbHome ? g.awayScore : g.homeScore,
                        SeriesNumber: g.seriesNumber,
                    })),
                }
                : {
                    MatchId: matchId,
                    HomeScore: isUserDbHome ? parseInt(homeScore, 10) : parseInt(awayScore, 10),
                    AwayScore: isUserDbHome ? parseInt(awayScore, 10) : parseInt(homeScore, 10),
                    TournamentId: tournamentId
                };

            console.log('[MatchScheduleCard] Payload:', JSON.stringify(payload));
            console.log('[MatchScheduleCard] Calling API:', endpoint);

            const response = await authenticatedFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            console.log('[MatchScheduleCard] Response status:', response.status);

            // authenticatedFetch resolves on an HTTP error instead of throwing, so a refused report
            // (ready check, verification, a result already confirmed) used to fall through to the
            // success path below: success haptic, evidence uploaded, sheet closed — nothing saved.
            // The server's reason is localized and belongs on screen.
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || t('card.reportError'));
            }

            console.log('[MatchScheduleCard] Success! Checking for images to upload');

            if (selectedImages.length > 0) {
                const formData = new FormData();
                selectedImages.forEach(file => {
                    // Honest content type: the server whitelists on it to tell a screenshot from
                    // a clip and route the upload accordingly.
                    // @ts-ignore
                    formData.append('files', { uri: file.uri, name: file.name, type: file.type });
                });

                await authenticatedFetch(ENDPOINTS.UPLOAD_MATCH_EVIDENCE(matchId), {
                    method: 'POST',
                    body: formData,
                });
            }

            console.log('[MatchScheduleCard] Complete! Closing modal and refreshing');

            // Same action as in MatchDetailsModal, so it has to feel the same from here.
            hapticSuccess();

            if (onMatchUpdate) {
                onMatchUpdate(tournamentId);
            }

            // Two cases keep the modal open and refetch instead of closing:
            //  - approval mode, where the submission is a proposal and the proposer should see the
            //    "Awaiting approval" state rather than being bounced back;
            //  - a level knockout series, which the server records and parks awaiting a tiebreak —
            //    the refetch seeds the form with the games so far so the replay can be added.
            const awaitingTiebreak = Boolean(isSeriesMatch && allowsTiebreak && seriesOutcome?.isLevel);

            if (requireResultApproval || awaitingTiebreak) {
                setHomeScore('');
                setAwayScore('');
                setSelectedImages([]);
                await fetchDbHomeUserId(true);
            } else {
                setModalVisible(false);
            }
        } catch (err: any) {
            console.error('[MatchScheduleCard] Report result error:', err);
            hapticError();
            setError(err.message || t('card.reportError'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const isSetAvailability = currentStatus === 'pending_availability';

    if (variant === 'compact') {
        return (
            <>
                <Pressable
                    onPress={() => setModalVisible(true)}
                    className={cn(
                        "w-[240px] bg-card/60 rounded-[32px] border border-white/5 p-5 mr-3",
                        currentStatus === 'ready_phase' && "border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                    )}
                >
                    <View className="flex-row items-center justify-between mb-4">
                        <View className={cn(
                            "w-12 h-12 rounded-2xl items-center justify-center",
                            isSetAvailability ? "bg-yellow-500/10" :
                                currentStatus === 'scheduled' ? "bg-primary/10" : "bg-indigo-500/10"
                        )}>
                            <Ionicons
                                name={isSetAvailability ? "alert-circle" : "game-controller"}
                                size={24}
                                color={isSetAvailability ? "#EAB308" :
                                    currentStatus === 'scheduled' ? "#10B981" : "#6366F1"}
                            />
                        </View>
                        <View className="items-end">
                            <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{roundName}</Text>
                            <Text className="text-[10px] font-bold text-slate-500" numberOfLines={1}>{tournamentName}</Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                        <Text className="text-xl font-black text-white leading-tight flex-1" numberOfLines={1}>
                            vs {opponentName}
                        </Text>
                        {/* Format on the card face: players should know it's a Bo3 before they open it. */}
                        {cardBestOf > 1 && (
                            <View className="px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/[0.06]">
                                <Text className="text-[9px] font-black text-slate-400 tracking-[1px]">BO{cardBestOf}</Text>
                            </View>
                        )}
                    </View>

                    <View className="mt-4 pt-4 border-t border-white/5">
                        {isSetAvailability ? (
                            <View className="flex-row items-center gap-2 bg-yellow-500/10 self-start px-3 py-2 rounded-xl border border-yellow-500/20">
                                <Ionicons name="calendar-outline" size={14} color="#EAB308" />
                                <Text className="text-[11px] font-black text-yellow-500 uppercase tracking-tight">{t('card.setAvailability')}</Text>
                            </View>
                        ) : (
                            <View className={cn(
                                "flex-row items-center gap-2 self-start px-3 py-2 rounded-xl border",
                                currentStatus === 'scheduled' ? "bg-primary/10 border-primary/20" : "bg-indigo-500/10 border-indigo-500/20"
                            )}>
                                <Ionicons
                                    name={currentStatus === 'scheduled' ? "time-outline" : "flash-outline"}
                                    size={14}
                                    color={currentStatus === 'scheduled' ? "#10B981" : "#6366F1"}
                                />
                                <Text className={cn(
                                    "text-[11px] font-black uppercase tracking-tight",
                                    currentStatus === 'scheduled' ? "text-primary" : "text-indigo-500"
                                )}>
                                    {currentStatus === 'scheduled' ? matchTime : t('card.readyCheck')}
                                </Text>
                            </View>
                        )}
                    </View>
                </Pressable>

                {renderModal()}
            </>
        );
    }

    const tone = FACE_TONES[currentStatus];
    // The tile on the right is the card's clock, drawn like a small calendar page: the date on a
    // coloured band, the kick-off time underneath. A match with no agreed time shows an empty
    // clock, which is exactly why it sits under Needs Attention. "Agreed outside the app" is
    // booked but has no time to print.
    const kickOff = matchTimeIso ? parseUtcDate(matchTimeIso) : null;
    const hasKickOff = !!kickOff && !isNaN(kickOff.getTime());
    const kickOffClock = kickOff && hasKickOff ? formatKickOffClock(kickOff) : null;
    const kickOffDate = kickOff && hasKickOff ? formatKickOffDate(kickOff) : null;
    const opponentGameName = !isSetAvailability && hasNickname(opponentNickname) ? opponentNickname!.trim() : null;

    return (
        <>
            <PressableScale
                onPress={() => setModalVisible(true)}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={[
                    `vs ${opponentName}`,
                    isSetAvailability ? t('card.setAvailability') : [kickOffDate, kickOffClock].filter(Boolean).join(' '),
                    tournamentName,
                    roundName,
                ].filter(Boolean).join('. ')}
            >
                <RaisedCard style={{ overflow: 'hidden' }}>
                    {/* The section's colour lights the card from its left edge: a soft wash and a
                        glowing rail. */}
                    <LinearGradient
                        pointerEvents="none"
                        colors={[tone.accent + '1A', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.65, y: 0 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 12,
                            bottom: 12,
                            width: 3,
                            backgroundColor: tone.accent,
                            borderTopRightRadius: 3,
                            borderBottomRightRadius: 3,
                            shadowColor: tone.accent,
                            shadowOpacity: 0.8,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 0 },
                        }}
                    />

                    <View style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}>
                        {/* Where: the hub top-left in the section's colour, the tournament top-right */}
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                            <View className="flex-1 flex-row items-center" style={{ gap: 6 }}>
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone.accent }} />
                                <Text
                                    className="flex-1 text-[10.5px] font-black uppercase tracking-[1.5px]"
                                    style={{ color: tone.text }}
                                    numberOfLines={1}
                                >
                                    {roundName}
                                </Text>
                            </View>
                            <View className="flex-row items-center" style={{ gap: 4, maxWidth: '50%' }}>
                                <Ionicons name="trophy" size={11} color={COLORS.slate400} />
                                <Text className="shrink text-[11px] font-bold text-slate-300" numberOfLines={1}>
                                    {tournamentName}
                                </Text>
                            </View>
                        </View>

                        {/* Who, and when */}
                        <View className="flex-row items-center" style={{ marginTop: 9, gap: 11 }}>
                            <View
                                style={{
                                    borderRadius: 999,
                                    padding: 1.5,
                                    borderWidth: 1,
                                    borderColor: tone.accent + '66',
                                    shadowColor: tone.accent,
                                    shadowOpacity: 0.35,
                                    shadowRadius: 8,
                                    shadowOffset: { width: 0, height: 0 },
                                }}
                            >
                                <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="border-0" />
                            </View>

                            <View className="flex-1 min-w-0">
                                <View className="flex-row items-baseline" style={{ gap: 6 }}>
                                    <Text className="text-[11px] font-black uppercase tracking-[1px]" style={{ color: tone.text }}>
                                        vs
                                    </Text>
                                    {/* Same size as the tournament title on the Highlights card — one type
                                        scale for the headline of every Home card. A long name shrinks to
                                        fit before it is cut. */}
                                    <Text
                                        className="flex-1 text-[17px] leading-[22px] font-black text-white tracking-tight"
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.7}
                                    >
                                        {opponentName}
                                    </Text>
                                </View>

                                {isSetAvailability ? (
                                    <Text className="text-[12px] font-bold mt-1" style={{ color: tone.text }} numberOfLines={1}>
                                        {t('card.setAvailability')}
                                    </Text>
                                ) : !hasKickOff && !!matchTime ? (
                                    <Text className="text-[12px] font-semibold text-slate-400 mt-1" numberOfLines={1}>
                                        {matchTime}
                                    </Text>
                                ) : opponentGameName ? (
                                    // The name to look for in the game, drawn like the profile header's gamepad line.
                                    <View className="flex-row items-center mt-1" style={{ gap: 5 }}>
                                        <Ionicons name="game-controller" size={13} color={tone.accent} />
                                        <Text className="shrink text-[12px] font-semibold text-slate-400" numberOfLines={1}>
                                            {opponentGameName}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>

                            {/* Unread chat, as information only: the whole card opens the match. */}
                            {showUnreadBadge && (
                                <View className="flex-row items-center h-5 px-[7px] rounded-full bg-destructive" style={{ gap: 3 }}>
                                    <Ionicons name="chatbubble" size={9} color={COLORS.foreground} />
                                    <Text style={TABULAR} className="text-[10px] font-black text-white">
                                        {unreadMessages > 99 ? '99+' : unreadMessages}
                                    </Text>
                                </View>
                            )}

                            <View
                                style={{
                                    width: 68,
                                    height: 44,
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    borderWidth: 1,
                                    borderColor: tone.accent + '66',
                                    backgroundColor: 'rgba(2, 6, 23, 0.55)',
                                }}
                            >
                                <View
                                    className="items-center justify-center px-1"
                                    style={{ height: 15, backgroundColor: tone.accent }}
                                >
                                    {kickOffDate ? (
                                        <Text
                                            className="text-[9px] leading-[11px] font-black uppercase tracking-[0.6px]"
                                            style={{ color: COLORS.background }}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.75}
                                        >
                                            {kickOffDate}
                                        </Text>
                                    ) : (
                                        <Ionicons
                                            name={isSetAvailability ? 'calendar' : 'checkmark'}
                                            size={10}
                                            color={COLORS.background}
                                        />
                                    )}
                                </View>
                                <View className="flex-1 items-center justify-center">
                                    {kickOffClock ? (
                                        <Text style={TABULAR} className="text-[16px] leading-[20px] font-black text-white" numberOfLines={1}>
                                            {kickOffClock}
                                        </Text>
                                    ) : isSetAvailability ? (
                                        <Text style={[TABULAR, { color: tone.text }]} className="text-[16px] leading-[20px] font-black">
                                            --:--
                                        </Text>
                                    ) : (
                                        <Ionicons name="checkmark-done" size={18} color={COLORS.foreground} />
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Ready check, when this match is running one. Sits above the deadline
                            strip: "confirm in the next 6 minutes" outranks "the round ends on
                            Sunday". The button lives inside the card's Pressable — RN gives the
                            inner press priority, so tapping Ready doesn't also open the match. */}
                        {/* Gated on the deadline exactly like the panel: the backend nulls it once the
                            match is no longer Scheduled or the check was already ruled, and without
                            one the bar would show a live "your turn" button the server refuses. */}
                        {currentStatus !== 'completed' && !!checkInState.checkInDeadline && (
                            <MatchCheckInBar
                                matchId={matchId}
                                enabled={checkInEnabled}
                                scheduledTimeIso={matchTimeIso}
                                state={checkInState}
                                isHome={checkInSide}
                                onCheckedIn={setCheckInState}
                                className="mt-2.5"
                            />
                        )}

                        {/* Round deadline. It only lived inside the modal, so nothing on a list
                            told a player which of their open matches was about to time out.
                            Renders nothing without a deadline, and is meaningless once played. */}
                        {currentStatus !== 'completed' && (
                            <MatchDeadlineBar
                                deadline={localDeadline}
                                className="mt-2 pt-2 border-t border-white/[0.06]"
                            />
                        )}
                    </View>
                </RaisedCard>
            </PressableScale>

            {renderModal()}
        </>
    );

    function renderModal() {
        const isPremium = true;

        const scrollToBottom = () => {
            setTimeout(() => {
                mainScrollViewRef.current?.scrollToEnd({ animated: true });
            }, 150);
        };

        return (
            <Modal
                animationType="slide"
                transparent={false}
                visible={modalVisible}
                onDismiss={sheetHandoff.onDismiss}
                onRequestClose={() => {
                    // The evidence preview, the Verify Result sheet and the confirmation are overlays
                    // inside this window, not Modals of their own, so Android's back key arrives
                    // here — it has to dismiss them rather than the whole match sheet underneath.
                    if (previewItem) {
                        setPreviewItem(null);
                        return;
                    }
                    if (showVerifySheet) {
                        setShowVerifySheet(false);
                        return;
                    }
                    if (confirmMarkScheduled) {
                        setConfirmMarkScheduled(false);
                        return;
                    }
                    setModalVisible(false);
                }}
                statusBarTranslucent={true}
            >
                <View
                    className={cn("flex-1", isPremium ? "bg-background-deep" : "bg-background")}
                    style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
                >
                    <View className="flex-1" style={{ paddingBottom: keyboardInset }}>
                        <View className={cn(
                            "flex-1 px-5 pt-5",
                            isPremium ? "bg-background-deep" : "bg-card"
                        )}>
                            {/* Drag Handle */}
                            <View className="w-10 h-1 bg-white/10 rounded-full self-center mb-4" />

                            {/* Header — the tournament's violet-and-gold tile, the hub under the name */}
                            <View className="flex-row items-center mb-5">
                                <LinearGradient
                                    colors={['#4C1D95', '#312E81']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 16,
                                        marginRight: 14,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: 'rgba(251,191,36,0.35)',
                                    }}
                                >
                                    <Ionicons name="trophy" size={21} color="#FBBF24" />
                                </LinearGradient>
                                <View className="flex-1 mr-3">
                                    <Text
                                        className="text-white font-black tracking-tight"
                                        style={{ fontSize: 20, lineHeight: 24 }}
                                        numberOfLines={2}
                                    >
                                        {tournamentName}
                                    </Text>
                                    {!!roundName && (
                                        <View className="flex-row items-center mt-1" style={{ gap: 5 }}>
                                            <Ionicons name="planet" size={12} color={COLORS.primaryBright} />
                                            <Text
                                                className="shrink text-[10.5px] font-black uppercase tracking-[1.5px]"
                                                style={{ color: COLORS.primaryBright }}
                                                numberOfLines={1}
                                            >
                                                {roundName}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Pressable
                                    onPress={() => setModalVisible(false)}
                                    accessibilityRole="button"
                                    className="w-10 h-10 rounded-2xl items-center justify-center bg-white/[0.05] border border-white/10 active:opacity-60"
                                >
                                    <Ionicons name="close" size={18} color="#94A3B8" />
                                </Pressable>
                            </View>

                            {/* Hairline under the header, fading out at both ends */}
                            <LinearGradient
                                pointerEvents="none"
                                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={{ height: 1, marginBottom: 18 }}
                            />

                            {/* Tab Bar — premium segmented control */}
                            <View
                                className="flex-row mb-5 rounded-2xl p-1"
                                style={{
                                    backgroundColor: '#131B2E',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.05)',
                                }}
                            >
                                <ModalTabButton
                                    active={activeModalTab === 'match'}
                                    onPress={() => setActiveModalTab('match')}
                                >
                                    <Text numberOfLines={1} className={cn(
                                        modalTabLabelClass,
                                        "w-full text-center",
                                        activeModalTab === 'match' ? "text-emerald-300" : "text-slate-500"
                                    )}>{t('tournament:details.match')}</Text>
                                </ModalTabButton>
                                {/* Labels next to an icon or badge carry `shrink`: with four tabs the
                                    longer translations (es "Estadísticas", "Transmisión") ellipsise
                                    instead of being clipped at the tab edge. */}
                                {showInsightsTab && (
                                    <ModalTabButton
                                        active={activeModalTab === 'insights'}
                                        onPress={() => setActiveModalTab('insights')}
                                        tint="indigo"
                                    >
                                        <View className="flex-row items-center gap-1.5">
                                            <Ionicons
                                                name="pulse"
                                                size={12}
                                                color={activeModalTab === 'insights' ? '#A5B4FC' : '#64748B'}
                                            />
                                            <Text numberOfLines={1} className={cn(
                                                modalTabLabelClass,
                                                "shrink",
                                                activeModalTab === 'insights' ? "text-indigo-300" : "text-slate-500"
                                            )}>{t('insights.tab')}</Text>
                                        </View>
                                    </ModalTabButton>
                                )}
                                <ModalTabButton
                                    active={activeModalTab === 'chat'}
                                    onPress={() => setActiveModalTab('chat')}
                                >
                                    <View className="flex-row items-center gap-2">
                                        <Text numberOfLines={1} className={cn(
                                            modalTabLabelClass,
                                            "shrink",
                                            activeModalTab === 'chat' ? "text-emerald-300" : "text-slate-500"
                                        )}>{t('match:chat.chat')}</Text>
                                    </View>
                                </ModalTabButton>
                                {/* Streaming only matters once the match is scheduled (live POVs) or
                                    done (replay) — hide the tab while still collecting availability. */}
                                {currentStatus !== 'pending_availability' && (
                                    <ModalTabButton
                                        active={activeModalTab === 'stream'}
                                        onPress={() => setActiveModalTab('stream')}
                                    >
                                        <View className="flex-row items-center gap-1.5">
                                            <Text numberOfLines={1} className={cn(
                                                modalTabLabelClass,
                                                "shrink",
                                                activeModalTab === 'stream' ? "text-emerald-300" : "text-slate-500"
                                            )}>{t('common:stream')}</Text>
                                            {streams.some(s => s.status === MatchStreamStatus.Live) && (
                                                <View className="flex-row items-center gap-1 bg-red-500/15 px-1.5 py-0.5 rounded-md">
                                                    <View className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    <Text className="text-[8px] font-black text-red-400 uppercase">{t('card.live')}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </ModalTabButton>
                                )}
                            </View>

                            <View className="flex-1">
                                {activeModalTab === 'match' ? (
                                    <ScrollView
                                        ref={mainScrollViewRef}
                                        onScroll={e => { mainScrollY.current = e.nativeEvent.contentOffset.y; }}
                                        scrollEventThrottle={16}
                                        showsVerticalScrollIndicator={false}
                                        keyboardShouldPersistTaps="handled"
                                        contentContainerStyle={{
                                            flexGrow: 1,
                                            paddingBottom: 20,
                                        }}
                                    >
                                        {currentStatus === 'pending_availability' && (
                                            <View className="flex-1">
                                                {!detailsLoaded || isLoadingAvailability ? (
                                                    <View
                                                        className="flex-1 items-center justify-center py-10"
                                                        accessibilityRole="progressbar"
                                                        accessibilityLabel={t('common:loading')}
                                                    >
                                                        <ActivityIndicator size="small" color="#10B981" />
                                                    </View>
                                                ) : (
                                                    <HourlyAvailabilityPicker
                                                        matchId={matchId}
                                                        deadline={localDeadline}
                                                        opponentName={opponentName}
                                                        opponentAvatarUrl={opponentAvatarUrl}
                                                        opponentAvailability={opponentSlots}
                                                        initialSlots={mySlots}
                                                        onSubmit={handleAvailabilitySubmit}
                                                        onMarkScheduled={allowScheduleOutsideApp === true ? () => setConfirmMarkScheduled(true) : undefined}
                                                        onOpponentPress={opponentUserId ? () => openPlayerProfile(opponentUserId) : undefined}
                                                    />
                                                )}
                                            </View>
                                        )}

                                        {(currentStatus === 'scheduled' || currentStatus === 'ready_phase') && matchTime && (() => {
                                            const hasPendingProposal = requireResultApproval && !!proposedByUserId;
                                            const meId = user?.id?.toLowerCase();
                                            const isProposer = hasPendingProposal && !!meId && proposedByUserId?.toLowerCase() === meId;
                                            const isPrivileged = !!meId && !!hubOwnerUserId && hubOwnerUserId.toLowerCase() === meId;
                                            // Opponent (or any privileged user who isn't the proposer) can Approve / Reject.
                                            const canDecide = hasPendingProposal && !isProposer;
                                            // Edit is available to the proposer (to amend their own report) and to privileged users
                                            // (admin / hub owner) who can override and finalize from any side.
                                            const canEdit = hasPendingProposal && (isProposer || isPrivileged);

                                            // Map the DB home/away scores back to the visual left/right so the proposer sees
                                            // their reported numbers in the same orientation they entered them.
                                            const isUserDbHome = !!dbHomeUserId && !!meId && dbHomeUserId.toLowerCase() === meId;
                                            // One player's word is not a result while the ready check is still
                                            // open. Mirrors the server-side refusal so the button never promises
                                            // something the API will reject; organizers stay outside it.
                                            const checkInBlocksReport = checkInEnabled
                                                && !!checkInState.checkInDeadline
                                                && !(checkInState.homeCheckedInOn && checkInState.awayCheckedInOn)
                                                && !isPrivileged;
                                            // Verification: the server says whether this viewer's report
                                            // would be refused right now — hub admins are exempt, and this
                                            // card cannot see who is one.
                                            const verificationBlocksReport = !!verification.panel?.reportBlocked;
                                            const reportBlocked = checkInBlocksReport || verificationBlocksReport;
                                            const visualLeftScore = isUserDbHome ? proposedHomeScore : proposedAwayScore;
                                            const visualRightScore = isUserDbHome ? proposedAwayScore : proposedHomeScore;
                                            const proposerName = !!proposedByUserId && dbHomeUserId && proposedByUserId.toLowerCase() === dbHomeUserId.toLowerCase()
                                                ? (dbHomeUsername || t('card.opponent'))
                                                : (dbAwayUsername || t('card.opponent'));

                                            // The scores are in visual orientation (you on the left), so the faces
                                            // have to follow them: a bare "1 : 0" left nobody able to tell whose
                                            // number was whose. Same pairing the bracket modal shows.
                                            const leftNickname = userNickname || user?.nickName;
                                            const pairingHasNickname = hasNickname(leftNickname) || hasNickname(opponentNickname);

                                            return (
                                            <View className={cn("gap-3", !isPremium && "space-y-3")}>
                                                {/* Kick-off + round deadline — the modal used to show neither, so
                                                    players had no way to see how long they had left to play. */}
                                                <MatchTimingStrip
                                                    matchTimeIso={matchTimeIso}
                                                    matchTimeText={matchTime}
                                                    deadline={localDeadline}
                                                />

                                                {/* Ready check — sits under the kick-off it belongs to. The panel
                                                    hides itself when this match runs no check. */}
                                                {checkInEnabled && !!checkInState.checkInDeadline && (
                                                    <MatchCheckInPanel
                                                        matchId={matchId}
                                                        enabled
                                                        scheduledTimeIso={matchTimeIso}
                                                        state={checkInState}
                                                        graceMinutes={checkInGraceMinutes}
                                                        isHome={checkInSide}
                                                        homeLabel={dbHomeUsername || t('checkIn.homeSide')}
                                                        awayLabel={dbAwayUsername || t('checkIn.awaySide')}
                                                        onCheckedIn={setCheckInState}
                                                    />
                                                )}

                                                {/* Result verification — above the result it gates. */}
                                                {showVerification && (
                                                    <ResultVerificationCard
                                                        panel={verification.panel}
                                                        isLoading={verification.isLoading}
                                                        currentUserId={user?.id}
                                                        onVerify={() => setShowVerifySheet(true)}
                                                        onOpenEvidence={setPreviewItem}
                                                        onOpenProfile={userId => openPlayerProfile(userId)}
                                                    />
                                                )}

                                                {/* Pending Proposal Card — hidden while editing so the edit form gets the full stage. */}
                                                {hasPendingProposal && !isEditingProposal && (
                                                    <View className={cn(
                                                        "rounded-[20px] p-4",
                                                        isPremium ? "bg-card/60 border border-white/[0.06]" : "bg-muted/10 border border-border/10"
                                                    )}>
                                                        <View className="items-center mb-3">
                                                            <View className="bg-warning/10 px-3 py-1 rounded-full">
                                                                <Text className="text-[9px] font-black text-warning uppercase tracking-[3px]">
                                                                    {isProposer ? t('card.awaitingApproval') : t('card.resultReported')}
                                                                </Text>
                                                            </View>
                                                            <Text className={cn(
                                                                "text-[11px] text-center mt-2 font-bold",
                                                                isPremium ? "text-slate-400" : "text-muted-foreground"
                                                            )}>
                                                                {isProposer
                                                                    ? t('card.waitingConfirm')
                                                                    : t('card.proposerReported', { name: proposerName })}
                                                            </Text>
                                                        </View>

                                                        <View className="flex-row items-start justify-between">
                                                            <Pressable
                                                                onPress={() => openPlayerProfile(user?.id)}
                                                                className="flex-1 items-center active:opacity-70"
                                                            >
                                                                <PlayerAvatar
                                                                    src={user?.avatarUrl}
                                                                    name={user?.username || t('card.you')}
                                                                    size="lg"
                                                                    className="rounded-2xl border-0"
                                                                />
                                                                <PlayerIdentity
                                                                    className="mt-2"
                                                                    username={user?.username || t('card.you')}
                                                                    nickname={leftNickname}
                                                                    tone="home"
                                                                    reserveNicknameSpace={pairingHasNickname}
                                                                />
                                                            </Pressable>

                                                            <View className="items-center px-2 pt-3">
                                                                <View className="flex-row items-baseline">
                                                                    <Text className="text-4xl font-black text-warning">
                                                                        {visualLeftScore ?? 0}
                                                                    </Text>
                                                                    <Text className="text-xl font-black text-white/20 mx-2">:</Text>
                                                                    <Text className="text-4xl font-black text-warning">
                                                                        {visualRightScore ?? 0}
                                                                    </Text>
                                                                </View>
                                                            </View>

                                                            <Pressable
                                                                onPress={() => openPlayerProfile(opponentUserId)}
                                                                disabled={!opponentUserId}
                                                                className="flex-1 items-center active:opacity-70"
                                                            >
                                                                <PlayerAvatar
                                                                    src={opponentAvatarUrl}
                                                                    name={opponentName}
                                                                    size="lg"
                                                                    className="rounded-2xl border-0"
                                                                />
                                                                <PlayerIdentity
                                                                    className="mt-2"
                                                                    username={opponentName}
                                                                    nickname={opponentNickname}
                                                                    tone="away"
                                                                    reserveNicknameSpace={pairingHasNickname}
                                                                />
                                                            </Pressable>
                                                        </View>

                                                        {/* The games behind that headline — deciding whether it is
                                                            right is a judgement on what was played, not on one number. */}
                                                        <SeriesBreakdown
                                                            className="mt-4"
                                                            games={visualProposedGames}
                                                            format={seriesFormat}
                                                            tone="proposed"
                                                        />

                                                        {(canDecide || (canEdit && !isEditingProposal)) && (
                                                            <View className="flex-row gap-2.5 mt-4">
                                                                {canDecide && (
                                                                    <Pressable
                                                                        onPress={handleRejectProposal}
                                                                        disabled={isRejecting || isApproving}
                                                                        className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl py-3 items-center active:opacity-70"
                                                                    >
                                                                        {isRejecting ? (
                                                                            <ActivityIndicator size="small" color="#F87171" />
                                                                        ) : (
                                                                            <Text className="text-xs font-black text-red-400 uppercase tracking-wider w-full text-center" numberOfLines={1}>{t('card.reject')}</Text>
                                                                        )}
                                                                    </Pressable>
                                                                )}
                                                                {canDecide && (
                                                                    <Pressable
                                                                        onPress={handleApproveProposal}
                                                                        disabled={isApproving || isRejecting}
                                                                        className="flex-1 bg-primary rounded-2xl py-3 items-center active:opacity-80"
                                                                    >
                                                                        {isApproving ? (
                                                                            <ActivityIndicator size="small" color="#0F172A" />
                                                                        ) : (
                                                                            <Text className="text-xs font-black text-primary-foreground uppercase tracking-wider w-full text-center" numberOfLines={1}>{t('card.approve')}</Text>
                                                                        )}
                                                                    </Pressable>
                                                                )}
                                                                {canEdit && !isEditingProposal && (
                                                                    <Pressable
                                                                        onPress={() => {
                                                                            setHomeScore(String(visualLeftScore ?? ''));
                                                                            setAwayScore(String(visualRightScore ?? ''));
                                                                            setIsEditingProposal(true);
                                                                        }}
                                                                        className="flex-1 bg-warning/10 border border-warning/25 rounded-2xl py-3 items-center active:opacity-70"
                                                                    >
                                                                        <Text className="text-xs font-black text-warning uppercase tracking-wider w-full text-center" numberOfLines={1}>{tCommon('edit')}</Text>
                                                                    </Pressable>
                                                                )}
                                                            </View>
                                                        )}

                                                    </View>
                                                )}

                                                {/* Slim divider before the evidence section */}
                                                {hasPendingProposal && !isEditingProposal && (
                                                    <View className={cn("h-px mx-2", isPremium ? "bg-white/[0.06]" : "bg-muted/20")} />
                                                )}

                                                {/* Error */}
                                                {error && (
                                                    <View className={cn(
                                                        "p-4 rounded-2xl border",
                                                        isPremium ? "bg-destructive/10 border-destructive/20" : "bg-destructive/10 border-transparent"
                                                    )}>
                                                        <Text className={cn(
                                                            "text-sm text-center font-bold",
                                                            isPremium ? "text-destructive tracking-tight" : "text-destructive"
                                                        )}>{error}</Text>
                                                    </View>
                                                )}

                                                {/* Submission form:
                                                    - Shown when there's no pending proposal (default flow)
                                                    - Hidden for the opponent when a proposal is pending (they Approve / Reject instead;
                                                      if they want to counter-propose they can Reject first)
                                                    - Shown for the proposer only when they click "Edit My Report" */}
                                                {(!hasPendingProposal || (isProposer && isEditingProposal)) && (<>
                                                {/* Edit-mode banner */}
                                                {isEditingProposal && (
                                                    <View className={cn(
                                                        "rounded-[20px] p-4 flex-row items-center gap-3",
                                                        isPremium ? "bg-warning/[0.08] border border-warning/20" : "bg-warning/10 border border-warning/20"
                                                    )}>
                                                        <View className="w-10 h-10 rounded-2xl bg-warning/15 items-center justify-center">
                                                            <Ionicons name="create-outline" size={18} color="#F59E0B" />
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="text-[10px] font-black text-warning uppercase tracking-[2px]">{t('card.editingYourReport')}</Text>
                                                            <Text className={cn(
                                                                "text-[11px] mt-0.5",
                                                                isPremium ? "text-slate-400" : "text-muted-foreground"
                                                            )}>
                                                                {t('card.updateAndNotify')}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                )}
                                                {/* Best-of series: one game at a time, never a wall of blank
                                                    inputs. Falls back to the single-score form for Bo1.
                                                    Held back until the details arrive, since the format is
                                                    what decides which of the two forms is even correct. */}
                                                {!detailsLoaded ? (
                                                    <View className="rounded-[20px] bg-card/60 border border-white/[0.04] py-10 items-center justify-center">
                                                        <ActivityIndicator size="small" color="#10B981" />
                                                    </View>
                                                ) : isSeriesMatch ? (
                                                    <SeriesScoreEntry
                                                        key={`${matchId}-${visualEntrySeedGames.length}-${seriesFormat.bestOf}`}
                                                        leftName={user?.username || t('card.you')}
                                                        leftNickname={userNickname || user?.nickName}
                                                        leftAvatarUrl={user?.avatarUrl}
                                                        rightName={opponentName}
                                                        rightNickname={opponentNickname}
                                                        rightAvatarUrl={opponentAvatarUrl}
                                                        // Leaving from the form takes the games typed so far
                                                        // along, so they are still there on the way back.
                                                        onLeftPress={() => openPlayerProfile(user?.id, seriesGames)}
                                                        onRightPress={opponentUserId ? () => openPlayerProfile(opponentUserId, seriesGames) : undefined}
                                                        format={seriesFormat}
                                                        allowTiebreak={allowsTiebreak}
                                                        initialGames={seriesDraftToRestore ?? visualEntrySeedGames}
                                                        onChange={(games, outcome, complete) => {
                                                            setSeriesGames(games);
                                                            setSeriesOutcome(outcome);
                                                            setIsSeriesComplete(complete);
                                                            // The form has taken the restored draft in (it reads
                                                            // initialGames once, on mount) — one use only.
                                                            if (seriesDraftToRestore) setSeriesDraftToRestore(null);
                                                        }}
                                                        onFocusInput={row => scrollRowIntoView(mainScrollViewRef.current, row, mainScrollY.current)}
                                                    />
                                                ) : (
                                                <>
                                                {/* Players VS Section */}
                                                <View className={cn(
                                                    "rounded-[20px] p-4 pt-6",
                                                    isPremium ? "bg-card/60 border border-white/[0.04]" : "bg-muted/5"
                                                )}>
                                                    <View className="flex-row items-center justify-between pb-2">
                                                        {/* Home Player (You). The identity opens the profile;
                                                            the score input below stays out of the tap target. */}
                                                        <View className="flex-1 items-center">
                                                            <Pressable
                                                                onPress={() => openPlayerProfile(user?.id)}
                                                                className="w-full items-center active:opacity-70"
                                                            >
                                                                <View className={cn(
                                                                    "rounded-full p-[3px] mb-2",
                                                                    isPremium ? "bg-primary/20" : ""
                                                                )}>
                                                                    <PlayerAvatar
                                                                        src={user?.avatarUrl}
                                                                        name={user?.username || t('card.you')}
                                                                        size={isPremium ? "xl" : "lg"}
                                                                        className={cn(isPremium ? "border-2 border-background-deep" : "")}
                                                                    />
                                                                </View>
                                                                <Text className={cn("font-black text-center mb-0.5", isPremium ? "text-base text-white" : "text-base text-foreground")} numberOfLines={1}>
                                                                    {user?.username || t('card.you')}
                                                                </Text>
                                                                {(userNickname || user?.nickName) && (
                                                                    <View className="flex-row items-center justify-center gap-1 mb-1">
                                                                        <Ionicons name="game-controller" size={20} color="#10B981" />
                                                                        <Text className="font-semibold text-[13px] text-slate-500" numberOfLines={1}>
                                                                            {userNickname || user?.nickName}
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </Pressable>
                                                            <View className="w-full px-1 mt-2">
                                                                <TextInput
                                                                    className={cn(
                                                                        "w-full text-center font-black",
                                                                        isPremium
                                                                            ? "bg-background-deep h-14 rounded-2xl text-2xl text-primary border border-white/[0.06]"
                                                                            : "bg-muted/30 h-12 rounded-2xl text-lg text-foreground border-border/10"
                                                                    )}
                                                                    placeholder="0"
                                                                    placeholderTextColor={isPremium ? "#1E293B" : "#71717A"}
                                                                    keyboardType="numeric"
                                                                    value={homeScore}
                                                                    onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                                                                    onFocus={scrollToBottom}
                                                                />
                                                            </View>
                                                        </View>

                                                        {/* VS Badge */}
                                                        <View className="items-center justify-center px-3 -mt-6">
                                                            <View className={cn(
                                                                "rounded-xl items-center justify-center",
                                                                isPremium ? "w-9 h-9 bg-white/[0.04] border border-white/[0.08]" : "w-8 h-8 bg-muted"
                                                            )}>
                                                                <Text className={cn(
                                                                    "font-black italic",
                                                                    isPremium ? "text-[10px] text-slate-500" : "text-[10px] text-muted-foreground"
                                                                )}>VS</Text>
                                                            </View>
                                                        </View>

                                                        {/* Away Player (Opponent) */}
                                                        <View className="flex-1 items-center">
                                                            <Pressable
                                                                onPress={() => openPlayerProfile(opponentUserId)}
                                                                disabled={!opponentUserId}
                                                                className="w-full items-center active:opacity-70"
                                                            >
                                                                <View className={cn(
                                                                    "rounded-full p-[3px] mb-2",
                                                                    isPremium ? "bg-indigo-500/20" : ""
                                                                )}>
                                                                    <PlayerAvatar
                                                                        src={opponentAvatarUrl}
                                                                        name={opponentName}
                                                                        size={isPremium ? "xl" : "lg"}
                                                                        className={cn(isPremium ? "border-2 border-background-deep" : "")}
                                                                    />
                                                                </View>
                                                                <Text className={cn("font-black text-center mb-0.5", isPremium ? "text-base text-white" : "text-base text-foreground")} numberOfLines={1}>
                                                                    {opponentName}
                                                                </Text>
                                                                {opponentNickname && (
                                                                    <View className="flex-row items-center justify-center gap-1 mb-1">
                                                                        <Ionicons name="game-controller" size={20} color="#6366F1" />
                                                                        <Text className="font-semibold text-[13px] text-slate-500" numberOfLines={1}>
                                                                            {opponentNickname}
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </Pressable>
                                                            <View className="w-full px-1 mt-2">
                                                                <TextInput
                                                                    className={cn(
                                                                        "w-full text-center font-black",
                                                                        isPremium
                                                                            ? "bg-background-deep h-14 rounded-2xl text-2xl text-white border border-white/[0.06]"
                                                                            : "bg-muted/30 h-12 rounded-2xl text-lg text-foreground border-border/10"
                                                                    )}
                                                                    placeholder="0"
                                                                    placeholderTextColor={isPremium ? "#1E293B" : "#71717A"}
                                                                    keyboardType="numeric"
                                                                    value={awayScore}
                                                                    onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                                                                    onFocus={scrollToBottom}
                                                                />
                                                            </View>
                                                        </View>
                                                    </View>
                                                </View>
                                                </>
                                                )}

                                                {/* Submit Button */}
                                                <View className="mt-1 flex-row gap-3">
                                                    {isEditingProposal && (
                                                        <Pressable
                                                            onPress={() => { setIsEditingProposal(false); setHomeScore(''); setAwayScore(''); setError(null); }}
                                                            className="flex-1 h-14 rounded-2xl border border-white/[0.06] bg-white/[0.04] items-center justify-center active:opacity-70"
                                                        >
                                                            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest w-full text-center" numberOfLines={1}>{tCommon('cancel')}</Text>
                                                        </Pressable>
                                                    )}
                                                    <Pressable
                                                        onPress={async () => { await handleSubmitResult(); setIsEditingProposal(false); }}
                                                        // Also held while the details load: the format decides what a valid
                                                        // submission even looks like.
                                                        disabled={isSubmitting || isRoundLocked || !detailsLoaded || reportBlocked}
                                                        className={cn("h-14 rounded-2xl overflow-hidden active:opacity-90", isEditingProposal ? "flex-1" : "w-full")}
                                                        style={{
                                                            shadowColor: isRoundLocked ? '#475569' : '#10B981',
                                                            shadowOpacity: isRoundLocked ? 0.15 : 0.38,
                                                            shadowRadius: 18,
                                                            shadowOffset: { width: 0, height: 8 },
                                                            elevation: 10,
                                                        }}
                                                    >
                                                        <LinearGradient
                                                            colors={(isRoundLocked || reportBlocked) ? ['#475569', '#334155'] : ['#10B981', '#059669']}
                                                            start={{ x: 0, y: 0 }}
                                                            end={{ x: 1, y: 1 }}
                                                            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            {isSubmitting ? (
                                                                <ActivityIndicator size="small" color="#022C22" />
                                                            ) : (
                                                                <View className="flex-row items-center gap-2">
                                                                    <Ionicons
                                                                        name={(isRoundLocked || reportBlocked) ? "lock-closed" : "checkmark-circle"}
                                                                        size={18}
                                                                        color={(isRoundLocked || reportBlocked) ? "#CBD5E1" : "#022C22"}
                                                                    />
                                                                    <Text numberOfLines={1} className={cn(
                                                                        "font-black uppercase tracking-widest text-xs",
                                                                        (isRoundLocked || reportBlocked) ? "text-slate-200" : "text-emerald-950"
                                                                    )}>
                                                                        {isRoundLocked
                                                                            ? t('card.roundNotOpen')
                                                                            : checkInBlocksReport
                                                                            ? t('checkIn.blockedShort')
                                                                            : verificationBlocksReport
                                                                            ? t('verification.blockedShort')
                                                                            : isEditingProposal
                                                                                ? t('card.updateReport')
                                                                                // A level knockout series is reported now and decided by a
                                                                                // tiebreak later — say so on the button rather than letting
                                                                                // "Submit Result" imply the match is settled.
                                                                                : (isSeriesMatch && allowsTiebreak && seriesOutcome?.isLevel)
                                                                                    ? t('card.reportTiebreakNeeded')
                                                                                    : (requireResultApproval ? t('card.reportResult') : t('card.submitResult'))}
                                                                    </Text>
                                                                </View>
                                                            )}
                                                        </LinearGradient>
                                                    </Pressable>
                                                </View>
                                                </>)}

                                                {/* Evidence — visible to both sides at all times so the proposer can keep
                                                    adding screenshots and the opponent can verify before approving. */}
                                                <EvidenceSection
                                                    uploadedCount={existingEvidences.length}
                                                    pendingCount={selectedImages.length}
                                                    onAdd={pickImages}
                                                    open={isEvidenceExpanded}
                                                    onToggle={setIsEvidenceExpanded}
                                                >
                                                    {/* Already-uploaded evidence (read-only carousel) — visible to both proposer and opponent. */}
                                                    {existingEvidences.length > 0 && (
                                                        <View className="mb-3">
                                                            <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('card.uploaded')}</Text>
                                                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                                {existingEvidences.map((item, idx) => (
                                                                    <EvidenceThumb
                                                                        key={idx}
                                                                        item={item}
                                                                        width={96}
                                                                        height={128}
                                                                        className="mr-2.5"
                                                                        onPress={() => setPreviewItem(item)}
                                                                    />
                                                                ))}
                                                            </ScrollView>
                                                        </View>
                                                    )}

                                                    {/* Add lives in the section header now — only Clear needs a spot here. */}
                                                    {selectedImages.length > 0 && (
                                                        <View className="flex-row items-center gap-2 mb-3">
                                                            <Pressable onPress={() => setSelectedImages([])} className={cn("flex-row items-center px-3.5 py-2 rounded-xl border", isPremium ? "bg-white/[0.03] border-white/[0.06]" : "bg-muted/20 border-border/10")}
                                                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                                            >
                                                                <Ionicons name="trash-outline" size={14} color={isPremium ? "#64748B" : "#71717A"} />
                                                                <Text className="font-bold uppercase ml-1 text-[10px] text-slate-500">{t('card.clear')}</Text>
                                                            </Pressable>
                                                        </View>
                                                    )}

                                                    {isPreparingMedia ? (
                                                        <View className={cn("h-20 border border-dashed rounded-2xl items-center justify-center", isPremium ? "border-white/[0.08] bg-white/[0.01]" : "border-border/20 bg-muted/5")}>
                                                            <ActivityIndicator size="small" color="#818CF8" />
                                                            <Text className="font-semibold tracking-wider mt-1.5 text-[10px] text-slate-500">
                                                                {t('card.compressingVideoProgress', { percent: Math.round(compressionProgress * 100) })}
                                                            </Text>
                                                        </View>
                                                    ) : selectedImages.length > 0 ? (
                                                        <PendingEvidenceStrip files={selectedImages} onRemove={removeImage} onAdd={pickImages} />
                                                    ) : (
                                                        <Pressable onPress={pickImages} className={cn("h-20 border border-dashed rounded-2xl items-center justify-center", isPremium ? "border-white/[0.08] bg-white/[0.01]" : "border-border/20 bg-muted/5")}
                                                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                                        >
                                                            <Ionicons name="cloud-upload-outline" size={24} color={isPremium ? "#334155" : "#71717A"} />
                                                            <Text className="font-semibold tracking-wider mt-1 text-[10px] text-slate-600">{t('card.tapToUpload')}</Text>
                                                        </Pressable>
                                                    )}

                                                    {/* Upload-only button visible during pending proposal so the proposer can attach
                                                        additional evidence without resubmitting their score. */}
                                                    {hasPendingProposal && selectedImages.length > 0 && (
                                                        <Pressable
                                                            onPress={async () => {
                                                                if (!matchId || selectedImages.length === 0) return;
                                                                const formData = new FormData();
                                                                selectedImages.forEach(file => {
                                                                    // @ts-ignore
                                                                    formData.append('files', { uri: file.uri, name: file.name, type: file.type });
                                                                });
                                                                try {
                                                                    setIsSubmitting(true);
                                                                    await authenticatedFetch(ENDPOINTS.UPLOAD_MATCH_EVIDENCE(matchId), { method: 'POST', body: formData });
                                                                    setSelectedImages([]);
                                                                    await fetchDbHomeUserId(true);
                                                                } catch (e) {
                                                                    console.error('[MatchScheduleCard] Upload evidence error:', e);
                                                                } finally {
                                                                    setIsSubmitting(false);
                                                                }
                                                            }}
                                                            className="mt-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl py-3 items-center flex-row justify-center gap-2 active:opacity-70"
                                                        >
                                                            {isSubmitting ? (
                                                                <ActivityIndicator size="small" color="#818CF8" />
                                                            ) : (
                                                                <>
                                                                    <Ionicons name="cloud-upload-outline" size={14} color="#818CF8" />
                                                                    <Text className="text-xs font-black text-indigo-400 uppercase tracking-wider" numberOfLines={1}>{t('card.uploadEvidence')}</Text>
                                                                </>
                                                            )}
                                                        </Pressable>
                                                    )}
                                                </EvidenceSection>
                                            </View>
                                            );
                                        })()}

                                        {currentStatus === 'completed' && (
                                            <View className={cn("py-12 items-center rounded-[40px] border mt-4", isPremium ? "bg-white/5 border-white/10" : "bg-muted/10 border-transparent")}>
                                                <View className={cn("w-20 h-20 rounded-full items-center justify-center border", isPremium ? "bg-primary/20 border-primary/30" : "bg-primary/20 border-transparent")}>
                                                    <Ionicons name="checkmark" size={40} color="#10B981" />
                                                </View>
                                                <Text numberOfLines={1} className={cn("font-black mt-6 uppercase tracking-widest w-full text-center", isPremium ? "text-xl text-white" : "text-foreground")}>{t('card.completed')}</Text>
                                                {isPremium && <Text className="text-sm font-medium text-slate-500 mt-2">{t('card.resultsRecorded')}</Text>}
                                            </View>
                                        )}

                                        {/* Admin-help escalation — the card is always the player's own match */}
                                        {currentStatus !== 'completed' && (
                                            <View className="mt-5 mb-4">
                                                <AdminHelpSection
                                                    matchId={matchId}
                                                    requested={adminHelpRequested}
                                                    requestedByMe={!!user?.id && adminHelpRequestedByUserId?.toLowerCase() === user.id.toLowerCase()}
                                                    isParticipant={true}
                                                    canResolve={!!user?.id && !!hubOwnerUserId && hubOwnerUserId.toLowerCase() === user.id.toLowerCase()}
                                                    onChanged={() => { fetchDbHomeUserId(true); refreshBadges(); }}
                                                />
                                            </View>
                                        )}
                                    </ScrollView>
                                ) : activeModalTab === 'insights' && showInsightsTab ? (
                                    // Every match on this card is the viewer's own, so the viewer is
                                    // always the left-hand side.
                                    <MatchInsightsPanel
                                        active={modalVisible}
                                        primary={insightMe}
                                        opponent={insightOpponent}
                                        viewerIsPrimary
                                        onPlayerPress={openPlayerProfile}
                                    />
                                ) : activeModalTab === 'stream' ? (
                                    <MatchStreamPanel
                                        matchId={matchId}
                                        isParticipant={isMatchParticipant}
                                        isCompleted={currentStatus === 'completed'}
                                        currentUserId={user?.id}
                                        initialStreams={streams}
                                        onStreamsChange={setStreams}
                                    />
                                ) : null}
                                <View style={{ flex: 1, display: activeModalTab === 'chat' ? 'flex' : 'none' }}>
                                    <MatchChatPanel
                                        key={matchId}
                                        matchId={matchId}
                                        workspace={chatWorkspace}
                                        active={modalVisible && activeModalTab === 'chat'}
                                        participantIds={[dbHomeUserId, dbAwayUserId]}
                                        avatarsByUserId={{ [opponentUserId?.toLowerCase() ?? '']: opponentAvatarUrl ?? undefined }}
                                        readOnly={currentStatus === 'completed'}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Overlay, not a nested Modal: this keeps the sheet and its confirmation in one
                    Android window, so closing them cannot strand a window over the screen. Sibling
                    of the padded root so it dims the full screen, as in LineupSwapModal. */}
                <ConfirmationModal
                    overlay
                    stacked
                    isDestructive={false}
                    visible={confirmMarkScheduled}
                    onClose={() => setConfirmMarkScheduled(false)}
                    onConfirm={() => {
                        // Dropped before the request goes out: success swaps the whole
                        // pending-availability section away, and a dialog still presented while
                        // that happens is left stranded over the screen.
                        setConfirmMarkScheduled(false);
                        handleMarkScheduled();
                    }}
                    title={t('card.markScheduledConfirmTitle')}
                    message={t('card.markScheduledConfirmMessage', { opponent: opponentName })}
                    confirmText={t('card.markScheduledConfirmAction')}
                />

                {/* Verify Result — an overlay in this window as well. As a Modal beside this one it
                    never showed on iOS (see VerifyResultSheet). */}
                {!!user?.id && requireResultVerification && (
                    <VerifyResultSheet
                        visible={showVerifySheet}
                        onClose={() => setShowVerifySheet(false)}
                        matchId={matchId}
                        userId={user.id}
                        opponentName={opponentName}
                        onVerified={() => {
                            verification.refresh();
                            // The clip is ordinary evidence too; the gallery row counts it.
                            fetchDbHomeUserId(true);
                        }}
                    />
                )}

                {/* Fullscreen evidence preview (the verified clip included) — an overlay too, and
                    last so it sits on top. As a Modal beside this one it never opened on iOS. */}
                <EvidencePreviewModal overlay item={previewItem} onClose={() => setPreviewItem(null)} />
            </Modal>
        );
    }
}

/**
 * The card is rendered once per row on Home and My Matches, and it is a heavy component — dozens
 * of pieces of state, its own modal, its own SignalR connection. Without this wrapper every
 * unrelated Home state change (a badge tick, a collapsed section, a tab-focus refetch) re-rendered
 * every card's whole tree.
 *
 * Both call sites were already written for it — stable `onMatchUpdate` callbacks, the `checkIn`
 * object built once in the normalizer, everything else a primitive — and their comments say
 * "so MatchScheduleCard's React.memo actually skips". The memo itself was simply never added, so
 * all of that care bought nothing. It does now.
 */
export const MatchScheduleCard = React.memo(MatchScheduleCardBase);

interface ModalTabButtonProps {
    active: boolean;
    onPress: () => void;
    children: React.ReactNode;
    /** Stats wears indigo, as it does in MatchDetailsModal; every other tab is emerald. */
    tint?: 'emerald' | 'indigo';
}

const MODAL_TAB_TINTS = {
    emerald: { glow: '#10B981', from: 'rgba(16, 185, 129, 0.28)', to: 'rgba(16, 185, 129, 0.10)' },
    indigo: { glow: '#818CF8', from: 'rgba(129, 140, 248, 0.28)', to: 'rgba(129, 140, 248, 0.10)' },
} as const;

function ModalTabButton({ active, onPress, children, tint = 'emerald' }: ModalTabButtonProps) {
    const colors = MODAL_TAB_TINTS[tint];
    return (
        <Pressable
            onPress={onPress}
            className="flex-1 py-2.5 items-center rounded-xl overflow-hidden"
            style={
                active
                    ? {
                        shadowColor: colors.glow,
                        shadowOpacity: 0.35,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                    }
                    : undefined
            }
        >
            {active && (
                <LinearGradient
                    colors={[colors.from, colors.to]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
            )}
            {children}
        </Pressable>
    );
}
