import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Modal,
    TouchableOpacity,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';

interface Participant {
    participantId: string;
    userId: string;
    username: string;
    score: number | null;
}

interface ReportResultModalProps {
    visible: boolean;
    onClose: () => void;
    matchId: string;
    tournamentId: string;
    home: Participant | null;
    away: Participant | null;
    onSuccess: () => void;
}

export function ReportResultModal({ visible, onClose, matchId, tournamentId, home, away, onSuccess }: ReportResultModalProps) {
    const insets = useSafeAreaInsets();
    const [homeScore, setHomeScore] = useState(home?.score?.toString() || '');
    const [awayScore, setAwayScore] = useState(away?.score?.toString() || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
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
                const text = await response.text().catch(() => 'No body');
                throw new Error(`Failed to report result: ${text}`);
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Report result error:', err);
            setError(err.message || 'An error occurred while reporting result');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/60 items-center justify-center p-6">
                <Pressable className="absolute inset-0" onPress={onClose} />

                <View className="bg-card w-full max-w-sm rounded-[32px] overflow-hidden border border-border/10 shadow-2xl">
                    <View className="p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-foreground">Report Result</Text>
                            <TouchableOpacity onPress={onClose} className="w-8 h-8 rounded-full bg-muted/20 items-center justify-center">
                                <Ionicons name="close" size={20} color="#71717A" />
                            </TouchableOpacity>
                        </View>

                        {error && (
                            <View className="bg-destructive/10 p-4 rounded-2xl mb-6">
                                <Text className="text-destructive text-sm text-center font-medium">{error}</Text>
                            </View>
                        )}

                        <View className="flex-row items-center justify-between gap-4">
                            {/* Home Participant */}
                            <View className="flex-1 items-center gap-3">
                                <PlayerAvatar name={home?.username || 'TBD'} size="lg" />
                                <Text className="text-sm font-bold text-foreground text-center" numberOfLines={1}>
                                    {home?.username || 'TBD'}
                                </Text>
                                <TextInput
                                    className="bg-muted/30 w-full h-12 rounded-xl text-center text-lg font-bold text-foreground border border-border/10"
                                    placeholder="0"
                                    placeholderTextColor="#71717A"
                                    keyboardType="numeric"
                                    value={homeScore}
                                    onChangeText={(val) => setHomeScore(val.replace(/[^0-9]/g, ''))}
                                    editable={!!home}
                                />
                            </View>

                            <Text className="text-2xl font-bold text-muted-foreground mt-12">VS</Text>

                            {/* Away Participant */}
                            <View className="flex-1 items-center gap-3">
                                <PlayerAvatar name={away?.username || 'TBD'} size="lg" />
                                <Text className="text-sm font-bold text-foreground text-center" numberOfLines={1}>
                                    {away?.username || 'TBD'}
                                </Text>
                                <TextInput
                                    className="bg-muted/30 w-full h-12 rounded-xl text-center text-lg font-bold text-foreground border border-border/10"
                                    placeholder="0"
                                    placeholderTextColor="#71717A"
                                    keyboardType="numeric"
                                    value={awayScore}
                                    onChangeText={(val) => setAwayScore(val.replace(/[^0-9]/g, ''))}
                                    editable={!!away}
                                />
                            </View>
                        </View>

                        <View className="mt-8 flex-row gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onPress={onClose}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1"
                                onPress={handleSubmit}
                                loading={isSubmitting}
                                disabled={!home || !away}
                            >
                                Submit
                            </Button>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
