import { normalizeKey } from './normalize.ts';
import type { GlossEntry } from './types.ts';

export type Glossary = Record<string, GlossEntry>;

export interface WordGloss {
  /** Entry for the exact form clicked (e.g. "come" → "eats"). */
  entry: GlossEntry | null;
  /** Dictionary form (e.g. "comer"), or null when the word isn't in the dictionary. */
  lemma: string | null;
  /** Match key: the lemma's key when known, so all forms of a word highlight and save together. */
  key: string;
  /** Entry for the dictionary form (e.g. "comer" → "to eat"). */
  lemmaEntry: GlossEntry | null;
}

export function lookupGloss(glossary: Glossary, form: string, language: string): WordGloss {
  const formKey = normalizeKey(form, language);
  const entry = glossary[formKey] ?? null;
  if (!entry) return { entry: null, lemma: null, key: formKey, lemmaEntry: null };
  const key = normalizeKey(entry.lemma, language);
  return { entry, lemma: entry.lemma, key, lemmaEntry: glossary[key] ?? entry };
}

/** keyFor() for tokenize(): inflected forms share their lemma's key. */
export const lemmaKeyFn = (glossary: Glossary, language: string) => (_surface: string, normalized: string) => {
  const e = glossary[normalized];
  return e ? normalizeKey(e.lemma, language) : normalized;
};
