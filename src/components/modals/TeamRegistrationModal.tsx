import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    ActivityIndicator,
    Modal,
    KeyboardAvoidingView,
    Platform,
    Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { useTranslation } from 'react-i18next';
import { createTeam, joinTeam, getPendingTournamentTeams } from '../../lib/teamApi';
import { getErrorMessage } from '../../lib/api';
import type { TeamDto } from '../../types/team';

interface TeamRegistrationModalProps {
    visible: boolean;
    onClose: () => void;
    tournamentId: string;
    onTeamJoined: (team: TeamDto) => void;
    availableTeams?: TeamDto[];
}

export function TeamRegistrationModal({
    visible,
    onClose,
    tournamentId,
    onTeamJoined,
}: TeamRegistrationModalProps) {
    const { t } = useTranslation('team');
    const [teamName, setTeamName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [requiresApproval, setRequiresApproval] = useState(false);

    useEffect(() => {
        if (visible) {
            setTeamName('');
            setCreateError(null);
            setRequiresApproval(false);
        }
    }, [visible]);

    const handleCreateTeam = async () => {
        if (!teamName.trim()) {
            setCreateError(t('teamNameRequired'));
            return;
        }
        setIsCreating(true);
        setCreateError(null);
        try {
            const team = await createTeam(tournamentId, teamName.trim(), requiresApproval);
            onTeamJoined(team);
            onClose();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setCreateError(message);
        } finally {
            setIsCreating(false);
        }
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <Pressable
                    className="flex-1 bg-black/60 justify-center items-center px-5"
                    onPress={onClose}
                >
                    <Pressable
                        className="bg-background rounded-3xl border border-white/10 shadow-2xl w-full max-w-md max-h-[85%]"
                        onPress={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <View className="flex-row justify-between items-center p-6 border-b border-white/5">
                            <Text className="text-xl font-bold text-white">
                                {t('registrationModalTitle')}
                            </Text>
                            <TouchableOpacity
                                onPress={onClose}
                                className="bg-white/5 p-2 rounded-full"
                            >
                                <Ionicons name="close" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        {/* Content */}
                        <ScrollView
                            className="px-6 py-6"
                            contentContainerStyle={{ paddingBottom: 24 }}
                            showsVerticalScrollIndicator={false}
                        >
                                <View className="gap-5">
                                    {/* Team Name */}
                                    <View>
                                        <View className="flex-row items-center mb-3">
                                            <Ionicons
                                                name="flag-outline"
                                                size={16}
                                                color="#00E5A0"
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text className="text-sm font-bold text-white">
                                                {t('teamNameLabel')}
                                            </Text>
                                        </View>
                                        <TextInput
                                            className="bg-card p-4 rounded-xl text-white border border-white/10"
                                            placeholder={t('teamNamePlaceholder')}
                                            placeholderTextColor="#6b7280"
                                            value={teamName}
                                            onChangeText={setTeamName}
                                        />
                                    </View>

                                    {/* Private Team Toggle */}
                                    <View className="flex-row items-center justify-between bg-card p-4 rounded-xl border border-white/5">
                                        <View className="flex-1 mr-4 gap-1">
                                            <View className="flex-row items-center gap-2">
                                                <Ionicons name="lock-closed-outline" size={16} color="#3B82F6" />
                                                <Text className="text-sm font-bold text-white">{t('privateTeam')}</Text>
                                            </View>
                                            <Text className="text-xs text-slate-400">{t('privateTeamHint')}</Text>
                                        </View>
                                        <Switch
                                            value={requiresApproval}
                                            onValueChange={setRequiresApproval}
                                            trackColor={{ false: '#334155', true: '#00E5A0' }}
                                            thumbColor="#ffffff"
                                        />
                                    </View>

                                    {createError && (
                                        <Text className="text-red-500 text-xs text-center">
                                            {createError}
                                        </Text>
                                    )}

                                    <Button
                                        onPress={handleCreateTeam}
                                        loading={isCreating}
                                        disabled={isCreating || !teamName.trim()}
                                        className="bg-team py-4 rounded-2xl w-full"
                                    >
                                        {t('createTeamButton')}
                                    </Button>
                                </View>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}
