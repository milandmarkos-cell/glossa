import { describe, expect, it } from 'vitest';
import { tokenize, contextFor, occurrences, splitParagraphs } from '../../src/shared/tokenize.ts';
import { normalizeKey, foldForAnswer } from '../../src/shared/normalize.ts';
import { cyrToLat, latToCyr } from '../../src/shared/script.ts';
import { LANGUAGES } from '../../src/shared/languages.ts';

const words = (body: string, lang: string) => tokenize(body, lang).tokens.filter((t) => t.word).map((t) => t.text);

describe('normalizeKey', () => {
  it('lowercases, NFC-normalizes and strips punctuation', () => {
    expect(normalizeKey('¿Dónde', 'es')).toBe('dónde');
    expect(normalizeKey('«Hola»', 'es')).toBe('hola');
    // decomposed é (e + U+0301) equals precomposed é
    expect(normalizeKey('Café', 'fr')).toBe(normalizeKey('Café', 'fr'));
  });
  it('keeps word-internal apostrophes and hyphens, unifies typographic apostrophe', () => {
    expect(normalizeKey('Don’t', 'en')).toBe("don't");
    expect(normalizeKey('well-known.', 'en')).toBe('well-known');
  });
  it('uses locale-aware lowercasing and folds German ß', () => {
    expect(normalizeKey('STRASSE', 'de')).toBe('strasse');
    expect(normalizeKey('Straße', 'de')).toBe(normalizeKey('STRASSE', 'de'));
  });
  it('folds Serbian Cyrillic to Latin so both scripts match', () => {
    expect(normalizeKey('Столица', 'sr')).toBe('stolica');
    expect(normalizeKey('stolica', 'sr')).toBe('stolica');
    expect(normalizeKey('Љубав', 'sr')).toBe('ljubav');
  });
  it('drops optional Arabic diacritics', () => {
    expect(normalizeKey('ذهبتُ', 'ar')).toBe(normalizeKey('ذهبت', 'ar'));
  });
});

describe('foldForAnswer (accent-tolerant checking)', () => {
  it('ignores accents and case for alphabetic languages', () => {
    expect(foldForAnswer('Está', 'es')).toBe(foldForAnswer('esta', 'es'));
    expect(foldForAnswer('čaša', 'sr')).toBe(foldForAnswer('casa', 'sr'));
    expect(foldForAnswer('чаша', 'sr')).toBe(foldForAnswer('časa', 'sr'));
  });
  it('keeps kana dakuten significant', () => {
    expect(foldForAnswer('が', 'ja')).not.toBe(foldForAnswer('か', 'ja'));
  });
});

describe('Serbian transliteration', () => {
  it('round-trips including digraphs and case', () => {
    expect(cyrToLat('Љубав и њега, Џеп, ЉУБАВ')).toBe('Ljubav i njega, Džep, LJUBAV');
    expect(latToCyr('Ljubav i njega, Džep')).toBe('Љубав и њега, Џеп');
    expect(latToCyr(cyrToLat('Ђорђе је купио столицу.'))).toBe('Ђорђе је купио столицу.');
  });
});

