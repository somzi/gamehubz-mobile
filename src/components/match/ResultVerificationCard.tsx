import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
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
import { seriesBlockLabel } from '../../lib/series';
import {
    VerificationSlot,
    gameIsVerified,
    verificationGameKey,
} from '../../lib/verificationGames';
import {
    VerificationPanel,
    VerificationRecord,
    VerificationDeviceAccount,
    VerificationFlag,
    VERIFICATION_FAILED,
    isVerified,
    VerificationTarget,
} from '../../lib/resultVerification';

interface ResultVerificationCardProps {
    panel: VerificationPanel | null;
    isLoading: boolean;
    currentUserId?: string | null;
    /** The match must be scheduled and open; the server's canVerify still decides permission. */
    allowVerify: boolean;
    /** The panel's games read against the result in view (buildVerificationSlots); null until it loads. */
    slots: VerificationSlot[] | null;
    onVerify: (game: VerificationTarget) => void;
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
    noRecordingTime: 'calendar-outline',
};

/**
 * What an organizer has to look at in a proof, carried up to every level of the card so a green time
 * never hides it: another account was on the phone first ('danger' — maybe someone else played), or
 * any other flag ('warning'). Only an organizer's panel carries flags and device details.
 */
type Concern = 'danger' | 'warning';
const CONCERN_COLOR: Record<Concern, string> = { danger: COLORS.destructive, warning: COLORS.warning };

function recordConcern(record: VerificationRecord): Concern | null {
    if (!isVerified(record)) return null;
    if (record.device?.otherAccounts.some(account => account.cameFirst)) return 'danger';
    if (record.flags.length > 0 || (record.device?.otherAccountsOnDevice ?? 0) > 0) return 'warning';
    return null;
}

function worstConcern(concerns: (Concern | null)[]): Concern | null {
    return concerns.includes('danger') ? 'danger' : concerns.includes('warning') ? 'warning' : null;
}

