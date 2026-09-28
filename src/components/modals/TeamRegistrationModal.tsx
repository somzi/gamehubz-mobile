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
import { isRejectedTournamentJoinCode } from '../../lib/tournamentJoinCode';
import { formatJoinCode } from '../../lib/share';
import { PRIVATE_COLORS } from '../ui/PrivateBadge';
import type { TeamDto } from '../../types/team';

interface TeamRegistrationModalProps {
    visible: boolean;
    onClose: () => void;
    tournamentId: string;
    onTeamJoined: (team: TeamDto) => void;
    availableTeams?: TeamDto[];
    /** Private tournament the caller can't manage: creating a team needs the join code. */
    requiresCode?: boolean;
    /** The code the player already holds (invite link / code sheet); asked for here when absent. */
    joinCode?: string | null;
    /** The held code was refused (say, an invite link from before the organiser made a new code) —
     *  the parent should drop it, so no other screen keeps offering it. */
    onCodeRejected?: () => void;
    /** A code typed here worked — the parent can keep it for the rest of the visit. */
    onCodeAccepted?: (code: string) => void;
}

export function TeamRegistrationModal({
    visible,
    onClose,
    tournamentId,
    onTeamJoined,
    requiresCode = false,
    joinCode = null,
    onCodeRejected,
    onCodeAccepted,
}: TeamRegistrationModalProps) {
    const { t } = useTranslation('team');
    const [teamName, setTeamName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [typedCode, setTypedCode] = useState('');
    // The player chose to replace the held code, or the server refused it.
    const [editingCode, setEditingCode] = useState(false);

    // Asked for when the tournament is private and the player has no code in hand — or the one in
    // hand has to be replaced. A held code is never a dead end: "Edit" swaps it for the field.
    const needsTypedCode = requiresCode && (!joinCode || editingCode);
    const codeToSend = requiresCode ? (needsTypedCode ? typedCode : joinCode) : null;

    useEffect(() => {
        if (visible) {
            setTeamName('');
            setCreateError(null);
            setRequiresApproval(false);
            setTypedCode('');
            setEditingCode(false);
        }
    }, [visible]);

    const startEditingCode = () => {
        setTypedCode('');
        setEditingCode(true);
    };

    const handleCreateTeam = async () => {
        if (!teamName.trim()) {
            setCreateError(t('teamNameRequired'));
            return;
        }
        setIsCreating(true);
        setCreateError(null);
        try {
            const team = await createTeam(tournamentId, teamName.trim(), requiresApproval, codeToSend);
            if (requiresCode && needsTypedCode) onCodeAccepted?.(typedCode);
            onTeamJoined(team);
            onClose();
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setCreateError(message);
            // Keep valid codes on capacity, eligibility, or throttle errors.
            if (requiresCode && !needsTypedCode && isRejectedTournamentJoinCode(err)) {
                startEditingCode();
                onCodeRejected?.();
            }
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
                            keyboardShouldPersistTaps="handled"
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

                                    {/* Private tournament: creating a team is how a captain enters it,
                                        so this is where the join code is needed. */}
                                    {requiresCode && (needsTypedCode ? (
                                        <View>
                                            <View className="flex-row items-center mb-3">
                                                <Ionicons
                                                    name="lock-closed"
                                                    size={16}
                                                    color={PRIVATE_COLORS.icon}
                                                    style={{ marginRight: 6 }}
                                                />
                                                <Text className="text-sm font-bold text-white">
                                                    {t('tournament:joinCode.teamCodeLabel')}
                                                </Text>
                                            </View>
                                            <TextInput
                                                className="bg-card p-4 rounded-xl text-white border border-white/10 text-center font-black"
                                                style={{ fontSize: 20, letterSpacing: 8 }}
                                                placeholder="••••••"
                                                placeholderTextColor="#6b7280"
                                                keyboardType="number-pad"
                                                inputMode="numeric"
                                                maxLength={32}
                                                value={typedCode}
                                                onChangeText={(text) => setTypedCode(text.replace(/\D/g, '').slice(0, 6))}
                                            />
                                            <Text className="text-xs text-slate-400 mt-2">
                                                {t('tournament:joinCode.teamCodeHint')}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View
                                            className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl"
                                            style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)' }}
                                        >
                                            <Ionicons name="lock-open" size={14} color="#34D399" />
                                            <Text className="flex-1 text-xs font-semibold text-emerald-300">
                                                {t('tournament:joinCode.codeApplied', { code: formatJoinCode(joinCode) })}
                                            </Text>
                                            <Pressable onPress={startEditingCode} hitSlop={8} className="active:opacity-60">
                                                <Text className="text-xs font-black text-emerald-200 underline">
                                                    {t('common:edit')}
                                                </Text>
                                            </Pressable>
                                        </View>
                                    ))}

                                    {createError && (
                                        <Text className="text-red-500 text-xs text-center">
                                            {createError}
                                        </Text>
                                    )}

                                    <Button
                                        onPress={handleCreateTeam}
                                        loading={isCreating}
                                        disabled={isCreating || !teamName.trim() || (needsTypedCode && typedCode.length !== 6)}
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
