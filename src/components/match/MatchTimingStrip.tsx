import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn, parseUtcDate } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

interface MatchTimingStripProps {
    /** Agreed match time as a raw backend timestamp — preferred, it renders as clock + date. */
    matchTimeIso?: string | null;
    /** Already-localized match time, used when the host only has a display string. */
    matchTimeText?: string | null;
    /** Round deadline as a raw backend timestamp. 'TBD' / empty renders the "not set" state. */
    deadline?: string | null;
    /** While the host is still loading the match, the deadline shows placeholders instead of
     *  claiming "Not set" — otherwise every open flashes a wrong answer for a frame. */
    isLoading?: boolean;
    className?: string;
}

type Tone = 'danger' | 'warning' | 'calm' | 'good';

const CHIP_BG: Record<Tone, string> = {
    danger: 'bg-destructive/15 border-destructive/25',
    warning: 'bg-warning/15 border-warning/25',
    calm: 'bg-white/[0.06] border-white/10',
    good: 'bg-primary/15 border-primary/25',
};

const CHIP_TEXT: Record<Tone, string> = {
    danger: 'text-destructive',
    warning: 'text-warning',
    calm: 'text-slate-400',
    good: 'text-primary',
};

// A timestamp we can actually work with, or null for 'TBD' / missing / junk input.
function toDate(value?: string | null): Date | null {
    if (!value || value === 'TBD') return null;
    const d = parseUtcDate(value);
    return isNaN(d.getTime()) ? null : d;
}

const formatClock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const formatDay = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

const dayDelta = (d: Date, now: number) => {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTarget = new Date(d);
    startOfTarget.setHours(0, 0, 0, 0);
    return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
};

// How much room is left. Sub-day windows are the ones players actually need to feel,
// so anything under a day reads in hours/minutes and escalates in colour.
function describeRemaining(deadline: Date, now: number): { label: string; tone: Tone } {
    const minutes = Math.floor((deadline.getTime() - now) / 60000);
    if (minutes <= 0) return { label: 'Overdue', tone: 'danger' };
    if (minutes < 60) return { label: `${minutes}m left`, tone: 'danger' };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { label: `${hours}h left`, tone: hours < 6 ? 'danger' : 'warning' };
    const days = Math.floor(hours / 24);
    return { label: `${days}d left`, tone: days <= 1 ? 'warning' : 'calm' };
}

// Only worth a chip when the match is close enough to change what you do today.
function describeMatchTime(matchDate: Date, now: number): { label: string; tone: Tone } | null {
    const minutes = Math.floor((matchDate.getTime() - now) / 60000);
    if (minutes <= 0) return null;
    if (minutes < 60) return { label: 'Starting soon', tone: 'good' };
    const delta = dayDelta(matchDate, now);
    if (delta === 0) return { label: 'Today', tone: 'good' };
    if (delta === 1) return { label: 'Tomorrow', tone: 'calm' };
    return null;
}

function TimingChip({ label, tone }: { label: string; tone: Tone }) {
    return (
        <View className={cn('self-start mt-1.5 px-2 py-0.5 rounded-md border', CHIP_BG[tone])}>
            <Text numberOfLines={1} className={cn('text-[9px] font-black uppercase tracking-wider', CHIP_TEXT[tone])}>
                {label}
            </Text>
        </View>
    );
}

/**
 * Side-by-side "when is it / when is it due" header for a match.
 *
 * The agreed kick-off used to be the only time on the match screen, so neither players nor
 * admins could see the round deadline they were actually being judged against without
 * backing out to the bracket. Both live here now, with a live-ticking countdown on the
 * deadline so "how long have I got" is answerable at a glance.
 */
export function MatchTimingStrip({
    matchTimeIso,
    matchTimeText,
    deadline,
    isLoading = false,
    className,
}: MatchTimingStripProps) {
    const matchDate = useMemo(() => toDate(matchTimeIso), [matchTimeIso]);
    const deadlineDate = useMemo(() => toDate(deadline), [deadline]);

    // Keep the countdown honest while the screen stays open (the modal unmounts on close,
    // so the interval dies with it).
    const [now, setNow] = useState(() => Date.now());
    const hasCountdown = !!deadlineDate || !!matchDate;
    useEffect(() => {
        if (!hasCountdown) return;
        const id = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(id);
    }, [hasCountdown]);

    const remaining = deadlineDate ? describeRemaining(deadlineDate, now) : null;
    const upcoming = matchDate ? describeMatchTime(matchDate, now) : null;

    return (
        <View className={cn('flex-row gap-3', className)}>
            {/* Match time */}
            <View className="flex-1 rounded-[20px] bg-white/[0.03] border border-white/[0.06] p-3">
                <View className="flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={11} color={COLORS.primary} />
                    <Text numberOfLines={1} className="flex-1 text-[9px] font-black text-primary uppercase tracking-[2px]">
                        Match Time
                    </Text>
                </View>
                {matchDate ? (
                    <>
                        <Text numberOfLines={1} className="text-[17px] font-black text-white mt-1.5">{formatClock(matchDate)}</Text>
                        <Text numberOfLines={1} className="text-[11px] font-bold text-slate-500 mt-0.5">{formatDay(matchDate)}</Text>
                    </>
                ) : (
                    <Text numberOfLines={2} className="text-[15px] font-black text-white mt-1.5">
                        {matchTimeText || 'TBD'}
                    </Text>
                )}
                {upcoming && <TimingChip label={upcoming.label} tone={upcoming.tone} />}
            </View>

            {/* Deadline */}
            <View className="flex-1 rounded-[20px] bg-warning/[0.06] border border-warning/20 p-3">
                <View className="flex-row items-center gap-1.5">
                    <Ionicons name="hourglass-outline" size={11} color={COLORS.warning} />
                    <Text numberOfLines={1} className="flex-1 text-[9px] font-black text-warning uppercase tracking-[2px]">
                        Deadline
                    </Text>
                </View>
                {deadlineDate ? (
                    <>
                        <Text numberOfLines={1} className="text-[17px] font-black text-white mt-1.5">{formatClock(deadlineDate)}</Text>
                        <Text numberOfLines={1} className="text-[11px] font-bold text-slate-500 mt-0.5">{formatDay(deadlineDate)}</Text>
                    </>
                ) : (
                    <>
                        <Text numberOfLines={1} className="text-[17px] font-black text-slate-600 mt-1.5">
                            {isLoading ? '—' : 'Not set'}
                        </Text>
                        <Text numberOfLines={1} className="text-[11px] font-bold text-slate-600 mt-0.5">
                            {isLoading ? ' ' : 'No round deadline'}
                        </Text>
                    </>
                )}
                {remaining && <TimingChip label={remaining.label} tone={remaining.tone} />}
            </View>
        </View>
    );
}
