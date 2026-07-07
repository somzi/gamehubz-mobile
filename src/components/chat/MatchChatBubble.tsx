import React, { JSX, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { translateMessage } from '../../lib/translationApi';
import {
  Language,
  TranslateLanguageSheet,
} from './TranslateLanguageSheet';

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

      <TranslateLanguageSheet
        visible={sheetOpen}
        activeCode={translatedLang?.code ?? null}
        onSelect={onPickLanguage}
        onClose={closeSheet}
      />
    </View>
  );
}
