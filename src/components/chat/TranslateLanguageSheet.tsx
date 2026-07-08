import React, { JSX } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../../lib/utils';

export interface Language {
  label: string;
  code: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { label: 'Srpski', code: 'SR', flag: '🇷🇸' },
  { label: 'English', code: 'EN-US', flag: '🇺🇸' },
  { label: 'Español', code: 'ES', flag: '🇪🇸' },
  { label: 'Deutsch', code: 'DE', flag: '🇩🇪' },
  { label: 'Français', code: 'FR', flag: '🇫🇷' },
  { label: 'हिन्दी', code: 'HI', flag: '🇮🇳' },
  { label: 'العربية', code: 'AR', flag: '🇸🇦' },
  { label: 'Português', code: 'PT-PT', flag: '🇵🇹' },
  { label: 'Italiano', code: 'IT', flag: '🇮🇹' },
  { label: 'Türkçe', code: 'TR', flag: '🇹🇷' },
  { label: 'Русский', code: 'RU', flag: '🇷🇺' },
  { label: 'Polski', code: 'PL', flag: '🇵🇱' },
];

export interface TranslateLanguageSheetProps {
  visible: boolean;
  activeCode?: string | null;
  onSelect: (lang: Language) => void;
  onClose: () => void;
}

export function TranslateLanguageSheet({
  visible,
  activeCode,
  onSelect,
  onClose,
}: TranslateLanguageSheetProps): JSX.Element | null {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background-deep"
        style={{ paddingTop: Math.max(insets.top, 50) }}
      >
        <View className="flex-row items-center justify-between px-6 pb-4 border-b border-white/5">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="w-10 h-10 rounded-full bg-white/5 items-center justify-center active:bg-white/10"
          >
            <Ionicons name="close" size={20} color="#94A3B8" />
          </Pressable>
          <View className="items-center flex-1 mx-4">
            <Text
              className="text-sm font-black text-white uppercase tracking-[3px]"
              numberOfLines={1}
            >
              Translate Message
            </Text>
            <Text className="text-[10px] text-slate-500 font-bold mt-0.5">
              Choose a target language
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 20),
          }}
          showsVerticalScrollIndicator={false}
        >
          {LANGUAGES.map((lang) => {
            const isActive = activeCode === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => onSelect(lang)}
                accessibilityRole="button"
                accessibilityLabel={`Translate to ${lang.label}`}
                className="flex-row items-center gap-3.5 px-6 py-[18px] border-b border-white/10 active:bg-white/5"
              >
                <Text className="text-[22px]">{lang.flag}</Text>
                <Text
                  className={cn(
                    'flex-1 text-[13px] font-semibold',
                    isActive ? 'text-emerald-400' : 'text-white',
                  )}
                  numberOfLines={1}
                >
                  {lang.label}
                </Text>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
