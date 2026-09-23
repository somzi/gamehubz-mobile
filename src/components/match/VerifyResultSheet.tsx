import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../ui/PressableScale';
import { COLORS } from '../../lib/theme';
import { cn } from '../../lib/utils';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { MAX_VIDEO_DURATION_SECONDS } from '../../lib/evidence';
import * as Device from 'expo-device';
import {
    BiometricError,
    ensureDeviceRegistered,
    getDeviceDescription,
    isBiometricAvailable,
    reRegisterDevice,
    signWithDeviceKey,
} from '../../lib/deviceIdentity';
import {
    PreparedRecording,
    VerificationRecord,
    VerificationRequestError,
    pickVerificationRecording,
    startVerification,
    submitBiometricProof,
    uploadVerificationRecording,
} from '../../lib/resultVerification';
import { biometricLabel, formatClipDuration, formatVerificationStamp } from './ResultVerificationCard';

interface VerifyResultSheetProps {
    visible: boolean;
    onClose: () => void;
    matchId: string;
    userId: string;
    opponentName?: string | null;
    /** The finished record, so the host can refresh its panel and unlock the report. */
    onVerified: (record: VerificationRecord) => void;
}

/**
 * Where the attempt stands. Two tracks — the biometric proof, then the recording — each with its own
 * failure, because they fail for different reasons and recover differently: a failed proof starts a
 * new attempt, a failed upload retries the same clip against the same attempt.
 */
type Phase =
    | 'unavailable'
    | 'authenticating'
    | 'authFailed'
    | 'readyForRecording'
    | 'preparing'
    | 'uploading'
    | 'uploadFailed'
    | 'verified';

type StepState = 'pending' | 'active' | 'done' | 'error';

/** One step of the stepper: a numbered node, a title, and the line under it that says what is happening. */
function StepRow({
    index,
    title,
    detail,
    state,
    isLast,
    children,
}: {
    index: number;
    title: string;
    detail?: string | null;
    state: StepState;
    isLast?: boolean;
    children?: React.ReactNode;
}) {
    const color = state === 'done' ? COLORS.primary
        : state === 'error' ? COLORS.destructive
            : state === 'active' ? COLORS.foreground
                : COLORS.slate600;

    return (
        <View className="flex-row gap-3.5">
            <View className="items-center">
                <View
                    className={cn(
                        'w-8 h-8 rounded-full items-center justify-center border',
                        state === 'done' && 'bg-primary/15 border-primary/40',
                        state === 'error' && 'bg-destructive/15 border-destructive/40',
                        state === 'active' && 'bg-white/[0.08] border-white/25',
                        state === 'pending' && 'bg-white/[0.03] border-white/10',
                    )}
                >
                    {state === 'done' ? (
                        <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                    ) : state === 'error' ? (
                        <Ionicons name="close" size={16} color={COLORS.destructive} />
                    ) : (
                        <Text className="text-[12px] font-black" style={{ color }}>{index}</Text>
                    )}
                </View>
                {!isLast && (
                    <View
                        className={cn('w-[2px] flex-1 my-1 rounded-full', state === 'done' ? 'bg-primary/35' : 'bg-white/[0.07]')}
                        style={{ minHeight: 18 }}
                    />
                )}
            </View>

            <View className={cn('flex-1', !isLast && 'pb-5')}>
                <Text
                    numberOfLines={1}
                    className={cn(
                        'text-[11px] font-black uppercase tracking-[1.5px] mt-1.5',
                        state === 'pending' ? 'text-slate-600' : 'text-slate-300',
                    )}
                >
                    {title}
                </Text>
                {!!detail && (
                    <Text
                        className={cn(
                            'text-[13px] font-bold mt-1 leading-[18px]',
                            state === 'done' ? 'text-primary' : state === 'error' ? 'text-destructive' : 'text-slate-400',
                        )}
                    >
                        {detail}
                    </Text>
                )}
                {children}
            </View>
        </View>
    );
}

