import type { BatchTranslateFn } from './claude.ts';

/**
 * Deterministic stand-in for Claude, enabled with GLOSSA_FAKE_AI=1. Used by the e2e tests and for
 * trying the AI-backed UI without an API key. Never enabled by default.
 */
export const fakeBatchTranslate: BatchTranslateFn = async ({ items }) => {
  await new Promise((r) => setTimeout(r, 150)); // feel like a network call
  return {
    items: items.map((it, index) => ({
      index,
      translation: `‹${it.surface.toLowerCase()}›`,
      pos: 'other' as const,
      lemma: it.surface.toLowerCase(),
    })),
  };
};
