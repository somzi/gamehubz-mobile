import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { HourlyAvailabilityPicker } from '../match/HourlyAvailabilityPicker';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { getOptimizedCloudinaryUrl } from '../../lib/image';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { cn } from '../../lib/utils';

export type MatchStatus = 'pending_availability' | 'scheduled' | 'ready_phase' | 'completed';

export interface MatchResultDetailDto {
    homeUser: string;
    homeUserId: string;
    awayUser: string;
    awayUserId: string;
    homeUserScore: number;
    awayUserScore: number;
    evidences: string[];
    hubOwnerId?: string;
    scheduledTime?: string;
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
    onMatchUpdate?: () => void;
    home?: { userId: string; username: string; score: number | null };
    away?: { userId: string; username: string; score: number | null };
    evidences?: string[];
    hubOwnerId?: string;
    isRoundLocked?: boolean;
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
    isRoundLocked = false,
}: MatchDetailsModalProps) {
    const { user } = useAuth();
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Availability state (migrated from MatchScheduleCard if needed)
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

    useEffect(() => {
        if (visible && matchId) {
            // Fetch match details to get evidence even for non-completed matches
            fetchMatchDetails();

            if (status === 'pending_availability') {
                fetchAvailability();
            }
        }
    }, [visible, status, matchId, evidences, home, away]);

    const fetchMatchDetails = async () => {
        if (!matchId) return;
        setIsLoadingDetails(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_MATCH_DETAILS(matchId));
            if (response.ok) {
                const data = await response.json();
                // Normalize casing if needed, though usually handled by serializer
                const normalizedData = {
                    ...data,
                    scheduledTime: data.scheduledTime || data.ScheduledTime
                };
                setMatchDetails(normalizedData);
                if (normalizedData.scheduledTime) {
                    const date = new Date(normalizedData.scheduledTime);
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
                    const confirmedDate = new Date(data.confirmedTime);
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
            // Always refresh details to show new evidence regardless of status
            fetchMatchDetails();
            
        } catch (err: any) {
            console.error('Upload evidence error:', err);
            setError(err.message || 'An error occurred while uploading evidence');
        } finally {
            setIsUploadingEvidence(false);
        }
    };

    const handleSubmitResult = async () => {
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
                TournamentId: tournamentId
            };

            const response = await authenticatedFetch(ENDPOINTS.REPORT_MATCH_RESULT, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to report result');
            }

            // Still support auto-upload if they just hit submit with images
            if (selectedImages.length > 0) {
                await handleUploadOnly();
            }

            onClose();
            if (onMatchUpdate) onMatchUpdate();
        } catch (err: any) {
            console.error('Report result error:', err);
            setError(err.message || 'An error occurred while reporting result');
        } finally {
            setIsSubmitting(false);
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

    const handleCancelEdit = () => {
        setIsEditMode(false);
        setHomeScore('');
        setAwayScore('');
        setSelectedImages([]);
        setError(null);
    };

    // Permission check
    const isHubOwner = !!(hubOwnerId && user?.id && hubOwnerId.toLowerCase() === user.id.toLowerCase());
    const canEditResult = isHubOwner && status === 'completed' && !isEditMode;

    const isHome = (home?.userId || matchDetails?.homeUserId)?.toLowerCase() === user?.id?.toLowerCase();
    const isAway = (away?.userId || matchDetails?.awayUserId)?.toLowerCase() === user?.id?.toLowerCase();
    const isParticipant = !!(isHome || isAway);
    
    // User requirement: Admin only if startTime is null, players only if startTime is not null
    const hasStartTime = !!scheduledTime || !!matchDetails?.scheduledTime;
    const canSubmit = hasStartTime ? isParticipant : isHubOwner;

    return (
        <Modal
            animationType="slide"
            transparent={false}
            visible={visible}
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-card">
                <View className="flex-1 p-6 pt-12">
                    {/* Header */}
                    <View className="flex-row items-center justify-between mb-4">
                        <View>
                            <Text className="text-lg font-bold text-foreground">{tournamentName}</Text>
                            <Text className="text-sm text-muted-foreground">{roundName}</Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            className="w-8 h-8 rounded-full bg-secondary items-center justify-center"
                        >
                            <Ionicons name="close" size={20} color="hsl(220, 15%, 55%)" />
                        </Pressable>
                    </View>

                    {isLoadingDetails && !matchDetails && (
                        <View className="py-2 mb-4">
                            <ActivityIndicator size="small" color="#10B981" />
                        </View>
                    )}

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {status === 'completed' ? (
                            <View className="py-2">
                                {isLoadingDetails ? (
                                    <View className="py-20 items-center justify-center">
                                        <ActivityIndicator size="large" color="#10B981" />
                                        <Text className="text-muted-foreground mt-4">Loading results...</Text>
                                    </View>
                                ) : matchDetails ? (
                                    <View className="space-y-6">
                                        {!isEditMode ? (
                                            <>
                                                <View className="items-center py-4 bg-muted/10 rounded-3xl border border-border/10">
                                                    <Text className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Final Score</Text>
                                                    <View className="flex-row items-center justify-center gap-8">
                                                        <Pressable onPress={() => navigateToProfile(matchDetails.homeUserId)} className="items-center gap-2">
                                                            <PlayerAvatar name={matchDetails.homeUser} size="lg" />
                                                            <Text className="text-xs font-bold text-foreground">{matchDetails.homeUser}</Text>
                                                            <Text className="text-4xl font-black text-primary">{matchDetails.homeUserScore}</Text>
                                                        </Pressable>

                                                        <Text className="text-2xl font-black text-muted-foreground mb-4">:</Text>

                                                        <Pressable onPress={() => navigateToProfile(matchDetails.awayUserId)} className="items-center gap-2">
                                                            <PlayerAvatar name={matchDetails.awayUser} size="lg" />
                                                            <Text className="text-xs font-bold text-foreground">{matchDetails.awayUser}</Text>
                                                            <Text className="text-4xl font-black text-white">{matchDetails.awayUserScore}</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>

                                                {matchDetails.evidences && matchDetails.evidences.length > 0 && (
                                                    <View className="mb-6">
                                                        <View className="flex-row items-center gap-2 mb-3">
                                                            <Ionicons name="images-outline" size={18} color="#64748B" />
                                                            <Text className="text-sm font-bold text-foreground">Evidence Gallery</Text>
                                                        </View>
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                                            {matchDetails.evidences.map((url, idx) => (
                                                                <Pressable
                                                                    key={idx}
                                                                    className="mr-3"
                                                                    onPress={() => setPreviewImage(url)}
                                                                >
                                                                    <Image
                                                                        source={{ uri: getOptimizedCloudinaryUrl(url, 400) }}
                                                                        className="w-40 h-56 rounded-2xl bg-muted"
                                                                        resizeMode="cover"
                                                                    />
                                                                </Pressable>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                )}

                                                {canEditResult && (
                                                    <Button
                                                        onPress={handleEditResult}
                                                        variant="outline"
                                                        className="w-full mt-4"
                                                    >
                                                        <View className="flex-row items-center gap-2">
                                                            <Ionicons name="create-outline" size={18} color="#10B981" />
                                                            <Text className="text-primary font-bold">Edit Result</Text>
                                                        </View>
                                                    </Button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {/* Edit Mode */}
                                                <View className="items-center mb-2">
                                                    <Text className="text-sm text-muted-foreground">Editing Match Result</Text>
                                                    <Text className="text-xs text-slate-500 mt-1">Hub Owner Privileges</Text>
                                                </View>

                                                {error && (
                                                    <View className="bg-destructive/10 p-4 rounded-2xl mb-2">
                                                        <Text className="text-destructive text-sm text-center font-medium">{error}</Text>
                                                    </View>
                                                )}

                                                <View className="flex-row items-center justify-between gap-4">
                                                    <View className="flex-1 items-center gap-3">
                                                        <PlayerAvatar name={matchDetails.homeUser} size="lg" />
                                                        <Text className="text-sm font-bold text-foreground text-center" numberOfLines={1}>
                                                            {matchDetails.homeUser}
                                                        </Text>
                                                        <TextInput
                                                            className="bg-muted/30 w-full h-12 rounded-xl text-center text-lg font-bold text-foreground border border-border/10"
                                                            placeholder="0"
                                                            placeholderTextColor="#71717A"
                                                            keyboardType="numeric"
                                                            value={homeScore}
                                                            onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                                                        />
                                                    </View>
                                                    <Text className="text-2xl font-bold text-muted-foreground mt-12">VS</Text>
                                                    <View className="flex-1 items-center gap-3">
                                                        <PlayerAvatar name={matchDetails.awayUser} size="lg" />
                                                        <Text className="text-sm font-bold text-foreground text-center" numberOfLines={1}>
                                                            {matchDetails.awayUser}
                                                        </Text>
                                                        <TextInput
                                                            className="bg-muted/30 w-full h-12 rounded-xl text-center text-lg font-bold text-foreground border border-border/10"
                                                            placeholder="0"
                                                            placeholderTextColor="#71717A"
                                                            keyboardType="numeric"
                                                            value={awayScore}
                                                            onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                                                        />
                                                    </View>
                                                </View>

                                                <View className="mt-6 border-t border-border/10 pt-6">
                                                    <View className="flex-row items-center justify-between mb-3">
                                                        <View>
                                                            <Text className="text-sm font-bold text-foreground">Evidence</Text>
                                                            <Text className="text-[11px] text-muted-foreground">Add match result screenshots</Text>
                                                        </View>
                                                        <Pressable onPress={pickImages} className="flex-row items-center bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
                                                            <Ionicons name="add" size={16} color="#10B981" />
                                                            <Text className="text-xs font-bold text-primary ml-1">Add Photos</Text>
                                                        </Pressable>
                                                    </View>
                                                    {selectedImages.length > 0 ? (
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                                            {selectedImages.map((img, index) => (
                                                                <View key={img.uri + index} className="mr-3 mb-2">
                                                                    <Image source={{ uri: img.uri }} className="w-20 h-20 rounded-xl" />
                                                                    <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1.5 -right-1.5 bg-destructive w-5 h-5 rounded-full items-center justify-center border border-background shadow-sm">
                                                                        <Ionicons name="close" size={12} color="white" />
                                                                    </Pressable>
                                                                </View>
                                                            ))}
                                                        </ScrollView>
                                                    ) : (
                                                        <Pressable onPress={pickImages} className="h-20 border border-dashed border-border/30 rounded-2xl items-center justify-center bg-muted/5">
                                                            <Ionicons name="images-outline" size={24} color="#71717A" />
                                                            <Text className="text-[11px] text-muted-foreground mt-1">No photos selected</Text>
                                                        </Pressable>
                                                    )}
                                                </View>

                                                <View className="mt-6 flex-row gap-3">
                                                    <Button variant="outline" className="flex-1" onPress={handleCancelEdit}>Cancel</Button>
                                                    <Button className="flex-1" onPress={handleSubmitResult} loading={isSubmitting}>Save Changes</Button>
                                                </View>
                                            </>
                                        )}
                                    </View>
                                ) : (
                                    <View className="py-20 items-center">
                                        <Ionicons name="alert-circle-outline" size={48} color="#71717A" />
                                        <Text className="text-muted-foreground mt-2">{error || 'No details available'}</Text>
                                    </View>
                                )}
                            </View>
                        ) : (status === 'scheduled' || status === 'ready_phase') ? (
                            <View className="space-y-4">
                                <View className="items-center mb-2">
                                    <Text className="text-sm text-muted-foreground">Match Time</Text>
                                    <Text className="text-lg font-bold text-primary mt-1">{confirmedTime || scheduledTime || 'TBD'}</Text>
                                </View>
                                {error && (
                                    <View className="bg-destructive/10 p-4 rounded-2xl mb-2">
                                        <Text className="text-destructive text-sm text-center font-medium">{error}</Text>
                                    </View>
                                )}
                                <View className="flex-row items-center justify-between gap-4">
                                    <View className="flex-1 items-center gap-3">
                                        <PlayerAvatar name={home?.username || 'Home'} size="lg" />
                                        <Text className="text-sm font-bold text-foreground text-center" numberOfLines={1}>
                                            {home?.username || 'Home'}
                                        </Text>
                                        <TextInput
                                            className={cn("bg-muted/30 w-full h-12 rounded-xl text-center text-lg font-bold text-foreground border border-border/10", !canSubmit && "opacity-50")}
                                            placeholder="0"
                                            placeholderTextColor="#71717A"
                                            keyboardType="numeric"
                                            value={homeScore}
                                            onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                                            editable={canSubmit}
                                        />
                                    </View>
                                    <Text className="text-2xl font-bold text-muted-foreground mt-12">VS</Text>
                                    <View className="flex-1 items-center gap-3">
                                        <PlayerAvatar name={away?.username || opponentName || 'Away'} size="lg" />
                                        <Text className="text-sm font-bold text-foreground text-center" numberOfLines={1}>
                                            {away?.username || opponentName || 'Away'}
                                        </Text>
                                        <TextInput
                                            className={cn("bg-muted/30 w-full h-12 rounded-xl text-center text-lg font-bold text-foreground border border-border/10", !canSubmit && "opacity-50")}
                                            placeholder="0"
                                            placeholderTextColor="#71717A"
                                            keyboardType="numeric"
                                            value={awayScore}
                                            onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                                            editable={canSubmit}
                                        />
                                    </View>
                                </View>

                                {matchDetails?.evidences && matchDetails.evidences.length > 0 && (
                                    <View className="mt-8">
                                        <View className="flex-row items-center gap-2 mb-3">
                                            <Ionicons name="images-outline" size={18} color="#64748B" />
                                            <Text className="text-sm font-bold text-foreground">Previously Uploaded Evidence</Text>
                                        </View>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                            {matchDetails.evidences.map((url, idx) => (
                                                <Pressable
                                                    key={idx}
                                                    className="mr-3"
                                                    onPress={() => setPreviewImage(url)}
                                                >
                                                    <Image
                                                        source={{ uri: getOptimizedCloudinaryUrl(url, 400) }}
                                                        className="w-32 h-44 rounded-2xl bg-muted"
                                                        resizeMode="cover"
                                                    />
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}

                                <View className="mt-6 border-t border-border/10 pt-6">
                                    <View className="flex-row items-center justify-between mb-3">
                                        <View>
                                            <Text className="text-sm font-bold text-foreground">Evidence</Text>
                                            <Text className="text-[11px] text-muted-foreground">Add match result screenshots</Text>
                                        </View>
                                        <Pressable onPress={pickImages} className="flex-row items-center bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
                                            <Ionicons name="add" size={16} color="#10B981" />
                                            <Text className="text-xs font-bold text-primary ml-1">Add Photos</Text>
                                        </Pressable>
                                    </View>
                                    {selectedImages.length > 0 ? (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                            {selectedImages.map((img, index) => (
                                                <View key={img.uri + index} className="mr-3 mb-2">
                                                    <Image source={{ uri: img.uri }} className="w-20 h-20 rounded-xl" />
                                                    <Pressable onPress={() => removeImage(img.uri)} className="absolute -top-1.5 -right-1.5 bg-destructive w-5 h-5 rounded-full items-center justify-center border border-background shadow-sm">
                                                        <Ionicons name="close" size={12} color="white" />
                                                    </Pressable>
                                                </View>
                                            ))}
                                        </ScrollView>
                                    ) : (
                                        <Pressable onPress={pickImages} className="h-20 border border-dashed border-border/30 rounded-2xl items-center justify-center bg-muted/5">
                                            <Ionicons name="images-outline" size={24} color="#71717A" />
                                            <Text className="text-[11px] text-muted-foreground mt-1">No photos selected</Text>
                                        </Pressable>
                                    )}
                                </View>

                                <View className="mt-6 flex-row gap-3">
                                    <Button variant="outline" className="flex-1" onPress={() => { setHomeScore(''); setAwayScore(''); setError(null); setSelectedImages([]); }}>Clear</Button>
                                    <Button className="flex-1" onPress={handleSubmitResult} loading={isSubmitting} disabled={isRoundLocked || !canSubmit}>
                                        {isRoundLocked ? "Round not open yet" : !canSubmit ? (hasStartTime ? "Players Only" : "Admin Only") : "Submit Result"}
                                    </Button>
                                </View>
                                
                                {selectedImages.length > 0 && !canSubmit && isParticipant && (
                                    <Button 
                                        className="mt-3 bg-indigo-600" 
                                        onPress={handleUploadOnly} 
                                        loading={isUploadingEvidence}
                                    >
                                        <View className="flex-row items-center gap-2">
                                            <Ionicons name="cloud-upload-outline" size={18} color="white" />
                                            <Text className="text-white font-bold">Upload Evidence Only</Text>
                                        </View>
                                    </Button>
                                )}

                                {!canSubmit && (
                                    <Text className="text-[10px] text-muted-foreground text-center mt-2 italic">
                                        {hasStartTime ? "Only match participants can report results once scheduled" : "Only administrators can report results for unscheduled matches"}
                                    </Text>
                                )}
                            </View>
                        ) : (
                            <View className="flex-1">
                                {currentStatus === 'pending_availability' ? (
                                    <View className="flex-1">
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
                    </ScrollView>
                </View>
            </View>

            {/* Fullscreen Image Preview */}
            <Modal
                visible={!!previewImage}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setPreviewImage(null)}
            >
                <View className="flex-1 bg-black/90 items-center justify-center p-4">
                    <Pressable
                        className="absolute top-12 right-6 z-10 w-10 h-10 rounded-full bg-black/50 items-center justify-center border border-white/20"
                        onPress={() => setPreviewImage(null)}
                    >
                        <Ionicons name="close" size={24} color="white" />
                    </Pressable>

                    {previewImage && (
                        <Image
                            source={{ uri: previewImage }}
                            className="w-full h-full"
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>
        </Modal>
    );
}
