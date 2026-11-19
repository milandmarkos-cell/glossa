import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getLanguage } from '../../shared/languages.ts';
import { toScript } from '../../shared/script.ts';
import type { SaveWordsResult, TextDetail, Word } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { clearMarks, loadMarks } from '../lib/marks.ts';
import { useSettings } from '../lib/settings.tsx';
import { speak, ttsSupported } from '../lib/tts.ts';
import { ContextSentence } from '../components/ContextSentence.tsx';
import type { MarkedWord } from '../reader/ReaderView.tsx';

interface Row {
  mark: MarkedWord;
  surface: string;
  /** null = not edited yet: show the dictionary (or existing library) translation. */
  translation: string | null;
  removed: boolean;
}

/** Summary after reading: review, edit or remove the marked words, then save them to the library. */
export function FinishPage() {
  const id = Number(useParams().id);
  const { settings, loaded } = useSettings();
  const [text, setText] = useState<TextDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => loadMarks(id).map((mark) => ({ mark, surface: mark.surface, translation: null, removed: false })));
  const [existing, setExisting] = useState<Map<string, Word>>(new Map());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveWordsResult | null>(null);

  useEffect(() => {
    api.text(id).then(setText, (e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!text || rows.length === 0) return;
    api.lookupWords(text.language, rows.map((r) => r.mark.key)).then((words) => setExisting(new Map(words.map((w) => [w.key, w]))), () => {});
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show (and save) words in the script the learner reads in (Serbian Cyrillic/Latin toggle).
  useEffect(() => {
    if (!text || !loaded || !getLanguage(text.language).scripts || settings.reader.script === 'original') return;
    setRows((rs) => rs.map((r) => (r.surface === r.mark.surface ? { ...r, surface: toScript(r.mark.surface, settings.reader.script) } : r)));
  }, [text, loaded, settings.reader.script]);

  if (error) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]">{error}</main>;
  if (!text) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]" aria-busy="true">Loading…</main>;

  const lang = getLanguage(text.language);
  /** What will be saved: the learner's edit > the dictionary > what the library already has. */
  const translationOf = (r: Row) => r.translation ?? r.mark.translation ?? existing.get(r.mark.key)?.translation ?? '';
  const kept = rows.filter((r) => !r.removed);
  const untranslated = kept.filter((r) => !translationOf(r)).length;
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveWords({
        language: text.language,
        textId: text.id,
        words: kept.map((r) => ({
          surface: r.surface.trim() || r.mark.surface,
          translation: translationOf(r),
          pos: r.mark.pos,
          lemma: r.mark.surface,
          sentence: r.mark.sentence,
          offset: r.mark.offset,
          form: r.mark.form,
        })),
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
          {result.created} new{result.updated > 0 && `, ${result.updated} already in your library (sentence added)`}.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={`/study?language=${text.language}`} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white hover:opacity-90">
            Review now
          </Link>
          <Link to={`/library?language=${text.language}`} className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--hover)]">
            Open library
          </Link>
          <Link to="/" className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--hover)]">
            Read another story
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
        From <span lang={lang.locale}>{text.title}</span>. Check the words, change anything you like, and remove the ones you don't want to keep.
      </p>

      {rows.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
          You didn't mark any words in this text.{' '}
          <Link to={`/read/${text.id}`} className="text-[var(--accent)] underline">
            Go back and tap the ones you don't know.
          </Link>
        </div>
      )}

      {untranslated > 0 && (
        <p className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]" role="status">
          {untranslated === 1 ? "One word isn't" : `${untranslated} words aren't`} in the dictionary. Type a translation, or save without one and add it later in your library.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((r, i) => {
          const prev = existing.get(r.mark.key);
          const pos = r.mark.pos ?? prev?.pos;
          return (
            <li key={r.mark.key} data-testid="finish-row" className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-opacity ${r.removed ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <input
                    lang={lang.locale}
                    dir={lang.dir}
                    value={r.surface}
                    disabled={r.removed}
                    onChange={(e) => update(i, { surface: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-reading)] text-lg"
                    aria-label="Word"
                  />
                  <input
                    value={translationOf(r)}
                    disabled={r.removed}
                    placeholder="Translation"
                    onChange={(e) => update(i, { translation: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                    aria-label="Translation"
                    data-testid="finish-translation"
                  />
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
                {r.mark.form.toLocaleLowerCase() !== r.mark.surface.toLocaleLowerCase() && (
                  <span>
                    in the text: <span lang={lang.locale}>{r.mark.form}</span>
                  </span>
                )}
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
            <span className="text-sm text-[var(--muted)]">{error ? <span className="text-red-700 dark:text-red-300">{error}</span> : `${kept.length} of ${rows.length} selected`}</span>
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
