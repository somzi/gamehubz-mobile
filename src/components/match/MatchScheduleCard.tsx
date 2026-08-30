import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HourlyAvailabilityPicker } from './HourlyAvailabilityPicker';
import { MatchTimingStrip } from './MatchTimingStrip';
import { PlayerIdentity, hasNickname } from './PlayerIdentity';
import { EvidenceSection } from './EvidenceSection';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn, formatLocalDateTime, parseUtcDate } from '../../lib/utils';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgesContext';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { MatchComment } from '../../types/auth';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize, getOptimizedCloudinaryUrl } from '../../lib/image';
import { MatchChatBubble } from '../chat/MatchChatBubble';
import { mergeMessagesById } from '../../lib/mergeMessages';
import { AdminHelpSection } from './AdminHelpSection';
import { MatchStreamPanel } from './MatchStreamPanel';
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
    /** Round deadline as a raw backend timestamp (MatchOverviewDto.roundDeadline). */
    deadline?: string;
    scheduledTime?: string;
    /** Raw backend timestamp behind `scheduledTime` — lets the timing strip render the
     *  kick-off as clock + date instead of one pre-localized blob. */
    scheduledTimeIso?: string | null;
    opponentAvailability?: string[];
    onMatchUpdate?: () => void;
    onPress?: () => void;
    variant?: 'default' | 'compact';
    isRoundLocked?: boolean;
    /** Unread chat messages for the current user — drives the per-match chat badge. */
    unreadMessages?: number;
    /** Series format from the match list, so the collapsed card can show "BO3" before it is opened. */
    bestOf?: number;
}

