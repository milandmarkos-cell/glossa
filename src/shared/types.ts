import type { CefrLevel } from './languages.ts';

export type SourceType = 'story' | 'user';

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

/** Dictionary entry for one word form. `lemma` is the dictionary form (may equal the form). */
export interface GlossEntry {
  translation: string;
  pos: string | null;
  lemma: string;
}

export interface TextDetail extends TextSummary {
  body: string;
  /** Entries for every word form in the text (keyed by normalizeKey) plus their lemmas. */
  glossary: Record<string, GlossEntry>;
}

export interface LanguageInfo {
  code: string;
  stories: number;
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

// ---- Study ----

export type CardType = 'recognition' | 'production';

export interface SrsStateDTO {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  due: string; // ISO
  lastReviewed: string | null; // ISO
}

export interface StudyCard {
  word: Word;
  cardType: CardType;
  state: SrsStateDTO;
  isNew: boolean;
}

export interface StudyQueue {
  cards: StudyCard[];
  due: number;
  newAvailable: number;
  newToday: number;
  newLimit: number;
}

export interface StudyStats {
  streak: number;
  reviewedToday: number;
  dueNow: number;
  total: number;
  byStatus: Record<WordStatus, number>;
}

export interface ReviewResult {
  state: SrsStateDTO;
  status: WordStatus;
  rescheduled: boolean;
}

export interface ApiError {
  error: string;
}
