import React, { JSX, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translateMessage } from '../../lib/translationApi';
import {
  Language,
  TranslateLanguageSheet,
} from './TranslateLanguageSheet';

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

      <TranslateLanguageSheet
        visible={sheetOpen}
        activeCode={translatedLang?.code ?? null}
        onSelect={onPickLanguage}
        onClose={closeSheet}
      />
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
});
