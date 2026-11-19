import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../../src/server/db.ts';
import { saveWords } from '../../src/server/repo/words.ts';
import { gamePool, getQueue, review, startOfLocalDay, stats } from '../../src/server/repo/study.ts';

const U = 1;
const T = new Date('2026-03-10T12:00:00Z');
const later = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
const DAY = 24 * 60;

let db: DB;
let ids: number[];

beforeEach(() => {
  db = openDb(':memory:');
  const r = saveWords(
    db,
    U,
    'es',
    null,
    ['casa', 'perro', 'gato', 'mesa', 'silla'].map((w, i) => ({ surface: w, translation: `t${i}`, sentence: `Una ${w}.`, offset: 4, form: w })),
  );
  ids = r.words.map((w) => w.id);
});

const queue = (now = T, newLimit = 3, cardType: 'recognition' | 'production' = 'recognition') =>
  getQueue(db, U, { language: 'es', cardType, newLimit, now, tzOffset: 0 });

describe('study queue', () => {
  it('serves new cards up to the daily limit', () => {
    const q = queue();
    expect(q.cards).toHaveLength(3);
    expect(q.cards.every((c) => c.isNew)).toBe(true);
    expect(q.newAvailable).toBe(5);
    expect(q.cards[0].word.contexts[0].sentence).toBe('Una casa.');
  });

  it('counts new cards introduced today against the limit', () => {
    review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 3, mode: 'flashcard', now: T });
    review(db, U, { wordId: ids[1], cardType: 'recognition', grade: 3, mode: 'flashcard', now: T });
    const q = queue(later(T, 5));
    expect(q.newToday).toBe(2);
    expect(q.cards.filter((c) => c.isNew)).toHaveLength(1);
    // next day the allowance resets
    expect(queue(later(T, DAY + 60)).newToday).toBe(0);
  });

  it('reviewed cards come back when due', () => {
    review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 3, mode: 'flashcard', now: T }); // → 1 day
    expect(queue(later(T, 60), 0).cards).toHaveLength(0);
    const q = queue(later(T, DAY + 1), 0);
    expect(q.due).toBe(1);
    expect(q.cards[0]).toMatchObject({ isNew: false, word: { id: ids[0] } });
  });

  it('production direction has its own schedule, created on first review', () => {
    review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 4, mode: 'flashcard', now: T });
    const p = queue(later(T, 1), 10, 'production');
    expect(p.cards.map((c) => c.word.id)).toContain(ids[0]); // still new in production
    review(db, U, { wordId: ids[0], cardType: 'production', grade: 3, mode: 'flashcard', now: T });
    const rows = db.prepare('SELECT card_type FROM srs_state WHERE word_id = ? ORDER BY card_type').all(ids[0]);
    expect(rows).toEqual([{ card_type: 'production' }, { card_type: 'recognition' }]);
  });
});

describe('review', () => {
  it('updates schedule, logs the review and moves status new → learning', () => {
    const r = review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 1, mode: 'flashcard', now: T })!;
    expect(r.rescheduled).toBe(true);
    expect(r.status).toBe('learning');
    expect(new Date(r.state.due).getTime() - T.getTime()).toBe(60_000);
    expect(db.prepare('SELECT grade, correct, mode FROM reviews').all()).toEqual([{ grade: 1, correct: 0, mode: 'flashcard' }]);
    expect((db.prepare('SELECT status FROM words WHERE id = ?').get(ids[0]) as { status: string }).status).toBe('learning');
  });

  it('becomes known once the interval passes 21 days', () => {
    let now = T;
    let status = '';
    for (let i = 0; i < 4; i++) {
      const r = review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 3, mode: 'flashcard', now })!;
      status = r.status;
      now = new Date(r.state.due);
    }
    expect(status).toBe('known');
  });

  it('games reschedule new or due cards, but only log reviews for cards not yet due', () => {
    const a = review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 3, mode: 'match', now: T })!;
    expect(a.rescheduled).toBe(true); // new
    const b = review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 1, mode: 'cloze', now: later(T, 60) })!;
    expect(b.rescheduled).toBe(false); // not due yet: a game mistake doesn't wreck the schedule
    expect(b.state.reps).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number }).n).toBe(2);
  });

  it('returns null for unknown words', () => {
    expect(review(db, U, { wordId: 999, cardType: 'recognition', grade: 3, mode: 'flashcard', now: T })).toBeNull();
  });
});

describe('stats', () => {
  it('counts statuses, due cards and a streak of consecutive days', () => {
    for (const d of [0, 1, 2, 4]) review(db, U, { wordId: ids[d], cardType: 'recognition', grade: 3, mode: 'flashcard', now: later(T, -d * DAY) });
    const s = stats(db, U, 'es', T, 0);
    expect(s.streak).toBe(3); // today, yesterday, the day before; gap at 3 days ago
    expect(s.reviewedToday).toBe(1);
    expect(s.byStatus).toEqual({ new: 1, learning: 4, known: 0 });
    expect(s.dueNow).toBe(3); // the ones reviewed 1, 2 and 4 days ago (1-day interval)
  });

  it('streak still counts if you have not studied yet today', () => {
    review(db, U, { wordId: ids[0], cardType: 'recognition', grade: 3, mode: 'flashcard', now: later(T, -DAY) });
    expect(stats(db, U, 'es', T, 0).streak).toBe(1);
  });

  it('day boundaries follow the learner time zone', () => {
    // 2026-03-10 12:00Z is 2026-03-10 03:00 in UTC−9 (tzOffset 540): local midnight = 09:00Z
    expect(startOfLocalDay(T, 540).toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(startOfLocalDay(T, -600).toISOString()).toBe('2026-03-09T14:00:00.000Z'); // UTC+10
  });
});

describe('game pool', () => {
  it('only uses words with a translation and weights weak words more', () => {
    db.prepare(`UPDATE words SET translation = NULL WHERE id = ?`).run(ids[4]);
    db.prepare(`UPDATE words SET status = 'known' WHERE id IN (?, ?)`).run(ids[0], ids[1]);
    const counts = new Map<number, number>();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) for (const w of gamePool(db, U, 'es', 2, T, rand)) counts.set(w.id, (counts.get(w.id) ?? 0) + 1);
    expect(counts.has(ids[4])).toBe(false);
    const known = (counts.get(ids[0]) ?? 0) + (counts.get(ids[1]) ?? 0);
    const fresh = (counts.get(ids[2]) ?? 0) + (counts.get(ids[3]) ?? 0);
    expect(fresh).toBeGreaterThan(known * 2);
  });
});
