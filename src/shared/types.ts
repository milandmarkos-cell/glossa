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

export interface ApiError {
  error: string;
}
