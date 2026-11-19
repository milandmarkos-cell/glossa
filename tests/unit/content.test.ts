import { describe, expect, it } from 'vitest';
import { coverage, glossaryFor, loadContent, parseDictionary, parseStory, syncStories } from '../../src/server/content.ts';
import { openDb } from '../../src/server/db.ts';
import { lemmaKeyFn, lookupGloss } from '../../src/shared/gloss.ts';
import { tokenize } from '../../src/shared/tokenize.ts';

const FIXTURES = 'tests/fixtures/content';

describe('content parsing', () => {
  it('parses story front matter', () => {
    const s = parseStory('x.md', 'es', '---\ntitle: Hola\nlevel: B1\ntopics: travel, cooking\n---\nTexto.\n');
    expect(s).toMatchObject({ slug: 'es/x', title: 'Hola', level: 'B1', topics: ['travel', 'cooking'], body: 'Texto.' });
  });
  it('rejects bad levels, unknown topics and missing front matter', () => {
    expect(() => parseStory('x.md', 'es', '---\ntitle: a\nlevel: D9\n---\nb')).toThrow(/level/);
    expect(() => parseStory('x.md', 'es', '---\ntitle: a\nlevel: A1\ntopics: astrology\n---\nb')).toThrow(/topic/);
    expect(() => parseStory('x.md', 'es', 'no front matter')).toThrow(/front matter/);
  });
  it('parses dictionary lines, comments, optional pos/lemma; rejects duplicates', () => {
    const d = parseDictionary('d', 'es', '# comment\nCasa | house | noun\ncome | eats | verb | comer  # inline\nya | already\n');
    expect(d.get('casa')).toEqual({ translation: 'house', pos: 'noun', lemma: 'Casa' });
    expect(d.get('come')).toEqual({ translation: 'eats', pos: 'verb', lemma: 'comer' });
    expect(d.get('ya')).toEqual({ translation: 'already', pos: null, lemma: 'ya' });
    expect(() => parseDictionary('d', 'es', 'casa | a\nCASA | b')).toThrow(/duplicate/);
    expect(() => parseDictionary('d', 'es', 'casa')).toThrow(/expected/);
  });
  it('keys Serbian entries by Latin form so either script matches', () => {
    const d = parseDictionary('d', 'sr', 'столица | chair | noun');
    expect(d.has('stolica')).toBe(true);
  });
});

describe('glossary + lemma matching', () => {
  const content = loadContent(FIXTURES);
  const es = content.dictionaries.get('es')!;

  it('builds a glossary with forms and their lemmas', () => {
    const g = glossaryFor(es, 'Lucía come en la casa.', 'es');
    expect(g.come.translation).toBe('eats');
    expect(g.comer.translation).toBe('to eat'); // lemma included
    expect(g.lucia).toBeUndefined();
  });

  it('inflected forms share their lemma key (casa/casas, stolica/stolici)', () => {
    const g = glossaryFor(es, 'La casa. Las casas.', 'es');
    const tk = tokenize('La casa. Las casas.', 'es', { keyFor: lemmaKeyFn(g, 'es') });
    const k = (w: string) => tk.tokens.find((t) => t.text === w)!.k;
    expect(k('casa')).toBe(k('casas'));
    expect(k('La')).toBe(k('Las'));

    const sr = content.dictionaries.get('sr')!;
    const body = 'Столица је нова. Седим на столици.';
    const gs = glossaryFor(sr, body, 'sr');
    const ts = tokenize(body, 'sr', { keyFor: lemmaKeyFn(gs, 'sr') });
    expect(ts.tokens.find((t) => t.text === 'Столица')!.k).toBe(ts.tokens.find((t) => t.text === 'столици')!.k);
  });

  it('lookupGloss returns form and lemma entries', () => {
    const g = glossaryFor(es, 'come', 'es');
    expect(lookupGloss(g, 'Come', 'es')).toMatchObject({ lemma: 'comer', key: 'comer', entry: { translation: 'eats' }, lemmaEntry: { translation: 'to eat' } });
    expect(lookupGloss(g, 'Lucía', 'es')).toEqual({ entry: null, lemma: null, key: 'lucía', lemmaEntry: null });
  });

  it('coverage reports missing forms', () => {
    const r = coverage(content).find((x) => x.language === 'es')!;
    expect(r.missing.map((m) => m.surface)).toEqual(['Lucía']);
    expect(r.missingLemmas).toEqual([]);
  });
});

describe('syncStories', () => {
  it('inserts, is idempotent, updates by slug, retires removed stories', () => {
    const db = openDb(':memory:');
    const { stories } = loadContent(FIXTURES);
    expect(syncStories(db, stories)).toEqual({ created: 2, updated: 0 });
    expect(syncStories(db, stories)).toEqual({ created: 0, updated: 0 });
    const edited = stories.map((s) => (s.language === 'es' ? { ...s, title: 'La casa grande', body: s.body + ' Fin.' } : s));
    expect(syncStories(db, edited)).toEqual({ created: 0, updated: 1 });
    const row = db.prepare(`SELECT title, source_type, license FROM texts WHERE slug = 'es/a1-la-casa'`).get() as Record<string, string>;
    expect(row).toEqual({ title: 'La casa grande', source_type: 'story', license: expect.stringMatching(/CC0/) });
    syncStories(db, edited.filter((s) => s.language === 'es'));
    expect((db.prepare(`SELECT COUNT(*) AS n FROM texts`).get() as { n: number }).n).toBe(1);
  });
});

describe('bundled content', () => {
  const content = loadContent('content');
  it('has stories in Spanish, Serbian and Japanese', () => {
    for (const l of ['es', 'sr', 'ja']) expect(content.stories.some((s) => s.language === l)).toBe(true);
  });
  it('dictionaries cover every word in every story (run `npm run content:check` for the list)', () => {
    for (const r of coverage(content)) {
      expect(r.missing.map((m) => `${r.language}: ${m.surface}`)).toEqual([]);
      expect(r.missingLemmas.map((m) => `${r.language}: lemma ${m.lemma}`)).toEqual([]);
    }
  });
});
