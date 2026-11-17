/**
 * Highlight-all-occurrences without re-rendering: every word span carries data-k (its interned key id),
 * and marking just rewrites one <style> element with a selector per marked key. Cost is O(#marked keys),
 * independent of text length, so a click stays far below 100 ms even on very long texts.
 */
export function buildHighlightCss(scope: string, marked: Iterable<number>, saved: Iterable<number>): string {
  const sel = (ids: Iterable<number>) => Array.from(ids, (k) => `${scope} [data-k="${k}"]`).join(',');
  let css = '';
  const m = sel(marked);
  if (m) css += `${m}{background:var(--mark-bg);box-shadow:0 0 0 1px var(--mark-ring);}`;
  const s = sel(saved);
  if (s) css += `${s}{text-decoration:underline dotted var(--saved);text-decoration-thickness:2px;text-underline-offset:0.28em;}`;
  return css;
}

let counter = 0;
export const nextScopeClass = () => `rdr-${++counter}`;

export class HighlightSheet {
  private el: HTMLStyleElement;

  constructor(private scopeClass: string) {
    this.el = document.createElement('style');
    this.el.dataset.glossa = 'highlight';
    document.head.appendChild(this.el);
  }

  render(marked: Iterable<number>, saved: Iterable<number>): void {
    this.el.textContent = buildHighlightCss(`.${this.scopeClass}`, marked, saved);
  }

  destroy(): void {
    this.el.remove();
  }
}
