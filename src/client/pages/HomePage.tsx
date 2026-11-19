import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CEFR_LEVELS, getLanguage, TOPICS } from '../../shared/languages.ts';
import type { LanguageInfo, TextSummary } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../lib/settings.tsx';
import { Attribution } from '../components/Attribution.tsx';

export function HomePage() {
  const { settings, update, loaded } = useSettings();
  const language = settings.targetLanguage;
  const lang = getLanguage(language);
  const [texts, setTexts] = useState<TextSummary[] | null>(null);
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const level = params.get('level') ?? '';
  const topic = params.get('topic') ?? '';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    api.languages().then(setLanguages, () => {});
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setTexts(null);
    api.texts(language).then(setTexts, (e) => setError(String(e.message ?? e)));
  }, [language, loaded]);

  const stories = useMemo(() => texts?.filter((t) => t.sourceType === 'story') ?? null, [texts]);
  const own = useMemo(() => texts?.filter((t) => t.sourceType === 'user') ?? [], [texts]);
  const shown = useMemo(
    () => stories?.filter((t) => (!level || t.level === level) && (!topic || t.topics.includes(topic))) ?? null,
    [stories, level, topic],
  );
  const topicsHere = useMemo(() => TOPICS.filter((tp) => stories?.some((s) => s.topics.includes(tp))), [stories]);
  const choices = languages.some((l) => l.code === language) ? languages : [...languages, { code: language, stories: 0 }];
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${active ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]' : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-reading)] text-3xl font-semibold tracking-tight">What would you like to read?</h1>
          <p className="mt-1 text-[var(--muted)]">Tap any word you don't know. It will be waiting in your library.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Learning</span>
          <select
            value={language}
            onChange={(e) => {
              update({ targetLanguage: e.target.value });
              setParams(new URLSearchParams(), { replace: true });
            }}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5"
          >
            {choices.map((l) => (
              <option key={l.code} value={l.code}>
                {getLanguage(l.code).name} — {getLanguage(l.code).nativeName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Level">
          <span className="mr-1 w-14 text-xs tracking-wide text-[var(--muted)] uppercase">Level</span>
          <button type="button" className={chip(!level)} onClick={() => setParam('level', '')} aria-pressed={!level}>
            All
          </button>
          {CEFR_LEVELS.map((l) => (
            <button key={l} type="button" className={chip(level === l)} onClick={() => setParam('level', level === l ? '' : l)} aria-pressed={level === l}>
              {l}
            </button>
          ))}
        </div>
        {topicsHere.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Topic">
            <span className="mr-1 w-14 text-xs tracking-wide text-[var(--muted)] uppercase">Topic</span>
            <button type="button" className={chip(!topic)} onClick={() => setParam('topic', '')} aria-pressed={!topic}>
              All
            </button>
            {topicsHere.map((tp) => (
              <button key={tp} type="button" className={chip(topic === tp)} onClick={() => setParam('topic', topic === tp ? '' : tp)} aria-pressed={topic === tp}>
                {tp[0].toUpperCase() + tp.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Couldn't load texts: {error}</p>}

      {own.length > 0 && !level && !topic && (
        <section className="mt-8" aria-label="Your texts">
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Your texts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {own.map((t) => (
              <TextCard key={t.id} t={t} locale={lang.locale} dir={lang.dir} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Stories" aria-busy={texts === null}>
        {shown?.map((t) => (
          <TextCard key={t.id} t={t} locale={lang.locale} dir={lang.dir} />
        ))}
        {shown?.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
            {stories?.length ? 'No stories match these filters.' : `No stories in ${lang.name} yet. Paste your own text below.`}
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

function TextCard({ t, locale, dir }: { t: TextSummary; locale: string; dir: 'ltr' | 'rtl' }) {
  return (
    <Link
      to={`/read/${t.id}`}
      className="group block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)] hover:shadow-sm"
      data-testid="text-card"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        {t.level && <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 font-medium text-[var(--text)]">{t.level}</span>}
        <span>{t.wordCount} words</span>
        {t.topics.length > 0 && <span>· {t.topics.join(', ')}</span>}
      </div>
      <h2 lang={locale} dir={dir} className="mt-2 font-[family-name:var(--font-reading)] text-xl font-semibold group-hover:text-[var(--accent)]">
        {t.title}
      </h2>
      <p lang={locale} dir={dir} className="mt-2 line-clamp-3 text-[15px] text-[var(--muted)]">
        {t.excerpt}
      </p>
      <Attribution text={t} className="mt-3" />
    </Link>
  );
}
