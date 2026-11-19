import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { getLanguage } from '../../shared/languages.ts';
import { contextFor, tokenize, type TokenizedText } from '../../shared/tokenize.ts';
import { toScript, type DisplayScript } from '../../shared/script.ts';
import type { ReaderPrefs } from '../../shared/types.ts';
import { HighlightSheet, nextScopeClass } from './highlight.ts';
import { WordPopover } from './WordPopover.tsx';
import { lemmaKeyFn, lookupGloss, type Glossary } from '../../shared/gloss.ts';

export interface MarkedWord {
  /** Match key (the dictionary form's key when the word is in the dictionary). */
  key: string;
  /** What gets saved: the dictionary form when known, else a lowercase occurrence when one exists. */
  surface: string;
  /** Translation of the dictionary form (or of the clicked form), null when not in the dictionary. */
  translation: string | null;
  pos: string | null;
  /** Exact text of the clicked occurrence, as it appears in `sentence`. */
  form: string;
  tokenIndex: number;
  sentence: string;
  offset: number;
}

interface Props {
  textId: number;
  language: string;
  body: string;
  glossary: Glossary;
  prefs: ReaderPrefs;
  /** Normalized keys already in the library (subtle "saved" style). */
  savedKeys: ReadonlySet<string>;
  /** Keys to restore as marked on load. */
  initialMarked?: readonly string[];
  onMarkedChange?: (words: MarkedWord[]) => void;
}

/** Prefer a lowercase occurrence as the display form, so sentence-initial capitals don't leak into the library. */
function bestSurface(tk: TokenizedText, occ: number[], clicked: number): string {
  const lower = occ.map((i) => tk.tokens[i].text).find((t) => t === t.toLocaleLowerCase(tk.language));
  return lower ?? tk.tokens[clicked].text;
}

