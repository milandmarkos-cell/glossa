import type { MarkedWord } from '../reader/ReaderView.tsx';

/** Marked words per text live in sessionStorage until "Finish reading" saves them. */
const keyFor = (textId: number) => `glossa:marks:${textId}`;

export function loadMarks(textId: number): MarkedWord[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(keyFor(textId)) ?? '[]');
    // M1 stored bare keys; those can't be restored with context, so drop them.
    return Array.isArray(raw) ? raw.filter((m): m is MarkedWord => typeof m === 'object' && m !== null && typeof m.key === 'string') : [];
  } catch {
    return [];
  }
}

export function saveMarks(textId: number, words: MarkedWord[]): void {
  try {
    if (words.length) sessionStorage.setItem(keyFor(textId), JSON.stringify(words));
    else sessionStorage.removeItem(keyFor(textId));
  } catch {
    /* storage full or disabled: marks just aren't restored */
  }
}

export function clearMarks(textId: number): void {
  try {
    sessionStorage.removeItem(keyFor(textId));
  } catch {
    /* ignore */
  }
}
