import { describe, expect, it } from 'vitest';
import { formatInterval, fromSqlTime, MIN_EASE, newCard, previewIntervals, schedule, statusOf, toSqlTime, type CardState, type Grade } from '../../src/shared/srs.ts';

const t0 = new Date('2026-01-01T09:00:00Z');
const days = (c: CardState, from: Date) => Math.round((c.due.getTime() - from.getTime()) / 86_400_000);
const mins = (c: CardState, from: Date) => Math.round((c.due.getTime() - from.getTime()) / 60_000);

/** Review a card repeatedly, each time exactly when it's due. */
function run(grades: Grade[], start = newCard(t0)) {
  let c = start;
  for (const g of grades) c = schedule(c, g, c.due);
  return c;
}

describe('SRS scheduling (SM-2, Anki-style)', () => {
  it('new card: learning steps in minutes, then graduates', () => {
    const c = newCard(t0);
    expect(mins(schedule(c, 1, t0), t0)).toBe(1);
    expect(mins(schedule(c, 2, t0), t0)).toBe(6);
    expect(days(schedule(c, 3, t0), t0)).toBe(1);
    expect(days(schedule(c, 4, t0), t0)).toBe(4);
    expect(schedule(c, 1, t0).reps).toBe(0);
    expect(schedule(c, 3, t0).reps).toBe(1);
  });

  it('classic SM-2 progression with Good: 1d, 6d, then × ease', () => {
    const c1 = run([3]);
    expect(c1.intervalDays).toBe(1);
    const c2 = schedule(c1, 3, c1.due);
    expect(c2.intervalDays).toBe(6);
    const c3 = schedule(c2, 3, c2.due);
    expect(c3.intervalDays).toBe(15); // 6 × 2.5
    const c4 = schedule(c3, 3, c3.due);
    expect(c4.intervalDays).toBe(38); // 15 × 2.5 rounded
  });

  it('Easy grows faster and raises ease; Hard grows slower and lowers ease', () => {
    const base = run([3, 3]); // interval 6, ease 2.5
    const easy = schedule(base, 4, base.due);
    const good = schedule(base, 3, base.due);
    const hard = schedule(base, 2, base.due);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
    expect(hard.intervalDays).toBeGreaterThan(base.intervalDays);
    expect(easy.ease).toBeCloseTo(2.65);
    expect(hard.ease).toBeCloseTo(2.35);
  });

  it('Again on a review card is a lapse: ease drops, relearning, then resumes at half interval', () => {
    const review = run([3, 3, 3]); // 15 days
    const lapsed = schedule(review, 1, review.due);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.ease).toBeCloseTo(2.3);
    expect(mins(lapsed, review.due)).toBe(10);
    const relearned = schedule(lapsed, 3, lapsed.due);
    expect(relearned.intervalDays).toBe(8); // half of 15, rounded
  });

  it('ease never drops below the minimum', () => {
    let c = run([3, 3]);
    for (let i = 0; i < 20; i++) c = schedule(schedule(c, 1, c.due), 3, c.due);
    expect(c.ease).toBe(MIN_EASE);
  });

  it('reviewing early only credits elapsed time', () => {
    const c = run([3, 3, 3]); // interval 15 days, due in 15 days
    const early = schedule(c, 3, c.lastReviewed!); // same day as last review
    expect(early.intervalDays).toBe(16); // prev + 1, not 15 × 2.5
  });

  it('status: new → learning → known after a 21+ day interval', () => {
    const c = newCard(t0);
    expect(statusOf(c)).toBe('new');
    expect(statusOf(schedule(c, 1, t0))).toBe('learning');
    expect(statusOf(run([3, 3, 3]))).toBe('learning'); // 15 days
    expect(statusOf(run([3, 3, 3, 3]))).toBe('known'); // 38 days
    expect(statusOf(schedule(run([3, 3, 3, 3]), 1, t0))).toBe('learning'); // lapse
  });

  it('formats button previews', () => {
    expect(previewIntervals(newCard(t0), t0)).toEqual({ 1: '1m', 2: '6m', 3: '1d', 4: '4d' });
    expect(formatInterval(t0, new Date(t0.getTime() + 90 * 86_400_000))).toBe('3mo');
    expect(formatInterval(t0, new Date(t0.getTime() + 3 * 3_600_000))).toBe('3h');
  });

  it('SQL time round-trips', () => {
    expect(toSqlTime(t0)).toBe('2026-01-01 09:00:00');
    expect(fromSqlTime('2026-01-01 09:00:00').getTime()).toBe(t0.getTime());
  });
});
