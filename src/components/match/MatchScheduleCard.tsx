import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HourlyAvailabilityPicker } from './HourlyAvailabilityPicker';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn } from '../../lib/utils';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgesContext';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as ImagePicker from 'expo-image-picker';
import { MatchComment } from '../../types/auth';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize, getOptimizedCloudinaryUrl } from '../../lib/image';
import { MatchChatBubble } from '../chat/MatchChatBubble';
import { AdminHelpSection } from './AdminHelpSection';
import { MatchStreamPanel } from './MatchStreamPanel';
import { MatchStream, MatchStreamStatus } from '../../types/stream';

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
    deadline?: string;
    scheduledTime?: string;
    opponentAvailability?: string[];
    onMatchUpdate?: () => void;
    onPress?: () => void;
    variant?: 'default' | 'compact';
    isRoundLocked?: boolean;
    /** Unread chat messages for the current user — drives the per-match chat badge. */
    unreadMessages?: number;
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
    opponentAvailability: initialOpponentAvailability = [],
    onMatchUpdate,
    onPress,
    variant = 'default',
    isRoundLocked = false,
    unreadMessages = 0,
}: MatchScheduleCardProps) {
    const { user } = useAuth();
    const { refresh: refreshBadges } = useBadges();
    const insets = useSafeAreaInsets();

    // Local copy so the card badge clears the moment the user opens the chat,
    // without waiting for the parent list to refetch.
    const [chatRead, setChatRead] = useState(false);
    const showUnreadBadge = unreadMessages > 0 && !chatRead && initialStatus !== 'completed';

    // Android-only: under Expo SDK 54 edge-to-edge, the window no longer resizes for
    // the keyboard and KeyboardAvoidingView mis-measures inside a statusBarTranslucent
    // Modal, so we track the real keyboard height and pad the content ourselves.
    // iOS is left untouched and keeps using KeyboardAvoidingView below.
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

    const [modalVisible, setModalVisible] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<MatchStatus>(initialStatus);
    const [matchTime, setMatchTime] = useState(initialScheduledTime);
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
    const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);

    // Comments state
    const [comments, setComments] = useState<MatchComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [isSendingComment, setIsSendingComment] = useState(false);
    const commentsScrollRef = useRef<ScrollView>(null);
    const mainScrollViewRef = useRef<ScrollView>(null);
    const connectionRef = useRef<HubConnection | null>(null);

    // Collapsible sections state
    const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(true);
    const [isChatExpanded, setIsChatExpanded] = useState(true);
    const [isAvailabilityExpanded, setIsAvailabilityExpanded] = useState(true);
    const [activeModalTab, setActiveModalTab] = useState<'match' | 'chat' | 'stream'>('match');

    // Streaming — both opponents can stream, so we track a list.
    const [streams, setStreams] = useState<MatchStream[]>([]);

    const isMatchParticipant = !!user?.id && (
        (!!dbHomeUserId && dbHomeUserId.toLowerCase() === user.id.toLowerCase()) ||
        (!!dbAwayUserId && dbAwayUserId.toLowerCase() === user.id.toLowerCase())
    );

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
                    const confirmedDate = new Date(data.confirmedTime);
                    setMatchTime(confirmedDate.toLocaleString());
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
        if (!newComment.trim() || !matchId) return;

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

    const formatCommentTime = (dateString: string) => {
        const normalized = dateString.endsWith('Z') ? dateString : dateString + 'Z';
        const date = new Date(normalized);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const fetchDbHomeUserId = async (): Promise<string | null> => {
        if (!matchId) return null;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS(matchId));
            if (response.ok) {
                const data = await response.json();
                const id = data.homeUserId || data.HomeUserId || null;
                setDbHomeUserId(id);
                setDbAwayUserId(data.awayUserId || data.AwayUserId || null);
                setDbHomeUsername(data.homeUser || data.HomeUser || null);
                setDbAwayUsername(data.awayUser || data.AwayUser || null);
                setRequireResultApproval(Boolean(data.requireResultApproval ?? data.RequireResultApproval ?? false));
                setProposedHomeScore(data.proposedHomeScore ?? data.ProposedHomeScore ?? null);
                setProposedAwayScore(data.proposedAwayScore ?? data.ProposedAwayScore ?? null);
                setProposedByUserId(data.proposedByUserId ?? data.ProposedByUserId ?? null);
                setHubOwnerUserId(data.hubOwnerUserId ?? data.HubOwnerUserId ?? null);
                setExistingEvidences(data.evidences || data.Evidences || []);
                setAdminHelpRequested(Boolean(data.adminHelpRequested ?? data.AdminHelpRequested ?? false));
                setAdminHelpRequestedByUserId(data.adminHelpRequestedByUserId ?? data.AdminHelpRequestedByUserId ?? null);
                return id;
            }
        } catch (error) {
            console.error('[MatchScheduleCard] Error fetching match details for home/away mapping:', error);
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
        if (!modalVisible) return;

        if (currentStatus === 'pending_availability') {
            fetchAvailability();
        }

        // Only load comments if they haven't been loaded for this match yet
        // or if we explicitly want to refresh on open
        if (currentStatus === 'scheduled' || currentStatus === 'ready_phase' || currentStatus === 'pending_availability') {
            fetchComments();
        }

        // Fetch DB home/away roles so we can correctly map scores on submit.
        // pending_availability also needs the details for the admin-help flag state.
        if (currentStatus === 'scheduled' || currentStatus === 'ready_phase' || currentStatus === 'pending_availability') {
            fetchDbHomeUserId();
        }

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
            .withUrl(`${API_BASE_URL}/hubs/chat`)
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();

        connection.on("ReceiveMessage", (newMessage: any) => {
            if (!isActive) return;
            const mappedMessage: MatchComment = {
                id: newMessage.id || newMessage.Id,
                userId: newMessage.userId || newMessage.UserId,
                userNickname: newMessage.userNickname || newMessage.UserNickname || 'Unknown',
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
                    const confirmedDate = new Date(result.data.confirmedTime);
                    setMatchTime(confirmedDate.toLocaleString());
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
        if (homeScore === '' || awayScore === '') {
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

            const isUserDbHome =
                resolvedHomeUserId != null &&
                user?.id != null &&
                resolvedHomeUserId.toLowerCase() === user.id.toLowerCase();

            const visualLeftScore = parseInt(homeScore, 10);  // logged-in user's score
            const visualRightScore = parseInt(awayScore, 10); // opponent's score

            const payload = {
                MatchId: matchId,
                HomeScore: isUserDbHome ? visualLeftScore : visualRightScore,
                AwayScore: isUserDbHome ? visualRightScore : visualLeftScore,
                TournamentId: tournamentId
            };

            console.log('[MatchScheduleCard] Payload:', JSON.stringify(payload));
            console.log('[MatchScheduleCard] Calling API:', ENDPOINTS.REPORT_MATCH_RESULT);

            const response = await authenticatedFetch(ENDPOINTS.REPORT_MATCH_RESULT, {
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

            // In approval-required mode the submission becomes a pending proposal — keep the
            // modal open and refresh the details so the proposer immediately sees the
            // "Awaiting approval" state instead of getting bounced back.
            if (requireResultApproval) {
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

                    <Text className="text-xl font-black text-white leading-tight" numberOfLines={1}>
                        vs {opponentName}
                    </Text>

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

        // iOS keeps the original KeyboardAvoidingView; Android uses a plain View with
        // keyboard-height padding (see the Keyboard listener effect above).
        const KeyboardWrapper: React.ComponentType<any> = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
        const keyboardWrapperProps: any = Platform.OS === 'ios'
            ? { behavior: 'padding', keyboardVerticalOffset: 0, className: 'flex-1' }
            // Android edge-to-edge: keyboardDidShow reports the IME height WITHOUT the
            // navigation-bar inset (the keyboard visually covers the nav bar below it),
            // so the real gap from the keyboard top to the screen bottom is
            // keyboardHeight + insets.bottom. The modal root already pads insets.bottom,
            // so padding the wrapper by the full keyboardHeight lands the composer right
            // above the keyboard. (Subtracting insets.bottom here left it one nav-bar
            // height too low, hiding the composer behind the keyboard.)
            : { className: 'flex-1', style: { paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 } };

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
                    className={cn("flex-1", isPremium ? "bg-[#0B1120]" : "bg-background")}
                    style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
                >
                    <KeyboardWrapper {...keyboardWrapperProps}>
                        <View className={cn(
                            "flex-1 px-5 pt-5",
                            isPremium ? "bg-[#0B1120]" : "bg-card"
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
                                    <Text className={cn(
                                        "text-xs font-black uppercase tracking-widest",
                                        activeModalTab === 'match' ? "text-emerald-300" : "text-slate-500"
                                    )}>Match</Text>
                                </ModalTabButton>
                                <ModalTabButton
                                    active={activeModalTab === 'chat'}
                                    onPress={() => setActiveModalTab('chat')}
                                >
                                    <View className="flex-row items-center gap-2">
                                        <Text className={cn(
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
                                            <Text className={cn(
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

                                            return (
                                            <View className={cn("gap-3", !isPremium && "space-y-3")}>
                                                {/* Pending Proposal Card — hidden while editing so the edit form gets the full stage. */}
                                                {hasPendingProposal && !isEditingProposal && (
                                                    <View className={cn(
                                                        "rounded-[20px] p-4",
                                                        isPremium ? "bg-[#131B2E]/60 border border-white/[0.06]" : "bg-muted/10 border border-border/10"
                                                    )}>
                                                        <View className="items-center mb-3">
                                                            <View className="bg-[#F59E0B]/10 px-3 py-1 rounded-full">
                                                                <Text className="text-[9px] font-black text-[#F59E0B] uppercase tracking-[3px]">
                                                                    {isProposer ? 'Awaiting Approval' : 'Result Reported'}
                                                                </Text>
                                                            </View>
                                                            <Text className={cn(
                                                                "text-[11px] text-center mt-2 font-bold",
                                                                isPremium ? "text-slate-400" : "text-muted-foreground"
                                                            )}>
                                                                {isProposer
                                                                    ? 'Waiting for your opponent (or hub owner) to confirm.'
                                                                    : `${proposerName} reported the result. Confirm if it's correct.`}
                                                            </Text>
                                                        </View>

                                                        <View className="flex-row items-center justify-center gap-3">
                                                            <Text className="text-4xl font-black text-[#F59E0B]">
                                                                {visualLeftScore ?? 0}
                                                            </Text>
                                                            <Text className="text-xl font-black text-white/20">:</Text>
                                                            <Text className="text-4xl font-black text-[#F59E0B]">
                                                                {visualRightScore ?? 0}
                                                            </Text>
                                                        </View>

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
                                                                            <Text className="text-xs font-black text-red-400 uppercase tracking-wider">Reject</Text>
                                                                        )}
                                                                    </Pressable>
                                                                )}
                                                                {canDecide && (
                                                                    <Pressable
                                                                        onPress={handleApproveProposal}
                                                                        disabled={isApproving || isRejecting}
                                                                        className="flex-1 bg-[#10B981] rounded-2xl py-3 items-center active:opacity-80"
                                                                    >
                                                                        {isApproving ? (
                                                                            <ActivityIndicator size="small" color="#0F172A" />
                                                                        ) : (
                                                                            <Text className="text-xs font-black text-[#0F172A] uppercase tracking-wider">Approve</Text>
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
                                                                        className="flex-1 bg-[#F59E0B]/10 border border-[#F59E0B]/25 rounded-2xl py-3 items-center active:opacity-70"
                                                                    >
                                                                        <Text className="text-xs font-black text-[#F59E0B] uppercase tracking-wider">Edit</Text>
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
                                                        isPremium ? "bg-[#F59E0B]/[0.08] border border-[#F59E0B]/20" : "bg-[#F59E0B]/10 border border-[#F59E0B]/20"
                                                    )}>
                                                        <View className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 items-center justify-center">
                                                            <Ionicons name="create-outline" size={18} color="#F59E0B" />
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="text-[10px] font-black text-[#F59E0B] uppercase tracking-[2px]">Editing Your Report</Text>
                                                            <Text className={cn(
                                                                "text-[11px] mt-0.5",
                                                                isPremium ? "text-slate-400" : "text-muted-foreground"
                                                            )}>
                                                                Update the score and tap Update Report to notify your opponent.
                                                            </Text>
                                                        </View>
                                                    </View>
                                                )}
                                                {/* Players VS Section */}
                                                <View className={cn(
                                                    "rounded-[20px] p-4 pt-6",
                                                    isPremium ? "bg-[#131B2E]/60 border border-white/[0.04]" : "bg-muted/5"
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
                                                                    className={cn(isPremium ? "border-2 border-[#0B1120]" : "")}
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
                                                                            ? "bg-[#0B1120] h-14 rounded-2xl text-2xl text-[#10B981] border border-white/[0.06]"
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
                                                                    className={cn(isPremium ? "border-2 border-[#0B1120]" : "")}
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
                                                                            ? "bg-[#0B1120] h-14 rounded-2xl text-2xl text-white border border-white/[0.06]"
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

                                                {/* Submit Button */}
                                                <View className="mt-1 flex-row gap-3">
                                                    {isEditingProposal && (
                                                        <Pressable
                                                            onPress={() => { setIsEditingProposal(false); setHomeScore(''); setAwayScore(''); setError(null); }}
                                                            className="flex-1 h-14 rounded-2xl border border-white/[0.06] bg-white/[0.04] items-center justify-center active:opacity-70"
                                                        >
                                                            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest">Cancel</Text>
                                                        </Pressable>
                                                    )}
                                                    <Pressable
                                                        onPress={async () => { await handleSubmitResult(); setIsEditingProposal(false); }}
                                                        disabled={isSubmitting || isRoundLocked}
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
                                                                    <Text className={cn(
                                                                        "font-black uppercase tracking-widest text-xs",
                                                                        isRoundLocked ? "text-slate-200" : "text-emerald-950"
                                                                    )}>
                                                                        {isRoundLocked
                                                                            ? "Round not open yet"
                                                                            : isEditingProposal
                                                                                ? "Update Report"
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
                                                <View className={cn(
                                                    "rounded-[20px] p-4",
                                                    isPremium ? "bg-[#131B2E]/60 border border-white/[0.04]" : "bg-muted/5"
                                                )}>
                                                    <View className="flex-row items-center justify-between mb-4">
                                                        <View className="flex-row items-center gap-2">
                                                            <View className={cn(
                                                                "w-8 h-8 rounded-xl items-center justify-center",
                                                                isPremium ? "bg-primary/10" : "bg-primary/10"
                                                            )}>
                                                                <Ionicons name="images-outline" size={16} color="#10B981" />
                                                            </View>
                                                            <Text className={cn("font-black uppercase tracking-wider text-xs", isPremium ? "text-white" : "text-foreground")}>Evidence</Text>
                                                            {existingEvidences.length > 0 && (
                                                                <View className="bg-white/5 px-2 py-0.5 rounded-full">
                                                                    <Text className="text-[9px] font-bold text-slate-400">{existingEvidences.length}</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </View>

                                                    {/* Already-uploaded evidence (read-only carousel) — visible to both proposer and opponent. */}
                                                    {existingEvidences.length > 0 && (
                                                        <View className="mb-3">
                                                            <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Uploaded</Text>
                                                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                                {existingEvidences.map((url, idx) => (
                                                                    <View key={idx} className="mr-2.5">
                                                                        <Image
                                                                            source={{ uri: getOptimizedCloudinaryUrl(url, 320) }}
                                                                            className="w-24 h-32 rounded-xl border border-white/5"
                                                                            resizeMode="cover"
                                                                        />
                                                                    </View>
                                                                ))}
                                                            </ScrollView>
                                                        </View>
                                                    )}

                                                    <View className="flex-row items-center gap-2 mb-3">
                                                        <Pressable onPress={pickImages} className={cn(
                                                            "flex-row items-center px-3.5 py-2 rounded-xl border",
                                                            isPremium ? "bg-primary/10 border-primary/20" : "bg-primary/10 border-primary/20"
                                                        )}
                                                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                                        >
                                                            <Ionicons name="add" size={16} color="#10B981" />
                                                            <Text className="font-black uppercase ml-1 text-[10px] text-primary">Add</Text>
                                                        </Pressable>
                                                        {selectedImages.length > 0 && (
                                                            <Pressable onPress={() => setSelectedImages([])} className={cn("flex-row items-center px-3.5 py-2 rounded-xl border", isPremium ? "bg-white/[0.03] border-white/[0.06]" : "bg-muted/20 border-border/10")}
                                                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                                            >
                                                                <Ionicons name="trash-outline" size={14} color={isPremium ? "#64748B" : "#71717A"} />
                                                                <Text className="font-bold uppercase ml-1 text-[10px] text-slate-500">Clear</Text>
                                                            </Pressable>
                                                        )}
                                                    </View>

                                                    {selectedImages.length > 0 ? (
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                                            {selectedImages.map((img, index) => (
                                                                <View key={img.uri + index} className="mr-3 mb-2">
                                                                    <Image source={{ uri: img.uri }} className={cn("rounded-2xl", isPremium ? "w-20 h-20 border border-white/[0.06]" : "w-20 h-20")} />
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
                                                                    <Text className="text-xs font-black text-indigo-400 uppercase tracking-wider">Upload Evidence</Text>
                                                                </>
                                                            )}
                                                        </Pressable>
                                                    )}
                                                </View>
                                            </View>
                                            );
                                        })()}

                                        {currentStatus === 'completed' && (
                                            <View className={cn("py-12 items-center rounded-[40px] border mt-4", isPremium ? "bg-white/5 border-white/10" : "bg-muted/10 border-transparent")}>
                                                <View className={cn("w-20 h-20 rounded-full items-center justify-center border", isPremium ? "bg-primary/20 border-primary/30" : "bg-primary/20 border-transparent")}>
                                                    <Ionicons name="checkmark" size={40} color="#10B981" />
                                                </View>
                                                <Text className={cn("font-black mt-6 uppercase tracking-widest", isPremium ? "text-xl text-white" : "text-foreground")}>Completed</Text>
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
                                                    onChanged={() => { fetchDbHomeUserId(); }}
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
                                                    keyboardShouldPersistTaps="handled"
                                                    keyboardDismissMode="on-drag"
                                                    contentContainerStyle={{ paddingVertical: 10 }}
                                                    onContentSizeChange={() => commentsScrollRef.current?.scrollToEnd({ animated: false })}
                                                >
                                                    {comments.map((comment) => {
                                                        const isMyComment = comment.userId === user?.id;
                                                        return (
                                                            <View key={comment.id} className={cn(
                                                                "mb-4 flex-row items-end gap-2 max-w-[85%]",
                                                                isMyComment ? "self-end" : "self-start"
                                                            )}>
                                                                {!isMyComment && (
                                                                    <PlayerAvatar
                                                                        src={opponentAvatarUrl}
                                                                        name={opponentName}
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
                                                <Text className={cn("font-bold uppercase tracking-widest mt-1", isPremium ? "text-xs text-slate-500" : "text-[10px] text-muted-foreground")}>No messages yet</Text>
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
                                            onPress={handleSendComment}
                                            disabled={!newComment.trim() || isSendingComment}
                                            className={cn(
                                                "w-12 h-12 rounded-full items-center justify-center",
                                                newComment.trim() ? "bg-primary" : "bg-primary/20",
                                                (!newComment.trim() || isSendingComment) && "opacity-50"
                                            )}
                                            style={({ pressed }) => [{
                                                backgroundColor: !newComment.trim() || isSendingComment
                                                    ? '#1E293B'
                                                    : pressed ? '#059669' : '#10B981',
                                                transform: [{ scale: pressed ? 0.95 : 1 }]
                                            }]}
                                        >
                                            {isSendingComment ? (
                                                <ActivityIndicator size="small" color="#0F172A" />
                                            ) : (
                                                <Ionicons name="send" size={20} color="#0F172A" />
                                            )}
                                        </Pressable>
                                    </View>
                                </View>
                            )}
                        </View>
                    </KeyboardWrapper>
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