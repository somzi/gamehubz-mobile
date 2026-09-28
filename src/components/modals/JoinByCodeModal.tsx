import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    Modal,
    Pressable,
    TextInput,
    ActivityIndicator,
    Animated,
    Keyboard,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../../types/navigation';
import { getTournamentFormatLabel } from '../../types/tournament';
import { ENDPOINTS, authenticatedFetch, getErrorMessage } from '../../lib/api';
import { formatDateSafe, formatLocalDateTime } from '../../lib/utils';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { Button } from '../ui/Button';
import { PrivateBadge, PRIVATE_COLORS } from '../ui/PrivateBadge';
import { formatJoinCode } from '../../lib/share';

const CODE_LENGTH = 6;

interface JoinByCodeModalProps {
    visible: boolean;
    onClose: () => void;
    /**
     * Verify mode: the player is already on a private tournament. A matching code reveals a
     * confirmation step; opening the sheet or typing six digits never submits a registration.
     */
    tournamentId?: string;
    onVerified?: (code: string) => Promise<void> | void;
    confirmLabel?: string;
}

interface CodePreview {
    id: string;
    name: string;
    hubName?: string | null;
    status: number;
    isTeamTournament: boolean;
    participants: number;
    maxPlayers: number;
    startDate?: string | null;
    registrationOpensAt?: string | null;
    format?: number | null;
    hasUserRegistered: boolean;
    canManage: boolean;
    isPrivate: boolean;
}

// The resolve endpoint answers with the v3 overview payload; this keeps only what the preview
// needs and tolerates either casing, like every other overview reader in the app.
function toPreview(raw: any): CodePreview {
    const d = raw?.result ?? raw;
    return {
        id: d.id ?? d.Id,
        name: d.name ?? d.Name ?? '',
        hubName: d.hubName ?? d.HubName ?? null,
        status: Number(d.status ?? d.Status ?? 0),
        isTeamTournament: !!(d.isTeamTournament ?? d.IsTeamTournament),
        participants: Number(d.numberOfParticipants ?? d.NumberOfParticipants ?? 0),
        maxPlayers: Number(d.maxPlayers ?? d.MaxPlayers ?? 0),
        startDate: d.startDate ?? d.StartDate ?? null,
        registrationOpensAt: d.registrationOpensAt ?? d.RegistrationOpensAt ?? null,
        format: d.format ?? d.Format ?? null,
        hasUserRegistered: !!(d.hasUserRegistered ?? d.HasUserRegistered),
        canManage: !!(d.canManage ?? d.CanManage),
        isPrivate: !!(d.isPrivate ?? d.IsPrivate),
    };
}

/**
 * The six digits are checked when entered, but verification only previews the tournament.
 * Registration is a separate, explicit action on its details screen or this confirmation sheet.
 *
 * Pinned to the upper part of the screen rather than centred: the number pad covers roughly the
 * bottom half, and KeyboardAvoidingView mismeasures inside a Modal under edge-to-edge (see
 * KeyboardAvoider), so staying clear of the keyboard beats trying to dodge it.
 */
