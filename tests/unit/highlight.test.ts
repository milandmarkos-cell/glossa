import { describe, expect, it } from 'vitest';
import { buildHighlightCss } from '../../src/client/reader/highlight.ts';

describe('buildHighlightCss', () => {
  it('emits one rule for marked and one for saved keys, scoped', () => {
    const css = buildHighlightCss('.rdr-1', [3, 7], [7, 9]);
    expect(css).toContain('.rdr-1 [data-k="3"],.rdr-1 [data-k="7"]{background:');
    expect(css).toContain('.rdr-1 [data-k="7"],.rdr-1 [data-k="9"]{text-decoration:');
  });
  it('is empty when nothing is marked or saved', () => {
    expect(buildHighlightCss('.x', [], [])).toBe('');
  });
  it('scales with marked keys, not text length', () => {
    const ids = Array.from({ length: 500 }, (_, i) => i);
    const t0 = performance.now();
    buildHighlightCss('.x', ids, ids);
    expect(performance.now() - t0).toBeLessThan(20);
  });
});
