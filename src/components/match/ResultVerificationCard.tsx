import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../ui/PressableScale';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { EvidenceThumb } from './EvidenceThumb';
import { COLORS } from '../../lib/theme';
import { cn, parseUtcDate, sameId } from '../../lib/utils';
import { dateLocale } from '../../i18n';
import { EvidenceItem } from '../../lib/evidence';
import {
    VerificationPanel,
    VerificationRecord,
    VerificationDeviceAccount,
    VerificationFlag,
    VERIFICATION_FAILED,
    isVerified,
} from '../../lib/resultVerification';

interface ResultVerificationCardProps {
    panel: VerificationPanel | null;
    isLoading: boolean;
    currentUserId?: string | null;
    onVerify: () => void;
    onOpenEvidence: (item: EvidenceItem) => void;
    onOpenProfile?: (userId: string) => void;
    className?: string;
}

/** "00:42:18", with the date in front whenever it is not today — seconds matter on a record like this. */
export function formatVerificationStamp(value?: string | null, withSeconds = true): string {
    if (!value) return '';
    const d = parseUtcDate(value);
    if (isNaN(d.getTime())) return '';

    const time = d.toLocaleTimeString(dateLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' } : {}),
        hour12: false,
    });
    if (d.toDateString() === new Date().toDateString()) return time;

    return `${d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} ${time}`;
}

