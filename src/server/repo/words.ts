import type { DB } from '../db.ts';
import type { SaveWordInput, SaveWordsResult, Word, WordContext, WordPatch, WordStatus } from '../../shared/types.ts';
import { normalizeKey } from '../../shared/normalize.ts';

interface WordRow {
  id: number;
  language: string;
  surface: string;
  lemma: string | null;
  normalized_key: string;
  translation: string | null;
  pos: string | null;
  notes: string | null;
  status: WordStatus;
  created_at: string;
  updated_at: string;
}

interface ContextRow {
  id: number;
  word_id: number;
  text_id: number | null;
  sentence: string;
  offset: number;
  form: string | null;
  source_title: string | null;
  created_at: string;
}

const toContext = (c: ContextRow): WordContext => ({
  id: c.id,
  textId: c.text_id,
  sentence: c.sentence,
  offset: c.offset,
  form: c.form,
  sourceTitle: c.source_title,
  createdAt: c.created_at,
});

function hydrate(db: DB, rows: WordRow[]): Word[] {
  if (rows.length === 0) return [];
  const byWord = new Map<number, WordContext[]>();
  // Chunk to stay under SQLite's bound-parameter limit on big libraries.
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map((r) => r.id);
    const ctx = db
      .prepare(`SELECT * FROM word_contexts WHERE word_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC, id DESC`)
      .all(...ids) as ContextRow[];
    for (const c of ctx) {
      const list = byWord.get(c.word_id) ?? [];
      list.push(toContext(c));
      byWord.set(c.word_id, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    language: r.language,
    surface: r.surface,
    lemma: r.lemma,
    key: r.normalized_key,
    translation: r.translation,
    pos: r.pos,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    contexts: byWord.get(r.id) ?? [],
  }));
}

const clean = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