export function ReaderView({ textId, language, body, glossary, prefs, savedKeys, initialMarked, onMarkedChange }: Props) {
  const lang = getLanguage(language);
  const tk = useMemo(() => tokenize(body, language, { keyFor: lemmaKeyFn(glossary, language) }), [body, language, glossary]);
  const keyIndex = useMemo(() => new Map(tk.keys.map((k, i) => [k, i])), [tk]);
  const { occ, words, ordinal } = useMemo(() => {
    const occ = new Map<number, number[]>();
    const words: number[] = [];
    const ordinal = new Int32Array(tk.tokens.length).fill(-1);
    for (const t of tk.tokens) {
      if (!t.word) continue;
      ordinal[t.i] = words.length;
      words.push(t.i);
      const list = occ.get(t.k);
      if (list) list.push(t.i);
      else occ.set(t.k, [t.i]);
    }
    return { occ, words, ordinal };
  }, [tk]);

  const [scope] = useState(nextScopeClass);
  const rootRef = useRef<HTMLDivElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HighlightSheet | null>(null);
  const spans = useRef<HTMLElement[]>([]);
  const marks = useRef(new Map<number, number>()); // key id → token index that was clicked
  const activeToken = useRef<number>(words[0] ?? -1);
  const [popover, setPopover] = useState<number | null>(null);
  const popoverRef = useRef<number | null>(null);
  popoverRef.current = popover;
  const [, setVersion] = useState(0);

  const savedIds = useMemo(() => {
    const ids: number[] = [];
    for (const key of savedKeys) {
      const k = keyIndex.get(key);
      if (k !== undefined) ids.push(k);
    }
    return ids;
  }, [savedKeys, keyIndex]);

  const repaint = useCallback(() => {
    sheetRef.current?.render(marks.current.keys(), prefs.showSaved ? savedIds : []);
  }, [savedIds, prefs.showSaved]);

  const emit = useCallback(() => {
    if (!onMarkedChange) return;
    const out: MarkedWord[] = [];
    for (const [k, i] of marks.current) {
      const ctx = contextFor(tk, tk.tokens[i]);
      const g = lookupGloss(glossary, tk.tokens[i].text, language);
      const info = g.lemmaEntry ?? g.entry;
      out.push({
        key: tk.keys[k],
        surface: g.lemma ?? bestSurface(tk, occ.get(k) ?? [i], i),
        translation: info?.translation ?? null,
        pos: info?.pos ?? null,
        form: tk.tokens[i].text,
        tokenIndex: i,
        ...ctx,
      });
    }
    onMarkedChange(out);
  }, [onMarkedChange, tk, occ, glossary, language]);

  const setPressed = (k: number, pressed: boolean) => {
    for (const i of occ.get(k) ?? []) spans.current[i]?.setAttribute('aria-pressed', String(pressed));
  };

  // Highlight stylesheet lifecycle (effect-created so StrictMode's double mount is safe).
  useEffect(() => {
    const sheet = new HighlightSheet(scope);
    sheetRef.current = sheet;
    return () => {
      sheet.destroy();
      sheetRef.current = null;
    };
  }, [scope]);

  // Index spans once per render of the passage, then restore marks.
  useLayoutEffect(() => {
    const arr: HTMLElement[] = [];
    passageRef.current?.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
      arr[Number(el.dataset.i)] = el;
    });
    spans.current = arr;
  });

  useEffect(() => {
    marks.current = new Map();
    for (const key of initialMarked ?? []) {
      const k = keyIndex.get(key);
      const first = k === undefined ? undefined : occ.get(k)?.[0];
      if (k !== undefined && first !== undefined) {
        marks.current.set(k, first);
        setPressed(k, true);
      }
    }
    setPopover(null);
    repaintRef.current();
    emitRef.current();
    setVersion((v) => v + 1);
    // Only on a new text; initialMarked is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tk, textId]);

  const repaintRef = useRef(repaint);
  repaintRef.current = repaint;
  const emitRef = useRef(emit);
  emitRef.current = emit;

  useEffect(() => repaint(), [repaint]);

  const focusToken = (i: number) => {
    const prev = spans.current[activeToken.current];
    if (prev) prev.tabIndex = -1;
    activeToken.current = i;
    const el = spans.current[i];
    if (el) {
      el.tabIndex = 0;
      el.focus({ preventScroll: false });
    }
  };

  const toggleMark = (k: number, i: number, on: boolean) => {
    if (on) marks.current.set(k, i);
    else marks.current.delete(k);
    setPressed(k, on);
    repaint(); // synchronous style update: highlight is visible on the next frame
    setVersion((v) => v + 1);
    emit();
  };

  /** Click semantics (PLAN §7.6): unmarked → mark + popover; same word with popover open → unmark; other marked occurrence → popover. */
  const activate = (i: number) => {
    const t = tk.tokens[i];
    if (!t?.word) return;
    if (!marks.current.has(t.k)) {
      toggleMark(t.k, i, true);
      setPopover(i);
    } else if (popoverRef.current === i) {
      toggleMark(t.k, i, false);
      setPopover(null);
    } else {
      setPopover(i);
    }
  };

  const onClick = (e: MouseEvent) => {
    // The 2nd click of a double-click would undo the 1st (mark → unmark): ignore it.
    if (e.detail > 1) return;
    // Finishing a text selection fires a click too; don't mark when the user selected text.
    if (!getSelection()?.isCollapsed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!el) {
      setPopover(null);
      return;
    }
    const i = Number(el.dataset.i);
    focusToken(i);
    activate(i);
  };

  // Keep the roving tabindex in sync with wherever focus actually lands (Tab, screen reader, programmatic).
  const onFocus = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!el) return;
    const i = Number(el.dataset.i);
    if (i === activeToken.current) return;
    const prev = spans.current[activeToken.current];
    if (prev) prev.tabIndex = -1;
    el.tabIndex = 0;
    activeToken.current = i;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const cur = activeToken.current;
    const ord = cur >= 0 ? ordinal[cur] : -1;
    const rtl = lang.dir === 'rtl';
    let next: number | undefined;
    switch (e.key) {
      case 'ArrowRight':
        next = words[ord + (rtl ? -1 : 1)];
        break;
      case 'ArrowLeft':
        next = words[ord + (rtl ? 1 : -1)];
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        const p = tk.tokens[cur]?.paragraph ?? 0;
        const target = tk.paragraphs[p + (e.key === 'ArrowDown' ? 1 : -1)];
        if (target) next = words.find((w) => w >= target.from && w < target.to);
        break;
      }
      case 'Home':
        next = words[0];
        break;
      case 'End':
        next = words[words.length - 1];
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (cur >= 0) activate(cur);
        return;
      case 'Escape':
        setPopover(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next !== undefined) {
      setPopover(null);
      focusToken(next);
    }
  };

  // Close the popover on outside click.
  useEffect(() => {
    if (popover === null) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [popover]);

  const popTok = popover !== null ? tk.tokens[popover] : null;
  const script: DisplayScript = lang.scripts ? prefs.script : 'original';
  const popGloss = popTok ? lookupGloss(glossary, popTok.text, language) : null;

  return (
    <div ref={rootRef} className="relative">
      <div
        ref={passageRef}
        lang={lang.locale}
        dir={lang.dir}
        className={`passage ${scope}`}
        style={{ fontSize: prefs.fontSize, lineHeight: prefs.lineHeight }}
        onClick={onClick}
        onMouseDown={(e) => e.detail > 1 && e.preventDefault() /* no word selection on double-click */}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        role="group"
        aria-label="Text. Use arrow keys to move between words, Enter to mark."
        data-testid="passage"
      >
        <Passage tk={tk} script={script} firstWord={words[0] ?? -1} />
      </div>
      {popTok && spans.current[popTok.i] && (
        <WordPopover
          key={popTok.i}
          anchor={spans.current[popTok.i]}
          container={rootRef.current!}
          language={language}
          surface={toScript(popTok.text, script)}
          sentence={toScript(contextFor(tk, popTok).sentence, script)}
          occurrences={occ.get(popTok.k)?.length ?? 1}
          marked={marks.current.has(popTok.k)}
          saved={savedKeys.has(tk.keys[popTok.k])}
          gloss={popGloss}
          script={script}
          onToggle={() => {
            const on = !marks.current.has(popTok.k);
            toggleMark(popTok.k, popTok.i, on);
            if (!on) setPopover(null);
          }}
          onClose={() => {
            setPopover(null);
            spans.current[popTok.i]?.focus();
          }}
        />
      )}
    </div>
  );
}

/** The token tree. Memoised: marking never re-renders it (highlighting is pure CSS). */
const Passage = memo(function Passage({ tk, script, firstWord }: { tk: TokenizedText; script: DisplayScript; firstWord: number }) {
  return (
    <>
      {tk.paragraphs.map((p) => {
        const children: ReactNode[] = [];
        let run = '';
        for (let i = p.from; i < p.to; i++) {
          const t = tk.tokens[i];
          const text = script === 'original' ? t.text : toScript(t.text, script);
          if (!t.word) {
            run += text;
            continue;
          }
          if (run) {
            children.push(run);
            run = '';
          }
          children.push(
            <span key={i} className="w" data-i={i} data-k={t.k} role="button" aria-pressed="false" tabIndex={i === firstWord ? 0 : -1}>
              {text}
            </span>,
          );
        }
        if (run) children.push(run);
        return (
          <p key={p.index} data-p={p.index} className="mb-[1.1em]">
            {children}
          </p>
        );
      })}
    </>
  );
});
