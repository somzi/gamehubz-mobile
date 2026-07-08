import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Country, RegionType } from '../../types/auth';
import { getCountries } from '../../lib/countries';

interface CountryListModalProps {
    visible: boolean;
    onClose: () => void;
    /** ISO codes to display. Names/flags are resolved from the catalog. */
    codes: string[];
    title?: string;
}

/** Read-only, scrollable list of countries — used to expand a "+N countries" summary. */
export function CountryListModal({ visible, onClose, codes, title = 'Eligible Countries' }: CountryListModalProps) {
    const [catalog, setCatalog] = useState<Country[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (visible) getCountries().then(setCatalog).catch(() => { });
        if (!visible) setSearch('');
    }, [visible]);

    const items = useMemo(() => {
        const byCode = new Map(catalog.map(c => [c.code, c]));
        const list = codes.map(code =>
            byCode.get(code) ?? { code, name: code, flag: '🏳️', region: RegionType.ALL }
        );
        list.sort((a, b) => a.name.localeCompare(b.name));
        const q = search.trim().toLowerCase();
        return q ? list.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : list;
    }, [catalog, codes, search]);

    const showSearch = codes.length > 12;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/60 justify-end" onPress={onClose}>
                <Pressable
                    className="bg-background w-full rounded-t-[32px] border-t border-white/10 overflow-hidden"
                    style={{ height: '70%' }}
                    onPress={() => { /* swallow taps inside */ }}
                >
                    <View className="items-center py-3">
                        <View className="w-12 h-1.5 bg-white/10 rounded-full" />
                    </View>

                    <View className="px-6 py-3 flex-row justify-between items-center bg-card/50">
                        <View className="flex-row items-center gap-2.5">
                            <Text className="text-xl font-black text-white tracking-tight">{title}</Text>
                            <View className="bg-primary/15 px-2.5 py-0.5 rounded-full">
                                <Text className="text-primary text-xs font-black">{codes.length}</Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            className="w-10 h-10 rounded-full bg-white/5 items-center justify-center"
                        >
                            <Ionicons name="close" size={22} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    {showSearch && (
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
                    )}

                    <FlatList
                        data={items}
                        keyExtractor={item => item.code}
                        keyboardShouldPersistTaps="handled"
                        initialNumToRender={20}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
                        renderItem={({ item }) => (
                            <View className="px-4 py-3.5 rounded-2xl mb-2 flex-row items-center gap-3 bg-white/5">
                                <Text className="text-2xl">{item.flag}</Text>
                                <Text className="text-base font-bold text-slate-200">{item.name}</Text>
                            </View>
                        )}
                        ListEmptyComponent={
                            <Text className="text-slate-500 text-center mt-8 font-medium">No countries</Text>
                        }
                    />
                </Pressable>
            </Pressable>
        </Modal>
    );
}
