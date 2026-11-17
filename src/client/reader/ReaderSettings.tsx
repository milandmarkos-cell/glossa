import { useEffect, useRef, useState } from 'react';
import { getLanguage } from '../../shared/languages.ts';
import { useSettings } from '../lib/settings.tsx';

/** "Aa" menu: font size, line height, theme, saved-word style, script toggle. */
export function ReaderSettings({ language }: { language: string }) {
  const { settings, update } = useSettings();
  const r = settings.reader;
  const lang = getLanguage(language);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const seg = (active: boolean) =>
    `flex-1 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-[var(--surface)] shadow-sm font-medium' : 'text-[var(--muted)] hover:text-[var(--text)]'}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-[family-name:var(--font-reading)] text-sm hover:bg-[var(--hover)]"
        title="Reader settings"
      >
        Aa
      </button>
      {open && (
        <div role="dialog" aria-label="Reader settings" className="absolute right-0 z-40 mt-2 w-72 space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-lg">
          <Row label="Text size">
            <Stepper value={r.fontSize} min={14} max={34} step={2} format={(v) => `${v}px`} onChange={(fontSize) => update({ reader: { fontSize } })} />
          </Row>
          <Row label="Line spacing">
            <Stepper value={r.lineHeight} min={1.4} max={2.4} step={0.2} format={(v) => v.toFixed(1)} onChange={(lineHeight) => update({ reader: { lineHeight: Math.round(lineHeight * 10) / 10 } })} />
          </Row>
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">Theme</div>
            <div className="flex gap-1 rounded-lg bg-[var(--hover)] p-1">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button key={t} type="button" className={seg(r.theme === t)} onClick={() => update({ reader: { theme: t } })} aria-pressed={r.theme === t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {lang.scripts && (
            <div>
              <div className="mb-1.5 text-xs text-[var(--muted)]">Script</div>
              <div className="flex gap-1 rounded-lg bg-[var(--hover)] p-1">
                {(
                  [
                    ['original', 'Original'],
                    ['cyrl', 'Ћирилица'],
                    ['latn', 'Latinica'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" className={seg(r.script === v)} onClick={() => update({ reader: { script: v } })} aria-pressed={r.script === v}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Underline words already in my library</span>
            <input type="checkbox" checked={r.showSaved} onChange={(e) => update({ reader: { showSaved: e.target.checked } })} className="h-4 w-4 accent-[var(--accent)]" />
          </label>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function Stepper({ value, min, max, step, format, onChange }: { value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const btn = 'h-8 w-8 rounded-md border border-[var(--line)] hover:bg-[var(--hover)] disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
        −
      </button>
      <span className="w-12 text-center text-sm tabular-nums">{format(value)}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
        +
      </button>
    </div>
  );
}
