import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getLanguage } from '../../shared/languages.ts';
import { GRADE_LABELS, previewIntervals, SESSION_REPEAT_MS, type CardState, type Grade } from '../../shared/srs.ts';
import type { CardType, SrsStateDTO, StudyCard } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../lib/settings.tsx';
import { speak, ttsSupported } from '../lib/tts.ts';
import { ContextSentence } from '../components/ContextSentence.tsx';
import { displayText } from '../study/display.ts';

const fromDTO = (s: SrsStateDTO): CardState => ({ ...s, due: new Date(s.due), lastReviewed: s.lastReviewed ? new Date(s.lastReviewed) : null });

const GRADE_STYLE: Record<Grade, string> = {
  1: 'border-red-300 text-red-800 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950',
  2: 'border-amber-300 text-amber-900 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-950',
  3: 'border-emerald-300 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950',
  4: 'border-sky-300 text-sky-900 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-200 dark:hover:bg-sky-950',
};

/** One flashcard session: due cards, then today's new cards. Failed cards come back within the session. */
export function FlashcardsPage() {
  const [params] = useSearchParams();
  const language = params.get('language') ?? 'es';
  const direction: CardType = params.get('direction') === 'production' ? 'production' : 'recognition';
  const { settings } = useSettings();
  const lang = getLanguage(language);
  const [cards, setCards] = useState<StudyCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    api.queue(language, direction).then((q) => setCards(q.cards), (e) => setError(e.message));
  }, [language, direction]);

  const card = cards?.[0];
  const show = (t: string) => displayText(t, language, settings.reader);
  const ctx = card?.word.contexts[0];

  const grade = useCallback(
    async (g: Grade) => {
      if (!card || busy.current) return;
      busy.current = true;
      try {
        const r = await api.review({ wordId: card.word.id, cardType: direction, grade: g, mode: 'flashcard' });
        const comesBackSoon = new Date(r.state.due).getTime() - Date.now() < SESSION_REPEAT_MS;
        setCards((cs) => {
          if (!cs) return cs;
          const rest = cs.slice(1);
          return comesBackSoon ? [...rest, { ...card, state: r.state, isNew: false }] : rest;
        });
        if (!comesBackSoon) setDone((d) => d + 1);
        if (g === 1) setAgain((a) => a + 1);
        setRevealed(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        busy.current = false;
      }
    },
    [card, direction],
  );

  // Keyboard: Space/Enter reveal, 1–4 grade, P pronounce.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === ' ' || e.key === 'Enter') && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        void grade(Number(e.key) as Grade);
      } else if (e.key.toLowerCase() === 'p') {
        speak(card.word.surface, lang.ttsLang);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [card, revealed, grade, lang.ttsLang]);

  if (error) return <main className="mx-auto max-w-xl px-4 py-16 text-center text-[var(--muted)]">{error}</main>;
  if (!cards) return <main className="mx-auto max-w-xl px-4 py-16 text-center text-[var(--muted)]">Loading…</main>;

  if (!card) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center" data-testid="session-done">
        <div className="text-4xl" aria-hidden="true">
          🎉
        </div>
        <h1 className="mt-3 font-[family-name:var(--font-reading)] text-3xl font-semibold">{done === 0 ? 'Nothing due right now' : 'Session complete'}</h1>
        <p className="mt-2 text-[var(--muted)]">
          {done === 0 ? 'Come back later, or try a game.' : `You reviewed ${done} card${done === 1 ? '' : 's'}${again ? ` and practised ${again} again` : ''}.`}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={`/study?language=${language}`} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white">
            Back to review
          </Link>
          <Link to="/" className="rounded-lg border border-[var(--line)] px-4 py-2 hover:bg-[var(--hover)]">
            Read a story
          </Link>
        </div>
      </main>
    );
  }

  const previews = previewIntervals(fromDTO(card.state), new Date());
  const remaining = cards.length;
  const progress = done / (done + remaining);
  const word = show(card.word.surface);
  const audio = ttsSupported() && (
    <button type="button" onClick={() => speak(card.word.surface, lang.ttsLang)} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)]" aria-label="Play pronunciation" title="Play (P)">
      🔊
    </button>
  );

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <Link to={`/study?language=${language}`} className="hover:text-[var(--text)]">
          ← Review
        </Link>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--hover)]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="tabular-nums" data-testid="remaining">
          {remaining} left
        </span>
      </div>

      <section className="mt-6 flex flex-1 flex-col rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-10" aria-live="polite" data-testid="flashcard">
        {card.isNew && <span className="self-start rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200">New word</span>}

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {direction === 'recognition' ? (
            <>
              <div className="flex items-center gap-2">
                <span lang={lang.locale} dir={lang.dir} className="font-[family-name:var(--font-reading)] text-4xl font-semibold sm:text-5xl" data-testid="card-front">
                  {word}
                </span>
                {audio}
              </div>
              {ctx && <ContextSentence sentence={ctx.sentence} offset={ctx.offset} form={ctx.form} transform={show} language={language} className="mt-6 max-w-lg font-[family-name:var(--font-reading)] text-lg text-[var(--muted)]" />}
              {revealed && (
                <div className="mt-8 border-t border-[var(--line)] pt-6" data-testid="card-back">
                  <div className="text-2xl font-medium">{card.word.translation || <span className="text-[var(--muted)] italic">no translation saved</span>}</div>
                  {card.word.pos && <div className="mt-1 text-xs tracking-wide text-[var(--muted)] uppercase">{card.word.pos}</div>}
                  {card.word.notes && <div className="mt-2 text-sm text-[var(--muted)]">{card.word.notes}</div>}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-3xl font-medium sm:text-4xl" data-testid="card-front">
                {card.word.translation || '—'}
              </div>
              {ctx && (
                <p lang={lang.locale} dir={lang.dir} className="mt-6 max-w-lg font-[family-name:var(--font-reading)] text-lg text-[var(--muted)]">
                  {blankOut(ctx.sentence, ctx.offset, ctx.form, revealed, show)}
                </p>
              )}
              {revealed && (
                <div className="mt-8 flex items-center gap-2 border-t border-[var(--line)] pt-6" data-testid="card-back">
                  <span lang={lang.locale} dir={lang.dir} className="font-[family-name:var(--font-reading)] text-4xl font-semibold">
                    {word}
                  </span>
                  {audio}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-8">
          {!revealed ? (
            <button type="button" onClick={() => setRevealed(true)} className="w-full rounded-xl bg-[var(--accent)] py-3 font-medium text-white hover:opacity-90">
              Show answer <span className="ml-1 text-sm opacity-75">(Space)</span>
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you remember?">
              {([1, 2, 3, 4] as Grade[]).map((g) => (
                <button key={g} type="button" onClick={() => grade(g)} className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${GRADE_STYLE[g]}`}>
                  <div>{GRADE_LABELS[g]}</div>
                  <div className="text-xs font-normal opacity-75">
                    {previews[g]} · {g}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/** Sentence with the word replaced by a gap (production cards); shows the word highlighted once revealed. */
function blankOut(sentence: string, offset: number, form: string | null, revealed: boolean, show: (s: string) => string) {
  if (!form || sentence.slice(offset, offset + form.length) !== form) return show(sentence);
  return (
    <>
      {show(sentence.slice(0, offset))}
      {revealed ? <mark className="rounded-sm bg-[var(--mark-bg)] px-0.5 text-inherit">{show(form)}</mark> : <span className="inline-block min-w-[3em] border-b-2 border-[var(--text)]">&nbsp;</span>}
      {show(sentence.slice(offset + form.length))}
    </>
  );
}
