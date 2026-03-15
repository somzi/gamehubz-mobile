import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Pressable,
    Alert
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

    const handleSave = () => {
        if (openAt && deadline) {
            const openTime = new Date(openAt.replace(' ', 'T')).getTime();
            const deadlineTime = new Date(deadline.replace(' ', 'T')).getTime();

            if (deadlineTime <= openTime) {
                Alert.alert("Invalid Times", "Deadline cannot be set before or at the exact same time as the Open At time.");
                return;
            }
        }
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
                        <View className="mb-6">
                            <Text className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Round Opens At</Text>
                            <TouchableOpacity
                                onPress={() => setPickerType('openAt')}
                                className="bg-white/5 p-4 rounded-xl border border-white/10 flex-row justify-between items-center"
                            >
                                <View className="flex-row items-center">
                                    <Ionicons name="time-outline" size={20} color="#10B981" style={{ marginRight: 10 }} />
                                    <Text className={openAt ? "text-white font-medium" : "text-slate-500 font-medium"}>
                                        {openAt ? openAt : 'Set Open Time'}
                                    </Text>
                                </View>
                                {openAt && (
                                    <TouchableOpacity 
                                        onPress={(e) => { e.stopPropagation(); setOpenAt(null); }} 
                                        className="bg-white/10 p-1.5 rounded-full"
                                    >
                                        <Ionicons name="close" size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        </View>

                        <View className="mb-8">
                            <Text className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Round Deadline</Text>
                            <TouchableOpacity
                                onPress={() => setPickerType('deadline')}
                                className="bg-white/5 p-4 rounded-xl border border-white/10 flex-row justify-between items-center"
                            >
                                <View className="flex-row items-center">
                                    <Ionicons name="calendar-outline" size={20} color="#ef4444" style={{ marginRight: 10 }} />
                                    <Text className={deadline ? "text-white font-medium" : "text-slate-500 font-medium"}>
                                        {deadline ? deadline : 'Set Deadline'}
                                    </Text>
                                </View>
                                {deadline && (
                                    <TouchableOpacity 
                                        onPress={(e) => { e.stopPropagation(); setDeadline(null); }} 
                                        className="bg-white/10 p-1.5 rounded-full"
                                    >
                                        <Ionicons name="close" size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={handleSave}
                            className="w-full py-4 rounded-2xl bg-primary items-center shadow-lg shadow-primary/30"
                        >
                            <Text className="text-background font-bold text-lg">Save Schedule</Text>
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
                initialValue={openAt || undefined}
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
                minDate={openAt || undefined}
                clearText="Clear Deadline"
            />
        </Modal>
    );
}