/** The organizer's cue on the card's header: a triangle and "Review", in the worst concern's colour. */
function ReviewPill({ concern }: { concern: Concern }) {
    const { t } = useTranslation('match');
    const color = CONCERN_COLOR[concern];
    return (
        <View
            className="flex-row items-center gap-1 px-2 py-1 rounded-lg border"
            style={{ backgroundColor: color + '1F', borderColor: color + '59' }}
        >
            <Ionicons name="warning" size={12} color={color} />
            <Text numberOfLines={1} className="text-[10px] font-black uppercase tracking-[1px]" style={{ color }}>
                {t('verification.review')}
            </Text>
        </View>
    );
}

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
    const concern = showFlags ? recordConcern(record) : null;
    const [expanded, setExpanded] = useState(false);
    const tone = concern ? CONCERN_COLOR[concern] : verified ? COLORS.primary : COLORS.slate500;

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
                    accessibilityLabel={`${record.username}, ${t(verified ? 'verification.verifiedPill' : 'verification.notVerified')}${concern ? `, ${t('verification.review')}` : ''}`}
                    accessibilityState={verified ? { expanded } : undefined}
                    className="flex-row items-center gap-2.5 flex-1 active:opacity-70"
                >
                    <Text numberOfLines={1} className="flex-1 text-[13px] font-bold text-slate-200">
                        {record.username}
                    </Text>

                    <View
                        className="flex-row items-center gap-1 px-2 py-1 rounded-lg border"
                        style={verified
                            ? { backgroundColor: tone + (concern ? '1F' : '1A'), borderColor: tone + (concern ? '59' : '4D') }
                            : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                        <Ionicons
                            name={concern ? 'warning' : verified ? 'shield-checkmark' : 'shield-outline'}
                            size={11}
                            color={tone}
                        />
                        <Text
                            numberOfLines={1}
                            className="text-[9px] font-black uppercase tracking-[1px]"
                            style={{ color: tone }}
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

/** The players of a game, with the viewer's own record — which can say more — in place of their row. */
function gamePlayers(slot: VerificationSlot, currentUserId?: string | null): VerificationRecord[] {
    const players = slot.records
        .filter(record => record.status !== VERIFICATION_FAILED)
        .map(record => slot.mine && sameId(record.userId, currentUserId) ? slot.mine : record);
    if (isVerified(slot.mine) && !players.some(record => sameId(record.userId, slot.mine!.userId))) players.push(slot.mine!);
    return players;
}

/** What one game says to the viewer: who has proven it, and whether anything is left for them. */
interface GameState {
    players: VerificationRecord[];
    notPlayed: boolean;
    /** Every player has proven it — the only state that reads as "verified". */
    everyone: boolean;
    /** A game the result needs that the viewer still owes: their own proof, or as an organizer anyone's. */
    needsViewer: boolean;
    status: string;
    statusColor: string;
    /** The tile's colour: green once the viewer's part is done, amber while they owe it. */
    tone: string;
    /** What an organizer should look at in this game's proofs, if anything. */
    concern: Concern | null;
    /** That concern in a few words: who may have played, or the flags raised. */
    concernText: string | null;
}

function describeGame(
    slot: VerificationSlot,
    byBothPlayers: boolean,
    currentUserId: string | null | undefined,
    isManager: boolean,
    t: (key: string, options?: any) => string,
): GameState {
    const notPlayed = slot.role === 'notPlayed';
    const players = gamePlayers(slot, currentUserId);
    const verifiedPlayers = players.filter(isVerified);
    const everyone = !notPlayed && players.length > 0 && verifiedPlayers.length === players.length;
    const some = !notPlayed && !everyone && verifiedPlayers.length > 0;
    const viewerDone = byBothPlayers ? everyone : isVerified(slot.mine);
    const needsViewer = !notPlayed && !viewerDone && slot.role === 'required';
    const status = notPlayed ? t('verification.notPlayed')
        : everyone ? t(players.length > 1 ? 'verification.gameVerifiedByBoth' : 'verification.gameVerified')
            : some ? t('verification.gameVerifiedBy', { name: verifiedPlayers.map(player => player.username).join(', ') })
                : slot.role === 'optional' ? t('verification.ifPlayed')
                    : t('verification.gameNotVerified');
    const tone = everyone || (some && viewerDone) ? COLORS.primary
        : needsViewer ? COLORS.warning
            : notPlayed || slot.role === 'optional' ? COLORS.slate500
                : COLORS.slate300;
    const statusColor = everyone ? COLORS.primary : some ? COLORS.slate300 : needsViewer ? COLORS.warning : COLORS.slate500;
    const concern = isManager ? worstConcern(players.map(recordConcern)) : null;
    const firstAccount = players.flatMap(player => player.device?.otherAccounts ?? []).find(account => account.cameFirst);
    const concernText = concern === 'danger' && firstAccount
        ? t('verification.possiblyPlayedBy', { name: firstAccount.username || t('verification.unknownAccount') })
        : concern
            ? [...new Set(players.flatMap(player => recordConcern(player) ? player.flags : []))]
                .map(flag => t(`verification.flag.${flag}`)).join(', ') || t('verification.flag.sharedDevice')
            : null;
    return { players, notPlayed, everyone, needsViewer, status, statusColor, tone, concern, concernText };
}

/**
 * One game in the strip: its number, a dot per player (green once they have proven it), and its state
 * in the tile's colour. Tapping it opens the game below the strip.
 */
function GameTile({
    slot,
    state,
    selected,
    onPress,
}: {
    slot: VerificationSlot;
    state: GameState;
    selected: boolean;
    onPress: () => void;
}) {
    const { t } = useTranslation('match');
    const label = t('series.gameN', { n: slot.gameNumber });
    const loud = state.everyone || state.needsViewer;

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${slot.seriesNumber > 1 ? `${seriesBlockLabel(slot.seriesNumber)}, ` : ''}${label}, ${state.status}${state.concernText ? `, ${state.concernText}` : ''}`}
            hitSlop={3}
            className="active:opacity-70"
        >
            <View
                className="items-center justify-center rounded-xl"
                style={{
                    width: 44,
                    height: 50,
                    borderWidth: selected ? 1.5 : 1,
                    // A game that may never be played is drawn as a placeholder.
                    borderStyle: slot.role === 'optional' && !selected ? 'dashed' : 'solid',
                    borderColor: selected ? 'rgba(255,255,255,0.8)' : state.tone + (loud ? '66' : '33'),
                    backgroundColor: selected ? 'rgba(255,255,255,0.08)' : state.tone + (loud ? '1A' : '0A'),
                    opacity: state.notPlayed && !selected ? 0.45 : 1,
                }}
            >
                {state.concern && (
                    <View pointerEvents="none" style={{ position: 'absolute', top: 3, right: 3 }}>
                        <Ionicons name="warning" size={11} color={CONCERN_COLOR[state.concern]} />
                    </View>
                )}
                <Text className="text-[15px] font-black" style={{ color: state.tone, fontVariant: ['tabular-nums'] }}>
                    {slot.gameNumber}
                </Text>
                {!state.notPlayed && state.players.length > 0 && (
                    <View className="flex-row mt-1" style={{ gap: 3 }}>
                        {state.players.map(player => (
                            <View
                                key={player.userId}
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: 2.5,
                                    backgroundColor: !isVerified(player) ? 'rgba(255,255,255,0.18)'
                                        : state.concern && recordConcern(player) ? CONCERN_COLOR[recordConcern(player)!]
                                            : COLORS.primary,
                                }}
                            />
                        ))}
                    </View>
                )}
            </View>
        </Pressable>
    );
}

/**
 * Result verification inside a match sheet: one proof per game. A series is a strip of game tiles
 * grouped by block, and the game tapped opens below it, so a long series with tiebreaks stays one
 * short card. One game to prove (a Bo1, or a server from
 * before per-game proofs) keeps the single card.
 */
export function ResultVerificationCard({ slots, ...props }: ResultVerificationCardProps) {
    const { t } = useTranslation('match');
    const { t: tCommon } = useTranslation('common');
    const { panel } = props;
    const [selection, setSelection] = useState<{ scope: string; key: string | null } | null>(null);

    if (!panel || !slots || panel.games.length === 0 || slots.length <= 1) {
        const only = panel && panel.games.length > 0 ? slots?.[0] ?? null : null;
        return (
            <SingleGameVerificationCard
                {...props}
                panel={panel && only ? { ...panel, mine: only.mine, records: only.records, canVerify: only.canVerify } : panel}
                onVerify={() => props.onVerify(only ?? { seriesNumber: 1, gameNumber: 1 })}
            />
        );
    }

    // A tournament that no longer requires verification still shows what was verified while it did.
    if (!panel.required && !slots.some(slot => slot.records.some(record => record.id))) return null;

    // The player counts their own proofs — an organizer who plays the match too; anyone else watching, both players'.
    const viewerPlays = panel.isParticipant ?? (!panel.isManager && slots.some(slot => slot.records.some(record => sameId(record.userId, props.currentUserId))));
    const byBothPlayers = !viewerPlays;
    const required = slots.filter(slot => slot.role === 'required');
    const verifiedCount = required.filter(slot => gameIsVerified(slot, byBothPlayers)).length;
    const allVerified = required.length > 0 && verifiedCount === required.length;
    // Everything starts closed — the tiles and the header say what needs a look. A new proof closes
    // whatever was opened by hand before it.
    const scope = `${panel.matchId}:${props.currentUserId}:${slots.map(slot => `${verificationGameKey(slot)}=${slot.mine?.id ?? ''}`).join(',')}`;
    const states = new Map(slots.map(slot => [verificationGameKey(slot), describeGame(slot, byBothPlayers, props.currentUserId, panel.isManager, t)]));
    const concern = worstConcern([...states.values()].map(state => state.concern));
    const openKey = selection?.scope === scope ? selection.key : null;
    const blocks = [...new Set(slots.map(slot => slot.seriesNumber))].map(seriesNumber => ({
        seriesNumber,
        slots: slots.filter(slot => slot.seriesNumber === seriesNumber),
    }));
    const open = openKey ? slots.find(slot => verificationGameKey(slot) === openKey) ?? null : null;
    const openState = open ? states.get(verificationGameKey(open)) ?? null : null;

    return (
        <View className={cn('rounded-[24px] border border-white/10 bg-white/[0.03] p-4', props.className)}>
            <View className="flex-row items-center gap-2">
                <Ionicons
                    name={allVerified ? 'shield-checkmark' : 'shield-half-outline'}
                    size={20}
                    color={allVerified ? COLORS.primary : required.length > 0 ? COLORS.warning : COLORS.slate500}
                />
                <Text className="flex-1 text-[14px] font-black text-white">{t('verification.title')}</Text>
                {concern && <ReviewPill concern={concern} />}
            </View>
            {required.length > 0 && (
                <Text
                    accessibilityLiveRegion="polite"
                    className={cn('text-xs font-bold mt-2', allVerified ? 'text-primary' : 'text-slate-300')}
                >
                    {t(byBothPlayers ? 'verification.gamesProgressManager' : 'verification.gamesProgress', {
                        verified: verifiedCount,
                        total: required.length,
                    })}
                </Text>
            )}

            {/* The games, by block. Sideways when a long series with tiebreaks outgrows the card. */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-3"
                style={{ flexGrow: 0, flexShrink: 0 }}
                contentContainerStyle={{ gap: 16 }}
            >
                {blocks.map(block => (
                    <View key={block.seriesNumber}>
                        {/* Block names only matter once there is more than one block. */}
                        {blocks.length > 1 && (
                            <Text numberOfLines={1} className="text-[10px] font-bold text-slate-500 mb-1.5">
                                {seriesBlockLabel(block.seriesNumber)}
                            </Text>
                        )}
                        <View className="flex-row" style={{ gap: 6 }}>
                            {block.slots.map(slot => {
                                const key = verificationGameKey(slot);
                                const selected = key === openKey;
                                return (
                                    <GameTile
                                        key={key}
                                        slot={slot}
                                        state={states.get(key)!}
                                        selected={selected}
                                        onPress={() => setSelection({ scope, key: selected ? null : key })}
                                    />
                                );
                            })}
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* The open game: its state and score, then its players and the Verify call. */}
            {open && openState && (
                <Animated.View
                    key={openKey}
                    entering={FadeIn.duration(160)}
                    className={cn(
                        'mt-3 rounded-2xl border overflow-hidden',
                        openState.everyone ? 'border-primary/25 bg-primary/[0.04]'
                            : openState.needsViewer ? 'border-warning/30 bg-warning/[0.04]'
                                : 'border-white/[0.08] bg-white/[0.02]',
                    )}
                >
                    {/* The header closes the game again — tapping its tile a second time does too. */}
                    <Pressable
                        onPress={() => setSelection({ scope, key: null })}
                        accessibilityRole="button"
                        accessibilityLabel={tCommon('close')}
                        accessibilityState={{ expanded: true }}
                        className="flex-row items-center gap-2.5 px-3 pt-3 active:opacity-70"
                    >
                        <View className="flex-1 min-w-0">
                            {blocks.length > 1 && (
                                <Text className="text-[10px] text-slate-500 font-bold">{seriesBlockLabel(open.seriesNumber)}</Text>
                            )}
                            <Text className="text-[13px] font-bold text-white">{t('series.gameN', { n: open.gameNumber })}</Text>
                            <Text numberOfLines={1} className="text-[11px] font-semibold mt-0.5" style={{ color: openState.statusColor }}>
                                {openState.status}
                            </Text>
                            {!!openState.concern && !!openState.concernText && (
                                <View className="flex-row items-center gap-1 mt-1">
                                    <Ionicons name="warning" size={12} color={CONCERN_COLOR[openState.concern]} />
                                    <Text numberOfLines={1} className="flex-1 text-[11px] font-black" style={{ color: CONCERN_COLOR[openState.concern] }}>
                                        {openState.concernText}
                                    </Text>
                                </View>
                            )}
                        </View>
                        {!!open.score && (
                            <Text className="text-sm font-black text-slate-300" style={{ fontVariant: ['tabular-nums'] }}>
                                {open.score.homeScore} : {open.score.awayScore}
                            </Text>
                        )}
                        <Ionicons name="chevron-up" size={16} color={COLORS.slate400} />
                    </Pressable>
                    <SingleGameVerificationCard
                        {...props}
                        compact
                        className={undefined}
                        // A game the series ended before is shown, never offered.
                        panel={{ ...panel, mine: open.mine, records: open.records, canVerify: open.role !== 'notPlayed' && open.canVerify }}
                        onVerify={() => props.onVerify({ seriesNumber: open.seriesNumber, gameNumber: open.gameNumber })}
                    />
                </Animated.View>
            )}
        </View>
    );
}

/**
 * The verification of one game — the whole card for a Bo1, the body of an opened row in a series.
 *
 * For the player who still has to verify it is a call to action — the three steps and the button.
 * Once they have, their green player row can expand to show the proof. An organizer
 * can expand each player's full record (recording, biometric, device, flags) and any attempt
 * that failed. The panel shape is decided by the server (see MatchVerificationPanelDto), so a player
 * never receives the device details this card would otherwise have to hide.
 */
function SingleGameVerificationCard({
    panel,
    isLoading,
    currentUserId,
    allowVerify,
    onVerify,
    onOpenEvidence,
    onOpenProfile,
    className,
    compact,
}: Omit<ResultVerificationCardProps, 'slots' | 'onVerify'> & { onVerify: () => void; compact?: boolean }) {
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
    const phonePending = allowVerify && panel.required && panel.phoneApprovalPending && !iVerified;
    const needsAction = allowVerify && panel.canVerify && !iVerified && !phonePending;
    // The viewer's own record may contain more detail than the row in records.
    const listedRecords = playerRecords
        .filter(r => panel.isManager || !needsAction || !sameId(r.userId, currentUserId))
        .map(r => mine && sameId(r.userId, currentUserId) ? mine : r);
    if (iVerified && mine && !listedRecords.some(r => sameId(r.userId, mine.userId))) {
        listedRecords.push(mine);
    }

    const accent = iVerified ? COLORS.primary : needsAction ? COLORS.warning : COLORS.info;
    const reviewConcern = panel.isManager ? worstConcern(listedRecords.map(recordConcern)) : null;

    return (
        <View
            className={cn(
                compact ? 'px-3 pb-3 overflow-hidden' : 'rounded-[24px] border p-4 overflow-hidden',
                !compact && (iVerified
                    ? 'bg-primary/[0.05] border-primary/25'
                    : needsAction
                        ? 'bg-warning/[0.06] border-warning/30'
                        : 'bg-white/[0.03] border-white/[0.08]'),
                className,
            )}
        >
            {!compact && <LinearGradient
                colors={[accent + '1A', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />}

            {/* Header */}
            {!compact && <View className="flex-row items-center gap-2">
                <View
                    className="w-7 h-7 rounded-xl items-center justify-center"
                    style={{ backgroundColor: accent + '26' }}
                >
                    <Ionicons name={iVerified ? 'shield-checkmark' : 'shield-half-outline'} size={15} color={accent} />
                </View>
                <Text numberOfLines={1} className="flex-1 text-[10px] font-black text-white uppercase tracking-[2px]">
                    {t('verification.title')}
                </Text>
                {!!reviewConcern && <ReviewPill concern={reviewConcern} />}
                {allowVerify && panel.required && !iVerified && (
                    <View className="px-2 py-[3px] rounded-md border border-warning/30 bg-warning/10">
                        <Text
                            numberOfLines={1}
                            className="text-[8px] font-black uppercase tracking-[1.5px] text-warning"
                        >
                            {t('verification.requiredPill')}
                        </Text>
                    </View>
                )}
            </View>}

            {/* The player who still has to verify: what to do, in the order they will do it. */}
            {phonePending && (
                <View className="flex-row items-center gap-2 mt-3" accessibilityLiveRegion="polite">
                    <Ionicons name="hourglass-outline" size={17} color={COLORS.warning} />
                    <Text className="flex-1 text-[13px] font-semibold text-warning">
                        {t('verification.phoneApprovalPending')}
                    </Text>
                </View>
            )}
            {needsAction && (
                <>
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
                                <Text className="flex-1 text-[12px] font-bold text-slate-300">
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
