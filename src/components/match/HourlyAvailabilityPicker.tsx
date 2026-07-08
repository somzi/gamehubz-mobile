import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cn, parseUtcDate } from '../../lib/utils';
import { PlayerAvatar } from '../ui/PlayerAvatar';

interface HourlyAvailabilityPickerProps {
    matchId: string;
    deadline: string; // ISO String
    opponentName: string;
    opponentAvatarUrl?: string;
    opponentAvailability?: string[];
    initialSlots?: string[];
    onSubmit: (selectedSlots: string[], dateTimeSlots: string[]) => void | Promise<void>;
    onMarkScheduled?: () => void | Promise<void>;
}

// Generate hours from 00:00 to 23:00
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatDate = (date: Date, format: string) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (format === 'EEE') return days[date.getDay()];
    if (format === 'MMM d') return `${months[date.getMonth()]} ${date.getDate()}`;
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

const buildDateTimeSlots = (slots: Set<string>) => {
    return Array.from(slots).map(slot => {
        const parts = slot.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        const hour = parseInt(parts[3], 10);

        // Construct local date and convert to UTC ISO string
        const localDate = new Date(year, month - 1, day, hour, 0, 0);
        return localDate.toISOString();
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
}: HourlyAvailabilityPickerProps) {
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
    const [selectedDateIndex, setSelectedDateIndex] = useState(0);

    const hasSubmitted = selectedSlots.size > 0;

    const deadlineDate = useMemo(() => {
        if (!deadline || deadline === 'TBD') return null;
        const d = parseUtcDate(deadline);
        return isNaN(d.getTime()) ? null : d;
    }, [deadline]);

    const displayDeadline = useMemo(() => {
        if (!deadlineDate) return deadline;
        return deadlineDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
            ', ' +
            deadlineDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
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
            availableDays.push({
                date,
                label: formatDate(date, 'EEE'),
                fullLabel: formatDate(date, 'MMM d'),
                key: formatDate(date, 'yyyy-MM-dd'),
            });
        }
        return availableDays;
    }, [deadlineDate]);

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
        const slotDate = new Date(dayKey);
        slotDate.setHours(hour, 0, 0, 0);
        const isExpired = deadlineDate && slotDate.getTime() > deadlineDate.getTime();
        const isPast = slotDate.getTime() < new Date().getTime();
        if (isExpired || isPast) return;

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
        setSelectedSlots(committed);
        setPickerVisible(false);
        await onSubmit(Array.from(committed), dateTimeSlots);
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
                    Availability selection is closed (Deadline Passed).
                </Text>
            </View>
        );
    }

    const draftMutualCount = Array.from(draftSlots).filter(s => processedOpponentKeys.has(s)).length;

    return (
        <View className="flex-1">
            {/* Opponent — who this match is against, prominent at the top */}
            <View className="bg-slate-800/40 rounded-2xl p-3 border border-white/5 mb-3 flex-row items-center gap-3">
                <View className="rounded-full p-[2px] bg-indigo-500/25">
                    <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" />
                </View>
                <View className="flex-1">
                    <Text className="text-[10px] font-black text-indigo-300/70 uppercase tracking-[2px]">Opponent</Text>
                    <Text className="text-[17px] font-black text-white mt-0.5" numberOfLines={1}>{opponentName}</Text>
                </View>
                <View className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-2.5 py-1.5">
                    <Text className="text-[11px] font-black italic text-slate-300 tracking-wider">VS</Text>
                </View>
            </View>

            {/* Deadline */}
            <View className="bg-slate-800/40 rounded-2xl p-3.5 border border-white/5 mb-4 flex-row items-center gap-3">
                <View className="w-9 h-9 rounded-xl bg-amber-500/10 items-center justify-center border border-amber-500/20">
                    <Ionicons name="calendar-outline" size={16} color="#FBBF24" />
                </View>
                <View className="flex-1">
                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[2px]">Deadline</Text>
                    <Text className="text-sm text-slate-200 font-bold mt-0.5">{displayDeadline}</Text>
                </View>
            </View>

            {hasSubmitted ? (
                /* ───────── Submitted summary ───────── */
                <View className="rounded-[24px] bg-emerald-500/[0.07] border border-emerald-500/20 p-5 items-center">
                    <View className="w-14 h-14 rounded-2xl bg-emerald-500/15 items-center justify-center mb-3">
                        <Ionicons name="checkmark-done" size={28} color="#10B981" />
                    </View>
                    <Text className="text-white font-black text-base uppercase tracking-tight">Availability Sent</Text>
                    <Text className="text-xs text-slate-400 mt-1 text-center">
                        Waiting for {opponentName} to confirm
                    </Text>

                    {/* Mini stats */}
                    <View className="flex-row gap-2.5 mt-4 w-full">
                        <View className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl py-3 items-center">
                            <Text className="text-2xl font-black text-indigo-300">{selectedSlots.size}</Text>
                            <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Slots</Text>
                        </View>
                        <View className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl py-3 items-center">
                            <Text className="text-2xl font-black text-emerald-400">{mutualCount}</Text>
                            <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Mutual</Text>
                        </View>
                    </View>

                    <Pressable
                        onPress={openPicker}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        className="mt-4 w-full h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex-row items-center justify-center gap-2"
                    >
                        <Ionicons name="create-outline" size={16} color="#94A3B8" />
                        <Text className="text-xs font-black text-slate-300 uppercase tracking-widest">Edit Slots</Text>
                    </Pressable>

                    {/* Even after availability is sent, let the user break the "waiting for opponent"
                        lock if they already agreed on a time outside the app. */}
                    {onMarkScheduled && (
                        <>
                            <View className="flex-row items-center w-full" style={{ marginVertical: 12 }}>
                                <View className="flex-1 h-[1px] bg-white/[0.06]" />
                                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] px-3">OR</Text>
                                <View className="flex-1 h-[1px] bg-white/[0.06]" />
                            </View>

                            <Pressable
                                onPress={onMarkScheduled}
                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                className="w-full rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/20 flex-row items-center px-4 py-3.5 gap-3"
                            >
                                <View className="w-9 h-9 rounded-xl bg-emerald-500/12 border border-emerald-500/20 items-center justify-center">
                                    <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[13px] font-black text-white leading-tight">
                                        Already agreed on a time?
                                    </Text>
                                    <Text className="text-[11px] text-slate-400 mt-0.5">
                                        Schedule now without waiting and report directly
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color="#64748B" />
                            </Pressable>
                        </>
                    )}
                </View>
            ) : (
                /* ───────── Choice cards ───────── */
                <>
                    <Text className="text-[11px] font-black text-slate-500 uppercase tracking-[2px] mb-3 ml-1">
                        How do you want to schedule?
                    </Text>

                    {/* Already agreed outside app */}
                    {onMarkScheduled && (
                        <Pressable
                            onPress={onMarkScheduled}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
                            className="w-full rounded-[22px] border border-white/[0.07] bg-white/[0.03] flex-row items-center px-4 py-4 gap-3.5"
                        >
                            <View className="w-11 h-11 rounded-2xl bg-emerald-500/12 border border-emerald-500/20 items-center justify-center">
                                <Ionicons name="checkmark-circle-outline" size={22} color="#10B981" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-[15px] font-black text-white leading-tight">
                                    Already agreed on a time?
                                </Text>
                                <Text className="text-[12px] text-slate-400 mt-0.5">
                                    Skip scheduling and report directly
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color="#64748B" />
                        </Pressable>
                    )}

                    {/* OR divider */}
                    {onMarkScheduled && (
                        <View className="flex-row items-center" style={{ marginVertical: 14 }}>
                            <View className="flex-1 h-[1px] bg-white/[0.06]" />
                            <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] px-3">OR</Text>
                            <View className="flex-1 h-[1px] bg-white/[0.06]" />
                        </View>
                    )}

                    {/* Set availability in app — primary action that opens the picker modal */}
                    <Pressable
                        onPress={openPicker}
                        style={({ pressed }) => ({
                            opacity: pressed ? 0.85 : 1,
                            transform: [{ scale: pressed ? 0.99 : 1 }],
                            shadowColor: '#6366F1',
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.22,
                            shadowRadius: 16,
                            elevation: 6,
                        })}
                        className="w-full rounded-[22px] border border-indigo-400/25 bg-indigo-500/[0.12] flex-row items-center px-4 py-4 gap-3.5"
                    >
                        <View className="w-11 h-11 rounded-2xl bg-indigo-500/25 border border-indigo-400/30 items-center justify-center">
                            <Ionicons name="calendar-number-outline" size={22} color="#A5B4FC" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-[15px] font-black text-white leading-tight">
                                Set your availability
                            </Text>
                            <Text className="text-[12px] text-slate-300/80 mt-0.5" numberOfLines={1}>
                                Pick times you can play vs {opponentName}
                            </Text>
                        </View>
                        <View className="w-7 h-7 rounded-full bg-indigo-500/30 items-center justify-center">
                            <Ionicons name="chevron-forward" size={15} color="#C7D2FE" />
                        </View>
                    </Pressable>
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
                                    <Text className="text-xl font-black text-white tracking-tight">Set availability</Text>
                                    <Text className="text-[12px] text-slate-500 mt-0.5">Tap the hours you're free to play</Text>
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
                                        You're scheduling against
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
                                                <Text className={cn(
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

                                        const slotDate = new Date(selectedDay.date);
                                        slotDate.setHours(hour, 0, 0, 0);
                                        const isAfterDeadline = deadlineDate && slotDate.getTime() > deadlineDate.getTime();
                                        const isPast = slotDate.getTime() < new Date().getTime();
                                        const isDisabled = isAfterDeadline || isPast;
                                        const isInactive = isDisabled && !isSelected && !opponentAvail;

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
                                                                Mutual
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
                                    <Text className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Your Choice</Text>
                                </View>
                                <View className="flex-row items-center gap-1.5">
                                    <View className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/20" />
                                    <Text className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Opponent</Text>
                                </View>
                                <View className="flex-row items-center gap-1.5">
                                    <View className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
                                    <Text className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Mutual Slot</Text>
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
                                <Text className={cn(
                                    "font-black text-base uppercase tracking-wider",
                                    draftSlots.size > 0 ? "text-white" : "text-slate-600"
                                )}>
                                    {draftMutualCount > 0
                                        ? `Confirm (${draftSlots.size} · ${draftMutualCount} mutual)`
                                        : `Confirm Availability (${draftSlots.size})`}
                                </Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