describe('tokenize', () => {
  it('marks only letter-bearing segments as words (not punctuation, spaces or numbers)', () => {
    const t = tokenize('¡Hola, mundo! Tengo 3 gatos.', 'es');
    expect(t.tokens.filter((x) => x.word).map((x) => x.text)).toEqual(['Hola', 'mundo', 'Tengo', 'gatos']);
    expect(t.tokens.find((x) => x.text === '3')?.word).toBe(false);
    expect(t.tokens.find((x) => x.text === ',')?.word).toBe(false);
    // Token texts cover the paragraph exactly.
    expect(t.tokens.map((x) => x.text).join('')).toBe('¡Hola, mundo! Tengo 3 gatos.');
  });

  it('segments Japanese without spaces', () => {
    const w = words('私は毎朝、駅の近くのカフェでコーヒーを飲みます。', 'ja');
    expect(w).toContain('カフェ');
    expect(w).toContain('コーヒー');
    expect(w).not.toContain('、');
    expect(w.length).toBeGreaterThan(8);
  });

  it('segments Chinese and Thai-like scripts', () => {
    expect(words('我今天去图书馆看书。', 'zh').length).toBeGreaterThan(3);
  });

  it('handles Arabic (RTL) text', () => {
    expect(words('ذهبتُ إلى السوق، واشتريتُ الخبز.', 'ar')).toEqual(['ذهبتُ', 'إلى', 'السوق', 'واشتريتُ', 'الخبز']);
  });

  it('splits French elision clitics', () => {
    expect(words("L'eau d'ici, c'est bon.", 'fr')).toEqual(["L'", 'eau', "d'", 'ici', "c'", 'est', 'bon']);
    // not for English
    expect(words("Don't stop.", 'en')).toEqual(["Don't", 'stop']);
  });

  it('assigns the same key id to every occurrence regardless of case/punctuation', () => {
    const t = tokenize('La casa es grande. ¡Casa! Mi CASA, tu casa.', 'es');
    const casa = t.tokens.filter((x) => x.word && x.text.toLowerCase() === 'casa');
    expect(casa).toHaveLength(4);
    expect(new Set(casa.map((x) => x.k)).size).toBe(1);
    expect(occurrences(t, casa[0].k)).toHaveLength(4);
  });

  it('matches Serbian across scripts', () => {
    const t = tokenize('Столица је ту. Sedim na stolica.', 'sr');
    const a = t.tokens.find((x) => x.text === 'Столица')!;
    const b = t.tokens.find((x) => x.text === 'stolica')!;
    expect(a.k).toBe(b.k);
  });

  it('distinguishes inflected forms in phase 1 (lemma matching comes later)', () => {
    const t = tokenize('Stolica je nova. Sedim na stolici.', 'sr');
    const a = t.tokens.find((x) => x.text === 'Stolica')!;
    const b = t.tokens.find((x) => x.text === 'stolici')!;
    expect(a.k).not.toBe(b.k);
  });

  it('supports a custom key function (lemma map)', () => {
    const lemmas: Record<string, string> = { stolica: 'stolica', stolici: 'stolica' };
    const t = tokenize('Stolica je nova. Sedim na stolici.', 'sr', { keyFor: (_s, n) => lemmas[n] ?? n });
    const a = t.tokens.find((x) => x.text === 'Stolica')!;
    const b = t.tokens.find((x) => x.text === 'stolici')!;
    expect(a.k).toBe(b.k);
  });

  it('records paragraphs and sentence context with offsets', () => {
    const body = 'Primera frase. Segunda frase con gato.\n\nOtro párrafo aquí.';
    const t = tokenize(body, 'es');
    expect(t.paragraphs).toHaveLength(2);
    const gato = t.tokens.find((x) => x.text === 'gato')!;
    const ctx = contextFor(t, gato);
    expect(ctx.sentence).toBe('Segunda frase con gato.');
    expect(ctx.sentence.slice(ctx.offset, ctx.offset + 4)).toBe('gato');
    expect(t.tokens.find((x) => x.text === 'Otro')!.paragraph).toBe(1);
  });

  it('splits paragraphs on blank lines only', () => {
    expect(splitParagraphs('a\nb\n\n\n  c  \n \n d')).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 9 },
      { start: 15, end: 16 },
    ]);
  });

  it('tokenizes a 3,000-word text quickly', () => {
    const para = 'El gato negro duerme en la casa grande mientras la lluvia cae sobre el tejado. ';
    const body = Array.from({ length: 20 }, () => para.repeat(10)).join('\n\n');
    const t0 = performance.now();
    const t = tokenize(body, 'es');
    const ms = performance.now() - t0;
    expect(t.wordCount).toBeGreaterThanOrEqual(3000);
    expect(ms).toBeLessThan(500);
  });

  it('keeps Japanese verbs together with their okurigana and polite endings', () => {
    const w = words('コーヒーを飲みます。リードを持っています。公園へ行きます。水をくれます。ゆいさんは歩いて、話しています。', 'ja');
    for (const v of ['飲みます', '持っています', '行きます', 'くれます', 'ゆい', '歩いて', '話しています']) expect(w).toContain(v);
    // particles, copula and honorifics stay separate
    expect(w).toContain('を');
    expect(w).toContain('さん');
    expect(w).not.toContain('飲');
  });

  it('does not make URLs or email addresses clickable', () => {
    expect(words('Visit https://example.com/a?b=1, or write to me@test.org. See www.foo.org.', 'en')).toEqual(['Visit', 'or', 'write', 'to', 'See']);
  });

  it('every configured language tokenizes', () => {
    for (const l of LANGUAGES) expect(() => tokenize('test', l.code)).not.toThrow();
  });
});
