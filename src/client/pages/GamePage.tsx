import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { checkAnswer, hint, scramble, shuffle, type AnswerResult } from '../../shared/answer.ts';
import { getLanguage } from '../../shared/languages.ts';
import type { Grade } from '../../shared/srs.ts';
import type { Word } from '../../shared/types.ts';
import { useSettings } from '../lib/settings.tsx';
import { speak, ttsSupported } from '../lib/tts.ts';
import { displayText } from '../study/display.ts';
import { GAMES, type GameInfo } from '../study/games.ts';
import { GameResults, GameShell, MIN_WORDS, NotEnoughWords, formatSeconds, record, useGameWords, useKey, useTimer, type GameResult } from '../study/GameShell.tsx';

export function GamePage() {
  const id = useParams().game;
  const [params] = useSearchParams();
  const language = params.get('language') ?? 'es';
  const game = GAMES.find((g) => g.id === id);
  if (!game || !game.available(getLanguage(language))) {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center text-[var(--muted)]">This game isn't available for {getLanguage(language).name}.</main>;
  }
  return <Game key={`${game.id}-${language}`} game={game} language={language} />;
}

const ROUND_SIZE: Record<GameInfo['id'], number> = { match: 6, choice: 10, cloze: 8, spelling: 8, scramble: 8 };

function Game({ game, language }: { game: GameInfo; language: string }) {
  const { words, error, again } = useGameWords(language, ROUND_SIZE[game.id] + 6); // extra words feed distractors
  const [result, setResult] = useState<GameResult | null>(null);
  const [progress, setProgress] = useState('');
  const playAgain = () => {
    setResult(null);
    again();
  };

  let body;
  if (error) body = <p className="m-auto text-[var(--muted)]">{error}</p>;
  else if (!words) body = <p className="m-auto text-[var(--muted)]">Loading…</p>;
  else if (words.length < MIN_WORDS) body = <NotEnoughWords language={language} have={words.length} />;
  else if (result) body = <GameResults result={result} language={language} onAgain={playAgain} />;
  else {
    const props = { words, language, onDone: setResult, setProgress, game };
    body =
      game.id === 'match' ? <MatchGame {...props} /> :
      game.id === 'choice' ? <ChoiceGame {...props} /> :
      game.id === 'scramble' ? <ScrambleGame {...props} /> :
      <TypeGame {...props} />;
  }
  return (
    <GameShell game={game} language={language} progress={result ? '' : progress}>
      {body}
    </GameShell>
  );
}

interface GameProps {
  words: Word[];
  language: string;
  game: GameInfo;
  onDone: (r: GameResult) => void;
  setProgress: (s: string) => void;
}

function useShow(language: string) {
  const { settings } = useSettings();
  return (t: string) => displayText(t, language, settings.reader);
}

// ---------------------------------------------------------------- Match pairs

