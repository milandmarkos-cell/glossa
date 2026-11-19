import { useEffect, useSyncExternalStore } from 'react';
import type { TranslateItem, WordInfo } from '../../shared/types.ts';
import { api } from './api.ts';

export type TranslationEntry =
  | { state: 'loading' }
  | { state: 'done'; info: WordInfo }
  | { state: 'error'; reason: string; aiDisabled?: boolean };

const keyOf = (language: string, it: TranslateItem) => `${language}\u0000${it.surface.toLocaleLowerCase()}\u0000${it.sentence}`;

/**
 * Client-side translation cache with background batching: requests made within 250 ms
 * (e.g. several quick marks) go to the server as one /api/translate call. The server caches too.
 */
class TranslationStore {
  private entries = new Map<string, TranslationEntry>();
  private queue = new Map<string, { language: string; item: TranslateItem }>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  get(language: string, item: TranslateItem): TranslationEntry | undefined {
    return this.entries.get(keyOf(language, item));
  }

  /** Queue items that aren't cached yet. `retry` re-requests ones that failed (unless AI is off). */
  request(language: string, items: TranslateItem[], retry = false): void {
    let added = false;
    for (const item of items) {
      if (!item.surface.trim()) continue;
      const k = keyOf(language, item);
      const cur = this.entries.get(k);
      if (cur && !(retry && cur.state === 'error' && !cur.aiDisabled)) continue;
      this.entries.set(k, { state: 'loading' });
      this.queue.set(k, { language, item });
      added = true;
    }
    if (!added) return;
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const batch = [...this.queue.entries()];
    this.queue.clear();
    const byLang = new Map<string, [string, TranslateItem][]>();
    for (const [k, { language, item }] of batch) {
      const list = byLang.get(language) ?? [];
      list.push([k, item]);
      byLang.set(language, list);
    }
    await Promise.all(
      [...byLang].map(async ([language, list]) => {
        for (let i = 0; i < list.length; i += 300) {
          const chunk = list.slice(i, i + 300);
          try {
            const res = await api.translate(language, chunk.map(([, it]) => it));
            chunk.forEach(([k], j) =>
              this.entries.set(
                k,
                res.ok ? { state: 'done', info: res.results[j] } : { state: 'error', reason: res.reason, aiDisabled: res.aiDisabled },
              ),
            );
          } catch (e) {
            chunk.forEach(([k]) => this.entries.set(k, { state: 'error', reason: `Translation request failed: ${(e as Error).message}` }));
          }
        }
      }),
    );
    this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private version = 0;
  getVersion = () => this.version;
  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

export const translations = new TranslationStore();

/** Re-render whenever any translation changes (cheap: entries are read from the map). */
export function useTranslationsVersion(): number {
  return useSyncExternalStore(translations.subscribe, translations.getVersion);
}

/** Lazily fetch and subscribe to one word's translation. */
export function useTranslation(language: string, item: TranslateItem | null): TranslationEntry | undefined {
  useTranslationsVersion();
  useEffect(() => {
    if (item) translations.request(language, [item]);
  }, [language, item?.surface, item?.sentence]); // eslint-disable-line react-hooks/exhaustive-deps
  return item ? translations.get(language, item) : undefined;
}
