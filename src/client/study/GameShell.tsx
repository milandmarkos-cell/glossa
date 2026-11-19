import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Grade } from '../../shared/srs.ts';
import type { Word } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import type { GameInfo } from './games.ts';

export const MIN_WORDS = 4;

/** Load a weighted pool of words for a game round. */
export function useGameWords(language: string, n: number) {
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    setWords(null);
    api.pool(language, n).then(setWords, (e) => setError(e.message));
  }, [language, n, round]);
  return { words, error, again: () => setRound((r) => r + 1) };
}

/** Record an answer for SRS (games only reschedule words that are new or due). Fire and forget. */
export function record(word: Word, grade: Grade, mode: GameInfo['id']) {
  api.review({ wordId: word.id, cardType: 'recognition', grade, mode }).catch(() => {});
}

export interface GameResult {
  correct: number;
  total: number;
  missed: Word[];
  seconds?: number;
}

export function GameShell({ game, language, progress, children }: { game: GameInfo; language: string; progress?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center justify-between gap-3 text-sm text-[var(--muted)]">
        <Link to={`/study?language=${language}`} className="hover:text-[var(--text)]">
          ← Review
        </Link>
        <span className="font-medium text-[var(--text)]">
          {game.icon} {game.name}
        </span>
        <span className="tabular-nums" data-testid="game-progress">
          {progress}
        </span>
      </div>
      <section className="mt-6 flex flex-1 flex-col rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8">{children}</section>
    </main>
  );
}

export function NotEnoughWords({ language, have }: { language: string; have: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center" data-testid="not-enough">
      <p className="text-lg">You need at least {MIN_WORDS} saved words with translations to play.</p>
      <p className="mt-1 text-[var(--muted)]">You have {have}. Read a story and save a few more.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white">
          Find a story
        </Link>
        <Link to={`/study?language=${language}`} className="rounded-lg border border-[var(--line)] px-4 py-2">
          Back
        </Link>
      </div>
    </div>
  );
}

export function GameResults({ result, language, onAgain }: { result: GameResult; language: string; onAgain: () => void }) {
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const unique = [...new Map(result.missed.map((w) => [w.id, w])).values()];
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center" data-testid="game-results">
      <div className="text-5xl font-semibold tabular-nums">{pct}%</div>
      <p className="mt-2 text-[var(--muted)]">
        {result.correct} of {result.total} right{result.seconds !== undefined && ` in ${formatSeconds(result.seconds)}`}
      </p>
      {unique.length > 0 && (
        <div className="mt-6 w-full max-w-sm text-left">
          <div className="mb-2 text-sm font-medium">Worth another look</div>
          <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
            {unique.map((w) => (
              <li key={w.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-[family-name:var(--font-reading)]">{w.surface}</span>
                <span className="text-[var(--muted)]">{w.translation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={onAgain} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white">
          Play again
        </button>
        <Link to={`/study?language=${language}`} className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--hover)]">
          Back to review
        </Link>
      </div>
    </div>
  );
}

export const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Elapsed seconds since mount (stops when `running` is false). */
export function useTimer(running: boolean) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  return Math.floor((now - start) / 1000);
}

export function useKey(handler: (e: KeyboardEvent) => void) {
  const cb = useCallback(handler, [handler]);
  useEffect(() => {
    document.addEventListener('keydown', cb);
    return () => document.removeEventListener('keydown', cb);
  }, [cb]);
}
