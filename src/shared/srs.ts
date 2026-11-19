/**
 * Spaced repetition: SM-2, Anki-style. Pure functions, no I/O.
 *
 * - New / relearning cards go through short learning steps (minutes) before graduating to days.
 * - Review cards grow by their ease factor; Hard grows slowly and lowers ease, Easy grows faster
 *   and raises ease, Again is a lapse (ease −0.2, back to relearning).
 * - Status shown to the learner: new (never reviewed) → learning → known (interval ≥ 21 days).
 */
export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export interface CardState {
  ease: number;
  /** Days until the next review; 0 while in learning steps. */
  intervalDays: number;
  /** Successful reviews since the last lapse (0 = new or relearning). */
  reps: number;
  lapses: number;
  due: Date;
  lastReviewed: Date | null;
}

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const KNOWN_AFTER_DAYS = 21;
const MINUTE = 60_000;
const DAY = 86_400_000;

export function newCard(now: Date): CardState {
  return { ease: DEFAULT_EASE, intervalDays: 0, reps: 0, lapses: 0, due: now, lastReviewed: null };
}

const round = (d: number) => Math.max(1, Math.round(d));
const addDays = (now: Date, days: number) => new Date(now.getTime() + days * DAY);
const addMinutes = (now: Date, m: number) => new Date(now.getTime() + m * MINUTE);

export function schedule(card: CardState, grade: Grade, now: Date): CardState {
  const base = { ...card, lastReviewed: now };

  // Learning (new card or relearning after a lapse): minute steps, then graduate.
  if (card.reps === 0) {
    switch (grade) {
      case 1:
        return { ...base, intervalDays: 0, due: addMinutes(now, 1) };
      case 2:
        return { ...base, intervalDays: 0, due: addMinutes(now, 6) };
      case 3: {
        // A relearned card resumes at a fraction of its old interval; a new card graduates to 1 day.
        const days = card.lapses > 0 ? round(Math.max(1, card.intervalDays * 0.5)) : 1;
        return { ...base, reps: 1, intervalDays: days, due: addDays(now, days) };
      }
      case 4: {
        const days = card.lapses > 0 ? round(Math.max(2, card.intervalDays * 0.7)) : 4;
        return { ...base, reps: 1, intervalDays: days, ease: card.ease + 0.15, due: addDays(now, days) };
      }
    }
  }

  // Review card.
  const prev = Math.max(1, card.intervalDays);
  // Reviewing early (e.g. in a game) shouldn't earn the full interval: credit only elapsed time.
  const elapsed = card.lastReviewed ? Math.max(1, (now.getTime() - card.lastReviewed.getTime()) / DAY) : prev;
  const effective = Math.min(prev, elapsed);
  switch (grade) {
    case 1: {
      // Lapse: keep the old interval (relearning uses half of it), lower ease, go back to learning steps.
      return { ...base, reps: 0, lapses: card.lapses + 1, ease: Math.max(MIN_EASE, card.ease - 0.2), intervalDays: prev, due: addMinutes(now, 10) };
    }
    case 2: {
      const days = card.reps === 1 ? 3 : round(Math.max(prev + 1, effective * 1.2));
      return { ...base, reps: card.reps + 1, ease: Math.max(MIN_EASE, card.ease - 0.15), intervalDays: days, due: addDays(now, days) };
    }
    case 3: {
      const days = card.reps === 1 ? 6 : round(Math.max(prev + 1, effective * card.ease));
      return { ...base, reps: card.reps + 1, intervalDays: days, due: addDays(now, days) };
    }
    case 4: {
      const ease = card.ease + 0.15;
      const days = card.reps === 1 ? 8 : round(Math.max(prev + 2, effective * ease * 1.3));
      return { ...base, reps: card.reps + 1, ease, intervalDays: days, due: addDays(now, days) };
    }
  }
}

export type Status = 'new' | 'learning' | 'known';

export function statusOf(card: CardState): Status {
  if (card.lastReviewed === null) return 'new';
  return card.reps > 0 && card.intervalDays >= KNOWN_AFTER_DAYS ? 'known' : 'learning';
}

/** Human label for "when would I see this again" on each answer button. */
export function formatInterval(from: Date, due: Date): string {
  const ms = due.getTime() - from.getTime();
  if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function previewIntervals(card: CardState, now: Date): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  for (const g of [1, 2, 3, 4] as Grade[]) out[g] = formatInterval(now, schedule(card, g, now).due);
  return out;
}

/** Cards answered in a session that come back within this window are re-shown in the same session. */
export const SESSION_REPEAT_MS = 20 * MINUTE;

// SQLite stores UTC timestamps as 'YYYY-MM-DD HH:MM:SS' (datetime('now') format).
export const toSqlTime = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
export const fromSqlTime = (s: string) => new Date(s.replace(' ', 'T') + 'Z');
