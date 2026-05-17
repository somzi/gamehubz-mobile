import React, { JSX, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
  flag: string;
}

const LANGUAGES: Language[] = [
  { label: 'Srpski', code: 'SR', flag: '🇷🇸' },
  { label: 'English', code: 'EN-US', flag: '🇺🇸' },
  { label: 'Español', code: 'ES', flag: '🇪🇸' },
  { label: 'German', code: 'DE', flag: '🇩🇪' },
  { label: 'French', code: 'FR', flag: '🇫🇷' },
  { label: 'Hindi', code: 'HI', flag: '🇮🇳' },
  { label: 'Arabic', code: 'AR', flag: '🇸🇦' },
  { label: 'Português', code: 'PT-PT', flag: '🇵🇹' },
  { label: 'Italiano', code: 'IT', flag: '🇮🇹' },
  { label: 'Türkçe', code: 'TR', flag: '🇹🇷' },
  { label: 'Русский', code: 'RU', flag: '🇷🇺' },
  { label: 'Polski', code: 'PL', flag: '🇵🇱' },
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
          <View style={sheetStyles.sheetHeader}>
            <View style={sheetStyles.iconCircle}>
              <Ionicons name="language" size={24} color="#7FB0FF" />
            </View>
            <Text style={sheetStyles.sheetTitle}>Translate Message</Text>
            <Text style={sheetStyles.sheetSubtitle}>
              Choose a target language
            </Text>
          </View>
          <ScrollView
            style={sheetStyles.sheetList}
            contentContainerStyle={sheetStyles.grid}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {LANGUAGES.map((lang) => {
              const isActive = translatedLang?.code === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => onPickLanguage(lang)}
                  style={({ pressed }) => [
                    sheetStyles.langCell,
                    pressed && sheetStyles.langCellPressed,
                  ]}
                >
                  <View style={[sheetStyles.flagWrap, isActive && sheetStyles.flagWrapActive]}>
                    <Text style={sheetStyles.langFlag}>{lang.flag}</Text>
                  </View>
                  <Text style={[sheetStyles.langName, isActive && sheetStyles.langNameActive]}>
                    {lang.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={sheetStyles.footer}>
            <Pressable
              onPress={closeSheet}
              style={({ pressed }) => [
                sheetStyles.cancelBtn,
                pressed && sheetStyles.cancelBtnPressed,
              ]}
            >
              <Text style={sheetStyles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
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
    backgroundColor: '#111827',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 32,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2E3D5C',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 0,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(127,176,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(127,176,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  sheetSubtitle: {
    color: '#4A5A7A',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    textAlign: 'center',
  },
  sheetList: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: 24,
    paddingBottom: 16,
    rowGap: 24,
  },
  langCell: {
    width: '25%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langCellPressed: {
    opacity: 0.6,
  },
  flagWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  flagWrapActive: {
    backgroundColor: 'rgba(127,176,255,0.15)',
  },
  langFlag: {
    fontSize: 28,
  },
  langName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  langNameActive: {
    color: '#7FB0FF',
    fontWeight: '700',
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  cancelBtn: {
    alignSelf: 'center',
    paddingVertical: 18,
    paddingHorizontal: 40,
  },
  cancelBtnPressed: {
    opacity: 0.6,
  },
  cancelText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