export function formatClipDuration(ms?: number | null): string | null {
    if (!ms || ms <= 0) return null;
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The label the phone's own biometric goes by, so the copy names the thing the player will see. */
export function biometricLabel(t: (key: string) => string): string {
    return Platform.OS === 'ios' ? t('verification.biometricIos') : t('verification.biometricAndroid');
}

function deviceLine(record: VerificationRecord, t: (key: string, options?: any) => string): string | null {
    const device = record.device;
    if (!device) return null;

    const os = device.platform === 'ios' ? 'iOS' : device.platform === 'android' ? 'Android' : device.platform;
    return [
        device.deviceModel,
        device.osVersion ? `${os} ${device.osVersion}` : os,
        device.appVersion ? t('verification.appVersion', { version: device.appVersion }) : null,
    ].filter(Boolean).join(' · ');
}

const FLAG_ICONS: Record<VerificationFlag, keyof typeof Ionicons.glyphMap> = {
    newDevice: 'phone-portrait-outline',
    freshKey: 'key-outline',
    sharedDevice: 'people-outline',
    emulator: 'bug-outline',
    oldRecording: 'time-outline',
};

/** One ✓ line of the record: what was proven, and the fact behind it. */
function CheckLine({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
    return (
        <View className="flex-row items-start gap-2">
            <Ionicons
                name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={ok ? COLORS.primary : COLORS.slate600}
                style={{ marginTop: 1 }}
            />
            <View className="flex-1">
                <Text className={cn('text-[11px] font-black', ok ? 'text-slate-200' : 'text-slate-500')} numberOfLines={1}>
                    {label}
                </Text>
                {!!value && (
                    <Text className="text-[10px] font-semibold text-slate-500 mt-px" numberOfLines={2}>
                        {value}
                    </Text>
                )}
            </View>
        </View>
    );
}

/**
 * The accounts behind "shared phone", for an organizer. One that was on the phone before the player
 * who verified is the phone's likeliest owner — and so, possibly, whoever actually played — which is
 * the case this exists for, so it is said first and in plain words. Names open the profile.
 */
function OtherAccountsOnPhone({
    record,
    onOpenProfile,
}: {
    record: VerificationRecord;
    onOpenProfile?: (userId: string) => void;
}) {
    const { t } = useTranslation('match');
    const accounts = record.device?.otherAccounts ?? [];
    if (accounts.length === 0) return null;

    const nameOf = (account: VerificationDeviceAccount) => account.username || t('verification.unknownAccount');
    const first = accounts.find(account => account.cameFirst);

    return (
        <View
            className={cn(
                'mt-3 rounded-2xl border px-3 py-2.5',
                first ? 'border-destructive/30 bg-destructive/[0.06]' : 'border-warning/30 bg-warning/[0.06]',
            )}
        >
            <View className="flex-row items-center gap-1.5">
                <Ionicons
                    name={first ? 'alert-circle' : 'people-outline'}
                    size={13}
                    color={first ? COLORS.destructive : COLORS.warning}
                />
                <Text
                    numberOfLines={1}
                    className={cn('flex-1 text-[10px] font-black uppercase tracking-[1px]', first ? 'text-destructive' : 'text-warning')}
                >
                    {first
                        ? t('verification.possiblyPlayedBy', { name: nameOf(first) })
                        : t('verification.otherAccountsTitle')}
                </Text>
            </View>
            {!!first && (
                <Text className="text-[10px] font-semibold text-slate-400 mt-1 leading-[14px]">
                    {t('verification.accountCameFirst', { name: nameOf(first), player: record.username })}
                </Text>
            )}

            <View className="mt-1.5">
                {accounts.map(account => {
                    const canOpen = !!onOpenProfile && !!account.userId;
                    return (
                        <Pressable
                            key={account.userId}
                            onPress={canOpen ? () => onOpenProfile!(account.userId) : undefined}
                            disabled={!canOpen}
                            className="flex-row items-center gap-2 py-1 active:opacity-70"
                        >
                            <PlayerAvatar src={account.avatarUrl ?? undefined} name={nameOf(account)} size="sm" className="rounded-lg border-0" />
                            <View className="flex-1">
                                <Text numberOfLines={1} className="text-[12px] font-bold text-slate-200">
                                    {nameOf(account)}
                                </Text>
                                {!!account.firstSeenOn && (
                                    <Text numberOfLines={1} className="text-[10px] font-semibold text-slate-500">
                                        {t('verification.onPhoneSince', { date: formatVerificationStamp(account.firstSeenOn, false) })}
                                    </Text>
                                )}
                            </View>
                            {canOpen && <Ionicons name="chevron-forward" size={13} color={COLORS.slate500} />}
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

/**
 * The full record, as an organizer reads it: the recording, the biometric proof and the device — the
 * checklist the whole feature exists to produce — plus the flags worth a second look. Module scope so it is not rebuilt as a new component type on every render.
 */
function RecordDetails({
    record,
    showFlags,
    onOpenEvidence,
    onOpenProfile,
}: {
    record: VerificationRecord;
    showFlags: boolean;
    onOpenEvidence: (item: EvidenceItem) => void;
    onOpenProfile?: (userId: string) => void;
}) {
    const { t } = useTranslation('match');
    const clip = formatClipDuration(record.evidenceDurationMs);
    const evidenceValue = [
        clip,
        record.recordedOn ? t('verification.recordedAt', { time: formatVerificationStamp(record.recordedOn, false) }) : null,
    ].filter(Boolean).join(' · ');

    const device = record.device;
    const deviceExtras = device
        ? [
            device.firstSeenOn ? t('verification.firstSeen', { date: formatVerificationStamp(device.firstSeenOn, false) }) : null,
            // Just the count when the names are not there to say it (a server from before the names).
            device.otherAccountsOnDevice > 0 && device.otherAccounts.length === 0
                ? t('verification.otherAccounts', { count: device.otherAccountsOnDevice })
                : null,
        ].filter(Boolean).join(' · ')
        : '';

    return (
        <View className="mt-3">
            <View className="flex-row gap-3">
                {record.evidence ? (
                    <EvidenceThumb
                        item={record.evidence}
                        width={62}
                        height={84}
                        onPress={() => onOpenEvidence(record.evidence!)}
                    />
                ) : (
                    <View
                        className="rounded-2xl border border-white/5 items-center justify-center px-1"
                        style={{ width: 62, height: 84, backgroundColor: COLORS.cardElevated }}
                    >
                        <Ionicons name="videocam-off-outline" size={16} color={COLORS.slate500} />
                        {record.evidenceExpired && (
                            <Text className="text-[8px] font-bold text-slate-500 text-center mt-1" numberOfLines={2}>
                                {t('verification.recordingRemoved')}
                            </Text>
                        )}
                    </View>
                )}

                <View className="flex-1 gap-2">
                    <CheckLine
                        ok={!!record.evidence || record.evidenceExpired}
                        label={t('verification.checkEvidence')}
                        value={evidenceValue || null}
                    />
                    <CheckLine
                        ok={record.biometricVerified}
                        label={t('verification.checkBiometric')}
                        value={formatVerificationStamp(record.biometricVerifiedOn)}
                    />
                    {!!device && (
                        <CheckLine
                            ok
                            label={t('verification.checkDevice')}
                            value={[deviceLine(record, t), deviceExtras].filter(Boolean).join('\n')}
                        />
                    )}
                </View>
            </View>

            {showFlags && <OtherAccountsOnPhone record={record} onOpenProfile={onOpenProfile} />}

            {showFlags && record.flags.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5 mt-3">
                    {record.flags.map(flag => (
                        <View
                            key={flag}
                            className="flex-row items-center gap-1 px-2 py-1 rounded-lg border border-warning/30 bg-warning/[0.08]"
                        >
                            <Ionicons name={FLAG_ICONS[flag] ?? 'alert-circle-outline'} size={11} color={COLORS.warning} />
                            <Text className="text-[9px] font-black text-warning uppercase tracking-[1px]" numberOfLines={1}>
                                {t(`verification.flag.${flag}`)}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

/** A player's line: who, and whether they have verified. Opens the full record for an organizer. */
function PlayerRow({
    record,
    showFlags,
    onOpenEvidence,
    onOpenProfile,
}: {
    record: VerificationRecord;
    showFlags: boolean;
    onOpenEvidence: (item: EvidenceItem) => void;
    onOpenProfile?: (userId: string) => void;
}) {
    const { t } = useTranslation('match');
    const verified = isVerified(record);
    const [expanded, setExpanded] = useState(false);

    return (
        <View className="py-2.5">
            <View className="flex-row items-center gap-2.5">
                <Pressable
                    onPress={onOpenProfile ? () => onOpenProfile(record.userId) : undefined}
                    disabled={!onOpenProfile}
                    className="active:opacity-70"
                >
                    <PlayerAvatar src={record.avatarUrl ?? undefined} name={record.username || '?'} size="sm" className="rounded-xl border-0" />
                </Pressable>
                <Pressable
                    onPress={verified ? () => setExpanded(open => !open) : onOpenProfile ? () => onOpenProfile(record.userId) : undefined}
                    disabled={!verified && !onOpenProfile}
                    accessibilityRole="button"
                    accessibilityLabel={`${record.username}, ${t(verified ? 'verification.verifiedPill' : 'verification.notVerified')}`}
                    accessibilityState={verified ? { expanded } : undefined}
                    className="flex-row items-center gap-2.5 flex-1 active:opacity-70"
                >
                    <Text numberOfLines={1} className="flex-1 text-[13px] font-bold text-slate-200">
                        {record.username}
                    </Text>

                    <View
                        className={cn(
                            'flex-row items-center gap-1 px-2 py-1 rounded-lg border',
                            verified ? 'border-primary/30 bg-primary/10' : 'border-white/[0.08] bg-white/[0.03]',
                        )}
                    >
                        <Ionicons
                            name={verified ? 'shield-checkmark' : 'shield-outline'}
                            size={11}
                            color={verified ? COLORS.primary : COLORS.slate500}
                        />
                        <Text
                            numberOfLines={1}
                            className={cn('text-[9px] font-black uppercase tracking-[1px]', verified ? 'text-primary' : 'text-slate-500')}
                        >
                            {verified
                                ? formatVerificationStamp(record.verifiedOn, false)
                                : t('verification.notVerified')}
                        </Text>
                    </View>
                    {verified && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.slate500} />}
                </Pressable>
            </View>

            {verified && expanded && (
                <RecordDetails record={record} showFlags={showFlags} onOpenEvidence={onOpenEvidence} onOpenProfile={onOpenProfile} />
            )}
        </View>
    );
}

/**
 * Result verification inside a match sheet.
 *
 * For the player who still has to verify it is a call to action — the three steps and the button.
 * Once they have, their green player row can expand to show the proof. An organizer
 * can expand each player's full record (recording, biometric, device, flags) and any attempt
 * that failed. The panel shape is decided by the server (see MatchVerificationPanelDto), so a player
 * never receives the device details this card would otherwise have to hide.
 */
export function ResultVerificationCard({
    panel,
    isLoading,
    currentUserId,
    onVerify,
    onOpenEvidence,
    onOpenProfile,
    className,
}: ResultVerificationCardProps) {
    const { t } = useTranslation('match');

    if (!panel) {
        if (!isLoading) return null;
        return (
            <View className={cn('flex-row items-center gap-2 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-3', className)}>
                <ActivityIndicator size="small" color={COLORS.slate400} />
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-[1.5px]" numberOfLines={1}>
                    {t('verification.title')}
                </Text>
            </View>
        );
    }

    const playerRecords = panel.records.filter(r => r.status !== VERIFICATION_FAILED);
    const failedAttempts = panel.records.filter(r => r.status === VERIFICATION_FAILED);
    const hasAnyRecord = panel.records.some(r => r.id);

    // A tournament that no longer requires verification still shows what was verified while it did.
    if (!panel.required && !hasAnyRecord) return null;

    const mine = panel.mine;
    const iVerified = isVerified(mine);
    const needsAction = panel.canVerify && !iVerified;
    // The viewer's own record may contain more detail than the row in records.
    const listedRecords = playerRecords
        .filter(r => panel.isManager || !needsAction || !sameId(r.userId, currentUserId))
        .map(r => mine && sameId(r.userId, currentUserId) ? mine : r);
    if (iVerified && mine && !listedRecords.some(r => sameId(r.userId, mine.userId))) {
        listedRecords.push(mine);
    }

    const accent = iVerified ? COLORS.primary : needsAction ? COLORS.warning : COLORS.info;

    return (
        <View
            className={cn(
                'rounded-[24px] border p-4 overflow-hidden',
                iVerified
                    ? 'bg-primary/[0.05] border-primary/25'
                    : needsAction
                        ? 'bg-warning/[0.06] border-warning/30'
                        : 'bg-white/[0.03] border-white/[0.08]',
                className,
            )}
        >
            <LinearGradient
                colors={[accent + '1A', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {/* Header */}
            <View className="flex-row items-center gap-2">
                <View
                    className="w-7 h-7 rounded-xl items-center justify-center"
                    style={{ backgroundColor: accent + '26' }}
                >
                    <Ionicons name={iVerified ? 'shield-checkmark' : 'shield-half-outline'} size={15} color={accent} />
                </View>
                <Text numberOfLines={1} className="flex-1 text-[10px] font-black text-white uppercase tracking-[2px]">
                    {t('verification.title')}
                </Text>
                {panel.required && !iVerified && (
                    <View className="px-2 py-[3px] rounded-md border border-warning/30 bg-warning/10">
                        <Text
                            numberOfLines={1}
                            className="text-[8px] font-black uppercase tracking-[1.5px] text-warning"
                        >
                            {t('verification.requiredPill')}
                        </Text>
                    </View>
                )}
            </View>

            {/* The player who still has to verify: what to do, in the order they will do it. */}
            {needsAction && (
                <>
                    <Text className="text-[12px] font-medium text-slate-300 mt-3 leading-[18px]">
                        {t('verification.intro')}
                    </Text>

                    <View className="gap-2 mt-3">
                        {[
                            { icon: 'videocam-outline' as const, label: t('verification.stepRecord') },
                            { icon: 'finger-print-outline' as const, label: t('verification.stepBiometric', { biometric: biometricLabel(t) }) },
                            { icon: 'cloud-upload-outline' as const, label: t('verification.stepAttach') },
                        ].map((step, index) => (
                            <View key={step.label} className="flex-row items-center gap-2.5">
                                <View className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/10 items-center justify-center">
                                    <Text className="text-[9px] font-black text-slate-300">{index + 1}</Text>
                                </View>
                                <Ionicons name={step.icon} size={14} color={COLORS.slate400} />
                                <Text numberOfLines={1} className="flex-1 text-[12px] font-bold text-slate-300">
                                    {step.label}
                                </Text>
                            </View>
                        ))}
                    </View>

                    <PressableScale
                        onPress={onVerify}
                        accessibilityRole="button"
                        accessibilityLabel={t('verification.cta')}
                        accessibilityHint={t('verification.a11yHint')}
                        className="h-12 rounded-2xl overflow-hidden mt-4"
                        style={{
                            shadowColor: COLORS.primary,
                            shadowOpacity: 0.38,
                            shadowRadius: 16,
                            shadowOffset: { width: 0, height: 7 },
                            elevation: 9,
                        }}
                    >
                        <LinearGradient
                            colors={['#10B981', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <View className="flex-row items-center gap-2">
                                <Ionicons name="shield-checkmark" size={16} color="#022C22" />
                                <Text numberOfLines={1} className="text-[13px] font-black text-emerald-950 uppercase tracking-[1.5px]">
                                    {t('verification.cta')}
                                </Text>
                            </View>
                        </LinearGradient>
                    </PressableScale>
                </>
            )}

            {/* Both players' status. Verified records start closed and open from their name. */}
            {listedRecords.length > 0 && (
                <View className={cn('mt-3', needsAction && 'border-t border-white/[0.06] pt-1')}>
                    {listedRecords.map(record => (
                        <PlayerRow
                            key={`${panel.matchId}:${record.userId}`}
                            record={record}
                            showFlags={panel.isManager}
                            onOpenEvidence={onOpenEvidence}
                            onOpenProfile={onOpenProfile}
                        />
                    ))}
                </View>
            )}

            {panel.isManager && failedAttempts.length > 0 && (
                <View className="mt-2 border-t border-white/[0.06] pt-3">
                    <Text className="text-[9px] font-black text-destructive uppercase tracking-[1.5px] mb-2">
                        {t('verification.failedAttempts', { n: failedAttempts.length })}
                    </Text>
                    {failedAttempts.map(attempt => (
                        <View key={attempt.id ?? attempt.startedOn ?? attempt.userId} className="flex-row items-center gap-2 py-1">
                            <Ionicons name="close-circle" size={13} color={COLORS.destructive} />
                            <Text numberOfLines={2} className="flex-1 text-[11px] font-semibold text-slate-400">
                                {t('verification.failedAttempt', {
                                    name: attempt.username,
                                    time: formatVerificationStamp(attempt.startedOn),
                                    device: deviceLine(attempt, t) || '—',
                                })}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}
