import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getLanguage } from '../../shared/languages.ts';
import { speak, ttsSupported } from '../lib/tts.ts';

interface Props {
  anchor: HTMLElement;
  container: HTMLElement;
  language: string;
  surface: string;
  sentence: string;
  occurrences: number;
  marked: boolean;
  saved: boolean;
  /** Translation details slot (filled lazily by the parent once available). */
  details?: ReactNode;
  onToggle: () => void;
  onClose: () => void;
}

const WIDTH = 300;

/**
 * Anchored card on wide screens; bottom sheet on phones (thumb-reachable, never covers the word's line).
 */
export function WordPopover({ anchor, container, language, surface, sentence, occurrences, marked, saved, details, onToggle, onClose }: Props) {
  const lang = getLanguage(language);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 639px)').matches);

  useLayoutEffect(() => {
    const place = () => {
      setNarrow(window.matchMedia('(max-width: 639px)').matches);
      const a = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 160;
      const below = a.bottom + 8 + h < window.innerHeight;
      const top = below ? a.bottom - c.top + 8 : a.top - c.top - h - 8;
      const left = Math.min(Math.max(a.left - c.left + a.width / 2 - WIDTH / 2, 0), Math.max(0, c.width - WIDTH));
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor, container]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const style = narrow ? undefined : { top: pos?.top ?? 0, left: pos?.left ?? 0, width: WIDTH, visibility: pos ? undefined : ('hidden' as const) };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Word: ${surface}`}
      data-testid="word-popover"
      style={style}
      className={
        narrow
          ? 'fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-[var(--line)] bg-[var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)]'
          : 'absolute z-40 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-lg'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div lang={lang.locale} dir={lang.dir} className="font-[family-name:var(--font-reading)] text-2xl leading-tight break-words">
          {surface}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ttsSupported() && (
            <button
              type="button"
              onClick={() => speak(surface, lang.ttsLang)}
              className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
              aria-label="Play pronunciation"
              title="Play pronunciation"
            >
              <SpeakerIcon />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      <div className="mt-2 min-h-[1.5rem] text-[15px]">{details ?? <span className="text-[var(--muted)]">Translation is added when you finish reading.</span>}</div>

      <p lang={lang.locale} dir={lang.dir} className="mt-3 line-clamp-3 text-sm text-[var(--muted)] italic">
        {sentence}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-[var(--muted)]">
          {occurrences > 1 ? `${occurrences}× in this text` : 'Once in this text'}
          {saved && ' · in your library'}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={
            marked
              ? 'rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-[var(--hover)]'
              : 'rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:opacity-90'
          }
        >
          {marked ? 'Unmark' : 'Mark'}
        </button>
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 8v4h3l4 3.5v-11L6 8H3z" fill="currentColor" />
      <path d="M13 7.5a3.5 3.5 0 010 5M15 5a7 7 0 010 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
