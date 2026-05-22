import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HourlyAvailabilityPicker } from './HourlyAvailabilityPicker';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn } from '../../lib/utils';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as ImagePicker from 'expo-image-picker';
import { MatchComment } from '../../types/auth';
import { MAX_FILE_SIZE, isFileSizeValid, formatFileSize } from '../../lib/image';
import { MatchChatBubble } from '../chat/MatchChatBubble';

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
}: MatchScheduleCardProps) {
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

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
    const [activeModalTab, setActiveModalTab] = useState<'match' | 'chat'>('match');

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

    const fetchDbHomeUserId = async () => {
        if (!matchId) return;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS(matchId));
            if (response.ok) {
                const data = await response.json();
                const id = data.homeUserId || data.HomeUserId || null;
                setDbHomeUserId(id);
            }
        } catch (error) {
            console.error('[MatchScheduleCard] Error fetching match details for home/away mapping:', error);
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

        // Fetch DB home/away roles so we can correctly map scores on submit
        if (currentStatus === 'scheduled' || currentStatus === 'ready_phase') {
            fetchDbHomeUserId();
        }
    }, [modalVisible, matchId]); // Removed currentStatus from dependencies to prevent re-fetching on status changes

    // SignalR Connection
    useEffect(() => {
        if (!matchId || !modalVisible) return;

        // 1. Configure Connection
        const connection = new HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/chat`)
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();

        // 2. Start Connection
        connection.start()
            .then(() => {
                console.log('SignalR Connected');
                // Join the specific match group
                connection.invoke("JoinMatchGroup", matchId);
            })
            .catch((err) => console.error('SignalR Connection Error:', err));

        // 3. Listen for Messages
        connection.on("ReceiveMessage", (newMessage: any) => {
            // Map explicitly to handle casing differences (Backend sends PascalCase)
            const mappedMessage: MatchComment = {
                id: newMessage.id || newMessage.Id,
                userId: newMessage.userId || newMessage.UserId,
                userNickname: newMessage.userNickname || newMessage.UserNickname || 'Unknown',
                content: newMessage.content || newMessage.Content,
                sentAt: newMessage.sentAt || newMessage.SentAt,
            };

            setComments((prevComments) => {
                // Prevent duplicates if API POST also adds it locally
                if (prevComments.some(c => c.id === mappedMessage.id)) return prevComments;
                return [...prevComments, mappedMessage];
            });

            // Auto-scroll to bottom on new message
            setTimeout(() => {
                commentsScrollRef.current?.scrollToEnd({ animated: true });
            }, 100);
        });

        connectionRef.current = connection;

        // 4. Cleanup on unmount or modal close
        return () => {
            connection.off("ReceiveMessage");
            connection.stop();
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
            const isUserDbHome =
                dbHomeUserId != null &&
                user?.id != null &&
                dbHomeUserId.toLowerCase() === user.id.toLowerCase();

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
            // Success - close modal and refresh
            setModalVisible(false);
            if (onMatchUpdate) {
                onMatchUpdate();
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
                    <View className="flex-row items-center gap-1.5 bg-yellow-500/10 self-start px-2 py-0.5 rounded-md border border-yellow-500/20">
                        <Ionicons name="calendar-outline" size={12} color="#EAB308" />
                        <Text className="text-[10px] font-black text-yellow-500 uppercase tracking-tighter">Set Availability</Text>
                    </View>
                );
            case 'scheduled':
                return (
                    <View className="flex-row items-center gap-1.5 bg-primary/10 self-start px-2 py-0.5 rounded-md border border-primary/20">
                        <Ionicons name="time-outline" size={12} color="#10B981" />
                        <Text className="text-[10px] font-black text-primary uppercase tracking-tighter">{matchTime}</Text>
                    </View>
                );
            case 'ready_phase':
                return (
                    <View className="flex-row items-center gap-1.5 bg-indigo-500/10 self-start px-2 py-0.5 rounded-md border border-indigo-500/20">
                        <Ionicons name="flash-outline" size={12} color="#6366F1" />
                        <Text className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">Ready Check</Text>
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

    const statusColor = currentStatus === 'pending_availability' ? '#EAB308'
        : currentStatus === 'scheduled' ? '#10B981' : '#6366F1';

    return (
        <>
            <Pressable
                onPress={() => setModalVisible(true)}
                className="active:opacity-80"
            >
                <View className={cn(
                    "bg-[#131B2E] rounded-3xl overflow-hidden",
                    currentStatus === 'ready_phase' && "border border-indigo-500/20"
                )}>
                    <View className="flex-row">
                        <View style={{ width: 4, backgroundColor: statusColor, opacity: 0.6 }} className="rounded-l-3xl" />

                        <View className="flex-1 p-4">
                            {/* Top row: hub + tournament */}
                            <View className="flex-row items-center justify-between mb-3">
                                <Text className="text-[10px] font-bold text-slate-600 uppercase tracking-widest flex-1" numberOfLines={1}>
                                    {roundName}
                                </Text>
                                <Text className="text-[10px] font-medium text-slate-600" numberOfLines={1}>
                                    {tournamentName}
                                </Text>
                            </View>

                            {/* Main content row */}
                            <View className="flex-row items-center">
                                <View className="w-11 h-11 items-center justify-center">
                                    <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="rounded-xl" />
                                </View>

                                <View className="flex-1 ml-3 min-w-0">
                                    <Text className="text-base font-black text-white tracking-tight" numberOfLines={1}>
                                        vs {opponentName}
                                    </Text>
                                    <View className="flex-row items-center mt-1.5">
                                        {getStatusContent()}
                                    </View>
                                </View>

                                <Ionicons name="chevron-forward" size={14} color="#1E293B" />
                            </View>
                        </View>
                    </View>
                </View>
            </Pressable>

            {renderModal()}
        </>
    );

    function renderModal() {
        const isPremium = variant === 'compact';

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
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        className="flex-1"
                        keyboardVerticalOffset={0}
                    >
                        <View className={cn(
                            "flex-1 px-5 pt-5",
                            isPremium ? "bg-[#0B1120]" : "bg-card"
                        )}>
                            {/* Drag Handle */}
                            <View className="w-10 h-1 bg-white/10 rounded-full self-center mb-4" />

                            {/* Premium Header Card */}
                            <View className={cn(
                                "rounded-[20px] p-4 mb-5",
                                isPremium
                                    ? "bg-[#131B2E] border border-white/[0.06]"
                                    : "bg-card border border-border/10"
                            )}>
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-1 mr-3">
                                        <View className="flex-row items-center gap-2 mb-1.5">
                                            <View className="w-2 h-2 rounded-full bg-primary" />
                                            <Text className={cn(
                                                "text-[10px] font-black uppercase tracking-[2px]",
                                                isPremium ? "text-primary/80" : "text-primary"
                                            )}>
                                                {roundName}
                                            </Text>
                                        </View>
                                        <Text className={cn(
                                            "font-black tracking-tight",
                                            isPremium ? "text-xl text-white" : "text-lg text-foreground"
                                        )} numberOfLines={2}>
                                            {tournamentName}
                                        </Text>
                                    </View>
                                    <Pressable
                                        onPress={() => setModalVisible(false)}
                                        className={cn(
                                            "rounded-2xl items-center justify-center",
                                            isPremium
                                                ? "w-10 h-10 bg-white/[0.04] border border-white/[0.06]"
                                                : "w-8 h-8 bg-secondary"
                                        )}
                                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
                                    >
                                        <Ionicons
                                            name="close"
                                            size={18}
                                            color={isPremium ? "#64748B" : "hsl(220, 15%, 55%)"}
                                        />
                                    </Pressable>
                                </View>
                            </View>

                            {/* Tab Bar */}
                            <View className={cn(
                                "flex-row mb-5 rounded-2xl p-1",
                                isPremium ? "bg-[#131B2E] border border-white/[0.04]" : "bg-muted/10"
                            )}>
                                <Pressable
                                    onPress={() => setActiveModalTab('match')}
                                    className={cn(
                                        "flex-1 py-2.5 items-center rounded-xl",
                                        activeModalTab === 'match'
                                            ? (isPremium ? "bg-primary/15" : "bg-primary/10")
                                            : "bg-transparent"
                                    )}
                                >
                                    <Text className={cn(
                                        "text-xs font-black uppercase tracking-widest",
                                        activeModalTab === 'match' ? "text-primary" : "text-slate-500"
                                    )}>Match</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => setActiveModalTab('chat')}
                                    className={cn(
                                        "flex-1 py-2.5 items-center rounded-xl",
                                        activeModalTab === 'chat'
                                            ? (isPremium ? "bg-primary/15" : "bg-primary/10")
                                            : "bg-transparent"
                                    )}
                                >
                                    <View className="flex-row items-center gap-2">
                                        <Text className={cn(
                                            "text-xs font-black uppercase tracking-widest",
                                            activeModalTab === 'chat' ? "text-primary" : "text-slate-500"
                                        )}>Chat</Text>
                                        {comments.length > 0 && (
                                            <View className={cn(
                                                "min-w-[20px] h-5 items-center justify-center rounded-full px-1.5",
                                                activeModalTab === 'chat' ? "bg-primary/30" : "bg-white/[0.06]"
                                            )}>
                                                <Text className={cn(
                                                    "text-[10px] font-black",
                                                    activeModalTab === 'chat' ? "text-primary" : "text-slate-500"
                                                )}>{comments.length}</Text>
                                            </View>
                                        )}
                                    </View>
                                </Pressable>
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
                                                    opponentAvailability={opponentSlots}
                                                    initialSlots={mySlots}
                                                    onSubmit={handleAvailabilitySubmit}
                                                    onMarkScheduled={handleMarkScheduled}
                                                />
                                            </View>
                                        )}

                                        {(currentStatus === 'scheduled' || currentStatus === 'ready_phase') && matchTime && (
                                            <View className={cn("gap-5", !isPremium && "space-y-4")}>
                                                {/* Match Time Pill */}
                                                <View className={cn(
                                                    "items-center rounded-2xl py-4 px-6",
                                                    isPremium ? "bg-[#131B2E] border border-white/[0.06]" : "bg-muted/10"
                                                )}>
                                                    <View className="flex-row items-center gap-2 mb-1.5">
                                                        <Ionicons name="time-outline" size={14} color="#10B981" />
                                                        <Text className={cn(
                                                            "text-[10px] font-black uppercase tracking-[2px]",
                                                            isPremium ? "text-slate-400" : "text-muted-foreground"
                                                        )}>Match Time</Text>
                                                    </View>
                                                    <Text className={cn(
                                                        "font-black text-primary",
                                                        isPremium ? "text-xl" : "text-lg"
                                                    )}>{matchTime}</Text>
                                                </View>

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

                                                {/* Evidence */}
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
                                                        </View>
                                                    </View>

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
                                                        <Pressable onPress={() => { setHomeScore(''); setAwayScore(''); setError(null); setSelectedImages([]); }} className={cn("flex-row items-center px-3.5 py-2 rounded-xl border", isPremium ? "bg-white/[0.03] border-white/[0.06]" : "bg-muted/20 border-border/10")}
                                                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                                        >
                                                            <Ionicons name="trash-outline" size={14} color={isPremium ? "#64748B" : "#71717A"} />
                                                            <Text className="font-bold uppercase ml-1 text-[10px] text-slate-500">Clear</Text>
                                                        </Pressable>
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
                                                </View>

                                                {/* Submit Button */}
                                                <View className="mt-6 mb-4">
                                                    <Button
                                                        className="w-full h-14 rounded-2xl"
                                                        onPress={handleSubmitResult}
                                                        loading={isSubmitting}
                                                        disabled={isRoundLocked}
                                                    >
                                                        <View className="flex-row items-center gap-2">
                                                            <Ionicons name="checkmark-circle" size={18} color={isPremium ? "#0B1120" : "#fff"} />
                                                            <Text className={cn("font-black uppercase tracking-widest text-xs", isPremium ? "text-slate-900" : "text-white")}>
                                                                {isRoundLocked ? "Round not open yet" : "Submit Result"}
                                                            </Text>
                                                        </View>
                                                    </Button>
                                                </View>
                                            </View>
                                        )}

                                        {currentStatus === 'completed' && (
                                            <View className={cn("py-12 items-center rounded-[40px] border mt-4", isPremium ? "bg-white/5 border-white/10" : "bg-muted/10 border-transparent")}>
                                                <View className={cn("w-20 h-20 rounded-full items-center justify-center border", isPremium ? "bg-primary/20 border-primary/30" : "bg-primary/20 border-transparent")}>
                                                    <Ionicons name="checkmark" size={40} color="#10B981" />
                                                </View>
                                                <Text className={cn("font-black mt-6 uppercase tracking-widest", isPremium ? "text-xl text-white" : "text-foreground")}>Completed</Text>
                                                {isPremium && <Text className="text-sm font-medium text-slate-500 mt-2">Results have been recorded</Text>}
                                            </View>
                                        )}
                                    </ScrollView>
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

                            {activeModalTab === 'chat' && (
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
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        );
    }
}