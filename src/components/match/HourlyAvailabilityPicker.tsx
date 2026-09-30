import { useTranslation } from 'react-i18next';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cn, parseUtcDate } from '../../lib/utils';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import i18n, { dateLocale } from '../../i18n';

interface HourlyAvailabilityPickerProps {
    matchId: string;
    deadline: string; // ISO String
    opponentName: string;
    opponentAvatarUrl?: string;
    opponentAvailability?: string[];
    initialSlots?: string[];
    onSubmit: (selectedSlots: string[], dateTimeSlots: string[]) => void | Promise<void>;
    onMarkScheduled?: () => void | Promise<void>;
    /** Opens the opponent's profile from the header row. Only that row: the banner inside the
     *  slot editor stays inert, since leaving from there would drop the unsaved selection. */
    onOpponentPress?: () => void;
}

// Generate hours from 00:00 to 23:00
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Weekday/month names come from Intl in the active language rather than a hardcoded
// English table, so they follow the locale automatically. 'yyyy-MM-dd' stays ISO — it is
// used as a slot key, not shown to the user.
const formatDate = (date: Date, format: string, locale = 'en') => {
    if (format === 'EEE') return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    if (format === 'MMM d') return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    if (format === 'yyyy-MM-dd') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return '';
};

const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

// The real local Date for a slot, built from the 'YYYY-MM-DD' day key and the hour.
// Never `new Date(dayKey)`: a date-only string is parsed as UTC midnight by spec, so on any
// device whose timezone is behind UTC (all of the Americas) it resolves to the PREVIOUS local
// day — which is what used to make every hour of "today" reject the tap.
const slotDateFrom = (dayKey: string, hour: number): Date => {
    const [year, month, day] = dayKey.split('-').map(part => parseInt(part, 10));
    return new Date(year, month - 1, day, hour, 0, 0, 0);
};

// Single source of truth for "this hour can't be offered": the grid greys the cell out with it
// and the tap handler refuses with it, so the two can never disagree again.
const isSlotDisabled = (dayKey: string, hour: number, deadlineDate: Date | null): boolean => {
    const slotTime = slotDateFrom(dayKey, hour).getTime();
    if (slotTime < Date.now()) return true;
    return !!deadlineDate && slotTime > deadlineDate.getTime();
};

const buildDateTimeSlots = (slots: Set<string>) => {
    return Array.from(slots).map(slotId => {
        // slotId is `${dayKey}-${hour}` — the hour is everything past the last dash.
        const cut = slotId.lastIndexOf('-');
        // Local wall-clock hour the user picked, handed to the backend as UTC.
        return slotDateFrom(slotId.slice(0, cut), parseInt(slotId.slice(cut + 1), 10)).toISOString();
    });
};

