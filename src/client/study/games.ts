import type { LanguageConfig } from '../../shared/languages.ts';

export interface GameInfo {
  id: 'match' | 'choice' | 'cloze' | 'spelling' | 'scramble';
  name: string;
  icon: string;
  description: string;
  available: (lang: LanguageConfig) => boolean;
}

export const GAMES: GameInfo[] = [
  { id: 'match', name: 'Match pairs', icon: '🧩', description: 'Pair words with their meanings against the clock.', available: () => true },
  { id: 'choice', name: 'Multiple choice', icon: '✅', description: 'Pick the right meaning, or the word that fits the sentence.', available: () => true },
  { id: 'cloze', name: 'Fill the gap', icon: '✏️', description: 'Type the missing word back into its sentence.', available: () => true },
  { id: 'spelling', name: 'Spelling', icon: '🎧', description: 'Hear the word (or see its meaning) and type it.', available: () => true },
  // Letter scramble needs an alphabet: skipped for Japanese, Chinese and Korean.
  { id: 'scramble', name: 'Letter scramble', icon: '🔀', description: 'Put the letters back in order.', available: (l) => l.alphabetic },
];
