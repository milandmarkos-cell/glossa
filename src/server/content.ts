import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.ts';
import { contentHash } from './repo/texts.ts';
import { CEFR_LEVELS, TOPICS, getLanguage, isSupportedLanguage, type CefrLevel } from '../shared/languages.ts';
import { normalizeKey } from '../shared/normalize.ts';
import { tokenize } from '../shared/tokenize.ts';
import type { GlossEntry } from '../shared/types.ts';

/**
 * Bundled content lives in content/<language>/:
 *   stories/<slug>.md   front matter (title, level, topics) + body (paragraphs separated by blank lines)
 *   dictionary.txt      one word form per line: `form | translation | part of speech | lemma`
 *                       (pos and lemma optional; lemma defaults to the form; `#` starts a comment)
 * Every lemma that differs from its form must also have its own line (that's the gloss shown in the library).
 */
export interface Story {
  slug: string;
  language: string;
  title: string;
  level: CefrLevel;
  topics: string[];
  body: string;
  file: string;
}

export type Dictionary = Map<string, GlossEntry>;

export interface Content {
  stories: Story[];
  dictionaries: Map<string, Dictionary>;
}

export const STORY_LICENSE = 'CC0 1.0 — original story written for Glossa';
export const STORY_SOURCE = 'Glossa stories';