export function JoinByCodeModal({ visible, onClose, tournamentId, onVerified, confirmLabel }: JoinByCodeModalProps) {
    const { t } = useTranslation('tournament');
    const { t: tCommon } = useTranslation('common');
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const insets = useSafeAreaInsets();
    const reduceMotion = useReduceMotion();
    const inputRef = useRef<TextInput>(null);
    const lookupVersion = useRef(0);
    const resolving = useRef(false);
    const submitting = useRef(false);
    const shake = useRef(new Animated.Value(0)).current;

    const [code, setCode] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<CodePreview | null>(null);
    // The code behind the preview — handed to the tournament screen so registration doesn't ask
    // for it again.
    const [resolvedCode, setResolvedCode] = useState<string | null>(null);
    const isVerifyMode = !!tournamentId;

    // Every open starts clean — a half-typed code or an old preview is never what the player
    // came back for.
    useEffect(() => {
        lookupVersion.current++;
        resolving.current = false;
        if (visible) {
            setCode('');
            setError(null);
            setPreview(null);
            setResolvedCode(null);
            setIsChecking(false);
            setIsSubmitting(false);
            submitting.current = false;
        }
        return () => { lookupVersion.current++; };
    }, [visible, tournamentId]);

    const requestClose = () => {
        if (!submitting.current) onClose();
    };

    const runShake = () => {
        if (reduceMotion) return;
        shake.setValue(0);
        Animated.sequence([
            Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    };

    const resolve = async (value: string) => {
        if (resolving.current) return;
        resolving.current = true;
        const version = ++lookupVersion.current;
        setIsChecking(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.RESOLVE_JOIN_CODE, {
                method: 'POST',
                body: JSON.stringify({ code: value }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || body.Message || t('joinCode.invalid'));
            }
            const next = toPreview(await response.json());
            if (version !== lookupVersion.current) return;

            if (tournamentId) {
                if (String(next.id).toLowerCase() !== tournamentId.toLowerCase()) {
                    throw new Error(t('joinCode.otherTournament'));
                }
            }

            setPreview(next);
            setResolvedCode(value);
            Keyboard.dismiss();
            hapticSuccess();
        } catch (err) {
            if (version !== lookupVersion.current) return;
            setError(getErrorMessage(err));
            setCode('');
            hapticError();
            runShake();
            inputRef.current?.focus();
        } finally {
            if (version === lookupVersion.current) {
                resolving.current = false;
                setIsChecking(false);
            }
        }
    };

    const handleChange = (text: string) => {
        const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
        setCode(digits);
        if (error) setError(null);
        if (digits.length === CODE_LENGTH && !isChecking) {
            resolve(digits);
        }
    };

    const handlePaste = async () => {
        const version = lookupVersion.current;
        try {
            const text = await Clipboard.getStringAsync();
            if (version !== lookupVersion.current) return;
            handleChange(text ?? '');
        } catch {
            // Clipboard refused (permission / empty) — typing still works.
        }
    };

    const resetToEntry = () => {
        if (submitting.current) return;
        lookupVersion.current++;
        resolving.current = false;
        setPreview(null);
        setResolvedCode(null);
        setCode('');
        setError(null);
        // Wait a frame so the input is mounted again before focusing it.
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    const openTournament = () => {
        if (!preview) return;
        const id = preview.id;
        const code = resolvedCode ?? undefined;
        onClose();
        navigation.navigate('TournamentDetails', { id, code });
    };

    const confirmAction = async () => {
        if (!resolvedCode || !onVerified || submitting.current) return;
        submitting.current = true;
        setIsSubmitting(true);
        try {
            await onVerified(resolvedCode);
            onClose();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            submitting.current = false;
            setIsSubmitting(false);
        }
    };

    // Global lookup only opens the details screen. Verify mode confirms the action the player
    // already chose (solo registration or joining/requesting a specific team).
    const renderPreviewAction = (p: CodePreview) => {
        const isWaitingToOpen = p.status === 0 && !!p.registrationOpensAt;
        const isOpen = (p.status === 0 || p.status === 1) && !isWaitingToOpen;
        const isFull = p.maxPlayers > 0 && p.participants >= p.maxPlayers;

        let note: string | null = null;

        if (p.canManage) note = t('joinCode.youManage');
        else if (p.hasUserRegistered) note = t('joinCode.alreadyIn');
        else if (isWaitingToOpen) note = t('joinCode.opensAt', { date: formatLocalDateTime(p.registrationOpensAt) });
        else if (!isOpen) note = t('joinCode.registrationClosed');
        else if (isFull) note = t('joinCode.full');

        return (
            <View className="mt-5 gap-3">
                {!isVerifyMode && note && (
                    <View className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <Ionicons name="information-circle" size={16} color="#94A3B8" />
                        <Text className="flex-1 text-slate-300 text-xs font-semibold">{note}</Text>
                    </View>
                )}
                {isVerifyMode && resolvedCode && (
                    <View className="flex-row items-center justify-center gap-1.5">
                        <Ionicons name="lock-open" size={14} color="#34D399" />
                        <Text className="text-xs font-semibold text-emerald-300">
                            {t('joinCode.codeApplied', { code: formatJoinCode(resolvedCode) })}
                        </Text>
                    </View>
                )}
                {isVerifyMode ? (
                    <Button className="w-full" onPress={confirmAction} loading={isSubmitting} disabled={isSubmitting}>
                        {confirmLabel || t('joinCode.join')}
                    </Button>
                ) : (
                    <Button className="w-full" onPress={openTournament}>
                        {t('joinCode.open')}
                    </Button>
                )}
                {error && <Text className="text-xs font-semibold text-red-400 text-center">{error}</Text>}
                <Pressable onPress={resetToEntry} disabled={isSubmitting} className="self-center px-3 py-1.5 active:opacity-60">
                    <Text className="text-xs font-bold text-slate-500">{t('joinCode.tryAnother')}</Text>
                </Pressable>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={requestClose}
            onShow={() => inputRef.current?.focus()}
        >
            <View className="flex-1 bg-black/70 px-4" style={{ paddingTop: insets.top + 48 }}>
                <Pressable className="absolute inset-0" onPress={requestClose} accessibilityLabel={tCommon('close')} />

                <View className="bg-background w-full rounded-[32px] border border-white/10 overflow-hidden">
                    {/* Header */}
                    <View className="flex-row items-center justify-between px-6 pt-6">
                        <View className="flex-row items-center gap-3 flex-1">
                            <View
                                className="w-10 h-10 rounded-xl items-center justify-center"
                                style={{ backgroundColor: PRIVATE_COLORS.bg }}
                            >
                                <Ionicons name="keypad" size={18} color={PRIVATE_COLORS.icon} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-black text-white">
                                    {isVerifyMode ? t('joinCode.verifyTitle') : t('joinCode.previewTitle')}
                                </Text>
                                {!preview && (
                                    <Text className="text-xs text-slate-400 mt-0.5">
                                        {isVerifyMode ? t('joinCode.verifySubtitle') : t('joinCode.previewSubtitle')}
                                    </Text>
                                )}
                            </View>
                        </View>
                        <Pressable onPress={requestClose} disabled={isSubmitting} accessibilityLabel={tCommon('close')} className="bg-white/5 p-2 rounded-full active:opacity-60">
                            <Ionicons name="close" size={18} color="#94A3B8" />
                        </Pressable>
                    </View>

                    <View className="px-6 pb-6 pt-5">
                        {!preview ? (
                            <>
                                {/* Six boxes over one real input: tapping anywhere focuses it, the OS
                                    one-time-code autofill and paste both land in it, and deleting works
                                    like any text field. */}
                                <Animated.View style={{ transform: [{ translateX: shake }] }}>
                                    <View className="flex-row justify-center" style={{ gap: 6 }}>
                                        {Array.from({ length: CODE_LENGTH }).map((_, index) => {
                                            const digit = code[index] ?? '';
                                            const isActive = !isChecking && index === Math.min(code.length, CODE_LENGTH - 1);
                                            return (
                                                <React.Fragment key={index}>
                                                    {index === 3 && <View style={{ width: 6 }} />}
                                                    <View
                                                        className="items-center justify-center rounded-2xl"
                                                        style={{
                                                            flex: 1,
                                                            maxWidth: 44,
                                                            height: 56,
                                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                                            borderWidth: 1.5,
                                                            borderColor: error
                                                                ? 'rgba(239,68,68,0.55)'
                                                                : isActive
                                                                    ? PRIVATE_COLORS.icon
                                                                    : 'rgba(255,255,255,0.08)',
                                                            opacity: isChecking ? 0.5 : 1,
                                                        }}
                                                    >
                                                        <Text className="text-white font-black" style={{ fontSize: 24, fontVariant: ['tabular-nums'] }}>
                                                            {digit}
                                                        </Text>
                                                    </View>
                                                </React.Fragment>
                                            );
                                        })}
                                    </View>
                                    <TextInput
                                        ref={inputRef}
                                        value={code}
                                        onChangeText={handleChange}
                                        editable={!isChecking}
                                        keyboardType="number-pad"
                                        inputMode="numeric"
                                        textContentType="oneTimeCode"
                                        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                                        maxLength={32}
                                        caretHidden
                                        accessibilityLabel={t('joinCode.title')}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            opacity: 0,
                                            color: 'transparent',
                                        }}
                                    />
                                </Animated.View>

                                <View className="min-h-[36px] items-center justify-center mt-3">
                                    {isChecking ? (
                                        <View className="flex-row items-center gap-2">
                                            <ActivityIndicator size="small" color={PRIVATE_COLORS.icon} />
                                            <Text className="text-xs font-semibold text-slate-400">{t('joinCode.checking')}</Text>
                                        </View>
                                    ) : error ? (
                                        <Text className="text-xs font-semibold text-red-400 text-center">{error}</Text>
                                    ) : (
                                        <Pressable
                                            onPress={handlePaste}
                                            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] active:opacity-60"
                                        >
                                            <Ionicons name="clipboard-outline" size={13} color="#94A3B8" />
                                            <Text className="text-[11px] font-bold text-slate-400">{t('joinCode.paste')}</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </>
                        ) : (
                            <>
                                {/* Preview */}
                                <View className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06]">
                                    <View className="flex-row items-start gap-3">
                                        <View
                                            className="w-12 h-12 rounded-2xl items-center justify-center"
                                            style={{ backgroundColor: 'rgba(251,191,36,0.10)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.22)' }}
                                        >
                                            <Ionicons name="trophy" size={22} color="#FBBF24" />
                                        </View>
                                        <View className="flex-1 min-w-0">
                                            <Text className="text-base font-black text-white" numberOfLines={2}>{preview.name}</Text>
                                            {!!preview.hubName && (
                                                <Text className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: '#34D399' }} numberOfLines={1}>
                                                    {preview.hubName}
                                                </Text>
                                            )}
                                            {preview.isPrivate && (
                                                <View className="flex-row mt-1.5">
                                                    <PrivateBadge />
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    <View className="flex-row flex-wrap gap-2 mt-4">
                                        <PreviewChip icon="list" text={getTournamentFormatLabel(preview.format, t)} />
                                        <PreviewChip
                                            icon="people"
                                            text={preview.isTeamTournament
                                                ? t('details.teamsCount', { count: preview.participants })
                                                : t('details.participantsCount', { count: preview.participants })}
                                        />
                                        <PreviewChip icon="calendar-clear-outline" text={formatDateSafe(preview.startDate)} />
                                    </View>
                                </View>

                                {renderPreviewAction(preview)}
                            </>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function PreviewChip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    return (
        <View className="flex-row items-center px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <Ionicons name={icon} size={12} color="#A5B4FC" />
            <Text className="text-[11px] font-black text-slate-300 ml-1.5">{text}</Text>
        </View>
    );
}
