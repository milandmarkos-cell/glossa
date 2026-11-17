import { LANGUAGES } from '../../shared/languages.ts';

export function LanguageSelect({ value, onChange, label = 'Language', id }: { value: string; onChange: (code: string) => void; label?: string; id?: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name} — {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
