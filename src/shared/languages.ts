/**
 * Language registry. Adding a language is config-only: add an entry here.
 * Everything else (tokenizer locale, direction, TTS voice, sources, frequency list) reads from it.
 */
export type Script = 'latn' | 'cyrl';

export interface LanguageConfig {
  code: string; // ISO 639-1, also the DB `language` value
  name: string; // English name
  nativeName: string;
  locale: string; // BCP-47 locale for Intl.Segmenter / toLocaleLowerCase
  dir: 'ltr' | 'rtl';
  /** Words separated by spaces? false for zh/ja (affects joins, scramble, cloze UI). */
  spaced: boolean;
  /** Alphabetic script where letter scramble makes sense. */
  alphabetic: boolean;
  /** Scripts the language is commonly written in; >1 enables the script toggle. */
  scripts?: Script[];
  /** Match keys are folded to this script so both scripts highlight together. */
  keyScript?: Script;
  /** Split elided clitics into their own token (French l'eau → l' + eau). */
  splitElision?: boolean;
  /** Web Speech API voice language. */
  ttsLang: string;
  /** Frequency list code (Hermit Dave FrequencyWords, OpenSubtitles 2018, CC BY-SA 4.0). */
  frequencyCode: string;
  /** Wikipedia / Wikinews subdomains (null = not available). */
  wikipedia: string | null;
  wikinews: string | null;
  /** Gutenberg language filter code. */
  gutenberg: string | null;
  /** Global Voices language subdomain (CC BY 3.0). */
  globalVoices: string | null;
}

export const LANGUAGES: LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', locale: 'en', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'en-US', frequencyCode: 'en', wikipedia: 'en', wikinews: 'en', gutenberg: 'en', globalVoices: 'globalvoices.org' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', locale: 'es', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'es-ES', frequencyCode: 'es', wikipedia: 'es', wikinews: 'es', gutenberg: 'es', globalVoices: 'es.globalvoices.org' },
  { code: 'fr', splitElision: true, name: 'French', nativeName: 'Français', locale: 'fr', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'fr-FR', frequencyCode: 'fr', wikipedia: 'fr', wikinews: 'fr', gutenberg: 'fr', globalVoices: 'fr.globalvoices.org' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', locale: 'de', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'de-DE', frequencyCode: 'de', wikipedia: 'de', wikinews: 'de', gutenberg: 'de', globalVoices: 'de.globalvoices.org' },
  { code: 'it', splitElision: true, name: 'Italian', nativeName: 'Italiano', locale: 'it', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'it-IT', frequencyCode: 'it', wikipedia: 'it', wikinews: 'it', gutenberg: 'it', globalVoices: 'it.globalvoices.org' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', locale: 'pt', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'pt-BR', frequencyCode: 'pt', wikipedia: 'pt', wikinews: 'pt', gutenberg: 'pt', globalVoices: 'pt.globalvoices.org' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', locale: 'ru', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'ru-RU', frequencyCode: 'ru', wikipedia: 'ru', wikinews: 'ru', gutenberg: 'ru', globalVoices: 'ru.globalvoices.org' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски / Srpski', locale: 'sr', dir: 'ltr', spaced: true, alphabetic: true, scripts: ['cyrl', 'latn'], keyScript: 'latn', ttsLang: 'sr-RS', frequencyCode: 'sr', wikipedia: 'sr', wikinews: 'sr', gutenberg: 'sr', globalVoices: 'sr.globalvoices.org' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', locale: 'pl', dir: 'ltr', spaced: true, alphabetic: true, ttsLang: 'pl-PL', frequencyCode: 'pl', wikipedia: 'pl', wikinews: 'pl', gutenberg: 'pl', globalVoices: 'pl.globalvoices.org' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', locale: 'ja', dir: 'ltr', spaced: false, alphabetic: false, ttsLang: 'ja-JP', frequencyCode: 'ja', wikipedia: 'ja', wikinews: 'ja', gutenberg: 'ja', globalVoices: 'ja.globalvoices.org' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', locale: 'zh', dir: 'ltr', spaced: false, alphabetic: false, ttsLang: 'zh-CN', frequencyCode: 'zh_cn', wikipedia: 'zh', wikinews: 'zh', gutenberg: 'zh', globalVoices: 'zhs.globalvoices.org' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', locale: 'ko', dir: 'ltr', spaced: true, alphabetic: false, ttsLang: 'ko-KR', frequencyCode: 'ko', wikipedia: 'ko', wikinews: 'ko', gutenberg: 'ko', globalVoices: 'ko.globalvoices.org' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', locale: 'ar', dir: 'rtl', spaced: true, alphabetic: true, ttsLang: 'ar-SA', frequencyCode: 'ar', wikipedia: 'ar', wikinews: 'ar', gutenberg: 'ar', globalVoices: 'ar.globalvoices.org' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): LanguageConfig {
  const lang = BY_CODE.get(code);
  if (!lang) throw new Error(`Unsupported language: ${code}`);
  return lang;
}

export function isSupportedLanguage(code: string): boolean {
  return BY_CODE.has(code);
}

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const TOPICS = [
  'technology', 'science', 'nature', 'sports', 'cars', 'business',
  'cooking', 'travel', 'history', 'culture', 'health',
] as const;