export function HourlyAvailabilityPicker({
    matchId,
    deadline,
    opponentName,
    opponentAvatarUrl,
    opponentAvailability = [],
    initialSlots = [],
    onSubmit,
    onMarkScheduled,
    onOpponentPress,
}: HourlyAvailabilityPickerProps) {
    const { t, i18n } = useTranslation('match');
    const insets = useSafeAreaInsets();

    const initialKeys = useMemo(() => {
        return new Set((initialSlots || []).map(iso => {
            if (!iso) return '';
            try {
                const date = parseUtcDate(iso);
                if (isNaN(date.getTime())) return '';

                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hour = date.getHours();

                return `${year}-${month}-${day}-${hour}`;
            } catch (e) {
                console.error('Error parsing slot:', iso, e);
                return '';
            }
        }).filter(Boolean));
    }, [initialSlots]);

    // Committed selection (what was sent to the server)
    const [selectedSlots, setSelectedSlots] = useState<Set<string>>(initialKeys);
    // Working selection used only inside the picker modal
    const [draftSlots, setDraftSlots] = useState<Set<string>>(initialKeys);
    const [pickerVisible, setPickerVisible] = useState(false);
    /** Set when the server rejected the submit — the selection has been rolled back. */
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [selectedDateIndex, setSelectedDateIndex] = useState(0);

    const hasSubmitted = selectedSlots.size > 0;

    const deadlineDate = useMemo(() => {
        if (!deadline || deadline === 'TBD') return null;
        const d = parseUtcDate(deadline);
        return isNaN(d.getTime()) ? null : d;
    }, [deadline]);

    const displayDeadline = useMemo(() => {
        if (!deadlineDate) return deadline;
        return deadlineDate.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) +
            ', ' +
            deadlineDate.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
    }, [deadlineDate, deadline]);

    useEffect(() => {
        setSelectedSlots(initialKeys);
        setDraftSlots(initialKeys);
    }, [initialKeys]);

    const processedOpponentKeys = useMemo(() => {
        return new Set((opponentAvailability || []).map(iso => {
            if (!iso) return '';
            try {
                const date = parseUtcDate(iso);
                if (isNaN(date.getTime())) return '';

                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hour = date.getHours();

                return `${year}-${month}-${day}-${hour}`;
            } catch (e) {
                console.error('Error parsing opponent slot:', iso, e);
                return '';
            }
        }).filter(Boolean));
    }, [opponentAvailability]);

    const days = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const availableDays = [];
        for (let i = 0; i < 7; i++) {
            const date = addDays(today, i);
            if (deadlineDate && date > deadlineDate) break;
            const key = formatDate(date, 'yyyy-MM-dd');
            // Drop a day with nothing left to offer — today once its last hour is gone, or the
            // deadline day when the deadline itself has already passed. Such a day used to render
            // as a tab of 24 dead cells with no hint why none of them could be tapped.
            if (!HOURS.some(hour => !isSlotDisabled(key, hour, deadlineDate))) continue;
            availableDays.push({
                date,
                label: formatDate(date, 'EEE', dateLocale()),
                fullLabel: formatDate(date, 'MMM d', dateLocale()),
                key,
            });
        }
        return availableDays;
        // Recomputed on each open too, so a screen left sitting for hours doesn't keep offering a
        // stale "today" whose hours have since passed.
    }, [deadlineDate, pickerVisible, i18n.language]);

    const selectedDay = days[selectedDateIndex] || days[0];

    // Mutual count across the committed selection (shown in the summary).
    const mutualCount = useMemo(
        () => Array.from(selectedSlots).filter(s => processedOpponentKeys.has(s)).length,
        [selectedSlots, processedOpponentKeys]
    );

    const openPicker = () => {
        setDraftSlots(new Set(selectedSlots));
        setSelectedDateIndex(0);
        setPickerVisible(true);
    };

    const closePicker = () => setPickerVisible(false);

    const toggleDraftSlot = (dayKey: string, hour: number) => {
        // Same predicate the cell is rendered with — a cell that looks tappable always is.
        if (isSlotDisabled(dayKey, hour, deadlineDate)) return;

        const slotId = `${dayKey}-${hour}`;
        setDraftSlots((prev) => {
            const next = new Set(prev);
            if (next.has(slotId)) {
                next.delete(slotId);
            } else {
                next.add(slotId);
            }
            return next;
        });
    };

    const handleConfirm = async () => {
        if (draftSlots.size === 0) return;
        const committed = new Set(draftSlots);
        const dateTimeSlots = buildDateTimeSlots(committed);

        // Flip to the summary straight away — the round-trip is otherwise a visible stall — but
        // remember what was on screen first. A rejected submit used to keep the optimistic
        // "Availability sent" forever while the server had stored nothing, so the player believed
        // they had answered and the organizer saw them as silent.
        const previous = selectedSlots;
        setSelectedSlots(committed);
        setPickerVisible(false);
        setSubmitError(null);

        try {
            await onSubmit(Array.from(committed), dateTimeSlots);
        } catch (error: any) {
            console.error('[HourlyAvailabilityPicker] Submit failed:', error);
            setSelectedSlots(previous);
            setSubmitError(error?.message || t('schedule.submitFailed'));
        }
    };

    const formatHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

    const isOpponentAvailable = (dayKey: string, hour: number) => {
        return processedOpponentKeys.has(`${dayKey}-${hour}`);
    };

    if (days.length === 0) {
        return (
            <View className="flex-1 items-center justify-center p-8 bg-slate-900/40 rounded-3xl border border-slate-800/20">
                <Ionicons name="time-outline" size={48} color="#475569" />
                <Text className="text-slate-400 font-bold text-center mt-4">
                    {t('schedule.closedDeadlinePassed')}
                </Text>
            </View>
        );
    }

    const draftMutualCount = Array.from(draftSlots).filter(s => processedOpponentKeys.has(s)).length;

    return (
        <View className="flex-1">
            {/* The matchup: opponent and the round's deadline on one card, lit in the amber a
                match without a time wears on Home. */}
            <View style={styles.matchupCard}>
                <LinearGradient
                    pointerEvents="none"
                    colors={[AMBER + '1A', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 0 }}
                    style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={styles.matchupRail} />

                <Pressable
                    onPress={onOpponentPress}
                    disabled={!onOpponentPress}
                    accessibilityRole={onOpponentPress ? 'button' : undefined}
                    className="flex-row items-center active:opacity-70"
                    style={{ gap: 12 }}
                >
                    <View style={styles.opponentRing}>
                        <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="border-0" />
                    </View>
                    <View className="flex-1 min-w-0">
                        <Text className="text-[10.5px] font-black uppercase tracking-[1.5px]" style={{ color: AMBER_TEXT }}>
                            {t('schedule.opponent')}
                        </Text>
                        <View className="flex-row items-baseline mt-0.5" style={{ gap: 6 }}>
                            <Text className="text-[11px] font-black uppercase tracking-[1px]" style={{ color: AMBER_TEXT }}>vs</Text>
                            <Text
                                className="flex-1 text-[17px] leading-[22px] font-black text-white tracking-tight"
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.7}
                            >
                                {opponentName}
                            </Text>
                        </View>
                    </View>
                    {onOpponentPress && <Ionicons name="chevron-forward" size={16} color="#64748B" />}
                </Pressable>

                <View className="flex-row items-center mt-3 pt-3 border-t border-white/[0.06]" style={{ gap: 8 }}>
                    <Ionicons name="calendar" size={14} color={AMBER} />
                    <Text className="text-[12px] font-bold text-slate-400">{t('schedule.deadline')}</Text>
                    <Text className="flex-1 text-right text-[13px] font-black text-slate-100" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
                        {displayDeadline}
                    </Text>
                </View>
            </View>

            {submitError && (
                <View className="mb-3 rounded-2xl bg-destructive/[0.08] border border-destructive/25 px-4 py-3 flex-row items-center gap-2.5">
                    <Ionicons name="alert-circle" size={16} color="#EF4444" />
                    <Text className="flex-1 text-[11px] font-bold text-red-400">{submitError}</Text>
                </View>
            )}

            {hasSubmitted ? (
                /* ───────── Submitted summary ───────── */
                <View style={styles.sentCard}>
                    <View className="flex-row items-center" style={{ gap: 12 }}>
                        <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
                            <Ionicons name="checkmark-done" size={22} color="#34D399" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-black text-[15px] tracking-tight" numberOfLines={1}>{t('schedule.availabilitySent')}</Text>
                            <Text className="text-[12px] text-slate-400 mt-0.5" numberOfLines={2}>
                                Waiting for {opponentName} to confirm
                            </Text>
                        </View>
                    </View>

                    {/* Mini stats */}
                    <View className="flex-row mt-4 pt-3.5 border-t border-white/[0.06]">
                        <View className="flex-1 items-center">
                            <Text className="text-[24px] leading-[28px] font-black text-indigo-300" style={{ fontVariant: ['tabular-nums'] }}>{selectedSlots.size}</Text>
                            <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 w-full text-center" numberOfLines={1}>{t('schedule.slots')}</Text>
                        </View>
                        <View style={{ width: 1, backgroundColor: 'rgba(148,163,184,0.12)' }} />
                        <View className="flex-1 items-center">
                            <Text className="text-[24px] leading-[28px] font-black text-emerald-400" style={{ fontVariant: ['tabular-nums'] }}>{mutualCount}</Text>
                            <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 w-full text-center" numberOfLines={1}>{t('schedule.mutual')}</Text>
                        </View>
                    </View>

                    <Pressable
                        onPress={openPicker}
                        className="mt-4 w-full h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex-row items-center justify-center gap-2 active:opacity-70"
                    >
                        <Ionicons name="create-outline" size={16} color="#CBD5E1" />
                        <Text className="text-[13px] font-black text-slate-200" numberOfLines={1}>{t('schedule.editSlots')}</Text>
                    </Pressable>

                    {/* Even after availability is sent, let the user break the "waiting for opponent"
                        lock if they already agreed on a time outside the app. */}
                    {onMarkScheduled && (
                        <>
                            <OrDivider label={t('common:or')} />
                            <AgreedCard
                                title={t('schedule.alreadyAgreed')}
                                hint={t('schedule.scheduleNowHint')}
                                onPress={onMarkScheduled}
                            />
                        </>
                    )}
                </View>
            ) : (
                /* ───────── Choice cards ───────── */
                <>
                    <Text className="text-[10.5px] font-black text-slate-400 uppercase tracking-[1.4px] mb-2.5 ml-1">
                        {t('schedule.howToSchedule')}
                    </Text>

                    {/* Set availability in app — the primary action, first: a card like the others,
                        marked out by a green edge, icon and arrow rather than a green fill */}
                    <Pressable
                        onPress={openPicker}
                        accessibilityRole="button"
                        className="active:opacity-80"
                        style={styles.primaryCard}
                    >
                        <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.14)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)' }}>
                            <Ionicons name="calendar-number" size={21} color="#34D399" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-[15px] font-black text-white leading-tight">
                                {t('schedule.setYourAvailability')}
                            </Text>
                            <Text className="text-[12px] text-slate-400 mt-0.5" numberOfLines={1}>
                                Pick times you can play vs {opponentName}
                            </Text>
                        </View>
                        <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                            <Ionicons name="chevron-forward" size={16} color={INK} />
                        </View>
                    </Pressable>

                    {/* Already agreed outside app */}
                    {onMarkScheduled && (
                        <>
                            <OrDivider label={t('common:or')} />
                            <AgreedCard
                                title={t('schedule.alreadyAgreed')}
                                hint={t('schedule.skipSchedulingHint')}
                                onPress={onMarkScheduled}
                            />
                        </>
                    )}
                </>
            )}

            {/* ───────── Time picker modal ───────── */}
            <Modal
                animationType="slide"
                transparent
                visible={pickerVisible}
                onRequestClose={closePicker}
                statusBarTranslucent
            >
                <View className="flex-1 justify-end">
                    <Pressable className="absolute inset-0 bg-black/70" onPress={closePicker} />

                    <View
                        className="bg-background-deep rounded-t-[32px] border-t border-white/[0.08] overflow-hidden"
                        style={{ maxHeight: '90%', paddingBottom: Math.max(insets.bottom, 14) }}
                    >
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}
                        >
                            {/* Drag handle */}
                            <View className="w-10 h-1 bg-white/15 rounded-full self-center mb-4" />

                            {/* Header */}
                            <View className="flex-row items-start justify-between mb-3">
                                <View className="flex-1 mr-3">
                                    <Text className="text-xl font-black text-white tracking-tight">{t('schedule.setAvailability')}</Text>
                                    <Text className="text-[12px] text-slate-500 mt-0.5">{t('schedule.tapHoursHint')}</Text>
                                </View>
                                <Pressable
                                    onPress={closePicker}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
                                    className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/[0.08] items-center justify-center"
                                >
                                    <Ionicons name="close" size={18} color="#94A3B8" />
                                </Pressable>
                            </View>

                            {/* Opponent banner — makes it obvious who this schedule is against */}
                            <View className="flex-row items-center gap-3 bg-indigo-500/[0.08] border border-indigo-400/20 rounded-2xl px-3 py-2.5 mb-4">
                                <PlayerAvatar
                                    src={opponentAvatarUrl}
                                    name={opponentName}
                                    size="md"
                                    className="border-indigo-400/40"
                                />
                                <View className="flex-1">
                                    <Text className="text-[9px] font-black text-indigo-300/70 uppercase tracking-[2px]">
                                        {t('schedule.schedulingAgainst')}
                                    </Text>
                                    <Text className="text-[16px] font-black text-white" numberOfLines={1}>
                                        {opponentName}
                                    </Text>
                                </View>
                                <View className="bg-white/[0.06] border border-white/[0.1] rounded-xl px-2.5 py-1.5">
                                    <Text className="text-[11px] font-black italic text-slate-300 tracking-wider">VS</Text>
                                </View>
                            </View>

                            {/* Date tabs */}
                            <View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row -mx-1 px-1">
                                    {days.map((day, index) => {
                                        const isSelected = selectedDateIndex === index;
                                        const hasSelectedSlots = Array.from(draftSlots).some(s => s.startsWith(day.key));
                                        const hasOpponentSlots = Array.from(processedOpponentKeys).some(s => s.startsWith(day.key));

                                        return (
                                            <Pressable
                                                key={day.key}
                                                onPress={() => setSelectedDateIndex(index)}
                                                className={cn(
                                                    "mr-2 px-4 py-2.5 rounded-2xl items-center min-w-[74px] border",
                                                    isSelected
                                                        ? "bg-indigo-600 border-indigo-400/40"
                                                        : "bg-white/[0.03] border-white/[0.07]"
                                                )}
                                            >
                                                <Text numberOfLines={1} className={cn(
                                                    "text-[11px] font-black uppercase tracking-tight",
                                                    isSelected ? "text-white" : "text-slate-400"
                                                )}>
                                                    {day.label}
                                                </Text>
                                                <Text className={cn(
                                                    "text-[10px] mt-0.5",
                                                    isSelected ? "text-slate-300" : "text-slate-500"
                                                )}>
                                                    {day.fullLabel}
                                                </Text>
                                                <View className="absolute top-1 right-1 flex-row gap-0.5">
                                                    {!isSelected && hasSelectedSlots && (
                                                        <View className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                    )}
                                                    {!isSelected && hasOpponentSlots && (
                                                        <View className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                    )}
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>

                            {/* Hourly grid — rendered directly so the sheet hugs the content (no stretched empty space) */}
                            <View className="bg-slate-900/40 rounded-2xl border border-white/5 p-2.5 mt-3">
                                <View className="flex-row flex-wrap justify-between">
                                    {HOURS.map((hour) => {
                                        const dayKey = selectedDay.key;
                                        const slotId = `${dayKey}-${hour}`;
                                        const isSelected = draftSlots.has(slotId);
                                        const opponentAvail = isOpponentAvailable(dayKey, hour);
                                        const isMutual = isSelected && opponentAvail;

                                        const isDisabled = isSlotDisabled(dayKey, hour, deadlineDate);
                                        // Everything untappable reads as untappable. The opponent's amber
                                        // used to win this branch, so an hour they had offered but which had
                                        // already passed looked live and silently swallowed every tap.
                                        const isInactive = isDisabled && !isSelected;

                                        return (
                                            <Pressable
                                                key={slotId}
                                                onPress={() => toggleDraftSlot(dayKey, hour)}
                                                disabled={isDisabled}
                                                className={cn(
                                                    "w-[23%] h-12 mb-2 rounded-xl items-center justify-center",
                                                    isInactive
                                                        ? "bg-white/[0.02] border border-white/[0.04] opacity-40"
                                                        : isMutual
                                                            ? "bg-emerald-500/20 border border-emerald-500/40"
                                                            : isSelected
                                                                ? "bg-indigo-600/80 border border-indigo-400/40"
                                                                : opponentAvail
                                                                    ? "bg-amber-500/15 border border-amber-500/25"
                                                                    : "bg-white/[0.04] border border-white/[0.08]",
                                                )}
                                            >
                                                {isMutual ? (
                                                    <>
                                                        <View className="items-center justify-center">
                                                            <Ionicons name="checkmark-done" size={14} color="#10B981" />
                                                            <Text className="text-[9px] text-emerald-300 uppercase font-black tracking-tighter -mt-0.5">
                                                                {t('schedule.mutual')}
                                                            </Text>
                                                        </View>
                                                        <View className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    </>
                                                ) : (
                                                    <View className="flex-row items-center justify-center gap-1">
                                                        {opponentAvail && !isSelected && (
                                                            <View className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5" />
                                                        )}
                                                        <Text className={cn(
                                                            "text-sm",
                                                            isInactive ? "text-slate-600 font-normal"
                                                                : isSelected ? "text-white font-black"
                                                                    : opponentAvail ? "text-amber-300 font-black"
                                                                        : "text-slate-400 font-bold"
                                                        )}>
                                                            {formatHour(hour)}
                                                        </Text>
                                                        {isSelected && (
                                                            <Ionicons name="checkmark-circle" size={12} color="#c7d2fe" />
                                                        )}
                                                    </View>
                                                )}
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Legend */}
                            <View className="bg-white/[0.03] rounded-xl px-4 py-2 flex-row items-center justify-center gap-4 flex-wrap mt-3">
                                <View className="flex-row items-center gap-1.5">
                                    <View className="w-2.5 h-2.5 rounded-sm bg-indigo-600/80 border border-indigo-400/30" />
                                    <Text className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{t('schedule.yourChoice')}</Text>
                                </View>
                                <View className="flex-row items-center gap-1.5">
                                    <View className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/20" />
                                    <Text className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{t('schedule.opponent')}</Text>
                                </View>
                                <View className="flex-row items-center gap-1.5">
                                    <View className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
                                    <Text className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{t('schedule.mutualSlot')}</Text>
                                </View>
                            </View>

                            {/* Confirm */}
                            <Pressable
                                onPress={handleConfirm}
                                disabled={draftSlots.size === 0}
                                style={draftSlots.size > 0 ? {
                                    shadowColor: '#6366F1',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.4,
                                    shadowRadius: 12,
                                    elevation: 8,
                                } : undefined}
                                className={cn(
                                    "w-full h-14 rounded-2xl flex-row items-center justify-center gap-2 mt-3",
                                    draftSlots.size > 0
                                        ? "bg-indigo-600"
                                        : "bg-white/[0.04] border border-white/[0.06]"
                                )}
                            >
                                <Ionicons name="send" size={18} color={draftSlots.size > 0 ? "#ffffff" : "#475569"} />
                                <Text numberOfLines={1} className={cn(
                                    "font-black text-base uppercase tracking-wider",
                                    draftSlots.size > 0 ? "text-white" : "text-slate-600"
                                )}>
                                    {draftMutualCount > 0
                                        ? t('schedule.confirmWithMutual', { count: draftSlots.size, mutual: draftMutualCount })
                                        : t('schedule.confirmAvailability', { count: draftSlots.size })}
                                </Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// Amber: a match that still needs a time (Home's Needs Attention). Dark ink sits on the green CTA.
const AMBER = '#F59E0B';
const AMBER_TEXT = '#FCD34D';
const INK = '#03140E';

function OrDivider({ label }: { label: string }) {
    return (
        <View className="flex-row items-center" style={{ marginVertical: 14 }}>
            <View className="flex-1 h-[1px] bg-white/[0.06]" />
            <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] px-3">{label}</Text>
            <View className="flex-1 h-[1px] bg-white/[0.06]" />
        </View>
    );
}

/** The quiet choice: the time was settled outside the app, so skip straight to the result. */
function AgreedCard({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-70" style={styles.agreedCard}>
            <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
            </View>
            <View className="flex-1">
                <Text className="text-[14px] font-black text-white leading-tight">{title}</Text>
                <Text className="text-[12px] text-slate-400 mt-0.5">{hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#64748B" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    matchupCard: {
        marginBottom: 18,
        paddingLeft: 16,
        paddingRight: 14,
        paddingVertical: 14,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#172036',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderTopColor: 'rgba(255,255,255,0.11)',
    },
    matchupRail: {
        position: 'absolute',
        left: 0,
        top: 12,
        bottom: 12,
        width: 3,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
        backgroundColor: AMBER,
        shadowColor: AMBER,
        shadowOpacity: 0.8,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },
    opponentRing: {
        borderRadius: 999,
        padding: 1.5,
        borderWidth: 1,
        borderColor: AMBER + '80',
    },
    primaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 22,
        backgroundColor: '#172036',
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.28)',
        borderTopColor: 'rgba(52,211,153,0.4)',
    },
    agreedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 20,
        backgroundColor: '#131B2E',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderTopColor: 'rgba(255,255,255,0.11)',
    },
    sentCard: {
        padding: 16,
        borderRadius: 22,
        backgroundColor: '#131B2E',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.22)',
        borderTopColor: 'rgba(16,185,129,0.35)',
    },
});
