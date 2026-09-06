import React, { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { cn, formatDateTimeShort, parseUtcDate } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import i18n from '../../i18n';

/** One side of the fixture, as the organizer projection sends it. */
export interface AdminAvailabilitySide {
    userId?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    /** UTC ISO hours this side offered. */
    slots?: string[] | null;
    /** Null on matches whose slots predate the timestamp column — "unknown", not "never". */
    submittedOn?: string | null;
    hasSubmitted?: boolean;
}

export interface AdminAvailability {
    matchId?: string;
    confirmedTime?: string | null;
    matchDeadline?: string | null;
    home: AdminAvailabilitySide;
    away: AdminAvailabilitySide;
    /** Hours both sides offered. Empty while one is silent AND when the two simply never met. */
    overlappingSlots?: string[] | null;
}

/** Whether a side answered. The slots are the truth — the timestamp is missing on old rows. */
const answered = (side: AdminAvailabilitySide) =>
    side?.hasSubmitted ?? (side?.slots?.length ?? 0) > 0;

type Verdict = 'scheduled' | 'noOverlap' | 'waitingOne' | 'waitingBoth';

/**
 * Groups a side's hours under their day, so twelve slots read as two lines instead of twelve
 * chips: "Sep 4 · 18:00, 19:00, 20:00". Sorted chronologically, since the picker sends them in
 * selection order.
 */
function groupByDay(slots: string[]): { day: string; hours: string }[] {
    const byDay = new Map<string, { sort: number; day: string; hours: { sort: number; label: string }[] }>();

    for (const iso of slots) {
        const date = parseUtcDate(iso);
        if (isNaN(date.getTime())) continue;

        // Keyed on the LOCAL day: an organizer in another timezone must see the hours where
        // they land on their own clock, not on the UTC calendar day.
        const key = date.toDateString();
        if (!byDay.has(key)) {
            byDay.set(key, {
                sort: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
                day: date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
                hours: [],
            });
        }
        byDay.get(key)!.hours.push({
            sort: date.getTime(),
            label: date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false }),
        });
    }

    return [...byDay.values()]
        .sort((a, b) => a.sort - b.sort)
        .map((entry) => ({
            day: entry.day,
            hours: entry.hours.sort((a, b) => a.sort - b.sort).map((h) => h.label).join(', '),
        }));
}

