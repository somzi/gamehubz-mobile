import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

interface SearchInputProps {
    value: string;
    onChange: (text: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    className?: string;
}

export function SearchInput({ value, onChange, onSubmit, placeholder, className }: SearchInputProps) {
    const { t } = useTranslation('common');
    return (
        <View className={cn("relative flex-row items-center", className)}>
            <View className="absolute left-3 z-10">
                <Ionicons name="search" size={18} color="#71717A" />
            </View>
            <TextInput
                value={value}
                onChangeText={onChange}
                onSubmitEditing={onSubmit}
                placeholder={placeholder || t('ui.searchPlaceholder')}
                placeholderTextColor="#71717A"
                className="flex-1 bg-secondary text-foreground py-3 pl-10 pr-12 rounded-xl border border-border/30"
                returnKeyType="search"
            />
            {onSubmit && (
                <Pressable 
                    onPress={onSubmit}
                    className="absolute right-3 p-1 rounded-lg bg-primary/20"
                >
                    <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
                </Pressable>
            )}
        </View>
    );
}