/** Upsert words (unique per user+language+key), append their context sentence, create SRS cards. */
export function saveWords(db: DB, userId: number, language: string, textId: number | null, items: SaveWordInput[]): SaveWordsResult {
  const sourceTitle = textId
    ? ((db.prepare('SELECT title FROM texts WHERE id = ?').get(textId) as { title: string } | undefined)?.title ?? null)
    : null;
  const find = db.prepare('SELECT id FROM words WHERE user_id = ? AND language = ? AND normalized_key = ?');
  const insert = db.prepare(
    `INSERT INTO words (user_id, language, surface, lemma, normalized_key, translation, pos)
     VALUES (@userId, @language, @surface, @lemma, @key, @translation, @pos)`,
  );
  const update = db.prepare(
    `UPDATE words SET
       translation = COALESCE(@translation, translation),
       pos = COALESCE(@pos, pos),
       lemma = COALESCE(@lemma, lemma),
       updated_at = datetime('now')
     WHERE id = @id`,
  );
  const addContext = db.prepare(
    `INSERT OR IGNORE INTO word_contexts (word_id, text_id, sentence, offset, form, source_title)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const addCard = db.prepare(`INSERT OR IGNORE INTO srs_state (word_id, card_type, user_id) VALUES (?, 'recognition', ?)`);

  let created = 0;
  let updated = 0;
  const ids: number[] = [];
  db.transaction(() => {
    for (const it of items) {
      const surface = it.surface.trim();
      const key = normalizeKey(surface, language);
      if (!key) continue;
      const fields = { translation: clean(it.translation), pos: clean(it.pos), lemma: clean(it.lemma) };
      const existing = find.get(userId, language, key) as { id: number } | undefined;
      let id: number;
      if (existing) {
        id = existing.id;
        update.run({ id, ...fields });
        updated++;
      } else {
        id = Number(insert.run({ userId, language, surface, key, ...fields }).lastInsertRowid);
        created++;
      }
      addContext.run(id, textId, it.sentence.trim(), Math.max(0, it.offset), it.form, sourceTitle);
      addCard.run(id, userId);
      if (!ids.includes(id)) ids.push(id);
    }
  })();
  return { created, updated, words: getWordsByIds(db, userId, ids) };
}

export function getWordsByIds(db: DB, userId: number, ids: number[]): Word[] {
  if (ids.length === 0) return [];
  const rows = db
    .prepare(`SELECT * FROM words WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
    .all(userId, ...ids) as WordRow[];
  return hydrate(db, rows);
}

export function getWord(db: DB, userId: number, id: number): Word | null {
  return getWordsByIds(db, userId, [id])[0] ?? null;
}

/** Accent- and case-insensitive search form. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface ListWordsQuery {
  language?: string;
  status?: WordStatus;
  q?: string;
  sort?: 'recent' | 'alpha';
}

export function listWords(db: DB, userId: number, query: ListWordsQuery): Word[] {
  const rows = db
    .prepare(
      `SELECT * FROM words WHERE user_id = @userId
       AND (@language IS NULL OR language = @language)
       AND (@status IS NULL OR status = @status)
       ORDER BY created_at DESC, id DESC`,
    )
    .all({ userId, language: query.language ?? null, status: query.status ?? null }) as WordRow[];
  let words = hydrate(db, rows);
  const q = query.q?.trim();
  if (q) {
    const needle = fold(q);
    words = words.filter((w) =>
      [w.surface, w.translation, w.lemma, w.notes, ...w.contexts.map((c) => c.sentence)].some((f) => f && fold(f).includes(needle)),
    );
  }
  if (query.sort === 'alpha') {
    const collator = new Intl.Collator(query.language, { sensitivity: 'base' });
    words.sort((a, b) => collator.compare(a.surface, b.surface));
  }
  return words;
}

export function updateWord(db: DB, userId: number, id: number, patch: WordPatch): Word | null | 'conflict' {
  const current = getWord(db, userId, id);
  if (!current) return null;
  const surface = patch.surface?.trim() || current.surface;
  const key = normalizeKey(surface, current.language);
  if (key !== current.key) {
    const clash = db
      .prepare('SELECT id FROM words WHERE user_id = ? AND language = ? AND normalized_key = ? AND id != ?')
      .get(userId, current.language, key, id);
    if (clash) return 'conflict';
  }
  const pick = <K extends keyof WordPatch>(k: K, cur: unknown) => (patch[k] === undefined ? cur : clean(patch[k] as string | null));
  db.prepare(
    `UPDATE words SET surface = ?, normalized_key = ?, translation = ?, pos = ?, lemma = ?, notes = ?, status = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  ).run(
    surface,
    key,
    pick('translation', current.translation),
    pick('pos', current.pos),
    pick('lemma', current.lemma),
    pick('notes', current.notes),
    patch.status ?? current.status,
    id,
    userId,
  );
  return getWord(db, userId, id);
}

export function deleteWord(db: DB, userId: number, id: number): boolean {
  return db.prepare('DELETE FROM words WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** Look up existing library entries for a set of keys (summary page shows "already saved"). */
export function findByKeys(db: DB, userId: number, language: string, keys: string[]): Word[] {
  if (keys.length === 0) return [];
  const out: WordRow[] = [];
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    out.push(
      ...(db
        .prepare(`SELECT * FROM words WHERE user_id = ? AND language = ? AND normalized_key IN (${chunk.map(() => '?').join(',')})`)
        .all(userId, language, ...chunk) as WordRow[]),
    );
  }
  return hydrate(db, out);
}

// ---- CSV export for Anki ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Context sentence with the word in bold; falls back to the plain sentence if the offset is stale. */
export function boldContext(c: WordContext, surface: string): string {
  const form = c.form ?? surface;
  if (c.sentence.slice(c.offset, c.offset + form.length) === form) {
    return esc(c.sentence.slice(0, c.offset)) + '<b>' + esc(form) + '</b>' + esc(c.sentence.slice(c.offset + form.length));
  }
  return esc(c.sentence);
}

/**
 * Anki-importable CSV (File → Import). Header lines tell Anki the separator, that fields contain HTML,
 * and which column holds tags. Columns: Word, Translation, Context, Part of speech, Lemma, Source, Tags.
 */
export function wordsToAnkiCsv(words: Word[]): string {
  const lines = ['#separator:Comma', '#html:true', '#tags column:7', '#columns:Word,Translation,Context,Part of speech,Lemma,Source,Tags'];
  for (const w of words) {
    const c = w.contexts[0];
    lines.push(
      [
        esc(w.surface),
        esc(w.translation ?? ''),
        c ? boldContext(c, w.surface) : '',
        esc(w.pos ?? ''),
        esc(w.lemma ?? ''),
        esc(c?.sourceTitle ?? ''),
        `glossa glossa::${w.language} ${w.status}`,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