function SideRow({
    side,
    expanded,
    onToggle,
}: {
    side: AdminAvailabilitySide;
    expanded: boolean;
    onToggle: () => void;
}) {
    const { t } = useTranslation('match');
    const { t: tc } = useTranslation('common');

    const slots = side?.slots ?? [];
    const didAnswer = answered(side);
    const days = useMemo(() => (expanded ? groupByDay(slots) : []), [expanded, slots]);
    const name = side?.name || tc('app.tbd');

    return (
        <View className="border-t border-white/[0.06]">
            <PressableScale
                onPress={onToggle}
                disabled={!didAnswer}
                pressedScale={0.99}
                className="flex-row items-center px-4 py-3"
            >
                <PlayerAvatar src={side?.avatarUrl || undefined} name={name} size="sm" />

                <View className="flex-1 ml-3">
                    <Text className="text-[13px] font-bold text-white" numberOfLines={1}>
                        {name}
                    </Text>
                    <Text
                        className={cn('text-[10px] font-bold mt-0.5', didAnswer ? 'text-slate-400' : 'text-destructive')}
                        numberOfLines={1}
                    >
                        {!didAnswer
                            ? t('adminAvailability.noResponse')
                            : side?.submittedOn
                                ? `${t('adminAvailability.slotsCount', { count: slots.length })} · ${formatDateTimeShort(side.submittedOn)}`
                                // Slots without a stamp are pre-migration rows, not a missing answer.
                                : `${t('adminAvailability.slotsCount', { count: slots.length })} · ${t('adminAvailability.timeUnknown')}`}
                    </Text>
                </View>

                <View
                    className={cn(
                        'w-6 h-6 rounded-full items-center justify-center ml-2',
                        didAnswer ? 'bg-primary/15' : 'bg-destructive/15',
                    )}
                >
                    <Ionicons
                        name={didAnswer ? 'checkmark' : 'close'}
                        size={13}
                        color={didAnswer ? COLORS.primary : COLORS.destructive}
                    />
                </View>

                {didAnswer && (
                    <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={COLORS.slate500}
                        style={{ marginLeft: 6 }}
                    />
                )}
            </PressableScale>

            {expanded && days.length > 0 && (
                <View className="px-4 pb-3 -mt-1">
                    {days.map((entry) => (
                        <View key={entry.day} className="flex-row mt-1.5">
                            <Text className="text-[10px] font-black uppercase tracking-wider text-slate-500 w-14">
                                {entry.day}
                            </Text>
                            <Text className="text-[11px] font-semibold text-slate-300 flex-1">{entry.hours}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

const VERDICT_META: Record<Verdict, { icon: keyof typeof Ionicons.glyphMap; color: string; tint: string }> = {
    scheduled: { icon: 'checkmark-circle', color: COLORS.primary, tint: 'bg-primary/[0.08]' },
    noOverlap: { icon: 'git-compare-outline', color: COLORS.warning, tint: 'bg-warning/[0.08]' },
    waitingOne: { icon: 'alert-circle', color: COLORS.destructive, tint: 'bg-destructive/[0.07]' },
    waitingBoth: { icon: 'time-outline', color: COLORS.slate400, tint: 'bg-white/[0.03]' },
};

/**
 * Organizer-only view of who tried to schedule this match. The players' own picker is
 * caller-relative ("my slots" / "theirs"), which says nothing to someone refereeing the fixture —
 * this names both sides, says when each answered, and separates the two cases that look identical
 * from the outside: one player ignored the match, versus both answered and never shared an hour.
 * The second is nobody's fault and must not be settled as a no-show.
 */
export function AdminAvailabilityPanel({
    availability,
    onClearSchedule,
    isClearingSchedule = false,
}: {
    availability: AdminAvailability;
    /** Organizer-only undo of the confirmed kick-off. Omitted where the action must not be offered. */
    onClearSchedule?: () => void;
    isClearingSchedule?: boolean;
}) {
    const { t } = useTranslation('match');
    const [expandedSide, setExpandedSide] = useState<'home' | 'away' | null>(null);

    const homeAnswered = answered(availability.home);
    const awayAnswered = answered(availability.away);
    const overlap = availability.overlappingSlots ?? [];

    const verdict: Verdict = availability.confirmedTime
        ? 'scheduled'
        : homeAnswered && awayAnswered
            ? 'noOverlap'
            : homeAnswered || awayAnswered
                ? 'waitingOne'
                : 'waitingBoth';

    // Who is being waited on — named, so the organizer doesn't have to re-read the rows.
    const silentName = homeAnswered ? availability.away?.name : availability.home?.name;
    const meta = VERDICT_META[verdict];

    const verdictText =
        verdict === 'scheduled'
            ? t('adminAvailability.scheduledFor', { time: formatDateTimeShort(availability.confirmedTime) })
            : verdict === 'noOverlap'
                ? t('adminAvailability.noOverlap')
                : verdict === 'waitingOne'
                    ? t('adminAvailability.waitingOne', { name: silentName || t('adminAvailability.opponent') })
                    : t('adminAvailability.waitingBoth');

    const verdictHint =
        verdict === 'noOverlap'
            ? t('adminAvailability.noOverlapHint')
            : verdict === 'waitingOne'
                ? t('adminAvailability.waitingOneHint')
                : verdict === 'waitingBoth'
                    ? t('adminAvailability.waitingBothHint')
                    : null;

    return (
        <View className="bg-card rounded-[20px] border border-white/10 overflow-hidden">
            {/* Header */}
            <View className="flex-row items-center px-4 py-3">
                <View className="w-9 h-9 rounded-2xl bg-info/15 items-center justify-center">
                    <Ionicons name="calendar-outline" size={17} color={COLORS.info} />
                </View>
                <View className="flex-1 ml-3">
                    <Text className="text-[11px] font-black text-info uppercase tracking-[2px]">
                        {t('adminAvailability.title')}
                    </Text>
                    <Text className="text-[10px] text-slate-500 font-bold mt-0.5" numberOfLines={1}>
                        {t('adminAvailability.subtitle')}
                    </Text>
                </View>
                {overlap.length > 0 && (
                    <View className="bg-primary/10 border border-primary/25 rounded-lg px-2 py-1">
                        <Text className="text-[9px] font-black uppercase tracking-wider text-primary">
                            {t('adminAvailability.sharedHours', { count: overlap.length })}
                        </Text>
                    </View>
                )}
            </View>

            <SideRow
                side={availability.home}
                expanded={expandedSide === 'home'}
                onToggle={() => setExpandedSide((current) => (current === 'home' ? null : 'home'))}
            />
            <SideRow
                side={availability.away}
                expanded={expandedSide === 'away'}
                onToggle={() => setExpandedSide((current) => (current === 'away' ? null : 'away'))}
            />

            {/* Verdict — the line that tells the organizer what they are actually looking at. */}
            <View className={cn('flex-row items-start px-4 py-3 border-t border-white/[0.06]', meta.tint)}>
                <Ionicons name={meta.icon} size={14} color={meta.color} style={{ marginTop: 1 }} />
                <View className="flex-1 ml-2.5">
                    <Text className="text-[11px] font-black" style={{ color: meta.color }}>
                        {verdictText}
                    </Text>
                    {verdictHint && (
                        <Text className="text-[10px] text-slate-400 mt-1 leading-4">{verdictHint}</Text>
                    )}
                </View>
            </View>

            {/* Undo. Only ever on a match that actually has a time — there is nothing to cancel
                otherwise — and only for callers that pass the handler, which is the organizer view. */}
            {onClearSchedule && verdict === 'scheduled' && (
                <View className="px-4 pt-3 pb-4 border-t border-white/[0.06]">
                    <PressableScale
                        onPress={onClearSchedule}
                        disabled={isClearingSchedule}
                        className="flex-row items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/[0.09] py-3"
                    >
                        {isClearingSchedule ? (
                            <ActivityIndicator size="small" color={COLORS.destructive} />
                        ) : (
                            <>
                                <Ionicons name="close-circle-outline" size={15} color={COLORS.destructive} />
                                <Text
                                    className="ml-2 text-[12px] font-black uppercase tracking-wider text-destructive"
                                    numberOfLines={1}
                                >
                                    {t('adminAvailability.clearSchedule')}
                                </Text>
                            </>
                        )}
                    </PressableScale>
                    <Text className="text-[10px] text-slate-500 font-semibold mt-2 leading-4 text-center">
                        {t('adminAvailability.clearScheduleHint')}
                    </Text>
                </View>
            )}
        </View>
    );
}
