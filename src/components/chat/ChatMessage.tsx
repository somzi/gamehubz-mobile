import React, { JSX, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { Ionicons } from '@expo/vector-icons';
import { translateMessage } from '../../lib/translationApi';

interface Language {
  label: string;
  code: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { label: 'Srpski', code: 'SR', flag: '🇷🇸' },
  { label: 'English', code: 'EN-US', flag: '🇬🇧' },
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

export interface ChatMessageProps {
  id: string;
  text: string;
  isOwn: boolean;
}

export function ChatMessage({ text, isOwn }: ChatMessageProps): JSX.Element {
  const [translated, setTranslated] = useState<string | null>(null);
  const [translatedLang, setTranslatedLang] = useState<Language | null>(null);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);

  const runTranslation = useCallback(
    async (lang: Language): Promise<void> => {
      setLoading(true);
      try {
        const result = await translateMessage(text, lang.code);
        setTranslated(result);
        setTranslatedLang(lang);
        setShowOriginal(false);
      } catch (err) {
        console.warn('Translation failed', err);
      } finally {
        setLoading(false);
      }
    },
    [text],
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
    translated && !showOriginal ? translated : text;
  const isShowingTranslation: boolean =
    !!translated && !showOriginal && !!translatedLang;
  const isShowingOriginalAfterTranslation: boolean =
    !!translated && showOriginal && !!translatedLang;

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isOwn ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isOwn ? styles.ownBubble : styles.otherBubble,
        ]}
      >
        <Text style={styles.text}>{displayText}</Text>

        {isShowingTranslation && translatedLang && (
          <View style={styles.translationMeta}>
            <Text style={styles.metaLabel}>
              (Translated to {translatedLang.label})
            </Text>
            <Pressable onPress={toggleToOriginal} hitSlop={8}>
              <Text style={styles.metaLink}>Show Original</Text>
            </Pressable>
          </View>
        )}

        {isShowingOriginalAfterTranslation && translatedLang && (
          <View style={styles.translationMeta}>
            <Text style={styles.metaLabel}>(Original)</Text>
            <Pressable onPress={toggleToTranslation} hitSlop={8}>
              <Text style={styles.metaLink}>
                Show Translation ({translatedLang.label})
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {!isOwn && (
        <View style={styles.iconSlot}>
          {loading ? (
            <ActivityIndicator size="small" color="#7A8AA8" />
          ) : (
            <Pressable
              onPress={openLanguagePicker}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Translate message"
              style={styles.iconPressable}
            >
              <Ionicons name="language" size={18} color="#5F6E89" />
            </Pressable>
          )}
        </View>
      )}

      <Modal
        isVisible={sheetOpen}
        onBackdropPress={closeSheet}
        onBackButtonPress={closeSheet}
        style={styles.modal}
        backdropOpacity={0.55}
        useNativeDriver
        hideModalContentWhileAnimating
        animationIn="slideInUp"
        animationOut="slideOutDown"
      >
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.sheetTitle}>Translate to…</Text>
          {LANGUAGES.map((lang, idx) => (
            <Pressable
              key={lang.code}
              onPress={() => onPickLanguage(lang)}
              style={[
                styles.sheetRow,
                idx === LANGUAGES.length - 1 && styles.sheetRowLast,
              ]}
              android_ripple={{ color: '#22304D' }}
            >
              <Text style={styles.sheetRowText}>
                {lang.flag}  {lang.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={closeSheet}
            style={styles.sheetCancel}
            android_ripple={{ color: '#22304D' }}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingHorizontal: 12,
    gap: 6,
  },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  ownBubble: {
    backgroundColor: '#2F6BFF',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#1C2538',
    borderBottomLeftRadius: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
  iconSlot: {
    width: 22,
    height: 22,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressable: {
    opacity: 0.7,
  },
  translationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 6,
  },
  metaLabel: {
    color: '#9BA8C2',
    fontSize: 11,
    fontStyle: 'italic',
  },
  metaLink: {
    color: '#7FB0FF',
    fontSize: 11,
    textDecorationLine: 'underline',
  },
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
