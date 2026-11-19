import type { CefrLevel } from './languages.ts';

export type SourceType =
  | 'sample' | 'wikipedia' | 'wikinews' | 'rss' | 'gutenberg' | 'wikisource' | 'ai' | 'user';

export interface TextSummary {
  id: number;
  language: string;
  title: string;
  level: CefrLevel | null;
  topics: string[];
  sourceType: SourceType;
  sourceName: string;
  author: string | null;
  license: string;
  url: string | null;
  wordCount: number;
  excerpt: string;
  createdAt: string;
}

export interface TextDetail extends TextSummary {
  body: string;
}

export interface NewTextInput {
  language: string;
  title: string;
  body: string;
  url?: string | null;
}

export type WordStatus = 'new' | 'learning' | 'known';

export interface ReaderPrefs {
  fontSize: number; // px
  lineHeight: number;
  theme: 'system' | 'light' | 'dark';
  showSaved: boolean;
  script: 'original' | 'latn' | 'cyrl';
}

export interface Settings {
  nativeLanguage: string;
  targetLanguage: string;
  levels: Record<string, CefrLevel>;
  interests: string[];
  newCardsPerDay: number;
  reader: ReaderPrefs;
  onboarded: boolean;
}

export type SettingsPatch = Partial<Omit<Settings, 'reader'>> & { reader?: Partial<ReaderPrefs> };

export const DEFAULT_SETTINGS: Settings = {
  nativeLanguage: 'en',
  targetLanguage: 'es',
  levels: {},
  interests: [],
  newCardsPerDay: 10,
  reader: { fontSize: 20, lineHeight: 1.8, theme: 'system', showSaved: true, script: 'original' },
  onboarded: false,
};

/** Library key entry used by the reader to style already-saved words. */
export interface SavedKey {
  key: string;
  status: WordStatus;
}

// ---- Translation (Claude, server-side) ----

export interface TranslateItem {
  surface: string;
  sentence: string;
}

export interface WordInfo {
  translation: string;
  pos: string;
  lemma: string;
}

export type TranslateResponse =
  | { ok: true; results: WordInfo[] }
  | { ok: false; reason: string; aiDisabled?: boolean };

// ---- Library ----

export interface WordContext {
  id: number;
  textId: number | null;
  sentence: string;
  offset: number;
  form: string | null;
  sourceTitle: string | null;
  createdAt: string;
}

export interface Word {
  id: number;
  language: string;
  surface: string;
  lemma: string | null;
  key: string;
  translation: string | null;
  pos: string | null;
  notes: string | null;
  status: WordStatus;
  createdAt: string;
  updatedAt: string;
  contexts: WordContext[];
}

export interface SaveWordInput {
  surface: string;
  translation?: string | null;
  pos?: string | null;
  lemma?: string | null;
  sentence: string;
  offset: number;
  form: string;
}

export interface SaveWordsRequest {
  language: string;
  textId: number | null;
  words: SaveWordInput[];
}

export interface SaveWordsResult {
  created: number;
  updated: number;
  words: Word[];
}

export interface WordPatch {
  surface?: string;
  translation?: string | null;
  pos?: string | null;
  lemma?: string | null;
  notes?: string | null;
  status?: WordStatus;
}

export interface ApiError {
  error: string;
}
