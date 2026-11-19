import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getLanguage } from '../../shared/languages.ts';
import { toScript } from '../../shared/script.ts';
import type { TextDetail } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../lib/settings.tsx';
import { ReaderView, type MarkedWord } from '../reader/ReaderView.tsx';
import { ReaderSettings } from '../reader/ReaderSettings.tsx';
import { Attribution } from '../components/Attribution.tsx';
import { loadMarks, saveMarks } from '../lib/marks.ts';

export function ReaderPage() {
  const id = Number(useParams().id);
  const { settings } = useSettings();
  const prefs = settings.reader;
  const [text, setText] = useState<TextDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<string>>(new Set());
  const [marked, setMarked] = useState<MarkedWord[]>([]);
  const initialMarked = useMemo(() => loadMarks(id).map((m) => m.key), [id]);
  const navigate = useNavigate();

  useEffect(() => {
    setText(null);
    setError(null);
    api.text(id).then(
      (t) => {
        setText(t);
        api.savedKeys(t.language).then((rows) => setSavedKeys(new Set(rows.map((r) => r.key))), () => {});
      },
      (e) => setError(e.message),
    );
  }, [id]);

  const onMarkedChange = useCallback(
    (words: MarkedWord[]) => {
      setMarked(words);
      saveMarks(id, words);
    },
    [id],
  );

  if (error) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]">{error}</main>;
  if (!text) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]" aria-busy="true">Loading…</main>;

  const lang = getLanguage(text.language);
  const script = lang.scripts ? prefs.script : 'original';

  return (
    <main className="mx-auto max-w-[44rem] px-4 pt-6 pb-32 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← All texts
        </Link>
        <ReaderSettings language={text.language} />
      </div>

      <header className="mt-6 mb-8">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          {text.level && <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 font-medium text-[var(--text)]">{text.level}</span>}
          <span>
            {lang.name} · {text.wordCount} words
          </span>
        </div>
        <h1 lang={lang.locale} dir={lang.dir} className="mt-2 font-[family-name:var(--font-reading)] text-3xl leading-tight font-semibold sm:text-4xl">
          {toScript(text.title, script)}
        </h1>
        <Attribution text={text} className="mt-3" />
      </header>

      <ReaderView
        textId={text.id}
        language={text.language}
        body={text.body}
        glossary={text.glossary}
        prefs={prefs}
        savedKeys={savedKeys}
        initialMarked={initialMarked}
        onMarkedChange={onMarkedChange}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[44rem] items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <span className="text-sm text-[var(--muted)]" aria-live="polite" data-testid="marked-count">
            {marked.length === 0 ? 'Tap words you don’t know' : `${marked.length} word${marked.length === 1 ? '' : 's'} marked`}
          </span>
          <button
            type="button"
            onClick={() => navigate(`/read/${id}/finish`)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Finish reading
          </button>
        </div>
      </div>
    </main>
  );
}
