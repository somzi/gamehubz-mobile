import i18n from '../i18n';
import { apiClient } from './api'; // Uvozimo tvoju konfigurisanu instancu sa tokenima

export interface TranslateResponse {
  OriginalText?: string;
  TranslatedText?: string;
  DetectedSourceLanguage?: string;
  originalText?: string;
  translatedText?: string;
  detectedSourceLanguage?: string;
}

export interface TranslateRequest {
  Text: string;
  TargetLanguage: string;
}

export async function translateMessage(
  text: string,
  targetLang: string,
): Promise<string> {
  const payload: TranslateRequest = {
    Text: text,
    TargetLanguage: targetLang,
  };

  // Koristimo apiClient umesto sirovog axios-a. 
  // Pošto apiClient već ima bazični URL, šaljemo samo relativnu putanju.
  const { data } = await apiClient.post<TranslateResponse>(
    '/api/translation/translate',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );

  const translated =
    (typeof data?.TranslatedText === 'string' && data.TranslatedText) ||
    (typeof data?.translatedText === 'string' && data.translatedText) ||
    '';

  if (!translated) {
    throw new Error(i18n.t('common:translationEmpty'));
  }

  return translated;
}