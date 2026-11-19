import { getLanguage } from './languages.ts';
import { foldForAnswer } from './normalize.ts';
import { cyrToLat } from './script.ts';

export type AnswerResult = 'exact' | 'accents' | 'wrong';

/** Case-insensitive; Serbian accepted in either script; accents/diacritics tolerated but reported. */
export function checkAnswer(input: string, expected: string, language: string): AnswerResult {
  const lang = getLanguage(language);
  const norm = (s: string) => {
    let t = s.trim().normalize('NFC').toLocaleLowerCase(lang.locale).replace(/[\s.,;:!?¡¿"«»“”'’()]+/g, ' ').trim();
    if (lang.keyScript === 'latn') t = cyrToLat(t);
    return t;
  };
  if (!input.trim()) return 'wrong';
  if (norm(input) === norm(expected)) return 'exact';
  if (foldForAnswer(input, language) === foldForAnswer(expected, language)) return 'accents';
  return 'wrong';
}

/** Progressive hint: the first `n` letters (graphemes) of the answer, the rest as dots. */
export function hint(expected: string, n: number, language: string): string {
  const g = [...new Intl.Segmenter(getLanguage(language).locale, { granularity: 'grapheme' }).segment(expected)].map((s) => s.segment);
  return g.map((c, i) => (i < n || /\s/.test(c) ? c : '·')).join('');
}

/** Split a word into letter tiles (graphemes, so accents stay on their letter). */
export function letters(word: string, language: string): string[] {
  return [...new Intl.Segmenter(getLanguage(language).locale, { granularity: 'grapheme' }).segment(word)].map((s) => s.segment);
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle letters so the result differs from the word whenever possible. */
export function scramble(word: string, language: string, rand: () => number = Math.random): string[] {
  const l = letters(word, language);
  if (new Set(l).size < 2) return l;
  for (let i = 0; i < 20; i++) {
    const s = shuffle(l, rand);
    if (s.join('') !== l.join('')) return s;
  }
  return [...l].reverse();
}
