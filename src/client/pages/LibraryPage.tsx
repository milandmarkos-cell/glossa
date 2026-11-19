import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getLanguage, LANGUAGES } from '../../shared/languages.ts';
import type { Word, WordStatus } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { speak, ttsSupported } from '../lib/tts.ts';
import { ContextSentence } from '../components/ContextSentence.tsx';

const STATUSES: WordStatus[] = ['new', 'learning', 'known'];
const STATUS_STYLE: Record<WordStatus, string> = {
  new: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  learning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  known: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
};

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const language = params.get('language') ?? '';
  const status = (params.get('status') ?? '') as WordStatus | '';
  const sort = params.get('sort') === 'alpha' ? 'alpha' : 'recent';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [all, setAll] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Load the whole library once per language/sort; search + status filter happen client-side (instant).
  useEffect(() => {
    setAll(null);
    api.words({ language: language || undefined, sort }).then(setAll, (e) => setError(e.message));
  }, [language, sort]);

  const words = useMemo(() => {
    if (!all) return null;
    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const needle = fold(debouncedQ.trim());
    return all.filter(
      (w) =>
        (!status || w.status === status) &&
        (!needle || [w.surface, w.translation, w.lemma, w.notes, ...w.contexts.map((c) => c.sentence)].some((f) => f && fold(f).includes(needle))),
    );
  }, [all, status, debouncedQ]);

  const counts = useMemo(() => {
    const c = { new: 0, learning: 0, known: 0 };
    for (const w of all ?? []) c[w.status]++;
    return c;
  }, [all]);

  const replace = (w: Word) => setAll((ws) => ws?.map((x) => (x.id === w.id ? w : x)) ?? null);
  const remove = (id: number) => setAll((ws) => ws?.filter((x) => x.id !== id) ?? null);
  const pill = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? 'bg-[var(--text)] text-[var(--bg)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]'}`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-reading)] text-3xl font-semibold">Your library</h1>
          <p className="mt-1 text-sm text-[var(--muted)]" data-testid="library-counts">
            {all ? `${all.length} word${all.length === 1 ? '' : 's'} · ${counts.new} new · ${counts.learning} learning · ${counts.known} known` : 'Loading…'}
          </p>
        </div>
        <a href={api.exportUrl(language || undefined)} download className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]" title="CSV with headers Anki understands (File → Import)">
          Export for Anki (CSV)
        </a>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParam('q', e.target.value);
          }}
          placeholder="Search words, translations, sentences…"
          className="min-w-0 flex-1 basis-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 sm:basis-0"
          aria-label="Search library"
        />
        <select value={language} onChange={(e) => setParam('language', e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm" aria-label="Language">
          <option value="">All languages</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'alpha' ? 'alpha' : '')} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm" aria-label="Sort">
          <option value="recent">Newest first</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filter by status">
        <button type="button" className={pill(!status)} onClick={() => setParam('status', '')} aria-pressed={!status}>
          All
        </button>
        {STATUSES.map((s) => (
          <button key={s} type="button" className={pill(status === s)} onClick={() => setParam('status', s)} aria-pressed={status === s}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <p className="mt-6 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {words && words.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
          {all && all.length === 0 ? (
            <>
              No words yet.{' '}
              <Link to="/" className="text-[var(--accent)] underline">
                Open a text
              </Link>{' '}
              and tap the words you don't know.
            </>
          ) : (
            'No words match these filters.'
          )}
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {words?.map((w) => (
          <WordCard key={w.id} word={w} onChange={replace} onDelete={() => remove(w.id)} />
        ))}
      </ul>
    </main>
  );
}

function WordCard({ word: w, onChange, onDelete }: { word: Word; onChange: (w: Word) => void; onDelete: () => void }) {
  const lang = getLanguage(w.language);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ surface: w.surface, translation: w.translation ?? '', pos: w.pos ?? '', notes: w.notes ?? '' });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onChange(await api.updateWord(w.id, draft));
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setStatus = async (status: WordStatus) => {
    try {
      onChange(await api.updateWord(w.id, { status }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const del = async () => {
    try {
      await api.deleteWord(w.id);
      onDelete();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const contexts = showAll ? w.contexts : w.contexts.slice(0, 1);
  const input = 'w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2';

  return (
    <li className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4" data-testid="library-word" data-word={w.surface}>
      {editing ? (
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-2">
          <input lang={lang.locale} dir={lang.dir} className={`${input} font-[family-name:var(--font-reading)] text-lg`} value={draft.surface} onChange={(e) => setDraft({ ...draft, surface: e.target.value })} aria-label="Word" required />
          <input className={input} value={draft.translation} onChange={(e) => setDraft({ ...draft, translation: e.target.value })} placeholder="Translation" aria-label="Translation" />
          <input className={input} value={draft.pos} onChange={(e) => setDraft({ ...draft, pos: e.target.value })} placeholder="Part of speech" aria-label="Part of speech" />
          <input className={input} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Notes" aria-label="Notes" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white">Save</button>
            <button type="button" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span lang={lang.locale} dir={lang.dir} className="font-[family-name:var(--font-reading)] text-xl font-semibold" data-testid="library-surface">
                {w.surface}
              </span>
              <span className="text-[var(--text)]" data-testid="library-translation">
                {w.translation || <span className="text-[var(--muted)] italic">no translation</span>}
              </span>
              {w.pos && <span className="text-xs tracking-wide text-[var(--muted)] uppercase">{w.pos}</span>}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {lang.name}
              {w.lemma && w.lemma !== w.surface && <> · dictionary form: <span lang={lang.locale}>{w.lemma}</span></>}
              {w.notes && <> · {w.notes}</>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {ttsSupported() && (
              <button type="button" className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)]" aria-label={`Play ${w.surface}`} onClick={() => speak(w.surface, lang.ttsLang)}>
                🔊
              </button>
            )}
            <select value={w.status} onChange={(e) => setStatus(e.target.value as WordStatus)} className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[w.status]}`} aria-label={`Status of ${w.surface}`}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]" onClick={() => setEditing(true)}>
              Edit
            </button>
            {confirming ? (
              <span className="flex items-center gap-1 text-sm">
                <button type="button" className="rounded-lg bg-red-600 px-2.5 py-1.5 text-white" onClick={del}>
                  Delete
                </button>
                <button type="button" className="rounded-lg px-2.5 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)]" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-red-700" onClick={() => setConfirming(true)} aria-label={`Delete ${w.surface}`}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {contexts.map((c) => (
        <div key={c.id} className="mt-3 border-l-2 border-[var(--line)] pl-3">
          <ContextSentence sentence={c.sentence} offset={c.offset} form={c.form} language={w.language} className="text-[15px] text-[var(--muted)]" />
          {c.sourceTitle && (
            <div className="mt-0.5 text-xs text-[var(--muted)]">
              {c.textId ? (
                <Link to={`/read/${c.textId}`} className="hover:text-[var(--text)] hover:underline">
                  {c.sourceTitle}
                </Link>
              ) : (
                c.sourceTitle
              )}
            </div>
          )}
        </div>
      ))}
      {w.contexts.length > 1 && (
        <button type="button" className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer sentences' : `+${w.contexts.length - 1} more sentence${w.contexts.length > 2 ? 's' : ''}`}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </li>
  );
}
