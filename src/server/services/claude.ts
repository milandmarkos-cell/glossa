import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { DB } from '../db.ts';
import { getLanguage } from '../../shared/languages.ts';
import { normalizeKey } from '../../shared/normalize.ts';
import type { TranslateItem, TranslateResponse, WordInfo } from '../../shared/types.ts';

export const POS_VALUES = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
  'particle', 'determiner', 'numeral', 'interjection', 'phrase', 'other',
] as const;

const TranslationSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      translation: z.string(),
      pos: z.enum(POS_VALUES),
      lemma: z.string(),
    }),
  ),
});
type TranslationOutput = z.infer<typeof TranslationSchema>;

/** One model call for a batch of words. Swappable in tests. */
export type BatchTranslateFn = (args: { language: string; native: string; items: TranslateItem[] }) => Promise<TranslationOutput>;

export class AiError extends Error {}

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function claudeBatchTranslate(client: Anthropic, model: string): BatchTranslateFn {
  return async ({ language, native, items }) => {
    const src = getLanguage(language);
    const dst = getLanguage(native);
    const list = items.map((it, i) => `${i}. word: ${JSON.stringify(it.surface)}\n   sentence: ${JSON.stringify(it.sentence)}`).join('\n');
    const prompt = `You are a bilingual dictionary for language learners reading ${src.name} texts.
For each numbered item, give:
- translation: the meaning of the word *as used in its sentence*, in ${dst.name}. Keep it short (1-4 words), like a dictionary gloss. For verbs, translate the inflected form naturally (e.g. "she buys"), not a bare infinitive, unless it is an infinitive.
- pos: its part of speech in that sentence.
- lemma: its dictionary form in ${src.name}, in the same script as the word.
Return one entry per item, with the item's index.

${list}`;
    const useFallbacks = FALLBACK_MODELS.has(model);
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(TranslationSchema) },
      messages: [{ role: 'user', content: prompt }],
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (res.stop_reason === 'refusal') throw new AiError('Claude declined to translate these words.');
    if (!res.parsed_output) throw new AiError('Claude returned an unexpected response.');
    return res.parsed_output;
  };
}

/** Human-readable reason for an SDK error (SDK already retried 429/5xx/connection errors). */
export function describeAiError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key cannot use the configured model. Check CLAUDE_MODEL.';
  if (e instanceof Anthropic.NotFoundError) return 'The configured Claude model was not found. Check CLAUDE_MODEL.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude is rate-limited right now. Try again in a minute.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API.';
  if (e instanceof Anthropic.APIError) return `Claude API error (${e.status ?? 'unknown'}).`;
  return 'Translation failed.';
}

const BATCH = 60;
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface Translator {
  enabled: boolean;
  translate(language: string, native: string, items: TranslateItem[]): Promise<TranslateResponse>;
}

/**
 * Batched, cached translation. Cache key: (language, native, normalized word, sentence).
 * Misses go to the model in batches of up to 60 words per request.
 */
export function createTranslator(db: DB, batchFn: BatchTranslateFn | null): Translator {
  const getCached = db.prepare(`SELECT json FROM translation_cache WHERE kind = 'word' AND language = ? AND target = ? AND input_hash = ?`);
  const putCached = db.prepare(
    `INSERT OR REPLACE INTO translation_cache (kind, language, target, input_hash, json) VALUES ('word', ?, ?, ?, ?)`,
  );
  const inflight = new Map<string, Promise<TranslateResponse>>();

  return {
    enabled: batchFn !== null,
    async translate(language, native, items) {
      const results: (WordInfo | null)[] = new Array(items.length).fill(null);
      const hashes = items.map((it) => hash(`${normalizeKey(it.surface, language)}\u0000${it.sentence.trim()}`));
      const missing: number[] = [];
      items.forEach((_, i) => {
        const row = getCached.get(language, native, hashes[i]) as { json: string } | undefined;
        if (row) results[i] = JSON.parse(row.json);
        else missing.push(i);
      });
      if (missing.length === 0) return { ok: true, results: results as WordInfo[] };
      if (!batchFn) return { ok: false, reason: 'AI features are off: the server has no ANTHROPIC_API_KEY.', aiDisabled: true };

      // Identical concurrent requests (e.g. popover + prefetch) share one model call.
      const flightKey = `${language}|${native}|${missing.map((i) => hashes[i]).join(',')}`;
      const existing = inflight.get(flightKey);
      if (existing) return existing;
      const run = (async (): Promise<TranslateResponse> => {
        try {
          for (let b = 0; b < missing.length; b += BATCH) {
            const idx = missing.slice(b, b + BATCH);
            const out = await batchFn({ language, native, items: idx.map((i) => items[i]) });
            for (const item of out.items) {
              const target = idx[item.index];
              if (target === undefined) continue;
              const info: WordInfo = { translation: item.translation.trim(), pos: item.pos, lemma: item.lemma.trim() };
              results[target] = info;
              putCached.run(language, native, hashes[target], JSON.stringify(info));
            }
          }
          if (results.some((r) => r === null)) return { ok: false, reason: 'Some words came back without a translation. Try again.' };
          return { ok: true, results: results as WordInfo[] };
        } catch (e) {
          console.warn('[translate]', e instanceof Error ? e.message : e);
          return { ok: false, reason: describeAiError(e) };
        } finally {
          inflight.delete(flightKey);
        }
      })();
      inflight.set(flightKey, run);
      return run;
    },
  };
}
