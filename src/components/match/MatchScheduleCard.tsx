import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HourlyAvailabilityPicker } from './HourlyAvailabilityPicker';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn } from '../../lib/utils';
import { authenticatedFetch, ENDPOINTS, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { MatchComment } from '../../types/auth';

type MatchStatus = 'pending_availability' | 'scheduled' | 'ready_phase' | 'completed';

interface MatchScheduleCardProps {
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    roundName: string;
    opponentName: string;
    opponentAvatarUrl?: string;
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
        const date = new Date(dateString);
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
            const payload = {
                MatchId: matchId,
                HomeScore: parseInt(homeScore, 10),
                AwayScore: parseInt(awayScore, 10),
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
                className={cn(
                    "mb-2 rounded-[24px] border border-white/5 bg-white/[0.03] p-5",
                    currentStatus === 'ready_phase' && "border-indigo-500/30"
                )}
                style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
            >
                <View className="flex-row items-center gap-4">
                    {/* Left side: Avatar */}
                    <View className="w-12 h-12 items-center justify-center">
                        <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="rounded-2xl" />
                    </View>

                    <View className="flex-1 min-w-0">
                        {/* Header Row: Hub + Time */}
                        <View className="flex-row justify-between items-center mb-0.5">
                            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" numberOfLines={1}>
                                {roundName}
                            </Text>
                            {matchTime && currentStatus !== 'scheduled' && (
                                <Text className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter">
                                    {matchTime}
                                </Text>
                            )}
                        </View>

                        {/* Tournament Row */}
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5" numberOfLines={1}>
                            {tournamentName}
                        </Text>

                        {/* Main Title Row */}
                        <Text className="text-lg font-bold text-white tracking-tight" numberOfLines={1}>
                            vs {opponentName}
                        </Text>

                        {/* Status badge */}
                        <View className="flex-row items-center mt-1">
                            {getStatusContent()}
                        </View>
                    </View>

                    {/* Right side: Chevron */}
                    <Ionicons name="chevron-forward" size={16} color="#334155" />
                </View>
            </Pressable>

            {renderModal()}
        </>
    );

    // ЗАМЕНИ renderModal функцију - само KeyboardAvoidingView део:

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
            >
                <View className={cn("flex-1", isPremium ? "bg-slate-900" : "bg-background")}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        className="flex-1"
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                    >
                        <View className={cn(
                            "flex-1 p-6 pt-12",
                            isPremium ? "bg-slate-900" : "bg-card"
                        )}>
                            {isPremium && (
                                <View className="w-12 h-1.5 bg-white/10 rounded-full self-center mb-6" />
                            )}

                            {/* Header */}
                            <View className="flex-row items-center justify-between mb-8">
                                <View>
                                    <Text className={cn(
                                        "font-black text-white tracking-tight",
                                        isPremium ? "text-2xl" : "text-lg text-foreground"
                                    )}>
                                        {tournamentName}
                                    </Text>
                                    <Text className={cn(
                                        "font-bold uppercase tracking-widest mt-1",
                                        isPremium
                                            ? "text-sm text-slate-400"
                                            : "text-sm text-muted-foreground"
                                    )}>
                                        {roundName}
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => setModalVisible(false)}
                                    className={cn(
                                        "rounded-full items-center justify-center",
                                        isPremium
                                            ? "w-10 h-10 bg-white/5 border border-white/10"
                                            : "w-8 h-8 bg-secondary"
                                    )}
                                >
                                    <Ionicons
                                        name="close"
                                        size={isPremium ? 24 : 20}
                                        color={isPremium ? "#94A3B8" : "hsl(220, 15%, 55%)"}
                                    />
                                </Pressable>
                            </View>

                            <View className="flex-row mb-6 border-b border-white/5">
                                <Pressable
                                    onPress={() => setActiveModalTab('match')}
                                    className={cn(
                                        "flex-1 pb-3 items-center border-b-2",
                                        activeModalTab === 'match' ? "border-primary" : "border-transparent"
                                    )}
                                >
                                    <Text className={cn(
                                        "font-black uppercase tracking-widest",
                                        activeModalTab === 'match' ? "text-primary" : "text-slate-500"
                                    )}>Match</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => setActiveModalTab('chat')}
                                    className={cn(
                                        "flex-1 pb-3 items-center border-b-2",
                                        activeModalTab === 'chat' ? "border-primary" : "border-transparent"
                                    )}
                                >
                                    <View className="flex-row items-center gap-2">
                                        <Text className={cn(
                                            "font-black uppercase tracking-widest",
                                            activeModalTab === 'chat' ? "text-primary" : "text-slate-500"
                                        )}>Chat</Text>
                                        {comments.length > 0 && (
                                            <View className="bg-primary/20 px-1.5 py-0.5 rounded-md">
                                                <Text className="text-[10px] font-black text-primary">{comments.length}</Text>
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
                                                />
                                            </View>
                                        )}

                                        {(currentStatus === 'scheduled' || currentStatus === 'ready_phase') && matchTime && (
                                            <View className={cn("gap-6", !isPremium && "space-y-4")}>
                                                {/* Match Info */}
                                                <View className="items-center mb-2">
                                                    <Text className={cn(
                                                        "font-black uppercase tracking-[2px]",
                                                        isPremium ? "text-xs text-slate-500" : "text-sm text-muted-foreground"
                                                    )}>Match Time</Text>
                                                    <Text className={cn(
                                                        "font-black text-primary mt-2",
                                                        isPremium ? "text-2xl" : "text-lg"
                                                    )}>{matchTime}</Text>
                                                </View>

                                                {/* Error */}
                                                {error && (
                                                    <View className={cn(
                                                        "p-4 rounded-2xl mb-2 border",
                                                        isPremium ? "bg-destructive/10 border-destructive/20" : "bg-destructive/10 border-transparent"
                                                    )}>
                                                        <Text className={cn(
                                                            "text-sm text-center font-bold",
                                                            isPremium ? "text-destructive tracking-tight" : "text-destructive"
                                                        )}>{error}</Text>
                                                    </View>
                                                )}

                                                <View className="flex-row items-center justify-between pb-2 pt-4">
                                                    {/* Home Player (You) */}
                                                    <View className="flex-1 items-center">
                                                        <PlayerAvatar 
                                                            src={user?.avatarUrl} 
                                                            name={user?.username || 'You'} 
                                                            size={isPremium ? "xl" : "lg"} 
                                                            className={cn(isPremium ? "border-[3px] border-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "")} 
                                                        />
                                                        <Text className={cn("font-black text-center mt-3 mb-0.5", isPremium ? "text-base text-white" : "text-sm text-foreground")} numberOfLines={1}>
                                                            {user?.username || 'You'}
                                                        </Text>
                                                        {isPremium && <Text className="text-[10px] font-bold text-[#10B981] uppercase tracking-[0.2em] mb-4">Your Score</Text>}
                                                        <View className="w-full px-2">
                                                            <TextInput
                                                                className={cn(
                                                                    "w-full text-center font-black",
                                                                    isPremium 
                                                                        ? "bg-[#131B2E] h-16 rounded-[20px] text-3xl text-[#10B981] border border-white/5" 
                                                                        : "bg-muted/30 h-12 rounded-2xl text-lg text-foreground border-border/10"
                                                                )}
                                                                placeholder="0"
                                                                placeholderTextColor={isPremium ? "#334155" : "#71717A"}
                                                                keyboardType="numeric"
                                                                value={homeScore}
                                                                onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                                                                onFocus={scrollToBottom}
                                                            />
                                                        </View>
                                                    </View>

                                                    {/* VS Badge */}
                                                    <View className="items-center justify-center px-4 -mt-10">
                                                        <View className={cn(
                                                            "rounded-full items-center justify-center",
                                                            isPremium ? "w-10 h-10 bg-white/5 border border-white/10" : "w-8 h-8 bg-muted"
                                                        )}>
                                                            <Text className={cn(
                                                                "font-black italic",
                                                                isPremium ? "text-xs text-slate-400" : "text-[10px] text-muted-foreground"
                                                            )}>VS</Text>
                                                        </View>
                                                    </View>

                                                    {/* Away Player (Opponent) */}
                                                    <View className="flex-1 items-center">
                                                        <PlayerAvatar 
                                                            src={opponentAvatarUrl} 
                                                            name={opponentName} 
                                                            size={isPremium ? "xl" : "lg"} 
                                                            className={cn(isPremium ? "border-[3px] border-white/10" : "")} 
                                                        />
                                                        <Text className={cn("font-black text-center mt-3 mb-0.5", isPremium ? "text-base text-white" : "text-sm text-foreground")} numberOfLines={1}>
                                                            {opponentName}
                                                        </Text>
                                                        {isPremium && <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Opponent</Text>}
                                                        <View className="w-full px-2">
                                                            <TextInput
                                                                className={cn(
                                                                    "w-full text-center font-black",
                                                                    isPremium 
                                                                        ? "bg-[#131B2E] h-16 rounded-[20px] text-3xl text-white border border-white/5" 
                                                                        : "bg-muted/30 h-12 rounded-2xl text-lg text-foreground border-border/10"
                                                                )}
                                                                placeholder="0"
                                                                placeholderTextColor={isPremium ? "#334155" : "#71717A"}
                                                                keyboardType="numeric"
                                                                value={awayScore}
                                                                onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                                                                onFocus={scrollToBottom}
                                                            />
                                                        </View>
                                                    </View>
                                                </View>

                                                {/* Evidence */}
                                                <View className={cn("mt-4 pt-6 border-t", isPremium ? "border-white/5" : "border-border/10")}>
                                                    <View className="flex-row items-center justify-between mb-4">
                                                        <View className="flex-row items-center gap-2">
                                                            <Ionicons name="images-outline" size={isPremium ? 20 : 18} color="#10B981" />
                                                            <Text className={cn("font-black uppercase tracking-tight", isPremium ? "text-lg text-white" : "text-sm text-foreground")}>Evidence</Text>
                                                        </View>
                                                    </View>

                                                    <View className="flex-row items-center gap-3 mb-3">
                                                        <Pressable onPress={pickImages} className={cn(
                                                            "flex-row items-center px-4 py-2.5 rounded-xl border self-start",
                                                            isPremium ? "bg-primary/20 border-primary/30" : "bg-primary/10 border-primary/20"
                                                        )}>
                                                            <Ionicons name="add" size={isPremium ? 20 : 16} color="#10B981" />
                                                            <Text className="font-black uppercase ml-1.5 text-xs text-primary">{isPremium ? "Photos" : "Add"}</Text>
                                                        </Pressable>
                                                        <Pressable onPress={() => { setHomeScore(''); setAwayScore(''); setError(null); setSelectedImages([]); }} className={cn("flex-row items-center px-4 py-2.5 rounded-xl border self-start", isPremium ? "bg-white/5 border-white/10" : "bg-muted/20 border-border/10")}>
                                                            <Ionicons name="trash-outline" size={isPremium ? 20 : 16} color={isPremium ? "#94A3B8" : "#71717A"} />
                                                            <Text className="font-bold uppercase ml-1.5 text-xs text-slate-400">Clear</Text>
                                                        </Pressable>
                                                    </View>

                                                    {selectedImages.length > 0 ? (
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                                            {selectedImages.map((img, index) => (
                                                                <View key={img.uri + index} className="mr-3 mb-2">
                                                                    <Image source={{ uri: img.uri }} className={cn("rounded-xl", isPremium ? "w-24 h-24 border border-white/10" : "w-20 h-20")} />
                                                                    <Pressable onPress={() => removeImage(img.uri)} className={cn("absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full items-center justify-center border-2 shadow-sm", isPremium ? "bg-destructive border-slate-900" : "bg-destructive border-background")}>
                                                                        <Ionicons name="close" size={14} color="white" />
                                                                    </Pressable>
                                                                </View>
                                                            ))}
                                                        </ScrollView>
                                                    ) : (
                                                        <Pressable onPress={pickImages} className={cn("h-24 border-2 border-dashed rounded-3xl items-center justify-center", isPremium ? "border-white/10 bg-white/[0.02]" : "border-border/20 bg-muted/5")}>
                                                            <Ionicons name="images-outline" size={isPremium ? 32 : 24} color={isPremium ? "#475569" : "#71717A"} />
                                                            <Text className="font-bold uppercase tracking-widest mt-1 text-[10px] text-muted-foreground">{isPremium ? "No Photos" : "No Selection"}</Text>
                                                        </Pressable>
                                                    )}
                                                </View>

                                                {/* Submit Button */}
                                                <View className="mt-8 mb-4">
                                                    <Button
                                                        className="w-full h-14 rounded-2xl"
                                                        onPress={handleSubmitResult}
                                                        loading={isSubmitting}
                                                        disabled={isRoundLocked}
                                                    >
                                                        <Text className={cn("font-black uppercase tracking-widest", isPremium ? "text-slate-900" : "text-white")}>
                                                            {isRoundLocked ? "Round not open yet" : "Submit Result"}
                                                        </Text>
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
                                                                    <View className={cn(
                                                                        "px-4 py-3 rounded-[20px]",
                                                                        isMyComment
                                                                            ? "bg-primary rounded-br-none"
                                                                            : "bg-slate-800 rounded-bl-none border border-white/5"
                                                                    )}>
                                                                        <Text className={cn(
                                                                            "leading-5 font-medium",
                                                                            isMyComment ? "text-slate-900" : "text-white"
                                                                        )}>
                                                                            {comment.content}
                                                                        </Text>
                                                                    </View>
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