/**
 * The "Verify Result" flow, as a sheet over the match.
 *
 *   biometric check  →  result recording  →  verified
 *
 * It starts the moment it opens: the player pressed Verify Result, and the next thing they expect is
 * the Face ID sheet. Everything security-relevant happens server-side — this only drives the steps and
 * says, in plain words, what each one is doing. The copy is deliberate about what biometrics mean
 * here: the phone confirms its owner, GameHubz never receives a face or a fingerprint.
 *
 * Not a Modal of its own: the host renders it INSIDE its match modal, as an absolute-fill overlay
 * (the same arrangement as ConfirmationModal's `overlay`). As a second native Modal it never appeared
 * on iOS — beside the match modal it is presented from the screen, which is already presenting the
 * match, so UIKit drops it — while the Face ID prompt, being the system's, still ran: the attempt went
 * through unseen, and the half-presented Modal was left behind. The host routes Android's back key
 * to onClose while this is up.
 */
export function VerifyResultSheet({
    visible,
    onClose,
    matchId,
    userId,
    opponentName,
    onVerified,
}: VerifyResultSheetProps) {
    const { t } = useTranslation('match');
    const { t: tCommon } = useTranslation('common');
    const insets = useSafeAreaInsets();

    const [phase, setPhase] = useState<Phase>('authenticating');
    const [authMessage, setAuthMessage] = useState<string | null>(null);
    const [uploadMessage, setUploadMessage] = useState<string | null>(null);
    const [recordingMessage, setRecordingMessage] = useState<string | null>(null);
    const [compressionProgress, setCompressionProgress] = useState(0);
    const [record, setRecord] = useState<VerificationRecord | null>(null);

    const verificationIdRef = useRef<string | null>(null);
    const recordingRef = useRef<PreparedRecording | null>(null);
    // One attempt at a time: a double tap on "Try again" must not start two challenges.
    const busyRef = useRef(false);
    // The sheet can be closed mid-request; a late answer must not write into the next opening.
    const sessionRef = useRef(0);

    const biometric = biometricLabel(t);

    const prompts = {
        register: t('verification.promptRegister'),
        unlock: t('verification.promptUnlock'),
    };

    const authenticate = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        const session = sessionRef.current;

        setPhase('authenticating');
        setAuthMessage(null);
        setUploadMessage(null);
        setRecordingMessage(null);
        verificationIdRef.current = null;
        recordingRef.current = null;

        try {
            let registration = await ensureDeviceRegistered(userId, prompts);
            const description = getDeviceDescription();

            let challenge;
            try {
                challenge = await startVerification(matchId, registration.deviceId, description);
            } catch (error) {
                // 409: the server holds no key for this installation — the phone's registration
                // outlived the server's record of it. Registering again fixes that; once, not in a loop.
                if (!(error instanceof VerificationRequestError) || error.status !== 409) throw error;
                registration = await reRegisterDevice(userId, prompts);
                challenge = await startVerification(matchId, registration.deviceId, description);
            }

            const signature = await signWithDeviceKey(userId, challenge.message, prompts, registration.unlockedSecret);
            await submitBiometricProof(challenge.verificationId, signature);

            if (session !== sessionRef.current) return;
            verificationIdRef.current = challenge.verificationId;
            // No buzz here: the OS already acknowledged the unlock, and the flow's one success haptic
            // belongs to the moment the result is actually verified.
            setPhase('readyForRecording');
        } catch (error) {
            if (session !== sessionRef.current) return;
            hapticError();

            if (error instanceof BiometricError) {
                setAuthMessage(
                    error.reason === 'cancelled' ? t('verification.cancelled')
                        : error.reason === 'lockout' ? t('verification.lockout')
                            : error.reason === 'unavailable' ? t('verification.unavailableShort', { biometric })
                                : t('verification.biometricFailed'),
                );
            } else if (error instanceof VerificationRequestError && error.message) {
                setAuthMessage(error.message);
            } else {
                setAuthMessage(t('verification.genericFailed'));
            }
            setPhase('authFailed');
        } finally {
            busyRef.current = false;
        }
    }, [matchId, userId, t]);

    const upload = useCallback(async () => {
        const verificationId = verificationIdRef.current;
        const recording = recordingRef.current;
        if (!verificationId || !recording || busyRef.current) return;
        busyRef.current = true;
        const session = sessionRef.current;

        setPhase('uploading');
        setUploadMessage(null);

        try {
            const verified = await uploadVerificationRecording(verificationId, recording);

            if (session === sessionRef.current) {
                setRecord(verified);
                hapticSuccess();
                setPhase('verified');
            }
            // Told even when the sheet was closed mid-upload (Android's back key can do that): the
            // record exists either way, and the card behind the sheet has to show it and let the
            // report through.
            onVerified(verified);
        } catch (error) {
            if (session !== sessionRef.current) return;
            hapticError();
            setUploadMessage(error instanceof VerificationRequestError && error.message
                ? error.message
                : t('verification.uploadFailedBody'));
            setPhase('uploadFailed');
        } finally {
            busyRef.current = false;
        }
    }, [onVerified, t]);

    const chooseRecording = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        const session = sessionRef.current;
        setRecordingMessage(null);

        let picked = false;
        try {
            const result = await pickVerificationRecording(
                () => {
                    setCompressionProgress(0);
                    setPhase('preparing');
                },
                progress => setCompressionProgress(progress),
            );
            if (session !== sessionRef.current) return;

            if (result.kind === 'picked') {
                recordingRef.current = result.recording;
                picked = true;
            } else {
                setPhase('readyForRecording');
                if (result.kind === 'permission') setRecordingMessage(t('verification.photosPermission'));
                if (result.kind === 'rejected') {
                    setRecordingMessage(
                        result.reason === 'tooLong' ? t('verification.videoTooLong', { seconds: MAX_VIDEO_DURATION_SECONDS })
                            : result.reason === 'unsupported' ? t('verification.videoUnsupported')
                                : t('verification.videoFailed'),
                    );
                }
            }
        } catch {
            if (session !== sessionRef.current) return;
            setPhase('readyForRecording');
            setRecordingMessage(t('verification.videoFailed'));
        } finally {
            busyRef.current = false;
        }

        if (picked) await upload();
    }, [upload, t]);

    // Every opening is a fresh attempt: a new challenge, a new proof, nothing carried over.
    useEffect(() => {
        if (!visible) {
            sessionRef.current += 1;
            busyRef.current = false;
            return;
        }

        sessionRef.current += 1;
        setRecord(null);
        setCompressionProgress(0);

        if (!isBiometricAvailable()) {
            setPhase('unavailable');
            return;
        }

        // A beat after the slide-in: raising the Face ID sheet while this one is still animating up
        // reads as two things happening at once.
        setPhase('authenticating');
        const timer = setTimeout(() => { authenticate(); }, 450);
        return () => clearTimeout(timer);
    }, [visible, matchId]);

    const biometricState: StepState = phase === 'authenticating' ? 'active'
        : phase === 'authFailed' || phase === 'unavailable' ? 'error'
            : 'done';

    const recordingState: StepState = phase === 'readyForRecording' || phase === 'preparing' || phase === 'uploading' ? 'active'
        : phase === 'uploadFailed' ? 'error'
            : phase === 'verified' ? 'done'
                : 'pending';

    const verifiedState: StepState = phase === 'verified' ? 'done' : 'pending';

    const recording = recordingRef.current;
    const recordingSummary = recording
        ? [formatClipDuration(recording.durationMs), recording.fileName].filter(Boolean).join(' · ')
        : null;

    const biometricDetail = phase === 'authenticating' ? t('verification.authenticating', { biometric })
        : phase === 'unavailable' ? t('verification.unavailableShort', { biometric })
            : phase === 'authFailed' ? (authMessage ?? t('verification.biometricFailed'))
                : t('verification.biometricOk');

    const recordingDetail = phase === 'preparing'
        ? t('verification.preparing', { percent: Math.round(compressionProgress * 100) })
        : phase === 'uploading' ? t('verification.uploading')
            : phase === 'uploadFailed' ? (uploadMessage ?? t('verification.uploadFailedBody'))
                : phase === 'verified' ? t('verification.recordingAttached', { details: recordingSummary || '—' })
                    : phase === 'readyForRecording' ? t('verification.selectRecordingHint', { seconds: MAX_VIDEO_DURATION_SECONDS })
                        : t('verification.recordingWaits');

    const isWorking = phase === 'authenticating' || phase === 'preparing' || phase === 'uploading';

    const primary = (() => {
        switch (phase) {
            case 'unavailable':
                return { label: t('verification.openSettings'), icon: 'settings-outline' as const, onPress: () => Linking.openSettings().catch(() => { }) };
            case 'authFailed':
                return { label: t('verification.retry'), icon: 'refresh' as const, onPress: authenticate };
            case 'readyForRecording':
                return { label: t('verification.selectRecording'), icon: 'film-outline' as const, onPress: chooseRecording };
            case 'uploadFailed':
                return { label: t('verification.retryUpload'), icon: 'cloud-upload-outline' as const, onPress: upload };
            case 'verified':
                return { label: t('verification.done'), icon: 'checkmark' as const, onPress: onClose };
            default:
                return null;
        }
    })();

    // After every hook: the component stays mounted while hidden, so the effect above sees it close.
    if (!visible) return null;

    return (
        // Elevation, not only tree order: on Android a sibling drawn later still sits under one with
        // a higher elevation, and the match sheet's own buttons carry some.
        <View className="absolute inset-0 justify-end" style={{ elevation: 24, zIndex: 50 }} accessibilityViewIsModal>
            <Animated.View entering={FadeIn.duration(180)} className="absolute inset-0 bg-black/70">
                <Pressable className="flex-1" onPress={isWorking ? undefined : onClose} />
            </Animated.View>

            <Animated.View
                entering={SlideInDown.duration(280)}
                className="bg-card border-t border-white/[0.08] rounded-t-[32px] px-5 pt-3 overflow-hidden"
                style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            >
                <LinearGradient
                    colors={[(phase === 'verified' ? COLORS.primary : COLORS.info) + '22', 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.45 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />

                <View className="self-center w-10 h-1 rounded-full bg-white/15 mb-4" />

                {/* Header: the emblem, what this is, and which match it is for. */}
                <View className="flex-row items-center gap-3 mb-6">
                    <View
                        className="w-12 h-12 rounded-2xl items-center justify-center border"
                        style={{
                            backgroundColor: (phase === 'verified' ? COLORS.primary : COLORS.info) + '1F',
                            borderColor: (phase === 'verified' ? COLORS.primary : COLORS.info) + '55',
                            shadowColor: phase === 'verified' ? COLORS.primary : COLORS.info,
                            shadowOpacity: 0.45,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: 0 },
                        }}
                    >
                        <Ionicons
                            name={phase === 'verified' ? 'shield-checkmark' : 'finger-print'}
                            size={24}
                            color={phase === 'verified' ? COLORS.primary : COLORS.info}
                        />
                    </View>
                    <View className="flex-1">
                        <Text numberOfLines={1} className="text-white text-[17px] font-black uppercase tracking-[2px]">
                            {phase === 'verified' ? t('verification.verifiedTitle') : t('verification.sheetTitle')}
                        </Text>
                        <Text numberOfLines={1} className="text-slate-500 text-xs font-bold mt-0.5">
                            {opponentName ? t('verification.sheetSubtitle', { name: opponentName }) : t('verification.sheetSubtitleNoName')}
                        </Text>
                    </View>
                    {!isWorking && (
                        <Pressable onPress={onClose} hitSlop={10} className="w-9 h-9 rounded-full bg-white/5 items-center justify-center active:bg-white/10">
                            <Ionicons name="close" size={18} color={COLORS.slate400} />
                        </Pressable>
                    )}
                </View>

                {/* The stepper */}
                <View className="px-1">
                    <StepRow
                        index={1}
                        title={t('verification.stepBiometricTitle', { biometric })}
                        detail={biometricDetail}
                        state={biometricState}
                    >
                        {phase === 'authenticating' && (
                            <ActivityIndicator size="small" color={COLORS.slate300} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
                        )}
                    </StepRow>

                    <StepRow
                        index={2}
                        title={t('verification.stepRecordingTitle')}
                        detail={recordingDetail}
                        state={recordingState}
                    >
                        {(phase === 'preparing' || phase === 'uploading') && (
                            <View className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-2.5">
                                <View
                                    className="h-full rounded-full bg-info"
                                    style={{ width: phase === 'uploading' ? '100%' : `${Math.max(4, Math.round(compressionProgress * 100))}%`, opacity: phase === 'uploading' ? 0.55 : 1 }}
                                />
                            </View>
                        )}
                        {!!recordingMessage && (
                            <Text className="text-[11px] font-bold text-warning mt-1.5">{recordingMessage}</Text>
                        )}
                    </StepRow>

                    <StepRow
                        index={3}
                        title={t('verification.stepVerifiedTitle')}
                        detail={phase === 'verified' && record
                            ? t('verification.verifiedDetail', {
                                time: formatVerificationStamp(record.verifiedOn),
                                device: record.device?.deviceModel || Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
                            })
                            : null}
                        state={verifiedState}
                        isLast
                    />
                </View>

                {phase === 'verified' && (
                    <Text className="text-[12px] font-semibold text-slate-400 mt-4 leading-[18px]">
                        {t('verification.verifiedBody')}
                    </Text>
                )}

                {phase === 'unavailable' && (
                    <Text className="text-[12px] font-semibold text-slate-400 mt-4 leading-[18px]">
                        {Platform.OS === 'ios' ? t('verification.unavailableIos') : t('verification.unavailableAndroid')}
                    </Text>
                )}

                {primary && (
                    <PressableScale
                        onPress={primary.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={primary.label}
                        className="h-[52px] rounded-2xl overflow-hidden mt-6"
                        style={{
                            shadowColor: COLORS.primary,
                            shadowOpacity: 0.32,
                            shadowRadius: 16,
                            shadowOffset: { width: 0, height: 7 },
                            elevation: 8,
                        }}
                    >
                        <LinearGradient
                            colors={['#10B981', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <View className="flex-row items-center gap-2">
                                <Ionicons name={primary.icon} size={17} color="#022C22" />
                                <Text numberOfLines={1} className="text-[13px] font-black text-emerald-950 uppercase tracking-[1.5px]">
                                    {primary.label}
                                </Text>
                            </View>
                        </LinearGradient>
                    </PressableScale>
                )}

                {/* A failed upload is usually the connection, and "Retry upload" keeps the same
                    attempt. When the attempt itself is gone — its 30 minutes ran out — only a new
                    one helps, and the server's message will have said so. */}
                {phase === 'uploadFailed' && (
                    <Pressable onPress={authenticate} className="h-11 items-center justify-center mt-1 active:opacity-60">
                        <Text className="text-[13px] font-bold text-slate-300">{t('verification.startOver')}</Text>
                    </Pressable>
                )}

                {phase !== 'verified' && !isWorking && (
                    <Pressable onPress={onClose} className="h-12 items-center justify-center mt-1 active:opacity-60">
                        <Text className="text-[13px] font-bold text-slate-400">{tCommon('cancel')}</Text>
                    </Pressable>
                )}

                {/* What the biometric step actually shares — said where the player is about to use it. */}
                <View className="flex-row items-start gap-2 mt-4 px-1">
                    <Ionicons name="lock-closed" size={12} color={COLORS.slate500} style={{ marginTop: 2 }} />
                    <Text className="flex-1 text-[10px] font-medium text-slate-500 leading-4">
                        {t('verification.privacy', { biometric })}
                    </Text>
                </View>
            </Animated.View>
        </View>
    );
}
