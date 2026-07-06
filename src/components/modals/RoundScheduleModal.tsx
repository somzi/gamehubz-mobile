import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerModal } from './DateTimePickerModal';

interface RoundScheduleModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (openAt: string | null, deadline: string | null) => void;
    roundNumber: number;
    initialOpenAt?: string | null;
    initialDeadline?: string | null;
}

// Values arrive either as backend UTC ISO ("2026-07-07T02:00:00.000Z") or as the
// picker's local "YYYY-MM-DD HH:mm" — the space→T swap makes both parseable, with
// the Z (or its absence) deciding UTC vs local, matching how the save path parses.
const parseValue = (val: string | null): Date | null => {
    if (!val) return null;
    const d = new Date(val.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
};

// League rounds that wait for the previous round to finish carry DateTime.MaxValue
// (year 9999) as their open time — a lock sentinel, not a real schedule.
const isLockSentinel = (d: Date | null): boolean => !!d && d.getFullYear() > 9000;

const formatDatePart = (d: Date): string => {
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString([], opts);
};

const formatTimePart = (d: Date): string =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatWindow = (ms: number): string => {
    const totalHours = Math.round(ms / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days === 0) return `${hours}h`;
    if (hours === 0) return `${days}d`;
    return `${days}d ${hours}h`;
};

function ScheduleField({ label, value, accent, emptyIcon, emptyLabel, lockedSentinel, onPress, onClear }: {
    label: string;
    value: string | null;
    accent: string;
    emptyIcon: keyof typeof Ionicons.glyphMap;
    emptyLabel: string;
    lockedSentinel?: boolean;
    onPress: () => void;
    onClear: () => void;
}) {
    const date = parseValue(value);

    return (
        <View>
            <Text className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">{label}</Text>
            {date && lockedSentinel ? (
                <View className="flex-row items-center">
                    <TouchableOpacity
                        onPress={onPress}
                        className="flex-1 bg-white/5 rounded-xl border border-white/10 px-4 py-3.5 flex-row items-center mr-2"
                    >
                        <Ionicons name="lock-closed-outline" size={16} color="#F59E0B" style={{ marginRight: 8 }} />
                        <Text className="text-slate-300 font-semibold">Locked — opens after previous round</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClear} className="bg-white/10 p-1.5 rounded-full">
                        <Ionicons name="close" size={14} color="#94A3B8" />
                    </TouchableOpacity>
                </View>
            ) : date ? (
                <View className="flex-row items-center">
                    <TouchableOpacity
                        onPress={onPress}
                        className="flex-1 bg-white/5 rounded-xl border border-white/10 px-4 py-3.5 flex-row items-center mr-2"
                    >
                        <Ionicons name="calendar-outline" size={16} color={accent} style={{ marginRight: 8 }} />
                        <Text className="text-white font-semibold">{formatDatePart(date)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onPress}
                        className="bg-white/5 rounded-xl border border-white/10 px-4 py-3.5 flex-row items-center"
                    >
                        <Ionicons name="time-outline" size={16} color={accent} style={{ marginRight: 6 }} />
                        <Text className="text-white font-semibold">{formatTimePart(date)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClear} className="ml-2 bg-white/10 p-1.5 rounded-full">
                        <Ionicons name="close" size={14} color="#94A3B8" />
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity
                    onPress={onPress}
                    className="bg-white/5 rounded-xl border border-dashed border-white/15 px-4 py-4 flex-row items-center justify-center"
                >
                    <Ionicons name={emptyIcon} size={16} color="#64748B" style={{ marginRight: 8 }} />
                    <Text className="text-slate-500 font-medium">{emptyLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

export function RoundScheduleModal({ visible, onClose, onSave, roundNumber, initialOpenAt, initialDeadline }: RoundScheduleModalProps) {
    const [openAt, setOpenAt] = useState<string | null>(initialOpenAt || null);
    const [deadline, setDeadline] = useState<string | null>(initialDeadline || null);

    const [pickerType, setPickerType] = useState<'openAt' | 'deadline' | null>(null);

    useEffect(() => {
        if (visible) {
            setOpenAt(initialOpenAt || null);
            setDeadline(initialDeadline || null);
        }
    }, [visible, initialOpenAt, initialDeadline]);

    const openDate = parseValue(openAt);
    const deadlineDate = parseValue(deadline);
    // The lock sentinel isn't a real open time — leave it out of the window math so a
    // deadline can still be edited on a locked round (the old modal hard-blocked that).
    const openIsLocked = isLockSentinel(openDate);
    const windowMs = openDate && !openIsLocked && deadlineDate
        ? deadlineDate.getTime() - openDate.getTime()
        : null;
    const isInvalid = windowMs !== null && windowMs <= 0;

    const handleSave = () => {
        if (isInvalid) return;
        onSave(openAt, deadline);
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable className="flex-1 bg-black/80 justify-center px-4" onPress={onClose}>
                <Pressable className="bg-[#0f172a] rounded-[32px] border border-white/10 overflow-hidden shadow-2xl">
                    <View className="px-6 py-5 border-b border-white/5 bg-[#131B2E] flex-row justify-between items-center">
                        <Text className="text-xl font-bold text-white">Round {roundNumber} Schedule</Text>
                        <TouchableOpacity onPress={onClose} className="p-2 bg-white/5 rounded-full z-10">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <View className="p-6">
                        <ScheduleField
                            label="Round Opens At"
                            value={openAt}
                            accent="#10B981"
                            emptyIcon="lock-open-outline"
                            emptyLabel="Round is open — tap to schedule"
                            lockedSentinel={openIsLocked}
                            onPress={() => setPickerType('openAt')}
                            onClear={() => setOpenAt(null)}
                        />

                        <View className="items-center my-2">
                            <View className="w-px h-2.5 bg-white/10" />
                            <View className="w-7 h-7 rounded-full bg-white/5 border border-white/10 items-center justify-center my-1">
                                <Ionicons name="arrow-down" size={14} color="#64748B" />
                            </View>
                            <View className="w-px h-2.5 bg-white/10" />
                        </View>

                        <ScheduleField
                            label="Round Deadline"
                            value={deadline}
                            accent="#ef4444"
                            emptyIcon="infinite-outline"
                            emptyLabel="No deadline — tap to set one"
                            onPress={() => setPickerType('deadline')}
                            onClear={() => setDeadline(null)}
                        />

                        <View className="mt-5 mb-5">
                            {windowMs !== null && !isInvalid && (
                                <View className="flex-row items-center justify-center bg-primary/5 border border-primary/15 rounded-xl py-2.5 px-4">
                                    <Ionicons name="hourglass-outline" size={15} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-primary font-semibold text-sm">Players get {formatWindow(windowMs)} to play</Text>
                                </View>
                            )}
                            {isInvalid && (
                                <View className="flex-row items-center justify-center bg-destructive/10 border border-destructive/20 rounded-xl py-2.5 px-4">
                                    <Ionicons name="alert-circle-outline" size={15} color="#ef4444" style={{ marginRight: 6 }} />
                                    <Text className="text-destructive font-semibold text-sm">Deadline must be after the open time</Text>
                                </View>
                            )}
                            {windowMs === null && (
                                <Text className="text-center text-slate-500 text-xs">Times are shown in your local timezone</Text>
                            )}
                        </View>

                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={isInvalid}
                            className={`w-full py-4 rounded-2xl items-center ${isInvalid ? 'bg-white/10' : 'bg-primary shadow-lg shadow-primary/30'}`}
                        >
                            <Text className={`font-bold text-lg ${isInvalid ? 'text-slate-500' : 'text-background'}`}>Save Schedule</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>

            <DateTimePickerModal
                visible={pickerType === 'openAt'}
                onClose={() => setPickerType(null)}
                onConfirm={(val) => {
                    setOpenAt(val);
                }}
                title="Round Open Time"
                initialValue={openAt && !openIsLocked ? openAt : undefined}
                clearText="Clear Open Time"
            />

            <DateTimePickerModal
                visible={pickerType === 'deadline'}
                onClose={() => setPickerType(null)}
                onConfirm={(val) => {
                    setDeadline(val);
                }}
                title="Round Deadline"
                initialValue={deadline || undefined}
                minDate={openAt && !openIsLocked ? openAt : undefined}
                clearText="Clear Deadline"
            />
        </Modal>
    );
}
