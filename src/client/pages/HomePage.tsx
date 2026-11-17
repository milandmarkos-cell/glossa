import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { getLanguage } from '../../shared/languages.ts';
import type { TextSummary } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../lib/settings.tsx';
import { LanguageSelect } from '../components/LanguageSelect.tsx';
import { Attribution } from '../components/Attribution.tsx';

export function HomePage() {
  const { settings, update, loaded } = useSettings();
  const language = settings.targetLanguage;
  const lang = getLanguage(language);
  const [texts, setTexts] = useState<TextSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    setTexts(null);
    api.texts(language).then(setTexts, (e) => setError(String(e.message ?? e)));
  }, [language, loaded]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-reading)] text-3xl font-semibold tracking-tight">What would you like to read?</h1>
          <p className="mt-1 text-[var(--muted)]">Click any word you don't know. It will be waiting in your library.</p>
        </div>
        <LanguageSelect value={language} onChange={(code) => update({ targetLanguage: code })} label="Learning" />
      </div>

      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Couldn't load texts: {error}</p>}

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Texts" aria-busy={texts === null}>
        {texts?.map((t) => (
          <Link
            key={t.id}
            to={`/read/${t.id}`}
            className="group block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)] hover:shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              {t.level && <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 font-medium text-[var(--text)]">{t.level}</span>}
              <span>{t.wordCount} words</span>
              {t.topics.length > 0 && <span>· {t.topics.join(', ')}</span>}
            </div>
            <h2 lang={lang.locale} dir={lang.dir} className="mt-2 font-[family-name:var(--font-reading)] text-xl font-semibold group-hover:text-[var(--accent)]">
              {t.title}
            </h2>
            <p lang={lang.locale} dir={lang.dir} className="mt-2 line-clamp-3 text-[15px] text-[var(--muted)]">
              {t.excerpt}
            </p>
            <Attribution text={t} className="mt-3" />
          </Link>
        ))}
        {texts?.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
            No texts in {lang.name} yet. Paste one below.
          </p>
        )}
      </section>

      <PasteForm language={language} />
    </main>
  );
}

function PasteForm({ language }: { language: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api.createText({ language, title, body });
      navigate(`/read/${t.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="font-medium">Paste your own text</span>
        <span className="text-[var(--muted)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={8}
            placeholder={`Paste a text in ${getLanguage(language).name}. Separate paragraphs with a blank line.`}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-reading)]"
            data-testid="paste-body"
          />
          <div className="flex items-center gap-3">
            <button disabled={busy || !body.trim()} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Read it'}
            </button>
            <span className="text-xs text-[var(--muted)]">Saved privately for your personal use.</span>
          </div>
          {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        </form>
      )}
    </section>
  );
}
