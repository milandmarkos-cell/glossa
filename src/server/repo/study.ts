import type { DB } from '../db.ts';
import { fromSqlTime, newCard, schedule, statusOf, toSqlTime, type CardState, type Grade } from '../../shared/srs.ts';
import type { CardType, StudyCard, StudyQueue, StudyStats, SrsStateDTO, Word } from '../../shared/types.ts';
import { getWordsByIds } from './words.ts';

interface SrsRow {
  word_id: number;
  card_type: CardType;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due: string;
  last_reviewed: string | null;
}

const toState = (r: SrsRow | undefined, now: Date): CardState =>
  r
    ? { ease: r.ease, intervalDays: r.interval_days, reps: r.reps, lapses: r.lapses, due: fromSqlTime(r.due), lastReviewed: r.last_reviewed ? fromSqlTime(r.last_reviewed) : null }
    : newCard(now);

export const toDTO = (s: CardState): SrsStateDTO => ({
  ease: s.ease,
  intervalDays: s.intervalDays,
  reps: s.reps,
  lapses: s.lapses,
  due: s.due.toISOString(),
  lastReviewed: s.lastReviewed?.toISOString() ?? null,
});

/** Start of the learner's local day, as a UTC SQL timestamp. tzOffset = Date#getTimezoneOffset() (minutes). */
export function startOfLocalDay(now: Date, tzOffset: number, daysAgo = 0): Date {
  const local = new Date(now.getTime() - tzOffset * 60_000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysAgo);
  return new Date(midnight + tzOffset * 60_000);
}

function newIntroducedToday(db: DB, userId: number, language: string, cardType: CardType, since: Date): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT r.word_id, MIN(r.reviewed_at) AS first FROM reviews r JOIN words w ON w.id = r.word_id
         WHERE r.user_id = ? AND r.card_type = ? AND w.language = ? GROUP BY r.word_id
       ) WHERE first >= ?`,
    )
    .get(userId, cardType, language, toSqlTime(since)) as { n: number };
  return row.n;
}

export interface QueueOptions {
  language: string;
  cardType: CardType;
  newLimit: number;
  now: Date;
  tzOffset: number;
}

export function getQueue(db: DB, userId: number, o: QueueOptions): StudyQueue {
  const now = toSqlTime(o.now);
  const dueRows = db
    .prepare(
      `SELECT s.* FROM srs_state s JOIN words w ON w.id = s.word_id
       WHERE s.user_id = ? AND s.card_type = ? AND w.language = ? AND s.last_reviewed IS NOT NULL AND s.due <= ?
       ORDER BY s.due LIMIT 500`,
    )
    .all(userId, o.cardType, o.language, now) as SrsRow[];

  // New = never reviewed in this direction (production cards are created lazily on first review).
  const newIds = db
    .prepare(
      `SELECT w.id FROM words w LEFT JOIN srs_state s ON s.word_id = w.id AND s.card_type = ?
       WHERE w.user_id = ? AND w.language = ? AND (s.word_id IS NULL OR s.last_reviewed IS NULL)
       ORDER BY w.created_at, w.id`,
    )
    .all(o.cardType, userId, o.language) as { id: number }[];

  const introduced = newIntroducedToday(db, userId, o.language, o.cardType, startOfLocalDay(o.now, o.tzOffset));
  const newLeft = Math.max(0, o.newLimit - introduced);
  const newPick = newIds.slice(0, newLeft).map((r) => r.id);

  const words = new Map(getWordsByIds(db, userId, [...dueRows.map((r) => r.word_id), ...newPick]).map((w) => [w.id, w]));
  const cards: StudyCard[] = [];
  for (const r of dueRows) {
    const word = words.get(r.word_id);
    if (word) cards.push({ word, cardType: o.cardType, state: toDTO(toState(r, o.now)), isNew: false });
  }
  for (const id of newPick) {
    const word = words.get(id);
    if (word) cards.push({ word, cardType: o.cardType, state: toDTO(newCard(o.now)), isNew: true });
  }
  return { cards, due: dueRows.length, newAvailable: newIds.length, newToday: introduced, newLimit: o.newLimit };
}

export interface ReviewInput {
  wordId: number;
  cardType: CardType;
  grade: Grade;
  /** 'flashcard' or a game name. Games only reschedule cards that are new or due. */
  mode: string;
  now: Date;
}

export function review(db: DB, userId: number, input: ReviewInput): { state: SrsStateDTO; status: Word['status']; rescheduled: boolean } | null {
  const word = db.prepare('SELECT id FROM words WHERE id = ? AND user_id = ?').get(input.wordId, userId);
  if (!word) return null;
  const row = db.prepare('SELECT * FROM srs_state WHERE word_id = ? AND card_type = ?').get(input.wordId, input.cardType) as SrsRow | undefined;
  const current = toState(row, input.now);
  const isNewOrDue = !row || row.last_reviewed === null || current.due <= input.now;
  const reschedule = input.mode === 'flashcard' || isNewOrDue;
  const next = reschedule ? schedule(current, input.grade, input.now) : current;

  db.transaction(() => {
    if (reschedule) {
      db.prepare(
        `INSERT INTO srs_state (word_id, card_type, user_id, ease, interval_days, reps, lapses, due, last_reviewed)
         VALUES (@wordId, @cardType, @userId, @ease, @interval, @reps, @lapses, @due, @last)
         ON CONFLICT(word_id, card_type) DO UPDATE SET ease = @ease, interval_days = @interval, reps = @reps,
           lapses = @lapses, due = @due, last_reviewed = @last`,
      ).run({
        wordId: input.wordId,
        cardType: input.cardType,
        userId,
        ease: next.ease,
        interval: next.intervalDays,
        reps: next.reps,
        lapses: next.lapses,
        due: toSqlTime(next.due),
        last: toSqlTime(input.now),
      });
    }
    db.prepare(`INSERT INTO reviews (user_id, word_id, card_type, mode, grade, correct, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      userId,
      input.wordId,
      input.cardType,
      input.mode,
      input.grade,
      input.grade > 1 ? 1 : 0,
      toSqlTime(input.now),
    );
  })();

  // Word status follows the recognition card (the production card if that's all there is).
  const rec = db.prepare(`SELECT * FROM srs_state WHERE word_id = ? AND card_type = 'recognition'`).get(input.wordId) as SrsRow | undefined;
  const basis = rec && rec.last_reviewed ? toState(rec, input.now) : next;
  const status = statusOf(basis);
  db.prepare(`UPDATE words SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, input.wordId);
  return { state: toDTO(next), status, rescheduled: reschedule };
}

export function stats(db: DB, userId: number, language: string | undefined, now: Date, tzOffset: number): StudyStats {
  const counts = db
    .prepare(`SELECT status, COUNT(*) AS n FROM words WHERE user_id = ? AND (? IS NULL OR language = ?) GROUP BY status`)
    .all(userId, language ?? null, language ?? null) as { status: Word['status']; n: number }[];
  const byStatus = { new: 0, learning: 0, known: 0 };
  for (const c of counts) byStatus[c.status] = c.n;

  const dueNow = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM srs_state s JOIN words w ON w.id = s.word_id
         WHERE s.user_id = ? AND s.card_type = 'recognition' AND s.last_reviewed IS NOT NULL AND s.due <= ? AND (? IS NULL OR w.language = ?)`,
      )
      .get(userId, toSqlTime(now), language ?? null, language ?? null) as { n: number }
  ).n;

  // Streak: consecutive local days with at least one review, ending today (or yesterday if not yet today).
  const since = startOfLocalDay(now, tzOffset, 400);
  const times = db
    .prepare(`SELECT reviewed_at FROM reviews WHERE user_id = ? AND reviewed_at >= ? ORDER BY reviewed_at DESC`)
    .all(userId, toSqlTime(since)) as { reviewed_at: string }[];
  const dayIndex = (d: Date) => Math.floor((startOfLocalDay(now, tzOffset).getTime() - startOfLocalDay(d, tzOffset).getTime()) / 86_400_000);
  const days = new Set(times.map((t) => dayIndex(fromSqlTime(t.reviewed_at))));
  let streak = 0;
  let d = days.has(0) ? 0 : 1;
  while (days.has(d)) {
    streak++;
    d++;
  }
  const reviewedToday = times.filter((t) => dayIndex(fromSqlTime(t.reviewed_at)) === 0).length;
  return { streak, reviewedToday, byStatus, dueNow, total: byStatus.new + byStatus.learning + byStatus.known };
}