export function parseStory(file: string, language: string, raw: string): Story {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const level = meta.level as CefrLevel;
  if (!CEFR_LEVELS.includes(level)) throw new Error(`${file}: level must be one of ${CEFR_LEVELS.join(', ')}`);
  if (!meta.title) throw new Error(`${file}: missing title`);
  const topics = (meta.topics ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  for (const t of topics) if (!(TOPICS as readonly string[]).includes(t)) throw new Error(`${file}: unknown topic "${t}"`);
  return { slug: `${language}/${path.basename(file, '.md')}`, language, title: meta.title, level, topics, body: m[2].trim(), file };
}

export function parseDictionary(file: string, language: string, raw: string): Dictionary {
  const dict: Dictionary = new Map();
  raw.split(/\r?\n/).forEach((line, n) => {
    const text = line.replace(/#.*$/, '').trim();
    if (!text) return;
    const [form, translation, pos, lemma] = text.split('|').map((p) => p.trim());
    if (!form || !translation) throw new Error(`${file}:${n + 1}: expected "form | translation | pos | lemma"`);
    const key = normalizeKey(form, language);
    if (!key) throw new Error(`${file}:${n + 1}: "${form}" has no letters`);
    if (dict.has(key)) throw new Error(`${file}:${n + 1}: duplicate entry for "${form}"`);
    dict.set(key, { translation, pos: pos || null, lemma: lemma || form });
  });
  return dict;
}

export function loadContent(dir: string): Content {
  const stories: Story[] = [];
  const dictionaries = new Map<string, Dictionary>();
  if (!fs.existsSync(dir)) return { stories, dictionaries };
  for (const language of fs.readdirSync(dir).sort()) {
    if (!isSupportedLanguage(language)) continue;
    const dictFile = path.join(dir, language, 'dictionary.txt');
    if (fs.existsSync(dictFile)) dictionaries.set(language, parseDictionary(dictFile, language, fs.readFileSync(dictFile, 'utf8')));
    const storyDir = path.join(dir, language, 'stories');
    if (!fs.existsSync(storyDir)) continue;
    for (const f of fs.readdirSync(storyDir).filter((f) => f.endsWith('.md')).sort()) {
      const file = path.join(storyDir, f);
      stories.push(parseStory(file, language, fs.readFileSync(file, 'utf8')));
    }
  }
  return { stories, dictionaries };
}

/** Insert or update bundled stories by slug. Returns counts. */
export function syncStories(db: DB, stories: Story[]): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  const bySlug = db.prepare('SELECT id, content_hash, title, level, topics FROM texts WHERE slug = ?');
  // Texts from older versions (before slugs) are adopted when their content matches.
  const byHash = db.prepare('SELECT id FROM texts WHERE language = ? AND content_hash = ? AND slug IS NULL');
  const insert = db.prepare(
    `INSERT INTO texts (user_id, language, title, body, level, topics, source_type, source_name, author, license, url, content_hash, word_count, slug)
     VALUES (NULL, @language, @title, @body, @level, @topics, 'story', @source, 'Glossa', @license, NULL, @hash, @wordCount, @slug)`,
  );
  const update = db.prepare(
    `UPDATE texts SET title = @title, body = @body, level = @level, topics = @topics, content_hash = @hash,
       word_count = @wordCount, slug = @slug, source_type = 'story', source_name = @source, license = @license
     WHERE id = @id`,
  );
  db.transaction(() => {
    for (const s of stories) {
      const hash = contentHash(s.body);
      const row = {
        language: s.language,
        title: s.title,
        body: s.body,
        level: s.level,
        topics: JSON.stringify(s.topics),
        hash,
        wordCount: tokenize(s.body, s.language).wordCount,
        slug: s.slug,
        source: STORY_SOURCE,
        license: STORY_LICENSE,
      };
      const current = bySlug.get(s.slug) as { id: number; content_hash: string; title: string; level: string; topics: string } | undefined;
      const adopted = current ? undefined : (byHash.get(s.language, hash) as { id: number } | undefined);
      if (current) {
        const changed = current.content_hash !== hash || current.title !== row.title || current.level !== row.level || current.topics !== row.topics;
        if (changed) {
          update.run({ ...row, id: current.id });
          updated++;
        }
      } else if (adopted) {
        update.run({ ...row, id: adopted.id });
        updated++;
      } else {
        insert.run(row);
        created++;
      }
    }
    // Retire bundled texts that are no longer in content/ (user words keep their sentences; text_id becomes NULL).
    const slugs = new Set(stories.map((s) => s.slug));
    for (const r of db.prepare(`SELECT id, slug FROM texts WHERE source_type = 'story'`).all() as { id: number; slug: string | null }[]) {
      if (!r.slug || !slugs.has(r.slug)) db.prepare('DELETE FROM texts WHERE id = ?').run(r.id);
    }
  })();
  return { created, updated };
}

/** Glossary for a text: entries for each word form present, plus the entries of their lemmas. */
export function glossaryFor(dict: Dictionary | undefined, body: string, language: string): Record<string, GlossEntry> {
  const out: Record<string, GlossEntry> = {};
  if (!dict) return out;
  const tk = tokenize(body, language);
  for (const key of tk.keys) {
    const e = dict.get(key);
    if (!e) continue;
    out[key] = e;
    const lk = normalizeKey(e.lemma, language);
    const le = dict.get(lk);
    if (le) out[lk] = le;
  }
  return out;
}

export interface CoverageReport {
  language: string;
  missing: { surface: string; key: string; count: number; stories: string[] }[];
  missingLemmas: { lemma: string; from: string }[];
  stories: { slug: string; level: string; words: number }[];
}

/** Which word forms in the bundled stories have no dictionary entry (and lemmas without their own entry). */
export function coverage(content: Content): CoverageReport[] {
  const reports: CoverageReport[] = [];
  const languages = new Set([...content.stories.map((s) => s.language), ...content.dictionaries.keys()]);
  for (const language of languages) {
    getLanguage(language);
    const dict = content.dictionaries.get(language) ?? new Map();
    const missing = new Map<string, { surface: string; key: string; count: number; stories: Set<string> }>();
    const stories: CoverageReport['stories'] = [];
    for (const s of content.stories.filter((x) => x.language === language)) {
      const tk = tokenize(s.body, language);
      stories.push({ slug: s.slug, level: s.level, words: tk.wordCount });
      for (const t of tk.tokens) {
        if (!t.word) continue;
        const key = tk.keys[t.k];
        if (dict.has(key)) continue;
        const m = missing.get(key) ?? { surface: t.text, key, count: 0, stories: new Set<string>() };
        m.count++;
        m.stories.add(s.slug);
        missing.set(key, m);
      }
    }
    const missingLemmas: CoverageReport['missingLemmas'] = [];
    for (const [key, e] of dict) {
      const lk = normalizeKey(e.lemma, language);
      if (lk !== key && !dict.has(lk)) missingLemmas.push({ lemma: e.lemma, from: key });
    }
    reports.push({
      language,
      missing: [...missing.values()].map((m) => ({ ...m, stories: [...m.stories] })),
      missingLemmas,
      stories,
    });
  }
  return reports;
}
