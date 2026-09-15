import { useTranslation } from 'react-i18next';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';
import { cn, parseUtcDate } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import { dateLocale } from '../../i18n';

/** The ready-check state of a match, exactly as every backend payload carries it. */
export interface MatchCheckInState {
    homeCheckedInOn?: string | null;
    awayCheckedInOn?: string | null;
    checkInOpensAt?: string | null;
    checkInDeadline?: string | null;
}

interface MatchCheckInPanelProps {
    matchId: string;
    /** Tournament setting. The panel renders nothing when the tournament runs no ready check. */
    enabled?: boolean;
    /** Absent kick-off = no ready check on this match: the pair arranged it themselves. */
    scheduledTimeIso?: string | null;
    state: MatchCheckInState;
    /** Grace window in minutes — the number the "what happens if nobody presses this" line quotes. */
    graceMinutes?: number | null;
    /** true = the viewer plays home, false = away, null = watching (organizer). */
    isHome?: boolean | null;
    homeLabel: string;
    awayLabel: string;
    /** Fresh state from the server after a successful check-in, so the host can keep its copy. */
    onCheckedIn?: (state: MatchCheckInState) => void;
    className?: string;
}

const toDate = (value?: string | null): Date | null => {
    if (!value) return null;
    const d = parseUtcDate(value);
    return isNaN(d.getTime()) ? null : d;
};

const formatClock = (d: Date) =>
    d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Exact local time, carrying the date whenever it is not today — the same rule as
 * formatLocalDateTime in lib/utils, which takes a string where this takes a Date we have already
 * parsed. The clock alone is not enough for a window that opens days out: "opens at 19:45" on a
 * Saturday fixture reads as tonight, and that is the one misreading here that costs a match.
 */
const formatStamp = (d: Date) => {
    const time = formatClock(d);
    if (d.toDateString() === new Date().toDateString()) return time;

    return `${d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} ${time}`;
};

/**
 * mm:ss inside the last hour — that is the window a player actually feels, and the seconds are
 * the whole point of it. Above an hour (an organizer may set a grace of up to three) the seconds
 * are noise on a number nobody is racing yet, so it reads h:mm instead.
 */
const formatCountdown = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');

    return hours > 0 ? `${hours}:${pad(minutes)}` : `${minutes}:${pad(seconds)}`;
};

// Digits that don't dance. A proportional font re-measures the row on every tick, which reads as
// the number twitching once a second — exactly the wrong texture for a countdown someone is
// watching because their match is on the line.
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * One side's line in the panel: who they are, and whether they have confirmed.
 *
 * Module scope, NOT a closure inside the panel — declared in the render body it is a fresh
 * component type on every render, so React tears both rows down and rebuilds them on each tick
 * of a countdown that ticks once a second.
 */
function SideRow({ label, at, isYou }: { label: string; at: Date | null; isYou: boolean }) {
    const { t } = useTranslation('match');

    return (
        <View className="flex-row items-center gap-2">
            <Ionicons
                name={at ? 'checkmark-circle' : 'ellipse-outline'}
                size={15}
                color={at ? COLORS.primary : COLORS.slate600}
            />
            <Text numberOfLines={1} className={cn('flex-1 text-[13px] font-bold', at ? 'text-slate-200' : 'text-slate-500')}>
                {label}
                {isYou ? ` ${t('checkIn.youSuffix')}` : ''}
            </Text>
            <Text numberOfLines={1} className={cn('text-[11px] font-black', at ? 'text-primary' : 'text-slate-600')}>
                {at ? t('checkIn.readyAt', { time: formatClock(at) }) : t('checkIn.notReady')}
            </Text>
        </View>
    );
}

/**
 * The ready check on a scheduled match: both sides confirm they are at the keyboard, and the one
 * who turns up alone takes the match when the grace period runs out.
 *
 * Everything here is a view of server state — the panel never decides an outcome, it only shows
 * what has been confirmed and how long is left. The forfeit itself is ruled server-side by the
 * deadline sweep, which is why an expired window shows "settling" rather than a result: the client
 * must never be the thing that says who won.
 *
 * Four shapes, because the four moments want different things from the reader:
 *   • not open yet  — one quiet line; nothing to do until 15 minutes before kick-off
 *   • open          — the countdown as the hero, with the button under it
 *   • you are in    — the countdown stays (it is your opponent's clock now), the button goes
 *   • both in       — collapses to a single green line, so the score form gets the screen
 */
