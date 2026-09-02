import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Pressable,
    ScrollView,
    Alert,
    Keyboard,
    BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface DateTimePickerModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (date: string) => void;
    title: string;
    initialValue?: string; // YYYY-MM-DD HH:mm
    onClear?: () => void;
    clearText?: string;
    minDate?: string; // Optional minimum date string in ISO format (or similar Parseable)
}

// Month and weekday names come from Intl in the active language instead of a
// hardcoded English table.
const monthName = (index: number, locale: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2000, index, 1));
const shortWeekdays = (locale: string) => {
    // 2024-01-01 was a Monday, matching the Mo-first calendar grid below.
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)).slice(0, 2));
};

// Hour strip metrics: pill width + gap = the horizontal snap/scroll pitch.
const HOUR_PILL = 56;
const HOUR_GAP = 8;

export function DateTimePickerModal({ visible, onClose, onConfirm, title, initialValue, onClear, clearText, minDate }: DateTimePickerModalProps) {
    const { t, i18n } = useTranslation('tournament');
    const now = new Date();

    const parseInitial = (): Date => {
        if (initialValue) {
            const parsed = new Date(initialValue.replace(' ', 'T'));
            if (!isNaN(parsed.getTime())) return parsed;
        }
        return new Date();
    };

    const initialDate = parseInitial();

    const [day, setDay] = useState(initialDate.getDate());
    const [month, setMonth] = useState(initialDate.getMonth());
    const [year, setYear] = useState(initialDate.getFullYear());
    const [hour, setHour] = useState(initialDate.getHours());

    // State for viewing calendar (month/year can change without selecting a day yet)
    const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
    const [viewYear, setViewYear] = useState(initialDate.getFullYear());

    const hourScrollRef = useRef<ScrollView>(null);
    // Android runs edge-to-edge (app.json), so the gesture bar overlays the bottom of the
    // window — without this the Confirm footer can sit under it on tall devices.
    const insets = useSafeAreaInsets();

    // Bring an hour into view in the strip (one pill of lead-in). Imperative on the ref, so
    // it works right after a setHour without waiting for a re-render.
    const scrollToHour = (h: number, animated: boolean) => {
        hourScrollRef.current?.scrollTo({ x: Math.max(0, (h - 1) * (HOUR_PILL + HOUR_GAP)), animated });
    };

    // Re-sync state when the modal is opened or initialValue changes.
    // Parent keeps the modal mounted between opens, so without this the picker
    // would show whatever date the user last selected on a previous match/field.
    useEffect(() => {
        if (!visible) return;
        // A field above may still hold focus when the picker opens. The host modal wraps us in
        // a KeyboardAvoidingView, so a live keyboard shrinks this overlay and pushes Confirm
        // off-screen — close it before we lay out.
        Keyboard.dismiss();
        const d = parseInitial();
        setDay(d.getDate());
        setMonth(d.getMonth());
        setYear(d.getFullYear());
        setHour(d.getHours());
        setViewMonth(d.getMonth());
        setViewYear(d.getFullYear());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, initialValue]);

    // Bring the pre-selected hour into view when the picker opens. Derived from
    // initialValue (not the `hour` state, which the sync effect above hasn't flushed
    // yet on this render) so the strip lands on the right hour with one pill of lead-in.
    useEffect(() => {
        if (!visible) return;
        const h = parseInitial().getHours();
        const t = setTimeout(() => scrollToHour(h, false), 60);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, initialValue]);

    // This picker is an overlay View, not a RN <Modal>, so Android's back gesture/button
    // isn't routed to it — untouched, back would fall through to the HOST modal and close the
    // whole Edit/Create form, losing the user's input. Consume it and dismiss only the picker.
    useEffect(() => {
        if (!visible) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => sub.remove();
    }, [visible, onClose]);

    const hours = Array.from({ length: 24 }, (_, i) => i);

    const handleConfirm = () => {
        const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00`;

        if (minDate) {
            const selectedTime = new Date(formattedDate.replace(' ', 'T')).getTime();
            const minTime = new Date(minDate).getTime();
            if (selectedTime < minTime) {
                Alert.alert(t('datePicker.invalidTime'), t('datePicker.deadlineBeforeOpen'));
                return; // Prevent closing and confirming
            }
        }

        onConfirm(formattedDate);
        onClose();
    };

    const changeMonth = (delta: number) => {
        let newMonth = viewMonth + delta;
        let newYear = viewYear;
        if (newMonth > 11) {
            newMonth = 0;
            newYear++;
        } else if (newMonth < 0) {
            newMonth = 11;
            newYear--;
        }
        setViewMonth(newMonth);
        setViewYear(newYear);
    };

    const renderCalendar = () => {
        const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
        // Adjust for Monday start (default getDay is Sunday=0)
        const emptyDays = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        const calendarDays = [];
        for (let i = 0; i < emptyDays; i++) {
            calendarDays.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            calendarDays.push(i);
        }

        const weekDays = shortWeekdays(i18n.language);

        return (
            <View className="gap-y-4">
                {/* Month/Year Selector */}
                <View className="flex-row justify-between items-center px-2">
                    <TouchableOpacity onPress={() => changeMonth(-1)} className="p-2 bg-white/5 rounded-full">
                        <Ionicons name="chevron-back" size={20} color="#10B981" />
                    </TouchableOpacity>
                    <Text className="text-white font-bold text-lg">
                        {monthName(viewMonth, i18n.language)} {viewYear}
                    </Text>
                    <TouchableOpacity onPress={() => changeMonth(1)} className="p-2 bg-white/5 rounded-full">
                        <Ionicons name="chevron-forward" size={20} color="#10B981" />
                    </TouchableOpacity>
                </View>

                {/* Week Day Labels */}
                <View className="flex-row mb-1">
                    {weekDays.map(wd => (
                        <View key={wd} className="flex-1 items-center">
                            <Text className="text-slate-500 text-xs font-bold">{wd}</Text>
                        </View>
                    ))}
                </View>

                {/* Days Grid */}
                <View className="flex-row flex-wrap">
                    {calendarDays.map((d, i) => {
                        if (d === null) return <View key={`empty-${i}`} className="w-[14.28%] h-12" />;

                        const isSelected = day === d && month === viewMonth && year === viewYear;
                        const isToday = d === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();

                        return (
                            <TouchableOpacity
                                key={d}
                                onPress={() => {
                                    setDay(d);
                                    setMonth(viewMonth);
                                    setYear(viewYear);
                                }}
                                className="w-[14.28%] h-12 justify-center items-center"
                            >
                                <View className={`w-10 h-10 rounded-xl justify-center items-center ${isSelected ? 'bg-primary' : isToday ? 'border border-primary' : ''
                                    }`}>
                                    <Text className={`font-bold ${isSelected ? 'text-background' : 'text-white'}`}>
                                        {d}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    if (!visible) return null;

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            <View
                className="flex-1 bg-black/80 justify-center px-4"
                style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}
            >
                {/* Backdrop sits BEHIND the content as an absolute sibling so it doesn't claim
                    touch responder over the hour strip. */}
                <Pressable
                    onPress={onClose}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />

                {/* Card is a bounded flex column: header / scrollable calendar / hour strip /
                    footer. Only the CALENDAR scrolls (and only on short screens); the hour
                    strip and Confirm footer are fixed siblings, always reachable — this is what
                    fixes "can't scroll down to Confirm".

                    Crucially the horizontal hour strip is a SIBLING of the calendar's vertical
                    ScrollView, never nested inside it: a horizontal ScrollView nested in a
                    vertical one can't be panned on Android (parent steals the gesture), which is
                    why the old design didn't scroll right. As a top-level sibling it scrolls with
                    plain RN ScrollView on both platforms — no gesture-handler / RootView needed
                    (this modal renders inside a RN Modal, outside any GestureHandlerRootView). */}
                <View
                    className="bg-background rounded-[40px] border border-white/10 overflow-hidden shadow-2xl"
                    style={{ maxHeight: '100%' }}
                >
                    {/* Header */}
                    <View className="p-6 border-b border-white/5 bg-card flex-row justify-between items-center">
                        <Text className="text-xl font-bold text-white">{title}</Text>
                        <TouchableOpacity onPress={onClose} className="p-2 bg-white/5 rounded-full">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    {/* Calendar — the only vertically-scrolling region */}
                    <ScrollView
                        className="px-6 pt-6"
                        style={{ flexShrink: 1 }}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 8 }}
                    >
                        {renderCalendar()}
                    </ScrollView>

                    {/* Hour strip — single row, horizontal, sibling of the ScrollView above */}
                    <View className="px-6 pt-5 pb-4 border-t border-white/5">
                        <View className="flex-row items-center justify-between mb-3">
                            <View className="flex-row items-center">
                                <Ionicons name="time-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                <Text className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    {t('datePicker.hour')}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    const h = new Date().getHours();
                                    setHour(h);
                                    scrollToHour(h, true);
                                }}
                                className="flex-row items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/5"
                            >
                                <Ionicons name="flash-outline" size={12} color="#10B981" style={{ marginRight: 4 }} />
                                <Text className="text-primary font-semibold text-xs">{t('datePicker.now')}</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            ref={hourScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={HOUR_PILL + HOUR_GAP}
                            // Deliberately NOT decelerationRate="fast": on Android that plus
                            // snapping kills long flings, so crossing 24 hours takes many swipes.
                            contentContainerStyle={{ paddingRight: 12 }}
                        >
                            {hours.map((item) => {
                                const active = item === hour;
                                return (
                                    <TouchableOpacity
                                        key={item}
                                        onPress={() => setHour(item)}
                                        activeOpacity={0.7}
                                        className={`rounded-2xl items-center justify-center border mr-2 ${active ? 'bg-primary border-primary' : 'bg-card border-white/5'
                                            }`}
                                        style={{ width: HOUR_PILL, height: HOUR_PILL }}
                                    >
                                        <Text className={`text-xl font-black ${active ? 'text-background' : 'text-white'}`}>
                                            {String(item).padStart(2, '0')}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Footer (fixed) */}
                    <View className="p-6 bg-card border-t border-white/5">
                        <TouchableOpacity
                            onPress={handleConfirm}
                            className="w-full py-4 rounded-2xl bg-primary items-center shadow-lg shadow-primary/30"
                        >
                            <Text className="text-background font-bold text-lg">{t('datePicker.confirmSchedule')}</Text>
                        </TouchableOpacity>

                        {onClear && (
                            <TouchableOpacity
                                onPress={() => {
                                    onClear();
                                    onClose();
                                }}
                                className="w-full py-3 rounded-2xl bg-destructive/10 border border-destructive/20 items-center mt-3"
                            >
                                <Text className="text-destructive font-bold text-base">{clearText || t('datePicker.clearSchedule')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </View>
    );
}
