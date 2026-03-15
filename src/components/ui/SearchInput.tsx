import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

interface SearchInputProps {
    value: string;
    onChange: (text: string) => void;
    placeholder?: string;
    className?: string;
}

export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
    return (
        <View className={cn("relative flex-row items-center", className)}>
            <View className="absolute left-3 z-10">
                <Ionicons name="search" size={18} color="#71717A" />
            </View>
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder={placeholder || "Search..."}
                placeholderTextColor="#71717A"
                className="flex-1 bg-secondary text-foreground py-3 pl-10 pr-4 rounded-xl border border-border/30"
            />
        </View>
    );
}