function MatchGame({ words, language, game, onDone, setProgress }: GameProps) {
  const show = useShow(language);
  const lang = getLanguage(language);
  const pairs = useMemo(() => words.slice(0, ROUND_SIZE.match), [words]);
  const left = useMemo(() => shuffle(pairs), [pairs]);
  const right = useMemo(() => shuffle(pairs), [pairs]);
  const [selLeft, setSelLeft] = useState<number | null>(null);
  const [selRight, setSelRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number[]>([]);
  const mistakes = useRef(new Map<number, number>());
  const finished = matched.size === pairs.length;
  const seconds = useTimer(!finished);

  useEffect(() => setProgress(`${matched.size}/${pairs.length} · ${formatSeconds(seconds)}`), [matched.size, pairs.length, seconds, setProgress]);

  useEffect(() => {
    if (selLeft === null || selRight === null) return;
    if (selLeft === selRight) {
      setMatched((m) => new Set(m).add(selLeft));
    } else {
      mistakes.current.set(selLeft, (mistakes.current.get(selLeft) ?? 0) + 1);
      setWrong([selLeft, selRight]);
      setTimeout(() => setWrong([]), 450);
    }
    setSelLeft(null);
    setSelRight(null);
  }, [selLeft, selRight]);

  useEffect(() => {
    if (!finished) return;
    const missed = pairs.filter((w) => mistakes.current.has(w.id));
    for (const w of pairs) record(w, mistakes.current.has(w.id) ? 1 : 3, game.id);
    onDone({ correct: pairs.length - missed.length, total: pairs.length, missed, seconds });
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = (id: number, selected: boolean) => {
    const done = matched.has(id);
    const bad = wrong.includes(id);
    return `w-full rounded-xl border px-3 py-3 text-left transition ${
      done ? 'border-emerald-300 bg-emerald-50 text-emerald-900 opacity-50 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' :
      bad ? 'border-red-400 bg-red-50 dark:bg-red-950' :
      selected ? 'border-[var(--accent)] bg-[var(--hover)]' : 'border-[var(--line)] hover:bg-[var(--hover)]'
    }`;
  };

  return (
    <div>
      <p className="mb-4 text-center text-sm text-[var(--muted)]">Tap a word, then its meaning.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {left.map((w) => (
            <button key={w.id} type="button" disabled={matched.has(w.id)} className={tile(w.id, selLeft === w.id)} onClick={() => setSelLeft(w.id)} data-testid="match-word" data-id={w.id}>
              <span lang={lang.locale} className="font-[family-name:var(--font-reading)] text-lg">
                {show(w.surface)}
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {right.map((w) => (
            <button key={w.id} type="button" disabled={matched.has(w.id)} className={tile(w.id, selRight === w.id)} onClick={() => setSelRight(w.id)} data-testid="match-meaning" data-id={w.id}>
              {w.translation}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Multiple choice

interface ChoiceQuestion {
  word: Word;
  kind: 'meaning' | 'fill';
  options: { label: string; correct: boolean }[];
}

const fillable = (w: Word) => {
  const c = w.contexts[0];
  return !!c && !!c.form && c.sentence.slice(c.offset, c.offset + c.form.length) === c.form;
};

function buildChoice(words: Word[]): ChoiceQuestion[] {
  const n = Math.min(ROUND_SIZE.choice, words.length);
  return words.slice(0, n).map((w, i) => {
    const others = shuffle(words.filter((o) => o.id !== w.id));
    const kind: ChoiceQuestion['kind'] = i % 2 === 1 && fillable(w) ? 'fill' : 'meaning';
    const answer = kind === 'meaning' ? w.translation! : w.contexts[0].form!;
    const distractors: string[] = [];
    for (const o of others) {
      const label = kind === 'meaning' ? o.translation! : (fillable(o) ? o.contexts[0].form! : o.surface);
      if (label && label.toLowerCase() !== answer.toLowerCase() && !distractors.includes(label)) distractors.push(label);
      if (distractors.length === 3) break;
    }
    return { word: w, kind, options: shuffle([{ label: answer, correct: true }, ...distractors.map((label) => ({ label, correct: false }))]) };
  });
}

function ChoiceGame({ words, language, game, onDone, setProgress }: GameProps) {
  const show = useShow(language);
  const lang = getLanguage(language);
  const questions = useMemo(() => buildChoice(words), [words]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const missed = useRef<Word[]>([]);
  const q = questions[i];

  useEffect(() => setProgress(`${i + 1}/${questions.length}`), [i, questions.length, setProgress]);

  const next = () => {
    if (i + 1 >= questions.length) onDone({ correct: questions.length - missed.current.length, total: questions.length, missed: missed.current });
    else {
      setI(i + 1);
      setPicked(null);
    }
  };
  const pick = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    const ok = q.options[k].correct;
    if (!ok) missed.current.push(q.word);
    record(q.word, ok ? 3 : 1, game.id);
    if (ok) setTimeout(next, 700);
  };
  useKey((e) => {
    if (['1', '2', '3', '4'].includes(e.key)) pick(Number(e.key) - 1);
    else if (e.key === 'Enter' && picked !== null && !q.options[picked].correct) next();
  });

  const ctx = q.word.contexts[0];
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {q.kind === 'meaning' ? (
          <>
            <div className="text-sm text-[var(--muted)]">What does this mean?</div>
            <div lang={lang.locale} className="mt-2 font-[family-name:var(--font-reading)] text-4xl font-semibold" data-testid="choice-prompt">
              {show(q.word.surface)}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-[var(--muted)]">Which word fits? <span className="italic">({q.word.translation})</span></div>
            <p lang={lang.locale} dir={lang.dir} className="mt-3 max-w-lg font-[family-name:var(--font-reading)] text-xl" data-testid="choice-prompt">
              {show(ctx.sentence.slice(0, ctx.offset))}
              <span className="inline-block min-w-[3em] border-b-2 border-[var(--text)]">&nbsp;</span>
              {show(ctx.sentence.slice(ctx.offset + ctx.form!.length))}
            </p>
          </>
        )}
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {q.options.map((o, k) => {
          const state = picked === null ? '' : o.correct ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950' : picked === k ? 'border-red-400 bg-red-50 dark:bg-red-950' : 'opacity-60';
          return (
            <button key={k} type="button" onClick={() => pick(k)} className={`rounded-xl border border-[var(--line)] px-4 py-3 text-left hover:bg-[var(--hover)] ${state}`} data-testid="choice-option" data-correct={o.correct}>
              <span className="mr-2 text-xs text-[var(--muted)]">{k + 1}</span>
              <span lang={q.kind === 'fill' ? lang.locale : undefined}>{q.kind === 'fill' ? show(o.label) : o.label}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && !q.options[picked].correct && (
        <button type="button" onClick={next} className="mt-4 rounded-xl bg-[var(--accent)] py-3 font-medium text-white" autoFocus>
          Next <span className="text-sm opacity-75">(Enter)</span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Cloze + Spelling (typing games)

function TypeGame({ words, language, game, onDone, setProgress }: GameProps) {
  const show = useShow(language);
  const lang = getLanguage(language);
  const cloze = game.id === 'cloze';
  const items = useMemo(() => (cloze ? words.filter(fillable) : words).slice(0, ROUND_SIZE[game.id]), [words, cloze, game.id]);
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [hints, setHints] = useState(0);
  const [verdict, setVerdict] = useState<AnswerResult | 'gave-up' | null>(null);
  const missed = useRef<Word[]>([]);
  const correct = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const w = items[i];
  const answer = w ? (cloze ? w.contexts[0].form! : w.surface) : '';
  const audio = !cloze && ttsSupported();

  useEffect(() => setProgress(`${i + 1}/${items.length}`), [i, items.length, setProgress]);
  useEffect(() => {
    if (audio && w) speak(w.surface, lang.ttsLang);
    input.current?.focus();
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length < MIN_WORDS) return <NotEnoughWords language={language} have={items.length} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (verdict) return next();
    const r = checkAnswer(value, answer, language);
    if (r === 'wrong') {
      // Wrong answer: let them try again once a hint is shown; record as a miss.
      setVerdict('wrong');
      missed.current.push(w);
      record(w, 1, game.id);
      return;
    }
    setVerdict(r);
    correct.current++;
    record(w, (hints > 0 ? 2 : 3) as Grade, game.id);
  };
  const giveUp = () => {
    setVerdict('gave-up');
    setValue(answer);
    missed.current.push(w);
    record(w, 1, game.id);
  };
  const next = () => {
    if (i + 1 >= items.length) return onDone({ correct: correct.current, total: items.length, missed: missed.current });
    setI(i + 1);
    setValue('');
    setHints(0);
    setVerdict(null);
  };

  const ctx = w.contexts[0];
  const feedback =
    verdict === 'exact' ? <span className="text-emerald-700 dark:text-emerald-300">Correct!</span> :
    verdict === 'accents' ? <span className="text-emerald-700 dark:text-emerald-300">Correct. Watch the accents: <b lang={lang.locale}>{show(answer)}</b></span> :
    verdict === 'wrong' || verdict === 'gave-up' ? <span className="text-red-700 dark:text-red-300">The answer is <b lang={lang.locale}>{show(answer)}</b></span> : null;

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {cloze ? (
          <>
            <div className="text-sm text-[var(--muted)]">Fill the gap: <span className="italic">{w.translation}</span></div>
            <p lang={lang.locale} dir={lang.dir} className="mt-3 max-w-lg font-[family-name:var(--font-reading)] text-xl leading-relaxed" data-testid="type-prompt">
              {show(ctx.sentence.slice(0, ctx.offset))}
              <span className="inline-block min-w-[3em] border-b-2 border-[var(--text)] px-1 text-[var(--accent)]">{verdict ? show(answer) : hints ? hint(show(answer), hints, language) : ' '}</span>
              {show(ctx.sentence.slice(ctx.offset + ctx.form!.length))}
            </p>
          </>
        ) : (
          <>
            <div className="text-sm text-[var(--muted)]">{audio ? 'Listen and type the word' : 'Type the word that means'}</div>
            {audio && (
              <button type="button" onClick={() => speak(w.surface, lang.ttsLang)} className="mt-3 rounded-full border border-[var(--line)] px-5 py-3 text-2xl hover:bg-[var(--hover)]" aria-label="Play the word again">
                🔊
              </button>
            )}
            <div className="mt-3 text-2xl font-medium" data-testid="type-prompt">
              {w.translation}
            </div>
            {hints > 0 && !verdict && <div lang={lang.locale} className="mt-2 font-mono text-lg tracking-widest">{hint(show(answer), hints, language)}</div>}
          </>
        )}
      </div>
      <div className="mt-6">
        <input
          ref={input}
          lang={lang.locale}
          dir={lang.dir}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (verdict === 'wrong') setVerdict(null);
          }}
          readOnly={verdict !== null && verdict !== 'wrong'}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type your answer"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-center font-[family-name:var(--font-reading)] text-xl"
          aria-label="Your answer"
          data-testid="type-input"
        />
        <div className="mt-2 min-h-[1.5rem] text-center text-sm" aria-live="polite" data-testid="type-feedback">
          {feedback}
        </div>
        <div className="mt-3 flex gap-2">
          {verdict === null || verdict === 'wrong' ? (
            <>
              <button type="button" onClick={() => setHints((h) => h + 1)} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm hover:bg-[var(--hover)]">
                Hint
              </button>
              <button type="button" onClick={giveUp} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm hover:bg-[var(--hover)]">
                Show answer
              </button>
              <button className="flex-1 rounded-xl bg-[var(--accent)] py-3 font-medium text-white">Check</button>
            </>
          ) : (
            <button className="flex-1 rounded-xl bg-[var(--accent)] py-3 font-medium text-white" autoFocus>
              Next <span className="text-sm opacity-75">(Enter)</span>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Letter scramble

function ScrambleGame({ words, language, game, onDone, setProgress }: GameProps) {
  const show = useShow(language);
  const lang = getLanguage(language);
  const items = useMemo(
    () => words.filter((w) => { const n = [...show(w.surface)].length; return n >= 3 && n <= 14; }).slice(0, ROUND_SIZE.scramble),
    [words], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [i, setI] = useState(0);
  const target = items[i] ? show(items[i].surface) : '';
  const tiles = useMemo(() => (target ? scramble(target, language) : []), [target, language]);
  const [used, setUsed] = useState<number[]>([]);
  const [state, setState] = useState<'playing' | 'wrong' | 'right' | 'gave-up'>('playing');
  const missed = useRef<Word[]>([]);
  const correct = useRef(0);
  const mistakes = useRef(0);

  useEffect(() => setProgress(`${i + 1}/${items.length}`), [i, items.length, setProgress]);

  const built = used.map((k) => tiles[k]).join('');
  useEffect(() => {
    if (state !== 'playing' || used.length !== tiles.length || tiles.length === 0) return;
    if (checkAnswer(built, target, language) !== 'wrong') {
      setState('right');
      correct.current++;
      record(items[i], mistakes.current ? 2 : 3, game.id);
    } else {
      setState('wrong');
      mistakes.current++;
      setTimeout(() => {
        setUsed([]);
        setState('playing');
      }, 700);
    }
  }, [used]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length < MIN_WORDS) return <NotEnoughWords language={language} have={items.length} />;

  const next = () => {
    if (i + 1 >= items.length) return onDone({ correct: correct.current, total: items.length, missed: missed.current });
    setI(i + 1);
    setUsed([]);
    setState('playing');
    mistakes.current = 0;
  };
  const giveUp = () => {
    setState('gave-up');
    missed.current.push(items[i]);
    record(items[i], 1, game.id);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-sm text-[var(--muted)]">Unscramble the word for</div>
        <div className="mt-2 text-2xl font-medium" data-testid="scramble-clue">
          {items[i].translation}
        </div>
        <div
          lang={lang.locale}
          className={`mt-6 flex min-h-[3.5rem] min-w-[60%] items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 font-[family-name:var(--font-reading)] text-3xl ${
            state === 'wrong' ? 'border-red-400' : state === 'right' ? 'border-emerald-400' : 'border-[var(--line)]'
          }`}
          data-testid="scramble-answer"
        >
          {state === 'gave-up' ? target : used.map((k, j) => (
            <button key={j} type="button" className="rounded px-0.5 hover:bg-[var(--hover)]" onClick={() => state === 'playing' && setUsed(used.filter((_, x) => x !== j))} aria-label={`Remove ${tiles[k]}`}>
              {tiles[k]}
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2" lang={lang.locale}>
          {tiles.map((t, k) => (
            <button
              key={k}
              type="button"
              disabled={used.includes(k) || state !== 'playing'}
              onClick={() => setUsed([...used, k])}
              className="h-12 w-12 rounded-xl border border-[var(--line)] bg-[var(--bg)] font-[family-name:var(--font-reading)] text-2xl shadow-sm transition hover:bg-[var(--hover)] disabled:opacity-25"
              data-testid="scramble-tile"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        {state === 'right' || state === 'gave-up' ? (
          <button type="button" onClick={next} className="flex-1 rounded-xl bg-[var(--accent)] py-3 font-medium text-white" autoFocus>
            {state === 'right' ? 'Correct! Next' : 'Next'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setUsed([])} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm hover:bg-[var(--hover)]">
              Clear
            </button>
            <button type="button" onClick={giveUp} className="flex-1 rounded-xl border border-[var(--line)] py-3 text-sm hover:bg-[var(--hover)]">
              Show answer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
