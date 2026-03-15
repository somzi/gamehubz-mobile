import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Pressable,
    ScrollView,
    Alert,
} from 'react-native';
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

const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function DateTimePickerModal({ visible, onClose, onConfirm, title, initialValue, onClear, clearText, minDate }: DateTimePickerModalProps) {
    const now = new Date();

    // Parse initial value or use now
    let initialDate = now;
    if (initialValue) {
        const parsed = new Date(initialValue.replace(' ', 'T'));
        if (!isNaN(parsed.getTime())) {
            initialDate = parsed;
        }
    }

    const [day, setDay] = useState(initialDate.getDate());
    const [month, setMonth] = useState(initialDate.getMonth());
    const [year, setYear] = useState(initialDate.getFullYear());
    const [hour, setHour] = useState(initialDate.getHours());

    // State for viewing calendar (month/year can change without selecting a day yet)
    const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
    const [viewYear, setViewYear] = useState(initialDate.getFullYear());

    const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() + i);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const handleConfirm = () => {
        const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00`;
        
        if (minDate) {
            const selectedTime = new Date(formattedDate.replace(' ', 'T')).getTime();
            const minTime = new Date(minDate).getTime();
            if (selectedTime < minTime) {
                Alert.alert("Invalid Time", "Deadline cannot be set before the round opens.");
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

        const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

        return (
            <View className="gap-y-4">
                {/* Month/Year Selector */}
                <View className="flex-row justify-between items-center px-2">
                    <TouchableOpacity onPress={() => changeMonth(-1)} className="p-2 bg-white/5 rounded-full">
                        <Ionicons name="chevron-back" size={20} color="#10B981" />
                    </TouchableOpacity>
                    <Text className="text-white font-bold text-lg">
                        {months[viewMonth]} {viewYear}
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

    const renderTimeGrid = (items: number[], current: number, onSelect: (val: number) => void, label: string) => (
        <View className="mt-6">
            <Text className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-widest">{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                <View className="flex-row gap-2 pb-2">
                    {items.map((item) => {
                        const active = item === current;
                        return (
                            <TouchableOpacity
                                key={item}
                                onPress={() => onSelect(item)}
                                className={`w-12 h-12 rounded-xl justify-center items-center border ${active ? 'bg-primary border-primary' : 'bg-[#131B2E] border-white/5'
                                    }`}
                            >
                                <Text className={`font-bold ${active ? 'text-background' : 'text-white'}`}>
                                    {String(item).padStart(2, '0')}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );

    if (!visible) return null;

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            <Pressable
                className="flex-1 bg-black/80 justify-center px-4"
                onPress={onClose}
            >
                <Pressable className="bg-[#0f172a] rounded-[40px] border border-white/10 overflow-hidden shadow-2xl">
                    <View className="p-6 border-b border-white/5 bg-[#131B2E] flex-row justify-between items-center">
                        <Text className="text-xl font-bold text-white">{title}</Text>
                        <TouchableOpacity onPress={onClose} className="p-2 bg-white/5 rounded-full">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="max-h-[550px]" showsVerticalScrollIndicator={false}>
                        <View className="p-6">
                            {renderCalendar()}

                            <View className="mt-8 pt-6 border-t border-white/5">
                                <View className="flex-row items-center mb-2">
                                    <Ionicons name="time-outline" size={18} color="#10B981" style={{ marginRight: 8 }} />
                                    <Text className="text-white font-bold text-lg">Select Time</Text>
                                </View>

                                {renderTimeGrid(hours, hour, setHour, 'Hour')}

                                <TouchableOpacity
                                    onPress={() => {
                                        const now = new Date();
                                        setHour(now.getHours());
                                    }}
                                    className="mt-6 py-3 bg-white/5 rounded-xl items-center border border-white/5"
                                >
                                    <Text className="text-primary font-semibold text-sm">Set to Current Hour</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>

                    <View className="p-6 bg-[#131B2E] border-t border-white/5 space-y-3">
                        <TouchableOpacity
                            onPress={handleConfirm}
                            className="w-full py-4 rounded-2xl bg-primary items-center shadow-lg shadow-primary/30"
                        >
                            <Text className="text-background font-bold text-lg">Confirm Schedule</Text>
                        </TouchableOpacity>
                        
                        {onClear && (
                            <TouchableOpacity
                                onPress={() => {
                                    onClear();
                                    onClose();
                                }}
                                className="w-full py-3 rounded-2xl bg-destructive/10 border border-destructive/20 items-center mt-3"
                            >
                                <Text className="text-destructive font-bold text-base">{clearText || 'Clear Schedule'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Pressable>
            </Pressable>
        </View>
    );
}
