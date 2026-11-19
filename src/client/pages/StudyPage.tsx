import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getLanguage } from '../../shared/languages.ts';
import type { StudyQueue, StudyStats } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../lib/settings.tsx';
import { useStudyLanguage } from '../study/useStudyLanguage.ts';
import { GAMES } from '../study/games.ts';

/** Review hub: stats, flashcards (spaced repetition) and practice games for one language. */
export function StudyPage() {
  const { language, available, ready } = useStudyLanguage();
  const [, setParams] = useSearchParams();
  const { settings, update } = useSettings();
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [queue, setQueue] = useState<StudyQueue | null>(null);
  const [reverseQueue, setReverseQueue] = useState<StudyQueue | null>(null);

  useEffect(() => {
    if (!language) return;
    setStats(null);
    api.stats(language).then(setStats, () => {});
    api.queue(language, 'recognition').then(setQueue, () => {});
    api.queue(language, 'production').then(setReverseQueue, () => {});
  }, [language, settings.newCardsPerDay]);

  if (!ready || !language) return <main className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--muted)]">Loading…</main>;

  if (available && available.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-reading)] text-3xl font-semibold">Nothing to review yet</h1>
        <p className="mt-3 text-[var(--muted)]">Read a story, tap the words you don't know and save them. They'll show up here as flashcards and games.</p>
        <Link to="/" className="mt-8 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white">
          Find a story
        </Link>
      </main>
    );
  }

  const lang = getLanguage(language);
  const total = stats?.total ?? 0;
  const translated = (queue?.cards.length ?? 0) > 0 || total > 0;
  const cardsToday = (q: StudyQueue | null) => (q ? q.cards.length : 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-reading)] text-3xl font-semibold">Review</h1>
          <p className="mt-1 text-[var(--muted)]">Practise the words you saved while reading.</p>
        </div>
        {available && available.length > 1 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Language</span>
            <select value={language} onChange={(e) => setParams({ language: e.target.value })} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5">
              {available.map((l) => (
                <option key={l.code} value={l.code}>
                  {getLanguage(l.code).name} ({l.words})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Your progress" data-testid="stats">
        <Stat label="Day streak" value={stats ? `${stats.streak}` : '–'} hint={stats?.streak ? '🔥' : ''} />
        <Stat label="Reviewed today" value={stats ? `${stats.reviewedToday}` : '–'} />
        <Stat label="Words" value={stats ? `${total}` : '–'} />
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--muted)]">Mastery</div>
          <MasteryBar stats={stats} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Flashcards">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Flashcards</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Spaced repetition: words come back just before you'd forget them.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">New cards per day</span>
            <input
              type="number"
              min={0}
              max={200}
              value={settings.newCardsPerDay}
              onChange={(e) => update({ newCardsPerDay: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })}
              className="w-16 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-center"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DeckButton
            to={`/study/flashcards?language=${language}&direction=recognition`}
            title={`${lang.name} → ${getLanguage(settings.nativeLanguage).name}`}
            subtitle="See the word in its sentence, recall the meaning"
            queue={queue}
            testId="deck-recognition"
          />
          <DeckButton
            to={`/study/flashcards?language=${language}&direction=production`}
            title={`${getLanguage(settings.nativeLanguage).name} → ${lang.name}`}
            subtitle="See the meaning, produce the word"
            queue={reverseQueue}
            testId="deck-production"
          />
        </div>
        {cardsToday(queue) === 0 && cardsToday(reverseQueue) === 0 && queue && translated && (
          <p className="mt-3 text-sm text-[var(--muted)]">All caught up for now. Play a game below, or read something new.</p>
        )}
      </section>

      <section className="mt-6" aria-label="Games">
        <h2 className="text-xl font-semibold">Games</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Short rounds that favour the words you find hardest.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.filter((g) => g.available(lang)).map((g) => (
            <Link
              key={g.id}
              to={`/study/${g.id}?language=${language}`}
              className="group rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
              data-testid={`game-${g.id}`}
            >
              <div className="text-2xl" aria-hidden="true">
                {g.icon}
              </div>
              <div className="mt-2 font-medium group-hover:text-[var(--accent)]">{g.name}</div>
              <div className="mt-0.5 text-sm text-[var(--muted)]">{g.description}</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value} {hint && <span aria-hidden="true">{hint}</span>}
      </div>
    </div>
  );
}

function MasteryBar({ stats }: { stats: StudyStats | null }) {
  if (!stats || stats.total === 0) return <div className="mt-2 text-sm text-[var(--muted)]">–</div>;
  const parts = [
    { k: 'known', n: stats.byStatus.known, cls: 'bg-emerald-500' },
    { k: 'learning', n: stats.byStatus.learning, cls: 'bg-amber-400' },
    { k: 'new', n: stats.byStatus.new, cls: 'bg-sky-400' },
  ] as const;
  return (
    <div className="mt-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--hover)]" role="img" aria-label={`${stats.byStatus.known} known, ${stats.byStatus.learning} learning, ${stats.byStatus.new} new`}>
        {parts.map((p) => p.n > 0 && <div key={p.k} className={p.cls} style={{ width: `${(p.n / stats.total) * 100}%` }} />)}
      </div>
      <div className="mt-1.5 text-xs text-[var(--muted)]">
        {stats.byStatus.known} known · {stats.byStatus.learning} learning · {stats.byStatus.new} new
      </div>
    </div>
  );
}

function DeckButton({ to, title, subtitle, queue, testId }: { to: string; title: string; subtitle: string; queue: StudyQueue | null; testId: string }) {
  const due = queue ? queue.due : 0;
  const fresh = queue ? queue.cards.filter((c) => c.isNew).length : 0;
  const empty = queue !== null && due + fresh === 0;
  return (
    <Link
      to={to}
      aria-disabled={empty}
      onClick={(e) => empty && e.preventDefault()}
      className={`block rounded-xl border p-4 transition ${empty ? 'cursor-default border-[var(--line)] opacity-60' : 'border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--hover)]'}`}
      data-testid={testId}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</div>
      <div className="mt-3 flex gap-3 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{due}</span> <span className="text-[var(--muted)]">due</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{fresh}</span> <span className="text-[var(--muted)]">new</span>
        </span>
      </div>
    </Link>
  );
}
