import crypto from 'node:crypto';
import type { DB } from '../db.ts';
import type { SourceType, TextDetail, TextSummary } from '../../shared/types.ts';
import type { CefrLevel } from '../../shared/languages.ts';
import { tokenize } from '../../shared/tokenize.ts';

export interface InsertText {
  userId: number | null;
  language: string;
  title: string;
  body: string;
  level?: string | null;
  difficulty?: unknown;
  topics?: string[];
  sourceType: SourceType;
  sourceName: string;
  author?: string | null;
  license: string;
  url?: string | null;
}

interface TextRow {
  id: number;
  language: string;
  title: string;
  body: string;
  level: string | null;
  topics: string;
  source_type: SourceType;
  source_name: string;
  author: string | null;
  license: string;
  url: string | null;
  word_count: number;
  created_at: string;
}

/** Normalise whitespace so trivially different copies of a text hash the same. */
export function contentHash(body: string): string {
  const canon = body.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  return crypto.createHash('sha256').update(canon).digest('hex');
}

/** Insert or return the existing id for an identical text (dedupe on language + content hash). */
export function insertText(db: DB, t: InsertText): { id: number; created: boolean } {
  const body = t.body.replace(/\r\n?/g, '\n').trim();
  const hash = contentHash(body);
  const existing = db
    .prepare('SELECT id FROM texts WHERE language = ? AND content_hash = ?')
    .get(t.language, hash) as { id: number } | undefined;
  if (existing) return { id: existing.id, created: false };
  const wordCount = tokenize(body, t.language).wordCount;
  const info = db
    .prepare(
      `INSERT INTO texts (user_id, language, title, body, level, difficulty, topics, source_type, source_name, author, license, url, content_hash, word_count)
       VALUES (@userId, @language, @title, @body, @level, @difficulty, @topics, @sourceType, @sourceName, @author, @license, @url, @hash, @wordCount)`,
    )
    .run({
      userId: t.userId,
      language: t.language,
      title: t.title.trim() || 'Untitled',
      body,
      level: t.level ?? null,
      difficulty: t.difficulty ? JSON.stringify(t.difficulty) : null,
      topics: JSON.stringify(t.topics ?? []),
      sourceType: t.sourceType,
      sourceName: t.sourceName,
      author: t.author ?? null,
      license: t.license,
      url: t.url ?? null,
      hash,
      wordCount,
    });
  return { id: Number(info.lastInsertRowid), created: true };
}

function toSummary(r: TextRow): TextSummary {
  const firstPara = r.body.split(/\n\s*\n/)[0] ?? '';
  return {
    id: r.id,
    language: r.language,
    title: r.title,
    level: (r.level as CefrLevel) ?? null,
    topics: JSON.parse(r.topics),
    sourceType: r.source_type,
    sourceName: r.source_name,
    author: r.author,
    license: r.license,
    url: r.url,
    wordCount: r.word_count,
    excerpt: firstPara.length > 220 ? firstPara.slice(0, 220).trimEnd() + '…' : firstPara,
    createdAt: r.created_at,
  };
}

/** Texts visible to a user: shared catalog (user_id NULL) plus their own. */
export function listTexts(db: DB, userId: number, language?: string): TextSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM texts WHERE (user_id IS NULL OR user_id = @userId)
       AND (@language IS NULL OR language = @language)
       ORDER BY created_at DESC, id DESC LIMIT 200`,
    )
    .all({ userId, language: language ?? null }) as TextRow[];
  return rows.map(toSummary);
}

export function getText(db: DB, userId: number, id: number): TextDetail | null {
  const r = db
    .prepare('SELECT * FROM texts WHERE id = ? AND (user_id IS NULL OR user_id = ?)')
    .get(id, userId) as TextRow | undefined;
  return r ? { ...toSummary(r), body: r.body } : null;
}
