import type { TextSummary } from '../../shared/types.ts';

/** Source + license line shown on every text (cards and reader). */
export function Attribution({ text, className = '' }: { text: TextSummary; className?: string }) {
  return (
    <p className={`text-xs text-[var(--muted)] ${className}`} data-testid="attribution">
      <span>Source: </span>
      {text.url ? (
        <a href={text.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text)]">
          {text.sourceName}
        </a>
      ) : (
        <span>{text.sourceName}</span>
      )}
      {text.author && text.author !== text.sourceName && <span> · {text.author}</span>}
      <span> · License: {text.license}</span>
    </p>
  );
}