export function MatchScheduleCard({
    matchId,
    tournamentId,
    tournamentName,
    roundName,
    opponentName,
    opponentAvatarUrl,
    opponentNickname,
    userNickname,
    status: initialStatus,
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
    const { user } = useAuth();
    const { refresh: refreshBadges } = useBadges();
    const insets = useSafeAreaInsets();

    // Local copy so the card badge clears the moment the user opens the chat,
    // without waiting for the parent list to refetch.
    const [chatRead, setChatRead] = useState(false);
    const showUnreadBadge = unreadMessages > 0 && !chatRead && initialStatus !== 'completed';

    const [modalVisible, setModalVisible] = useState(false);

    // The modal root already pads the safe-area bottom, so the content only has to be
    // lifted by the rest of the keyboard. Measured on both platforms — see the hook for
    // why KeyboardAvoidingView cannot do this from inside a modal. Only subscribed while
    // the modal is open: these cards render one per match in a list.
    const keyboardInset = useKeyboardInset(insets.bottom, modalVisible);

    const [currentStatus, setCurrentStatus] = useState<MatchStatus>(initialStatus);
    const [matchTime, setMatchTime] = useState(initialScheduledTime);
    const [matchTimeIso, setMatchTimeIso] = useState<string | undefined>(scheduledTimeIso ?? undefined);
    const [localDeadline, setLocalDeadline] = useState<string>(deadline);
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
    const [existingEvidences, setExistingEvidences] = useState<string[]>([]);
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
    const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);

    // Comments state
    const [comments, setComments] = useState<MatchComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [isSendingComment, setIsSendingComment] = useState(false);
    const commentsScrollRef = useRef<ScrollView>(null);
    const mainScrollViewRef = useRef<ScrollView>(null);
    // Live scroll offset, kept in a ref so tracking it costs no re-renders.
    const mainScrollY = useRef(0);
    const connectionRef = useRef<HubConnection | null>(null);
    const commentInputRef = useRef<TextInput>(null);

    // Collapsible sections state. Evidence starts closed: it's the tallest block on the screen,
    // empty most of the time, and open it pushed "Need Help?" below the fold.
    const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);
    const [isChatExpanded, setIsChatExpanded] = useState(true);
    const [isAvailabilityExpanded, setIsAvailabilityExpanded] = useState(true);
    const [activeModalTab, setActiveModalTab] = useState<'match' | 'chat' | 'stream'>('match');

    // Streaming — both opponents can stream, so we track a list.
    const [streams, setStreams] = useState<MatchStream[]>([]);

    const isMatchParticipant = !!user?.id && (
        (!!dbHomeUserId && dbHomeUserId.toLowerCase() === user.id.toLowerCase()) ||
        (!!dbAwayUserId && dbAwayUserId.toLowerCase() === user.id.toLowerCase())
    );

    // The card outlives a list refetch (same key), so pick up a deadline the admin moved
    // instead of showing the one this card mounted with.
    useEffect(() => {
        setLocalDeadline(deadline);
    }, [deadline]);

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
                    // parseUtcDate, not new Date(): the backend serializes without a Z suffix,
                    // so raw parsing reads the UTC clock as local and shifts the time.
                    const confirmedDate = parseUtcDate(data.confirmedTime);
                    setMatchTime(confirmedDate.toLocaleString());
                    setMatchTimeIso(data.confirmedTime);
                    setCurrentStatus('scheduled');
                }
            }
        } catch (error) {
            console.error('Error fetching availability:', error);
        } finally {
            setIsLoadingAvailability(false);
        }
    };

    const fetchComments = async (silent = false) => {
        if (!matchId) return;
        if (!silent) setIsLoadingComments(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_COMMENTS(matchId));
            if (response.ok) {
                const data = await response.json();
                setComments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error fetching comments:', error);
        } finally {
            if (!silent) setIsLoadingComments(false);
        }
    };

    const fetchStreams = async () => {
        if (!matchId) return;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_STREAMS(matchId));
            if (response.ok) {
                const data = await response.json();
                setStreams(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error fetching streams:', error);
        }
    };

    // Mark the match chat read for the current user, clear the card badge, and
    // refresh the global counts.
    const markChatRead = async () => {
        if (!matchId) return;
        setChatRead(true);
        try {
            await authenticatedFetch(ENDPOINTS.MARK_MATCH_CHAT_READ(matchId), { method: 'POST' });
            refreshBadges();
        } catch { /* best-effort */ }
    };

    // Clear unread as soon as the user opens the Chat tab.
    useEffect(() => {
        if (modalVisible && activeModalTab === 'chat') {
            markChatRead();
        }
    }, [modalVisible, activeModalTab, matchId]);

    const handleSendComment = async () => {
        // isSendingComment is part of the guard, not just the disabled prop: the button now fires
        // on touch-down, so a double-tap could otherwise post the same message twice.
        if (!newComment.trim() || !matchId || isSendingComment) return;

        // Keep the keyboard up across sends (Discord-style): re-assert focus before the
        // async round-trip — a no-op when already focused, and it re-opens the keyboard
        // if a near-miss tap on the message list just dismissed it.
        commentInputRef.current?.focus();
        setIsSendingComment(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.POST_MATCH_COMMENT(matchId), {
                method: 'POST',
                body: JSON.stringify({ content: newComment.trim() }),
            });

            if (response.ok) {
                setNewComment('');
                // If SignalR is not connected or fails, we might want a manual refresh
                // but we should do it silently to avoid UI jumps
                if (!connectionRef.current) {
                    await fetchComments(true);
                }
                // Scroll to bottom after new comment
                setTimeout(() => {
                    commentsScrollRef.current?.scrollToEnd({ animated: true });
                }, 100);
            }
        } catch (error) {
            console.error('Error sending comment:', error);
        } finally {
            setIsSendingComment(false);
        }
    };

    // The send button fires on touch-down (see the composer in the modal); these two keep a
    // single gesture — touch-down followed by the tap it completes into — to exactly one send.
    const sentOnTouchDownRef = useRef(false);

    const sendCommentFromTouchDown = () => {
        sentOnTouchDownRef.current = true;
        void handleSendComment();
    };

    const sendCommentFromTap = () => {
        if (sentOnTouchDownRef.current) {
            sentOnTouchDownRef.current = false;
            return;
        }
        void handleSendComment();
    };

    const formatCommentTime = (dateString: string) => formatLocalDateTime(dateString);

    const fetchDbHomeUserId = async (): Promise<string | null> => {
        if (!matchId) {
            // Nothing to wait for, and the gate below must not strand the form behind a spinner:
            // callers build this id defensively (`match.id || match.matchId || ''`).
            setDetailsLoaded(true);
            return null;
        }
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS(matchId));
            if (response.ok) {
                const data = await response.json();

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
                let evidences = data.evidences || data.Evidences || [];

                // Series format + games. On a team sub-match these live on the sub-match row, and
                // the win condition on the parent DTO, so both are re-read in the sub-match branch.
                let bestOf = data.bestOf ?? data.BestOf ?? 1;
                let tiebreakBestOf = data.tiebreakBestOf ?? data.TiebreakBestOf ?? null;
                const condition = normalizeCondition(data.seriesWinCondition ?? data.SeriesWinCondition);
                let games = seriesGamesFrom(data);
                let proposed = seriesGamesFrom({ games: data.proposedGames ?? data.ProposedGames });
                // Only a solo knockout match can park in a tiebreak; the server says which.
                let allowsTie = Boolean(data.allowsTieBreak ?? data.AllowsTieBreak ?? false);

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
                        evidences = sub.evidences || sub.Evidences || evidences;
                        // Each individual game of a tie is its own series, reported on the sub-match.
                        bestOf = sub.bestOf ?? sub.BestOf ?? bestOf;
                        tiebreakBestOf = sub.tiebreakBestOf ?? sub.TiebreakBestOf ?? tiebreakBestOf;
                        games = seriesGamesFrom(sub);
                        proposed = seriesGamesFrom({ games: sub.proposedGames ?? sub.ProposedGames });
                        // A level sub-match is never replayed — the tie resolves it one level up.
                        allowsTie = false;
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
        } catch (error) {
            console.error('[MatchScheduleCard] Error fetching match details for home/away mapping:', error);
        } finally {
            // Settled either way: a failed fetch must not leave the form hidden behind a spinner.
            setDetailsLoaded(true);
        }
        return null;
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
            setModalVisible(false);
            // The consumed proposal drops both this user's "result to confirm" badge and the
            // organizer pill cascade — refresh eagerly instead of relying on the SignalR push.
            refreshBadges();
            if (onMatchUpdate) onMatchUpdate();
        } catch (err: any) {
            console.error('[MatchScheduleCard] Approve error:', err);
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
            // Refresh details so the modal returns to the empty-score state and the proposer can resubmit.
            await fetchDbHomeUserId();
            refreshBadges();
            if (onMatchUpdate) onMatchUpdate();
        } catch (err: any) {
            console.error('[MatchScheduleCard] Reject error:', err);
            setError(err.message || 'An error occurred while rejecting the result');
        } finally {
            setIsRejecting(false);
        }
    };

    // Fetch availability and comments when modal opens
    useEffect(() => {
        if (!modalVisible) {
            setDetailsLoaded(false);
            return;
        }

        if (currentStatus === 'pending_availability') {
            fetchAvailability();
        }

        // Only load comments if they haven't been loaded for this match yet
        // or if we explicitly want to refresh on open
        if (currentStatus === 'scheduled' || currentStatus === 'ready_phase' || currentStatus === 'pending_availability') {
            fetchComments();
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

    // SignalR Connection
    useEffect(() => {
        if (!matchId || !modalVisible) return;

        // Scope flag — same pattern as DirectChatScreen. Prevents stale
        // ReceiveMessage callbacks from writing to the next match's state
        // and skips JoinMatchGroup if the modal closed before start() resolved.
        let isActive = true;

        const connection = new HubConnectionBuilder()
            // MatchChatHub now requires authentication — pass the JWT as the access_token query param.
            .withUrl(`${API_BASE_URL}/hubs/chat`, {
                accessTokenFactory: async () =>
                    (await SecureStore.getItemAsync('access_token').catch(() => null)) ?? '',
            })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();

        connection.on("ReceiveMessage", (newMessage: any) => {
            if (!isActive) return;
            const mappedMessage: MatchComment = {
                id: newMessage.id || newMessage.Id,
                userId: newMessage.userId || newMessage.UserId,
                userNickname: newMessage.userNickname || newMessage.UserNickname || 'Unknown',
                userAvatarUrl: newMessage.userAvatarUrl || newMessage.UserAvatarUrl,
                content: newMessage.content || newMessage.Content,
                sentAt: newMessage.sentAt || newMessage.SentAt,
            };

            setComments((prevComments) => {
                if (prevComments.some(c => c.id === mappedMessage.id)) return prevComments;
                return [...prevComments, mappedMessage];
            });

            setTimeout(() => {
                commentsScrollRef.current?.scrollToEnd({ animated: true });
            }, 100);
        });

        // Group membership is per-connection: withAutomaticReconnect() re-establishes the
        // socket after a drop (common on mobile: network switch, backgrounding) but SignalR
        // does NOT re-join our old groups. Without this handler the card looks connected
        // but silently stops receiving new messages until the user closes and reopens it.
        // Backfill the gap with a merged, dedup'd history pull.
        connection.onreconnected(() => {
            if (!isActive) return;
            connection.invoke('JoinMatchGroup', matchId).catch(() => { });
            authenticatedFetch(ENDPOINTS.GET_MATCH_COMMENTS(matchId))
                .then((r) => (r.ok ? r.json() : null))
                .then((msgs: MatchComment[] | null) => {
                    if (!isActive || !Array.isArray(msgs)) return;
                    setComments((prev) => mergeMessagesById(prev, msgs));
                })
                .catch(() => { });
        });

        const startPromise = connection.start()
            .then(() => {
                if (!isActive) return;
                return connection.invoke("JoinMatchGroup", matchId);
            })
            .catch((err) => console.error('SignalR Connection Error:', err));

        connectionRef.current = connection;

        return () => {
            isActive = false;
            connection.off("ReceiveMessage");
            // Wait for start to settle before stopping, otherwise stop() on a
            // still-Connecting connection throws and leaves orphan sockets.
            startPromise.finally(async () => {
                try { await connection.stop(); } catch { /* ignore */ }
            });
            connectionRef.current = null;
        };
    }, [matchId, modalVisible]);

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

            if (response.ok) {
                const result = await response.json();

                setMySlots(dateTimeSlots);

                // Check if match was scheduled
                if (result.data?.confirmedTime) {
                    const confirmedDate = parseUtcDate(result.data.confirmedTime);
                    setMatchTime(confirmedDate.toLocaleString());
                    setMatchTimeIso(result.data.confirmedTime);
                    setCurrentStatus('scheduled');
                }

                // Notify parent to refresh immediately
                if (onMatchUpdate) {
                    onMatchUpdate();
                }
            }
        } catch (error) {
            console.error('Error submitting availability:', error);
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
                setMatchTime('Agreed outside app');
                // No agreed timestamp in this path — clear the raw one so the strip shows the text.
                setMatchTimeIso(undefined);
                
                if (onMatchUpdate) {
                    onMatchUpdate();
                }
            } else {
                const errorText = await response.text().catch(() => 'Failed to mark as scheduled');
                setError(errorText);
            }
        } catch (error: any) {
            console.error('Error marking scheduled:', error);
            setError(error.message || 'An error occurred');
        } finally {
            setIsSubmitting(false);
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
                // File size check for multiple selections
                const oversized = result.assets.filter(asset => !isFileSizeValid(asset));

                if (oversized.length > 0) {
                    const oversizedNames = oversized.map(a => a.fileName || 'Image').join(', ');
                    setError(`Some images are too large: ${oversizedNames}. Max size is ${formatFileSize(MAX_FILE_SIZE)}.`);

                    // Only add the valid ones
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
                setError('Enter the score for at least one game');
                return;
            }
            if (!isSeriesComplete) {
                setError('Enter the remaining games before submitting');
                return;
            }
        } else if (homeScore === '' || awayScore === '') {
            console.log('[MatchScheduleCard] Missing scores');
            setError('Please enter scores for both players');
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
                setError('Could not load this match. Check your connection and try again.');
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

            console.log('[MatchScheduleCard] Success! Checking for images to upload');

            if (selectedImages.length > 0) {
                const formData = new FormData();
                selectedImages.forEach((img, index) => {
                    const filename = img.uri.split('/').pop() || `evidence-${index}.jpg`;
                    const match = /\.(\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : `image/jpeg`;
                    // @ts-ignore
                    formData.append('files', { uri: img.uri, name: filename, type });
                });

                await authenticatedFetch(ENDPOINTS.UPLOAD_MATCH_EVIDENCE(matchId), {
                    method: 'POST',
                    body: formData,
                });
            }

            console.log('[MatchScheduleCard] Complete! Closing modal and refreshing');

            if (onMatchUpdate) {
                onMatchUpdate();
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
                await fetchDbHomeUserId();
            } else {
                setModalVisible(false);
            }
        } catch (err: any) {
            console.error('[MatchScheduleCard] Report result error:', err);
            setError(err.message || 'An error occurred while reporting result');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusContent = () => {
        switch (currentStatus) {
            case 'pending_availability':
                return (
                    <View
                        className="flex-row items-center gap-1.5 self-start px-2.5 py-1 rounded-lg"
                        style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.12)',
                            borderWidth: 1,
                            borderColor: 'rgba(245, 158, 11, 0.28)',
                        }}
                    >
                        <Ionicons name="calendar" size={11} color="#FBBF24" />
                        <Text className="text-[10px] font-black text-amber-300 uppercase tracking-tight">
                            Set Availability
                        </Text>
                    </View>
                );
            case 'scheduled':
                return (
                    <View
                        className="flex-row items-center gap-1.5 self-start px-2.5 py-1 rounded-lg"
                        style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            borderWidth: 1,
                            borderColor: 'rgba(16, 185, 129, 0.28)',
                        }}
                    >
                        <Ionicons name="time" size={11} color="#34D399" />
                        <Text className="text-[10px] font-black text-emerald-300 uppercase tracking-tight">
                            {matchTime}
                        </Text>
                    </View>
                );
            case 'ready_phase':
                return (
                    <View
                        className="flex-row items-center gap-1.5 self-start px-2.5 py-1 rounded-lg"
                        style={{
                            backgroundColor: 'rgba(99, 102, 241, 0.12)',
                            borderWidth: 1,
                            borderColor: 'rgba(99, 102, 241, 0.28)',
                        }}
                    >
                        <Ionicons name="flash" size={11} color="#A5B4FC" />
                        <Text className="text-[10px] font-black text-indigo-300 uppercase tracking-tight">
                            Ready Check
                        </Text>
                    </View>
                );
            default:
                return null;
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
                                <Text className="text-[11px] font-black text-yellow-500 uppercase tracking-tight">Set Availability</Text>
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
                                    {currentStatus === 'scheduled' ? matchTime : "Ready Check"}
                                </Text>
                            </View>
                        )}
                    </View>
                </Pressable>

                {renderModal()}
            </>
        );
    }

    const statusColor = currentStatus === 'pending_availability' ? '#F59E0B'
        : currentStatus === 'scheduled' ? '#10B981' : '#6366F1';

    return (
        <>
            <Pressable
                onPress={() => setModalVisible(true)}
                className="active:opacity-90"
            >
                <View
                    className={cn(
                        "rounded-[22px] overflow-hidden",
                        currentStatus === 'ready_phase' && "border border-indigo-500/30"
                    )}
                    style={{
                        backgroundColor: '#131B2E',
                        shadowColor: statusColor,
                        shadowOpacity: 0.12,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 6,
                    }}
                >
                    {/* Subtle status-tinted gradient (left-to-right) */}
                    <LinearGradient
                        colors={[statusColor + '14', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.7, y: 0 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    />

                    {/* Soft hairline border */}
                    <View
                        pointerEvents="none"
                        className="absolute inset-0 rounded-[22px]"
                        style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }}
                    />

                    {/* Left accent line (glowing) */}
                    <View
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 14,
                            bottom: 14,
                            width: 3,
                            backgroundColor: statusColor,
                            borderTopRightRadius: 3,
                            borderBottomRightRadius: 3,
                            shadowColor: statusColor,
                            shadowOpacity: 0.7,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 0 },
                        }}
                    />

                    <View className="p-4 pl-5">
                        {/* Top row: hub badge + tournament */}
                        <View className="flex-row items-center justify-between mb-3.5">
                            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
                                <View
                                    style={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: 2,
                                        backgroundColor: statusColor,
                                    }}
                                />
                                <Text
                                    className="text-[10px] font-black uppercase tracking-[2px] flex-1"
                                    style={{ color: statusColor + 'DD' }}
                                    numberOfLines={1}
                                >
                                    {roundName}
                                </Text>
                            </View>
                            <Text
                                className="text-[10px] font-bold text-slate-500 tracking-wider"
                                numberOfLines={1}
                            >
                                {tournamentName}
                            </Text>
                        </View>

                        {/* Main content row */}
                        <View className="flex-row items-center">
                            <View
                                style={{
                                    shadowColor: statusColor,
                                    shadowOpacity: 0.35,
                                    shadowRadius: 10,
                                    shadowOffset: { width: 0, height: 2 },
                                }}
                            >
                                <View
                                    style={{
                                        borderWidth: 1.5,
                                        borderColor: statusColor + '55',
                                        borderRadius: 16,
                                        padding: 2,
                                    }}
                                >
                                    <PlayerAvatar
                                        src={opponentAvatarUrl}
                                        name={opponentName}
                                        size="md"
                                        className="rounded-[12px]"
                                    />
                                </View>
                            </View>

                            <View className="flex-1 ml-3.5 min-w-0">
                                <View className="flex-row items-baseline gap-1.5">
                                    <Text
                                        className="text-[11px] font-black uppercase tracking-widest"
                                        style={{ color: statusColor }}
                                    >
                                        vs
                                    </Text>
                                    <Text
                                        className="text-[15px] font-black text-white tracking-tight flex-1"
                                        numberOfLines={1}
                                    >
                                        {opponentName}
                                    </Text>
                                </View>
                                <View className="flex-row items-center mt-2">
                                    {getStatusContent()}
                                </View>
                            </View>

                            {showUnreadBadge && (
                                <View
                                    className="flex-row items-center gap-1 ml-2 px-2 h-6 rounded-full"
                                    style={{ backgroundColor: '#EF4444' }}
                                >
                                    <Ionicons name="chatbubble" size={10} color="#FFFFFF" />
                                    <Text className="text-white font-black" style={{ fontSize: 10 }}>
                                        {unreadMessages > 99 ? '99+' : unreadMessages}
                                    </Text>
                                </View>
                            )}

                            <View
                                className="w-8 h-8 rounded-full items-center justify-center ml-2"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.07)',
                                }}
                            >
                                <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                            </View>
                        </View>
                    </View>
                </View>
            </Pressable>

            {renderModal()}
        </>
    );

    function renderModal() {
        const isPremium = true;

        const scrollToBottom = () => {
            setTimeout(() => {
                if (activeModalTab === 'chat') {
                    commentsScrollRef.current?.scrollToEnd({ animated: true });
                } else {
                    mainScrollViewRef.current?.scrollToEnd({ animated: true });
                }
            }, 150);
        };

        return (
            <Modal
                animationType="slide"
                transparent={false}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
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

                            {/* Header — minimal monochrome with trophy icon */}
                            <View className="flex-row items-center mb-6">
                                <View
                                    className="w-12 h-12 rounded-2xl items-center justify-center mr-3.5"
                                    style={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(255, 255, 255, 0.06)',
                                    }}
                                >
                                    <Ionicons name="trophy" size={20} color="#CBD5E1" />
                                </View>
                                <View className="flex-1 mr-3">
                                    <Text
                                        className="text-white font-black tracking-tight"
                                        style={{ fontSize: 20, lineHeight: 24 }}
                                        numberOfLines={2}
                                    >
                                        {tournamentName}
                                    </Text>
                                    <Text
                                        className="text-slate-500 text-[11px] font-bold uppercase tracking-[2px] mt-1"
                                        numberOfLines={1}
                                    >
                                        in {roundName}
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => setModalVisible(false)}
                                    className="w-10 h-10 rounded-2xl items-center justify-center"
                                    style={({ pressed }) => ({
                                        opacity: pressed ? 0.6 : 1,
                                        transform: [{ scale: pressed ? 0.9 : 1 }],
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(255, 255, 255, 0.07)',
                                    })}
                                >
                                    <Ionicons name="close" size={18} color="#94A3B8" />
                                </Pressable>
                            </View>

                            {/* Slim divider under header */}
                            <View
                                className="mb-5"
                                style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
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
                                        "text-xs font-black uppercase tracking-widest w-full text-center",
                                        activeModalTab === 'match' ? "text-emerald-300" : "text-slate-500"
                                    )}>Match</Text>
                                </ModalTabButton>
                                <ModalTabButton
                                    active={activeModalTab === 'chat'}
                                    onPress={() => setActiveModalTab('chat')}
                                >
                                    <View className="flex-row items-center gap-2">
                                        <Text numberOfLines={1} className={cn(
                                            "text-xs font-black uppercase tracking-widest",
                                            activeModalTab === 'chat' ? "text-emerald-300" : "text-slate-500"
                                        )}>Chat</Text>
                                        {comments.length > 0 && (
                                            <View className={cn(
                                                "min-w-[20px] h-5 items-center justify-center rounded-full px-1.5",
                                                activeModalTab === 'chat' ? "bg-emerald-400/30" : "bg-white/[0.06]"
                                            )}>
                                                <Text className={cn(
                                                    "text-[10px] font-black",
                                                    activeModalTab === 'chat' ? "text-emerald-200" : "text-slate-500"
                                                )}>{comments.length}</Text>
                                            </View>
                                        )}
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
                                                "text-xs font-black uppercase tracking-widest",
                                                activeModalTab === 'stream' ? "text-emerald-300" : "text-slate-500"
                                            )}>Stream</Text>
                                            {streams.some(s => s.status === MatchStreamStatus.Live) && (
                                                <View className="flex-row items-center gap-1 bg-red-500/15 px-1.5 py-0.5 rounded-md">
                                                    <View className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    <Text className="text-[8px] font-black text-red-400 uppercase">Live</Text>
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
                                                <HourlyAvailabilityPicker
                                                    matchId={matchId}
                                                    deadline={localDeadline}
                                                    opponentName={opponentName}
                                                    opponentAvatarUrl={opponentAvatarUrl}
                                                    opponentAvailability={opponentSlots}
                                                    initialSlots={mySlots}
                                                    onSubmit={handleAvailabilitySubmit}
                                                    onMarkScheduled={handleMarkScheduled}
                                                />
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
                                            const visualLeftScore = isUserDbHome ? proposedHomeScore : proposedAwayScore;
                                            const visualRightScore = isUserDbHome ? proposedAwayScore : proposedHomeScore;
                                            const proposerName = !!proposedByUserId && dbHomeUserId && proposedByUserId.toLowerCase() === dbHomeUserId.toLowerCase()
                                                ? (dbHomeUsername || 'Opponent')
                                                : (dbAwayUsername || 'Opponent');

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

                                                {/* Pending Proposal Card — hidden while editing so the edit form gets the full stage. */}
                                                {hasPendingProposal && !isEditingProposal && (
                                                    <View className={cn(
                                                        "rounded-[20px] p-4",
                                                        isPremium ? "bg-card/60 border border-white/[0.06]" : "bg-muted/10 border border-border/10"
                                                    )}>
                                                        <View className="items-center mb-3">
                                                            <View className="bg-warning/10 px-3 py-1 rounded-full">
                                                                <Text className="text-[9px] font-black text-warning uppercase tracking-[3px]">
                                                                    {isProposer ? 'Awaiting Approval' : 'Result Reported'}
                                                                </Text>
                                                            </View>
                                                            <Text className={cn(
                                                                "text-[11px] text-center mt-2 font-bold",
                                                                isPremium ? "text-slate-400" : "text-muted-foreground"
                                                            )}>
                                                                {isProposer
                                                                    ? 'Waiting for your opponent or admin to confirm.'
                                                                    : `${proposerName} reported the result. Confirm if it's correct.`}
                                                            </Text>
                                                        </View>

                                                        <View className="flex-row items-start justify-between">
                                                            <View className="flex-1 items-center">
                                                                <PlayerAvatar
                                                                    src={user?.avatarUrl}
                                                                    name={user?.username || 'You'}
                                                                    size="lg"
                                                                    className="rounded-2xl border-0"
                                                                />
                                                                <PlayerIdentity
                                                                    className="mt-2"
                                                                    username={user?.username || 'You'}
                                                                    nickname={leftNickname}
                                                                    tone="home"
                                                                    reserveNicknameSpace={pairingHasNickname}
                                                                />
                                                            </View>

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

                                                            <View className="flex-1 items-center">
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
                                                            </View>
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
                                                                            <Text className="text-xs font-black text-red-400 uppercase tracking-wider w-full text-center" numberOfLines={1}>Reject</Text>
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
                                                                            <Text className="text-xs font-black text-primary-foreground uppercase tracking-wider w-full text-center" numberOfLines={1}>Approve</Text>
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
                                                                        <Text className="text-xs font-black text-warning uppercase tracking-wider w-full text-center" numberOfLines={1}>Edit</Text>
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
                                                            <Text className="text-[10px] font-black text-warning uppercase tracking-[2px]">Editing Your Report</Text>
                                                            <Text className={cn(
                                                                "text-[11px] mt-0.5",
                                                                isPremium ? "text-slate-400" : "text-muted-foreground"
                                                            )}>
                                                                Update the score and tap Update Report to notify your opponent.
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
                                                        leftName={user?.username || 'You'}
                                                        leftNickname={userNickname || user?.nickName}
                                                        leftAvatarUrl={user?.avatarUrl}
                                                        rightName={opponentName}
                                                        rightNickname={opponentNickname}
                                                        rightAvatarUrl={opponentAvatarUrl}
                                                        format={seriesFormat}
                                                        allowTiebreak={allowsTiebreak}
                                                        initialGames={visualEntrySeedGames}
                                                        onChange={(games, outcome, complete) => {
                                                            setSeriesGames(games);
                                                            setSeriesOutcome(outcome);
                                                            setIsSeriesComplete(complete);
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
                                                        {/* Home Player (You) */}
                                                        <View className="flex-1 items-center">
                                                            <View className={cn(
                                                                "rounded-full p-[3px] mb-2",
                                                                isPremium ? "bg-primary/20" : ""
                                                            )}>
                                                                <PlayerAvatar
                                                                    src={user?.avatarUrl}
                                                                    name={user?.username || 'You'}
                                                                    size={isPremium ? "xl" : "lg"}
                                                                    className={cn(isPremium ? "border-2 border-background-deep" : "")}
                                                                />
                                                            </View>
                                                            <Text className={cn("font-black text-center mb-0.5", isPremium ? "text-base text-white" : "text-base text-foreground")} numberOfLines={1}>
                                                                {user?.username || 'You'}
                                                            </Text>
                                                            {(userNickname || user?.nickName) && (
                                                                <View className="flex-row items-center justify-center gap-1 mb-1">
                                                                    <Ionicons name="game-controller" size={20} color="#10B981" />
                                                                    <Text className="font-semibold text-[13px] text-slate-500" numberOfLines={1}>
                                                                        {userNickname || user?.nickName}
                                                                    </Text>
                                                                </View>
                                                            )}
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
                                                            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest w-full text-center" numberOfLines={1}>Cancel</Text>
                                                        </Pressable>
                                                    )}
                                                    <Pressable
                                                        onPress={async () => { await handleSubmitResult(); setIsEditingProposal(false); }}
                                                        // Also held while the details load: the format decides what a valid
                                                        // submission even looks like.
                                                        disabled={isSubmitting || isRoundLocked || !detailsLoaded}
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
                                                            colors={isRoundLocked ? ['#475569', '#334155'] : ['#10B981', '#059669']}
                                                            start={{ x: 0, y: 0 }}
                                                            end={{ x: 1, y: 1 }}
                                                            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            {isSubmitting ? (
                                                                <ActivityIndicator size="small" color="#022C22" />
                                                            ) : (
                                                                <View className="flex-row items-center gap-2">
                                                                    <Ionicons
                                                                        name={isRoundLocked ? "lock-closed" : "checkmark-circle"}
                                                                        size={18}
                                                                        color={isRoundLocked ? "#CBD5E1" : "#022C22"}
                                                                    />
                                                                    <Text numberOfLines={1} className={cn(
                                                                        "font-black uppercase tracking-widest text-xs",
                                                                        isRoundLocked ? "text-slate-200" : "text-emerald-950"
                                                                    )}>
                                                                        {isRoundLocked
                                                                            ? "Round not open yet"
                                                                            : isEditingProposal
                                                                                ? "Update Report"
                                                                                // A level knockout series is reported now and decided by a
                                                                                // tiebreak later — say so on the button rather than letting
                                                                                // "Submit Result" imply the match is settled.
                                                                                : (isSeriesMatch && allowsTiebreak && seriesOutcome?.isLevel)
                                                                                    ? "Report — Tiebreak Needed"
                                                                                    : (requireResultApproval ? "Report Result" : "Submit Result")}
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
                                                            <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Uploaded</Text>
                                                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                                {existingEvidences.map((url, idx) => (
                                                                    <View key={idx} className="mr-2.5">
                                                                        <Image
                                                                            source={{ uri: getOptimizedCloudinaryUrl(url, 320) }}
                                                                            style={{ width: 96, height: 128, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}
                                                                            contentFit="cover"
                                                                            cachePolicy="memory-disk"
                                                                        />
                                                                    </View>
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
                                                                <Text className="font-bold uppercase ml-1 text-[10px] text-slate-500">Clear</Text>
                                                            </Pressable>
                                                        </View>
                                                    )}

                                                    {selectedImages.length > 0 ? (
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                                            {selectedImages.map((img, index) => (
                                                                <View key={img.uri + index} className="mr-3 mb-2">
                                                                    <Image source={{ uri: img.uri }} style={isPremium ? { width: 80, height: 80, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' } : { width: 80, height: 80, borderRadius: 16 }} />
                                                                    <Pressable onPress={() => removeImage(img.uri)} className={cn("absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full items-center justify-center", isPremium ? "bg-destructive" : "bg-destructive")}>
                                                                        <Ionicons name="close" size={12} color="white" />
                                                                    </Pressable>
                                                                </View>
                                                            ))}
                                                        </ScrollView>
                                                    ) : (
                                                        <Pressable onPress={pickImages} className={cn("h-20 border border-dashed rounded-2xl items-center justify-center", isPremium ? "border-white/[0.08] bg-white/[0.01]" : "border-border/20 bg-muted/5")}
                                                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                                        >
                                                            <Ionicons name="cloud-upload-outline" size={24} color={isPremium ? "#334155" : "#71717A"} />
                                                            <Text className="font-semibold tracking-wider mt-1 text-[10px] text-slate-600">Tap to upload</Text>
                                                        </Pressable>
                                                    )}

                                                    {/* Upload-only button visible during pending proposal so the proposer can attach
                                                        additional evidence without resubmitting their score. */}
                                                    {hasPendingProposal && selectedImages.length > 0 && (
                                                        <Pressable
                                                            onPress={async () => {
                                                                if (!matchId || selectedImages.length === 0) return;
                                                                const formData = new FormData();
                                                                selectedImages.forEach((img, index) => {
                                                                    const filename = img.uri.split('/').pop() || `evidence-${index}.jpg`;
                                                                    const m = /\.(\w+)$/.exec(filename);
                                                                    const type = m ? `image/${m[1]}` : `image/jpeg`;
                                                                    // @ts-ignore
                                                                    formData.append('files', { uri: img.uri, name: filename, type });
                                                                });
                                                                try {
                                                                    setIsSubmitting(true);
                                                                    await authenticatedFetch(ENDPOINTS.UPLOAD_MATCH_EVIDENCE(matchId), { method: 'POST', body: formData });
                                                                    setSelectedImages([]);
                                                                    await fetchDbHomeUserId();
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
                                                                    <Text className="text-xs font-black text-indigo-400 uppercase tracking-wider" numberOfLines={1}>Upload Evidence</Text>
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
                                                <Text numberOfLines={1} className={cn("font-black mt-6 uppercase tracking-widest w-full text-center", isPremium ? "text-xl text-white" : "text-foreground")}>Completed</Text>
                                                {isPremium && <Text className="text-sm font-medium text-slate-500 mt-2">Results have been recorded</Text>}
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
                                                    onChanged={() => { fetchDbHomeUserId(); refreshBadges(); }}
                                                />
                                            </View>
                                        )}
                                    </ScrollView>
                                ) : activeModalTab === 'stream' ? (
                                    <MatchStreamPanel
                                        matchId={matchId}
                                        isParticipant={isMatchParticipant}
                                        isCompleted={currentStatus === 'completed'}
                                        currentUserId={user?.id}
                                        initialStreams={streams}
                                        onStreamsChange={setStreams}
                                    />
                                ) : (
                                    <View className="flex-1">
                                        <View className="flex-row items-center gap-2 mb-4">
                                            <Ionicons name="chatbubbles-outline" size={isPremium ? 20 : 18} color="#10B981" />
                                            <Text className={cn("font-black uppercase tracking-tight", isPremium ? "text-lg text-white" : "text-sm text-foreground")}>Match Chat</Text>
                                            <Text className={cn("font-bold", isPremium ? "text-xs text-slate-500" : "text-[10px] text-muted-foreground")}>({comments.length})</Text>
                                        </View>

                                        {isLoadingComments ? (
                                            <View className="h-48 items-center justify-center">
                                                <ActivityIndicator size="small" color="#10B981" />
                                            </View>
                                        ) : comments.length > 0 ? (
                                            <View className="flex-1">
                                                <ScrollView
                                                    ref={commentsScrollRef}
                                                    className={cn("mb-2 flex-1")}
                                                    nestedScrollEnabled
                                                    showsVerticalScrollIndicator={false}
                                                    // 'always', not 'handled': with 'handled' the list still blurs the
                                                    // input when it ends up as the touch responder, which ate the first tap
                                                    // on Send and only dropped the keyboard — two taps per message. Drag-to-
                                                    // dismiss (below) stays, and is the only dismissal this chat needs.
                                                    keyboardShouldPersistTaps="always"
                                                    // iOS: 'interactive' (drag down onto the keyboard to dismiss, Discord-style)
                                                    // so a small scroll while composing doesn't drop the keyboard.
                                                    // Android doesn't support 'interactive' — keep 'on-drag' there.
                                                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                                                    contentContainerStyle={{ paddingVertical: 10 }}
                                                    onContentSizeChange={() => commentsScrollRef.current?.scrollToEnd({ animated: false })}
                                                >
                                                    {comments.map((comment) => {
                                                        const senderId = (comment.userId || '').toLowerCase();
                                                        const isMyComment = !!user?.id && senderId === user.id.toLowerCase();
                                                        // Match participants (home/away) come from the loaded match details.
                                                        // Any sender outside that set is an admin / hub owner chiming in.
                                                        const matchParticipantIds = [dbHomeUserId, dbAwayUserId]
                                                            .filter(Boolean)
                                                            .map(id => (id as string).toLowerCase());
                                                        const isAdminMessage = !isMyComment && matchParticipantIds.length > 0 && !matchParticipantIds.includes(senderId);
                                                        const isOpponentMessage = !isMyComment && !isAdminMessage;
                                                        // Use the sender's own avatar; only fall back to the opponent avatar for the
                                                        // actual opponent — never borrow it for an admin (that was the bug).
                                                        const avatarSrc = isMyComment
                                                            ? user?.avatarUrl
                                                            : (comment.userAvatarUrl || (isOpponentMessage ? opponentAvatarUrl : undefined));
                                                        return (
                                                            <View key={comment.id} className={cn(
                                                                "mb-4 flex-row items-end gap-2 max-w-[85%]",
                                                                isMyComment ? "self-end" : "self-start"
                                                            )}>
                                                                {!isMyComment && (
                                                                    <PlayerAvatar
                                                                        src={avatarSrc}
                                                                        name={comment.userNickname}
                                                                        size="sm"
                                                                        className="w-7 h-7 shrink-0"
                                                                    />
                                                                )}

                                                                <View className={cn(isMyComment ? "items-end" : "items-start", "flex-1")}>
                                                                    <View className="flex-row items-center gap-2 mb-1 px-1">
                                                                        {!isMyComment && (
                                                                            <Text className={cn("font-black text-[10px] uppercase tracking-tighter", isPremium ? "text-primary" : "text-primary/70")}>
                                                                                {comment.userNickname}
                                                                            </Text>
                                                                        )}
                                                                        {isAdminMessage && (
                                                                            <View className="bg-warning/15 px-1.5 py-0.5 rounded-full border border-warning/25">
                                                                                <Text className="text-[8px] font-black text-warning uppercase tracking-widest">Admin</Text>
                                                                            </View>
                                                                        )}
                                                                        <Text className="text-[9px] font-bold text-slate-500">
                                                                            {formatCommentTime(comment.sentAt)}
                                                                        </Text>
                                                                    </View>
                                                                    <MatchChatBubble
                                                                        content={comment.content}
                                                                        isMyComment={isMyComment}
                                                                    />
                                                                </View>

                                                                {isMyComment && (
                                                                    <PlayerAvatar
                                                                        src={user?.avatarUrl}
                                                                        name={user?.username || 'You'}
                                                                        size="sm"
                                                                        className="w-7 h-7 shrink-0"
                                                                    />
                                                                )}
                                                            </View>
                                                        );
                                                    })}
                                                </ScrollView>
                                            </View>
                                        ) : (
                                            <View className={cn("h-32 border border-dashed rounded-2xl items-center justify-center mb-4", isPremium ? "border-white/10 bg-white/[0.02]" : "border-border/20 bg-muted/5")}>
                                                <Ionicons name="chatbubble-outline" size={isPremium ? 28 : 24} color={isPremium ? "#475569" : "#71717A"} />
                                                <Text numberOfLines={1} className={cn("font-bold uppercase tracking-widest mt-1 w-full text-center", isPremium ? "text-xs text-slate-500" : "text-[10px] text-muted-foreground")}>No messages yet</Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>

                            {/* Completed matches keep the chat visible but read-only. */}
                            {activeModalTab === 'chat' && currentStatus === 'completed' && (
                                <View className="p-2 border-t border-white/5 pt-4 items-center">
                                    <View className="flex-row items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/10">
                                        <Ionicons name="lock-closed-outline" size={13} color="#64748B" />
                                        <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            Match completed — chat is read-only
                                        </Text>
                                    </View>
                                </View>
                            )}
                            {activeModalTab === 'chat' && currentStatus !== 'completed' && (
                                <View className="p-2 border-t border-white/5 pt-4">
                                    <View className="flex-row items-end gap-3 bg-white/5 p-2 rounded-[24px] border border-white/10">
                                        <TextInput
                                            ref={commentInputRef}
                                            className={cn(
                                                "flex-1 px-4 py-3 text-white font-medium",
                                            )}
                                            placeholder="Type a message..."
                                            placeholderTextColor="#64748B"
                                            value={newComment}
                                            onChangeText={setNewComment}
                                            multiline
                                            maxLength={500}
                                            style={{ minHeight: 48, maxHeight: 120 }}
                                            onFocus={scrollToBottom}
                                        />
                                        <Pressable
                                            // Sends on touch-down: inside the Modal the completed tap was being
                                            // cancelled while the keyboard was up, so the press never became a send and
                                            // the first tap only dropped the keyboard. onPress stays for activations
                                            // that produce no touch (VoiceOver), and the ref keeps one gesture to a
                                            // single send.
                                            onPressIn={sendCommentFromTouchDown}
                                            onPress={sendCommentFromTap}
                                            disabled={!newComment.trim() || isSendingComment}
                                            // Taps that land a few px above the button hit the message list,
                                            // which dismisses the keyboard and swallows the tap — extend the
                                            // touch target so near-misses still send.
                                            hitSlop={{ top: 14, bottom: 10, left: 6, right: 10 }}
                                            // Background MUST live in className — a function style on Pressable is
                                            // not applied reliably here. bg-emerald-500 (bright green) when there's
                                            // text, bg-white/5 (dark) when empty. Mirrors the friends DM send button.
                                            className={`w-12 h-12 rounded-full items-center justify-center ${
                                                newComment.trim() && !isSendingComment ? 'bg-emerald-500' : 'bg-white/5'
                                            }`}
                                            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                        >
                                            {isSendingComment ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <Ionicons
                                                    name="send"
                                                    size={20}
                                                    color={newComment.trim() ? '#fff' : '#475569'}
                                                />
                                            )}
                                        </Pressable>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }
}

interface ModalTabButtonProps {
    active: boolean;
    onPress: () => void;
    children: React.ReactNode;
}

function ModalTabButton({ active, onPress, children }: ModalTabButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-1 py-2.5 items-center rounded-xl overflow-hidden"
            style={
                active
                    ? {
                        shadowColor: '#10B981',
                        shadowOpacity: 0.35,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                    }
                    : undefined
            }
        >
            {active && (
                <LinearGradient
                    colors={['rgba(16, 185, 129, 0.28)', 'rgba(16, 185, 129, 0.10)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
            )}
            {children}
        </Pressable>
    );
}