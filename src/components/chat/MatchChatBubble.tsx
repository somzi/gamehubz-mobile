import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { translateMessage } from '../../lib/translationApi';

interface Language {
  label: string;
  code: string;
}

const LANGUAGES: Language[] = [
  { label: 'Srpski', code: 'SR' },
  { label: 'English', code: 'EN-US' },
  { label: 'Español', code: 'ES' },
  { label: 'German', code: 'DE' },
  { label: 'French', code: 'FR' },
  { label: 'Hindi', code: 'HI' },
  { label: 'Arabic', code: 'AR' },
  { label: 'Português', code: 'PT-PT' },
  { label: 'Italiano', code: 'IT' },
  { label: 'Türkçe', code: 'TR' },
  { label: 'Русский', code: 'RU' },
  { label: 'Polski', code: 'PL' },
];

export interface MatchChatBubbleProps {
  content: string;
  isMyComment: boolean;
}

export function MatchChatBubble({
  content,
  isMyComment,
}: MatchChatBubbleProps): JSX.Element {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedLang, setTranslatedLang] = useState<Language | null>(null);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);

  const runTranslation = useCallback(
    async (lang: Language): Promise<void> => {
      setLoading(true);
      try {
        const result = await translateMessage(content, lang.code);
        setTranslatedText(result);
        setTranslatedLang(lang);
        setShowOriginal(false);
      } catch (err) {
        console.warn('Translation failed', err);
      } finally {
        setLoading(false);
      }
    },
    [content],
  );

  const openLanguagePicker = useCallback((): void => {
    setSheetOpen(true);
  }, []);

  const onPickLanguage = useCallback(
    (lang: Language): void => {
      setSheetOpen(false);
      void runTranslation(lang);
    },
    [runTranslation],
  );

  const closeSheet = useCallback((): void => {
    setSheetOpen(false);
  }, []);

  const toggleToOriginal = useCallback((): void => {
    setShowOriginal(true);
  }, []);

  const toggleToTranslation = useCallback((): void => {
    setShowOriginal(false);
  }, []);

  const displayText: string =
    translatedText && !showOriginal ? translatedText : content;
  const isShowingTranslation: boolean =
    !!translatedText && !showOriginal && !!translatedLang;
  const isShowingOriginalAfterTranslation: boolean =
    !!translatedText && showOriginal && !!translatedLang;

  const bubble = (
    <View
      className={cn(
        'px-4 py-3 rounded-[20px]',
        isMyComment
          ? 'bg-primary rounded-br-none'
          : 'bg-slate-800 rounded-bl-none border border-white/5',
      )}
    >
      <Text
        className={cn(
          'leading-5 font-medium',
          isMyComment ? 'text-slate-900' : 'text-white',
        )}
      >
        {displayText}
      </Text>

      {isShowingTranslation && translatedLang && (
        <View className="flex-row items-center flex-wrap gap-2 mt-1.5">
          <Text
            className={cn(
              'text-[10px] italic',
              isMyComment ? 'text-slate-700' : 'text-slate-400',
            )}
          >
            (Translated to {translatedLang.label})
          </Text>
          <Pressable onPress={toggleToOriginal} hitSlop={8}>
            <Text
              className={cn(
                'text-[10px] underline font-semibold',
                isMyComment ? 'text-slate-900' : 'text-primary',
              )}
            >
              Show Original
            </Text>
          </Pressable>
        </View>
      )}

      {isShowingOriginalAfterTranslation && translatedLang && (
        <View className="flex-row items-center flex-wrap gap-2 mt-1.5">
          <Text
            className={cn(
              'text-[10px] italic',
              isMyComment ? 'text-slate-700' : 'text-slate-400',
            )}
          >
            (Original)
          </Text>
          <Pressable onPress={toggleToTranslation} hitSlop={8}>
            <Text
              className={cn(
                'text-[10px] underline font-semibold',
                isMyComment ? 'text-slate-900' : 'text-primary',
              )}
            >
              Show Translation ({translatedLang.label})
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (isMyComment) {
    return (
      <>
        {bubble}
      </>
    );
  }

  return (
    <View className="flex-row items-center gap-2">
      <View className="shrink">{bubble}</View>
      <View
        className="w-5 h-5 items-center justify-center"
        style={{ marginLeft: 8 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#7A8AA8" />
        ) : (
          <Pressable
            onPress={openLanguagePicker}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Translate message"
            style={{ opacity: 0.7 }}
          >
            <Ionicons name="language" size={18} color="#5F6E89" />
          </Pressable>
        )}
      </View>

      <Modal
        isVisible={sheetOpen}
        onBackdropPress={closeSheet}
        onBackButtonPress={closeSheet}
        style={sheetStyles.modal}
        backdropOpacity={0.55}
        useNativeDriver
        hideModalContentWhileAnimating
        animationIn="slideInUp"
        animationOut="slideOutDown"
      >
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.dragHandle} />
          <Text style={sheetStyles.sheetTitle}>Translate to…</Text>
          {LANGUAGES.map((lang, idx) => (
            <Pressable
              key={lang.code}
              onPress={() => onPickLanguage(lang)}
              style={[
                sheetStyles.sheetRow,
                idx === LANGUAGES.length - 1 && sheetStyles.sheetRowLast,
              ]}
              android_ripple={{ color: '#22304D' }}
            >
              <Text style={sheetStyles.sheetRowText}>{lang.label}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={closeSheet}
            style={sheetStyles.sheetCancel}
            android_ripple={{ color: '#22304D' }}
          >
            <Text style={sheetStyles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  modal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  sheet: {
    backgroundColor: '#1C2538',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A4D71',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetTitle: {
    color: '#9BA8C2',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 14,
  },
  sheetRow: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#2C3A57',
  },
  sheetRowLast: {
    borderBottomWidth: 0,
  },
  sheetRowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'left',
  },
  sheetCancel: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#2C3A57',
    marginTop: 8,
  },
  sheetCancelText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
