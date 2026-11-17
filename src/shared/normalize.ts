import { getLanguage } from './languages.ts';
import { cyrToLat, latToCyr } from './script.ts';

// Edge punctuation/symbols (incl. quotes, ¿¡, «», 「」, Arabic punctuation) — removed from both ends.
const EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
// Inner punctuation except word-internal apostrophes and hyphens (l'eau, don't, porte-monnaie).
const INNER_PUNCT = /[^\p{L}\p{M}\p{N}'’\-]/gu;
// Arabic tatweel and harakat (short-vowel diacritics) are optional in writing: fold them away.
const ARABIC_OPTIONAL = /[ـً-ٰٟ]/g;

/**
 * The key used to match occurrences of a word: NFC, locale lowercase, punctuation stripped,
 * typographic apostrophe unified, folded to the language's key script (Serbian → Latin).
 */
export function normalizeKey(surface: string, language: string): string {
  const lang = getLanguage(language);
  let s = surface.normalize('NFC').toLocaleLowerCase(lang.locale);
  s = s.replace(/’/g, "'").replace(EDGE_PUNCT, '').replace(INNER_PUNCT, '');
  if (lang.code === 'ar') s = s.replace(ARABIC_OPTIONAL, '');
  if (lang.keyScript === 'latn') s = cyrToLat(s);
  else if (lang.keyScript === 'cyrl') s = latToCyr(s);
  return s;
}

/** Accent/diacritic-insensitive comparison form, for typed answers in cloze/spelling games. */
export function foldForAnswer(s: string, language: string): string {
  const lang = getLanguage(language);
  let out = s.trim().normalize('NFC').toLocaleLowerCase(lang.locale);
  if (lang.keyScript === 'latn') out = cyrToLat(out);
  // Non-alphabetic scripts (kana dakuten, hangul) carry meaning in marks: only strip punctuation there.
  if (!lang.alphabetic) return out.replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  return out
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'dj')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