/**
 * Words for games, weighted toward weaker ones: new and learning words, lapses, recent mistakes and
 * overdue cards are more likely to be picked. Only words with a translation can be used.
 */
export function gamePool(db: DB, userId: number, language: string, n: number, now: Date, rand: () => number = Math.random): Word[] {
  const rows = db
    .prepare(
      `SELECT w.id, w.status, COALESCE(s.lapses, 0) AS lapses, s.due, s.last_reviewed,
         (SELECT COUNT(*) FROM reviews r WHERE r.word_id = w.id AND r.correct = 0 AND r.reviewed_at >= ?) AS recentMisses
       FROM words w LEFT JOIN srs_state s ON s.word_id = w.id AND s.card_type = 'recognition'
       WHERE w.user_id = ? AND w.language = ? AND w.translation IS NOT NULL AND w.translation != ''`,
    )
    .all(toSqlTime(new Date(now.getTime() - 14 * 86_400_000)), userId, language) as {
    id: number;
    status: Word['status'];
    lapses: number;
    due: string | null;
    last_reviewed: string | null;
    recentMisses: number;
  }[];
  const weighted = rows.map((r) => {
    let w = r.status === 'known' ? 0.4 : r.status === 'learning' ? 2 : 2.5;
    w += r.lapses * 1 + r.recentMisses * 2;
    if (r.last_reviewed && r.due && fromSqlTime(r.due) <= now) w += 2;
    return { id: r.id, w };
  });
  // Weighted sampling without replacement (Efraimidis–Spirakis).
  const picked = weighted
    .map((x) => ({ id: x.id, k: Math.pow(rand(), 1 / x.w) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, n)
    .map((x) => x.id);
  const byId = new Map(getWordsByIds(db, userId, picked).map((w) => [w.id, w]));
  return picked.map((id) => byId.get(id)!).filter(Boolean);
}
