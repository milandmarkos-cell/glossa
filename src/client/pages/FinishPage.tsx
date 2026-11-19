import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getLanguage } from '../../shared/languages.ts';
import type { SaveWordsResult, TextDetail, Word } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { clearMarks, loadMarks } from '../lib/marks.ts';
import { translations, useTranslationsVersion } from '../lib/translations.ts';
import { speak, ttsSupported } from '../lib/tts.ts';
import { ContextSentence } from '../components/ContextSentence.tsx';
import { useSettings } from '../lib/settings.tsx';
import { toScript } from '../../shared/script.ts';
import type { MarkedWord } from '../reader/ReaderView.tsx';

interface Row {
  mark: MarkedWord;
  surface: string;
  /** null = not edited by the user yet (follow the automatic translation). */
  translation: string | null;
  removed: boolean;
}

/** Summary after reading: review, edit or remove the marked words, then save them to the library. */
export function FinishPage() {
  const id = Number(useParams().id);
  const [text, setText] = useState<TextDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => loadMarks(id).map((mark) => ({ mark, surface: mark.surface, translation: null, removed: false })));
  const [existing, setExisting] = useState<Map<string, Word>>(new Map());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveWordsResult | null>(null);
  useTranslationsVersion();
  const { settings, loaded } = useSettings();

  useEffect(() => {
    api.text(id).then(setText, (e) => setError(e.message));
  }, [id]);

  // Show (and save) words in the script the learner reads in (Serbian Cyrillic/Latin toggle).
  useEffect(() => {
    if (!text || !loaded || !getLanguage(text.language).scripts || settings.reader.script === 'original') return;
    setRows((rs) => rs.map((r) => (r.surface === r.mark.surface ? { ...r, surface: toScript(r.mark.surface, settings.reader.script) } : r)));
  }, [text, loaded, settings.reader.script]);

  const language = text?.language;
  const items = useMemo(() => rows.map((r) => ({ surface: r.mark.form, sentence: r.mark.sentence })), [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!language || rows.length === 0) return;
    translations.request(language, items);
    api.lookupWords(language, rows.map((r) => r.mark.key)).then((words) => setExisting(new Map(words.map((w) => [w.key, w]))), () => {});
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]">{error}</main>;
  if (!text) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]" aria-busy="true">Loading…</main>;

  const lang = getLanguage(text.language);
  const entryFor = (r: Row) => translations.get(text.language, { surface: r.mark.form, sentence: r.mark.sentence });
  /** What will be saved: user's edit > automatic translation > what the library already has. */
  const effectiveTranslation = (r: Row) => {
    if (r.translation !== null) return r.translation;
    const e = entryFor(r);
    if (e?.state === 'done') return e.info.translation;
    return existing.get(r.mark.key)?.translation ?? '';
  };
  const kept = rows.filter((r) => !r.removed);
  const errors = rows.map(entryFor).filter((e) => e?.state === 'error');
  const aiOff = errors.some((e) => e?.state === 'error' && e.aiDisabled);
  const failure = errors.find((e) => e?.state === 'error' && !e.aiDisabled);
  const loading = rows.some((r) => entryFor(r)?.state === 'loading');
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveWords({
        language: text.language,
        textId: text.id,
        words: kept.map((r) => {
          const e = entryFor(r);
          const info = e?.state === 'done' ? e.info : null;
          return {
            surface: r.surface.trim() || r.mark.surface,
            translation: effectiveTranslation(r),
            pos: info?.pos ?? null,
            lemma: info?.lemma ?? null,
            sentence: r.mark.sentence,
            offset: r.mark.offset,
            form: r.mark.form,
          };
        }),
      });
      clearMarks(text.id);
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center" data-testid="finish-done">
        <div className="text-4xl" aria-hidden="true">
          ✓
        </div>
        <h1 className="mt-3 font-[family-name:var(--font-reading)] text-3xl font-semibold">
          {result.words.length === 0 ? 'Nothing saved' : `Saved ${result.words.length} word${result.words.length === 1 ? '' : 's'}`}
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          {result.created} new{result.updated > 0 && `, ${result.updated} already in your library (context added)`}.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={`/library?language=${text.language}`} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white hover:opacity-90">
            Open library
          </Link>
          <Link to="/" className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--hover)]">
            Read something else
          </Link>
          <Link to={`/read/${text.id}`} className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--hover)]">
            Back to the text
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-32 sm:px-6">
      <Link to={`/read/${text.id}`} className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Back to the text
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-reading)] text-3xl font-semibold">New words</h1>
      <p className="mt-1 text-[var(--muted)]">
        From <span lang={lang.locale}>{text.title}</span>. Check the translations, fix anything that's off, and remove words you don't want to keep.
      </p>

      {rows.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
          You didn't mark any words in this text.{' '}
          <Link to={`/read/${text.id}`} className="text-[var(--accent)] underline">
            Go back and tap the ones you don't know.
          </Link>
        </div>
      )}

      {aiOff && (
        <p className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]" role="status">
          Automatic translation is off. Type the translations yourself, or add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart to fill them in automatically.
        </p>
      )}
      {failure && failure.state === 'error' && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100" role="alert">
          <span>Some translations couldn't be fetched: {failure.reason} You can still type them yourself.</span>
          <button type="button" className="rounded-md border border-current px-2.5 py-1" onClick={() => translations.request(text.language, items, true)}>
            Try again
          </button>
        </div>
      )}

      <ul className="mt-6 space-y-3" aria-busy={loading}>
        {rows.map((r, i) => {
          const entry = entryFor(r);
          const prev = existing.get(r.mark.key);
          const pos = entry?.state === 'done' ? entry.info.pos : prev?.pos;
          return (
            <li
              key={r.mark.key}
              data-testid="finish-row"
              className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition ${r.removed ? 'opacity-50' : ''}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="sr-only">Word</span>
                    <input
                      lang={lang.locale}
                      dir={lang.dir}
                      value={r.surface}
                      disabled={r.removed}
                      onChange={(e) => update(i, { surface: e.target.value })}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-reading)] text-lg"
                      aria-label="Word"
                    />
                  </label>
                  <label className="relative block">
                    <span className="sr-only">Translation</span>
                    <input
                      value={effectiveTranslation(r)}
                      disabled={r.removed}
                      placeholder={entry?.state === 'loading' ? 'Translating…' : 'Translation'}
                      onChange={(e) => update(i, { translation: e.target.value })}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                      aria-label="Translation"
                      data-testid="finish-translation"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  {ttsSupported() && (
                    <button type="button" className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)]" aria-label={`Play ${r.surface}`} onClick={() => speak(r.surface, lang.ttsLang)}>
                      🔊
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => update(i, { removed: !r.removed })}
                    className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                    aria-label={r.removed ? `Keep ${r.surface}` : `Remove ${r.surface}`}
                  >
                    {r.removed ? 'Undo' : 'Remove'}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                {pos && <span className="tracking-wide uppercase">{pos}</span>}
                {prev && <span className="rounded bg-[var(--hover)] px-1.5 py-0.5">Already in your library: this sentence will be added</span>}
              </div>
              <ContextSentence sentence={r.mark.sentence} offset={r.mark.offset} form={r.mark.form} language={text.language} className="mt-2 text-[15px] text-[var(--muted)]" />
            </li>
          );
        })}
      </ul>

      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <span className="text-sm text-[var(--muted)]">{error ? <span className="text-red-700 dark:text-red-300">{error}</span> : loading ? 'Fetching translations…' : `${kept.length} of ${rows.length} selected`}</span>
            <button
              type="button"
              disabled={saving || kept.length === 0}
              onClick={save}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save ${kept.length} word${kept.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
