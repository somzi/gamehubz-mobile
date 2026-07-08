import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Country } from '../../types/auth';
import { getCountries } from '../../lib/countries';

interface CountryPickerProps {
    label?: string;
    placeholder?: string;
    /** Single-select: selected ISO country code (e.g. "RS"), or undefined/null when none. */
    value?: string | null;
    onSelect?: (code: string) => void;
    /** Multi-select mode. When true, use `values` + `onToggle` instead of `value` + `onSelect`. */
    multiple?: boolean;
    values?: string[];
    onToggle?: (code: string) => void;
    error?: string;
    /** When true, the field is read-only (e.g. country already set and locked). Single-select only. */
    locked?: boolean;
    className?: string;
}

export function CountryPicker({
    label,
    placeholder = 'Select your country',
    value,
    onSelect,
    multiple = false,
    values = [],
    onToggle,
    error,
    locked = false,
    className,
}: CountryPickerProps) {
    const [modalVisible, setModalVisible] = useState(false);
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        getCountries()
            .then(list => { if (active) setCountries(list); })
            .catch(() => { /* leave empty; field still usable once retried */ })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const selectedSet = useMemo(() => new Set(values), [values]);

    const selected = useMemo(
        () => countries.find(c => c.code === value),
        [countries, value]
    );

    const selectedMulti = useMemo(
        () => countries.filter(c => selectedSet.has(c.code)),
        [countries, selectedSet]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return countries;
        return countries.filter(c =>
            c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
        );
    }, [countries, search]);

    const isRowSelected = (code: string) => (multiple ? selectedSet.has(code) : value === code);

    const handlePress = (code: string) => {
        if (multiple) {
            onToggle?.(code);
        } else {
            onSelect?.(code);
            setModalVisible(false);
            setSearch('');
        }
    };

    const openModal = () => {
        if (locked) return;
        setModalVisible(true);
    };

    const triggerText = (() => {
        if (multiple) {
            if (selectedMulti.length === 0) return placeholder;
            if (selectedMulti.length <= 3) return selectedMulti.map(c => `${c.flag} ${c.name}`).join(', ');
            return `${selectedMulti.slice(0, 3).map(c => c.flag).join(' ')}  +${selectedMulti.length - 3} more`;
        }
        return selected ? `${selected.flag}  ${selected.name}` : (value ? value : placeholder);
    })();

    const hasSelection = multiple ? selectedMulti.length > 0 : !!selected;

    return (
        <View className={`w-full ${className ?? ''}`}>
            {label && (
                <Text className="text-[11px] font-black text-muted-foreground mb-2 ml-1 uppercase tracking-widest">
                    {label}
                </Text>
            )}

            <TouchableOpacity
                activeOpacity={locked ? 1 : 0.7}
                onPress={openModal}
                className={`
                    flex-row items-center w-full min-h-[56px] py-2 bg-card/50 border rounded-2xl px-4
                    ${error ? 'border-destructive/50' : 'border-white/5'}
                    ${locked ? 'opacity-70' : ''}
                `}
            >
                <Ionicons
                    name="flag-outline"
                    size={20}
                    color={error ? '#EF4444' : '#10B981'}
                    style={{ marginRight: 12 }}
                />

                <Text className={`flex-1 text-[15px] font-medium ${hasSelection ? 'text-white' : 'text-slate-500'}`}>
                    {triggerText}
                </Text>

                {locked ? (
                    <Ionicons name="lock-closed" size={16} color="#64748B" />
                ) : (
                    <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
                        <Ionicons name="chevron-down" size={16} color="#64748B" />
                    </View>
                )}
            </TouchableOpacity>

            {locked && (
                <Text className="text-[11px] text-slate-500 mt-1.5 ml-1 font-medium">
                    Country can't be changed once set.
                </Text>
            )}

            {error && (
                <Text className="text-xs text-destructive mt-1.5 ml-1 font-medium">
                    {error}
                </Text>
            )}

            <Modal
                visible={modalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable
                    className="flex-1 bg-black/60 justify-end"
                    onPress={() => setModalVisible(false)}
                >
                    <Pressable
                        className="bg-background w-full rounded-t-[32px] border-t border-white/10 overflow-hidden"
                        style={{ height: '78%' }}
                        onPress={() => { /* swallow so taps inside don't close */ }}
                    >
                        <View className="items-center py-3">
                            <View className="w-12 h-1.5 bg-white/10 rounded-full" />
                        </View>

                        <View className="px-6 py-3 flex-row justify-between items-center bg-card/50">
                            <Text className="text-xl font-black text-white tracking-tight">
                                {label || (multiple ? 'Select Countries' : 'Select Country')}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setModalVisible(false)}
                                className="w-10 h-10 rounded-full bg-white/5 items-center justify-center"
                            >
                                <Ionicons name="close" size={22} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        <View className="px-4 pt-3 pb-1">
                            <View className="flex-row items-center bg-card border border-white/5 rounded-2xl px-4 h-12">
                                <Ionicons name="search" size={18} color="#64748B" />
                                <TextInput
                                    value={search}
                                    onChangeText={setSearch}
                                    placeholder="Search country..."
                                    placeholderTextColor="#64748B"
                                    autoCorrect={false}
                                    className="flex-1 ml-2 text-white text-[15px]"
                                />
                                {search.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                                        <Ionicons name="close-circle" size={18} color="#64748B" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {loading ? (
                            <View className="flex-1 items-center justify-center">
                                <ActivityIndicator size="small" color="#10B981" />
                            </View>
                        ) : (
                            <FlatList
                                data={filtered}
                                keyExtractor={item => item.code}
                                keyboardShouldPersistTaps="handled"
                                initialNumToRender={20}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
                                renderItem={({ item }) => {
                                    const isSelected = isRowSelected(item.code);
                                    return (
                                        <TouchableOpacity
                                            activeOpacity={0.6}
                                            className={`
                                                px-4 py-4 rounded-2xl mb-2 flex-row justify-between items-center
                                                ${isSelected ? 'bg-primary/10 border border-primary/20' : 'bg-white/5'}
                                            `}
                                            onPress={() => handlePress(item.code)}
                                        >
                                            <View className="flex-row items-center gap-3">
                                                <Text className="text-2xl">{item.flag}</Text>
                                                <Text className={`text-base font-bold ${isSelected ? 'text-primary' : 'text-slate-300'}`}>
                                                    {item.name}
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
                                ListEmptyComponent={
                                    <Text className="text-slate-500 text-center mt-8 font-medium">No countries found</Text>
                                }
                            />
                        )}

                        {multiple && (
                            <View className="px-4 pb-8 pt-2 border-t border-white/5">
                                <TouchableOpacity
                                    onPress={() => setModalVisible(false)}
                                    className="bg-primary h-12 rounded-2xl items-center justify-center"
                                >
                                    <Text className="text-primary-foreground font-black text-base">
                                        Done{selectedMulti.length > 0 ? ` (${selectedMulti.length})` : ''}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}