/**
 * Everything the ready check knows, shared by the full panel and the one-line bar so the two can
 * never disagree about who is in, how long is left, or what pressing the button does.
 */
function useCheckIn({
    matchId,
    enabled,
    scheduledTimeIso,
    state,
    isHome,
    onCheckedIn,
}: Pick<MatchCheckInPanelProps, 'matchId' | 'enabled' | 'scheduledTimeIso' | 'state' | 'isHome' | 'onCheckedIn'>) {
    const { t } = useTranslation('match');

    const [local, setLocal] = useState<MatchCheckInState>(state);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The host refetches the match on all sorts of events; take its word over ours except while
    // our own request is still in flight.
    useEffect(() => {
        if (!isSubmitting) setLocal(state);
    }, [state, isSubmitting]);

    const kickOff = useMemo(() => toDate(scheduledTimeIso), [scheduledTimeIso]);
    const opensAt = useMemo(
        () => toDate(local.checkInOpensAt) ?? (kickOff ? new Date(kickOff.getTime() - 15 * 60000) : null),
        [local.checkInOpensAt, kickOff],
    );
    const deadline = useMemo(() => toDate(local.checkInDeadline), [local.checkInDeadline]);
    const homeIn = useMemo(() => toDate(local.homeCheckedInOn), [local.homeCheckedInOn]);
    const awayIn = useMemo(() => toDate(local.awayCheckedInOn), [local.awayCheckedInOn]);

    const bothIn = !!homeIn && !!awayIn;

    const [now, setNow] = useState(() => Date.now());

    const isOpen = !opensAt || now >= opensAt.getTime();
    const expired = !!deadline && now >= deadline.getTime() && !bothIn;

    // Which of the three clocks this match is on. Derived from `now` but changing only when a
    // boundary is actually crossed, so the effect below re-arms exactly twice in a match's life
    // instead of on every tick.
    const phase: 'waiting' | 'live' | 'over' = expired ? 'over' : isOpen ? 'live' : 'waiting';

    // The tick, gated hard. This hook runs for EVERY match card in a list — including fixtures
    // days out and tournaments that run no ready check at all — so an ungated 1s interval (what
    // this was) re-rendered the whole list once a second, for days, to display nothing at all.
    //
    //   • waiting — 60s, the same cadence MatchTimingStrip uses. Nothing in this state is finer
    //     than "opens at HH:MM", and it re-arms itself until the window opens rather than
    //     overflowing a multi-day setTimeout.
    //   • live    — 1s. This is a countdown someone is watching while their opponent is late;
    //     seconds are the entire point of it.
    //   • over    — nothing. The verdict is the server's now, and the host polls for it.
    useEffect(() => {
        if (!enabled || !kickOff || bothIn || phase === 'over') return;

        const id = setInterval(() => setNow(Date.now()), phase === 'live' ? 1000 : 60000);
        return () => clearInterval(id);
    }, [enabled, kickOff, bothIn, phase]);

    const mine = isHome == null ? null : isHome ? homeIn : awayIn;
    const theirs = isHome == null ? null : isHome ? awayIn : homeIn;
    const isPlayer = isHome != null;
    const canPress = isPlayer && !mine && isOpen && !expired && !bothIn;

    const remaining = deadline ? deadline.getTime() - now : null;
    // Under a minute the countdown stops being information and becomes a warning.
    const critical = remaining != null && remaining <= 60000;

    const submit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.MATCH_CHECK_IN(matchId), { method: 'POST' });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                // The server's reason (e.g. "check-in closed") is localized and worth showing; a
                // network failure never gets here — it throws out of fetch with an English message,
                // which is why the catch below falls back to our own string for that case.
                const serverMessage = data?.message || data?.Message;
                const httpError = new Error(serverMessage || t('checkIn.failed'));
                (httpError as any).fromServer = true;
                throw httpError;
            }

            const next: MatchCheckInState = {
                homeCheckedInOn: data?.homeCheckedInOn ?? data?.HomeCheckedInOn ?? null,
                awayCheckedInOn: data?.awayCheckedInOn ?? data?.AwayCheckedInOn ?? null,
                checkInOpensAt: data?.checkInOpensAt ?? data?.CheckInOpensAt ?? local.checkInOpensAt,
                checkInDeadline: data?.checkInDeadline ?? data?.CheckInDeadline ?? local.checkInDeadline,
            };

            setLocal(next);
            // Checking in is a commitment against a running clock — missing it forfeits the match.
            // The buzz is the confirmation, for the case where the phone is not being looked at.
            hapticSuccess();
            onCheckedIn?.(next);
        } catch (err: any) {
            hapticError();
            setError(err?.fromServer && err?.message ? err.message : t('checkIn.failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        kickOff, opensAt, deadline, homeIn, awayIn, bothIn,
        isOpen, expired, mine, theirs, isPlayer, canPress,
        remaining, critical, isSubmitting, error, submit,
    };
}

export function MatchCheckInPanel({
    matchId,
    enabled,
    scheduledTimeIso,
    state,
    graceMinutes,
    isHome,
    homeLabel,
    awayLabel,
    onCheckedIn,
    className,
}: MatchCheckInPanelProps) {
    const { t } = useTranslation('match');
    const {
        kickOff, opensAt, homeIn, awayIn, bothIn,
        isOpen, expired, mine, theirs, isPlayer, canPress,
        remaining, critical, isSubmitting, error, submit,
    } = useCheckIn({ matchId, enabled, scheduledTimeIso, state, isHome, onCheckedIn });

    if (!enabled || !kickOff) return null;

    /* ── Both in: one line. The check is done; the screen belongs to the score now. ─────────── */
    if (bothIn) {
        return (
            <View
                className={cn(
                    'flex-row items-center gap-2 rounded-[20px] border border-primary/25 bg-primary/[0.06] px-3.5 py-2.5',
                    className,
                )}
            >
                <Ionicons name="checkmark-done" size={14} color={COLORS.primary} />
                <Text numberOfLines={1} className="text-[10px] font-black text-primary uppercase tracking-[1.5px]">
                    {t('checkIn.bothReady')}
                </Text>
                <Text numberOfLines={1} className="flex-1 text-[11px] font-bold text-slate-400 text-right">
                    {t('checkIn.bothReadyTail')}
                </Text>
            </View>
        );
    }

    /* ── Window not open yet: a quiet line, not a card. Nothing to do for another few hours. ── */
    if (!isOpen) {
        return (
            <View
                className={cn(
                    'flex-row items-center gap-2 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5',
                    className,
                )}
            >
                <Ionicons name="hand-left-outline" size={14} color={COLORS.slate400} />
                <Text numberOfLines={1} className="text-[10px] font-black text-slate-400 uppercase tracking-[1.5px]">
                    {t('checkIn.title')}
                </Text>
                <Text numberOfLines={1} className="flex-1 text-[11px] font-bold text-slate-500 text-right">
                    {t('checkIn.opensAt', { time: formatStamp(opensAt ?? kickOff) })}
                </Text>
            </View>
        );
    }

    /* ── Settling: the window closed and the server is ruling. Seconds, not minutes. ───────── */
    if (expired) {
        return (
            <View
                className={cn(
                    'rounded-[20px] border border-warning/25 bg-warning/[0.07] px-3.5 py-3',
                    className,
                )}
            >
                <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color={COLORS.warning} />
                    <Text numberOfLines={1} className="flex-1 text-[10px] font-black text-warning uppercase tracking-[1.5px]">
                        {t('checkIn.settling')}
                    </Text>
                </View>
                <Text className="text-[10px] font-medium text-slate-500 mt-1.5 leading-4">
                    {t('checkIn.hintSettling')}
                </Text>
            </View>
        );
    }

    /* ── Live window ──────────────────────────────────────────────────────────────────────── */
    // Amber while the viewer is the one holding the match up, primary once they are in and it is
    // the opponent's clock running.
    const urgent = isPlayer && !mine;
    const accent = critical ? COLORS.destructive : urgent ? COLORS.warning : COLORS.primary;

    const headline = urgent
        ? t('checkIn.yourTurn')
        : mine
            ? t('checkIn.opponentTurn')
            : t('checkIn.title');

    return (
        <View
            className={cn(
                'rounded-[20px] border p-3.5 overflow-hidden',
                critical
                    ? 'bg-destructive/[0.07] border-destructive/30'
                    : urgent
                        ? 'bg-warning/[0.07] border-warning/30'
                        : 'bg-white/[0.03] border-white/[0.08]',
                className,
            )}
            style={{
                shadowColor: accent,
                shadowOpacity: urgent ? 0.18 : 0.1,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: urgent ? 6 : 0,
            }}
        >
            {/* Tinted wash behind the whole card, the same one the bracket uses for a live state. */}
            <LinearGradient
                colors={[accent + (urgent ? '1F' : '12'), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            <View className="flex-row items-center gap-1.5">
                <Ionicons name={urgent ? 'alert-circle' : 'hand-left-outline'} size={12} color={accent} />
                <Text
                    numberOfLines={1}
                    className={cn(
                        'flex-1 text-[9px] font-black uppercase tracking-[2px]',
                        critical ? 'text-destructive' : urgent ? 'text-warning' : 'text-primary',
                    )}
                >
                    {headline}
                </Text>
            </View>

            {/* The clock, as the hero. It is the whole point of the panel: how long before this
                match is decided without being played. */}
            {remaining != null && (
                <View className="flex-row items-baseline gap-2 mt-1.5">
                    <Text
                        style={TABULAR}
                        className={cn(
                            'text-[30px] font-black leading-[34px]',
                            critical ? 'text-destructive' : urgent ? 'text-warning' : 'text-white',
                        )}
                    >
                        {formatCountdown(remaining)}
                    </Text>
                    <Text numberOfLines={1} className="flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-[1px]">
                        {urgent ? t('checkIn.beforeForfeit') : t('checkIn.opponentDeadline')}
                    </Text>
                </View>
            )}

            {/* Who has confirmed */}
            <View className="gap-1.5 mt-3">
                <SideRow label={homeLabel} at={homeIn} isYou={isHome === true} />
                <SideRow label={awayLabel} at={awayIn} isYou={isHome === false} />
            </View>

            {canPress && (
                <PressableScale
                    onPress={submit}
                    disabled={isSubmitting}
                    // The single highest-stakes tap in the app: pressing it is what keeps the match
                    // from being awarded to the other side. Worth spelling out for a screen reader
                    // rather than leaving it as the bare "I'm ready" label.
                    accessibilityRole="button"
                    accessibilityLabel={t('checkIn.cta')}
                    accessibilityHint={t('checkIn.a11yHint')}
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    className="h-12 rounded-2xl overflow-hidden mt-3"
                    style={{
                        shadowColor: COLORS.primary,
                        shadowOpacity: 0.38,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 7 },
                        elevation: 9,
                    }}
                >
                    <LinearGradient
                        colors={isSubmitting ? ['#334155', '#1E293B'] : ['#10B981', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#E2E8F0" />
                        ) : (
                            <View className="flex-row items-center gap-2">
                                <Ionicons name="flash" size={16} color="#022C22" />
                                <Text numberOfLines={1} className="text-[13px] font-black text-emerald-950 uppercase tracking-[1.5px]">
                                    {t('checkIn.cta')}
                                </Text>
                            </View>
                        )}
                    </LinearGradient>
                </PressableScale>
            )}

            {/* One line on what happens next — and it has to be the RIGHT one: telling a player
                "your opponent is ready" when nobody is would be worse than saying nothing. */}
            <Text className="text-[10px] font-medium text-slate-500 mt-2.5 leading-4">
                {mine
                    ? t('checkIn.hintWaitingOpponent')
                    : isPlayer && theirs
                        ? t('checkIn.hintOpponentWaiting')
                        : t('checkIn.hintNobodyYet', { count: graceMinutes ?? 10 })}
            </Text>

            {!!error && (
                <Text className="text-[11px] font-bold text-destructive mt-2">{error}</Text>
            )}
        </View>
    );
}


/**
 * The same ready check, one line high, for a match card in a list.
 *
 * This is where the feature is actually used: the push lands, the player opens the app on Home,
 * and the match they have to confirm for is right there. Making them open the match first would
 * spend the seconds the countdown is measuring. Renders nothing unless this match is running a
 * check that is already open.
 */
export function MatchCheckInBar({
    matchId,
    enabled,
    scheduledTimeIso,
    state,
    isHome,
    onCheckedIn,
    className,
}: Omit<MatchCheckInPanelProps, 'homeLabel' | 'awayLabel' | 'graceMinutes'>) {
    const { t } = useTranslation('match');
    const {
        kickOff, deadline, bothIn, isOpen, expired, mine, isPlayer, canPress,
        remaining, critical, isSubmitting, error, submit,
    } = useCheckIn({ matchId, enabled, scheduledTimeIso, state, isHome, onCheckedIn });

    // A list card is not the place for "opens in 3 hours", a settled match, or a check that is
    // over — the deadline strip beside it already carries the timing story. No deadline means the
    // server has nothing left to check (not Scheduled any more, or already ruled): without this,
    // `expired` can never turn true and the bar would offer a button the server refuses forever.
    if (!enabled || !kickOff || !deadline || bothIn || !isOpen || expired || !isPlayer) return null;

    const accent = critical ? COLORS.destructive : mine ? COLORS.primary : COLORS.warning;

    return (
        <View className={className}>
        <View
            className={cn(
                'flex-row items-center gap-2 rounded-2xl border px-2.5 py-2',
                critical
                    ? 'border-destructive/30 bg-destructive/[0.08]'
                    : mine
                        ? 'border-primary/25 bg-primary/[0.06]'
                        : 'border-warning/30 bg-warning/[0.08]',
            )}
        >
            <Ionicons name={mine ? 'checkmark-circle' : 'alert-circle'} size={13} color={accent} />

            <Text
                numberOfLines={1}
                className={cn(
                    'text-[9px] font-black uppercase tracking-[1.5px]',
                    critical ? 'text-destructive' : mine ? 'text-primary' : 'text-warning',
                )}
            >
                {mine ? t('checkIn.youAreIn') : t('checkIn.yourTurn')}
            </Text>

            {remaining != null && (
                <Text
                    style={TABULAR}
                    numberOfLines={1}
                    className={cn(
                        'flex-1 text-[13px] font-black',
                        critical ? 'text-destructive' : mine ? 'text-slate-300' : 'text-warning',
                    )}
                >
                    {formatCountdown(remaining)}
                </Text>
            )}

            {canPress && (
                <PressableScale
                    onPress={submit}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel={t('checkIn.cta')}
                    accessibilityHint={t('checkIn.a11yHint')}
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    className="h-8 px-3 rounded-xl bg-primary items-center justify-center flex-row gap-1.5"
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color="#022C22" />
                    ) : (
                        <>
                            <Ionicons name="flash" size={12} color="#022C22" />
                            <Text numberOfLines={1} className="text-[11px] font-black text-emerald-950 uppercase tracking-[1px]">
                                {t('checkIn.ctaShort')}
                            </Text>
                        </>
                    )}
                </PressableScale>
            )}
        </View>

            {/* The failure has to be visible here: this is where the check-in is actually pressed,
                and a haptic buzz alone reads as success to someone not looking at the phone —
                who then gets forfeited for a request that never reached the server. */}
            {!!error && (
                <Text
                    accessibilityRole="alert"
                    numberOfLines={2}
                    className="text-[11px] font-bold text-destructive mt-1 px-1"
                >
                    {error}
                </Text>
            )}
        </View>
    );
}
