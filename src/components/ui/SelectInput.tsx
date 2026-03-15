import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SelectOption {
    label: string;
    value: any;
}

interface SelectInputProps {
    label?: string;
    placeholder?: string;
    value?: any;
    options: SelectOption[];
    onSelect: (value: any) => void;
    error?: string;
    leftIcon?: keyof typeof Ionicons.glyphMap;
    className?: string;
}

export function SelectInput({
    label,
    placeholder = 'Select an option',
    value,
    options,
    onSelect,
    error,
    leftIcon,
    className
}: SelectInputProps) {
    const [modalVisible, setModalVisible] = useState(false);

    const selectedOption = options.find(opt => opt.value === value);

    const handleSelect = (val: any) => {
        onSelect(val);
        setModalVisible(false);
    };

    return (
        <View className={`w-full ${className}`}>
            {label && (
                <Text className="text-[11px] font-black text-muted-foreground mb-2 ml-1 uppercase tracking-widest">
                    {label}
                </Text>
            )}

            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setModalVisible(true)}
                className={`
                    flex-row items-center w-full h-14 bg-[#131B2E]/50 border rounded-2xl px-4
                    ${error ? 'border-destructive/50' : 'border-white/5'}
                `}
            >
                {leftIcon && (
                    <Ionicons
                        name={leftIcon}
                        size={20}
                        color={error ? "#EF4444" : "#10B981"}
                        style={{ marginRight: 12 }}
                    />
                )}

                <Text className={`flex-1 text-[15px] font-medium ${selectedOption ? 'text-white' : 'text-slate-500'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </Text>

                <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
                    <Ionicons
                        name="chevron-down"
                        size={16}
                        color="#64748B"
                    />
                </View>
            </TouchableOpacity>

            {error && (
                <Text className="text-xs text-destructive mt-1.5 ml-1 font-medium">
                    {error}
                </Text>
            )}

            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable
                    className="flex-1 bg-black/60 justify-end"
                    onPress={() => setModalVisible(false)}
                >
                    <View className="bg-[#0F172A] w-full rounded-t-[32px] border-t border-white/10 overflow-hidden pb-10">
                        {/* Drag Handle */}
                        <View className="items-center py-3">
                            <View className="w-12 h-1.5 bg-white/10 rounded-full" />
                        </View>

                        <View className="px-6 py-4 flex-row justify-between items-center bg-[#131B2E]/50">
                            <Text className="text-xl font-black text-white tracking-tight">
                                {label || 'Select Option'}
                            </Text>
                            <TouchableOpacity 
                                onPress={() => setModalVisible(false)}
                                className="w-10 h-10 rounded-full bg-white/5 items-center justify-center"
                            >
                                <Ionicons name="close" size={22} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        <View className="px-4 mt-2">
                            <FlatList
                                data={options}
                                scrollEnabled={false}
                                keyExtractor={(item) => String(item.value)}
                                renderItem={({ item }) => {
                                    const isSelected = value === item.value;
                                    return (
                                        <TouchableOpacity
                                            activeOpacity={0.6}
                                            className={`
                                                p-5 rounded-2xl mb-2 flex-row justify-between items-center
                                                ${isSelected ? 'bg-primary/10 border border-primary/20' : 'bg-white/5'}
                                            `}
                                            onPress={() => handleSelect(item.value)}
                                        >
                                            <View className="flex-row items-center gap-3">
                                                {isSelected && (
                                                    <View className="w-1.5 h-6 bg-primary rounded-full" />
                                                )}
                                                <Text className={`text-base font-bold ${isSelected ? 'text-primary' : 'text-slate-300'}`}>
                                                    {item.label}
                                                </Text>
                                            </View>
                                            {isSelected && (
                                                <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                                                    <Ionicons name="checkmark" size={14} color="#0F172A" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                }}
                                contentContainerStyle={{ paddingVertical: 10 }}
                            />
                        </View>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}
