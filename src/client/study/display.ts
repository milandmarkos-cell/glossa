import { getLanguage } from '../../shared/languages.ts';
import { toScript } from '../../shared/script.ts';
import type { ReaderPrefs } from '../../shared/types.ts';

/** Show target-language text in the learner's chosen script (Serbian Cyrillic/Latin toggle). */
export function displayText(text: string, language: string, prefs: ReaderPrefs): string {
  return getLanguage(language).scripts && prefs.script !== 'original' ? toScript(text, prefs.script) : text;
}
