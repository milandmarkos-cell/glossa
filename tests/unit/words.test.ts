import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { openDb } from '../../src/server/db.ts';
import { seedSamples } from '../../src/server/seed.ts';
import { createApp } from '../../src/server/app.ts';
import { createTranslator, describeAiError, type BatchTranslateFn } from '../../src/server/services/claude.ts';
import { boldContext } from '../../src/server/repo/words.ts';

describe('translator (batched, cached)', () => {
  const calls: number[] = [];
  const fake: BatchTranslateFn = async ({ items }) => {
    calls.push(items.length);
    return { items: items.map((it, index) => ({ index, translation: `T(${it.surface})`, pos: 'noun', lemma: it.surface.toLowerCase() })) };
  };

  it('translates in one call, then serves from cache', async () => {
    const db = openDb(':memory:');
    const t = createTranslator(db, fake);
    calls.length = 0;
    const items = [
      { surface: 'casa', sentence: 'La casa es grande.' },
      { surface: 'gato', sentence: 'El gato duerme.' },
    ];
    const a = await t.translate('es', 'en', items);
    expect(a).toEqual({ ok: true, results: [{ translation: 'T(casa)', pos: 'noun', lemma: 'casa' }, { translation: 'T(gato)', pos: 'noun', lemma: 'gato' }] });
    expect(calls).toEqual([2]);
    // Same word+sentence (different case) is a cache hit; only the new one is sent.
    const b = await t.translate('es', 'en', [{ surface: 'Casa', sentence: 'La casa es grande.' }, { surface: 'perro', sentence: 'Un perro.' }]);
    expect(b.ok).toBe(true);
    expect(calls).toEqual([2, 1]);
  });

  it('splits very large requests into batches of 60', async () => {
    const db = openDb(':memory:');
    calls.length = 0;
    const items = Array.from({ length: 130 }, (_, i) => ({ surface: `palabra${i}`, sentence: `Frase ${i}.` }));
    const r = await createTranslator(db, fake).translate('es', 'en', items);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([60, 60, 10]);
  });

  it('reports a readable reason instead of throwing', async () => {
    const db = openDb(':memory:');
    const failing: BatchTranslateFn = async () => {
      throw new Anthropic.APIConnectionError({ message: 'down' });
    };
    const r = await createTranslator(db, failing).translate('es', 'en', [{ surface: 'casa', sentence: 'x' }]);
    expect(r).toEqual({ ok: false, reason: 'Could not reach the Claude API.' });
  });

  it('says AI is off when no key is configured', async () => {
    const r = await createTranslator(openDb(':memory:'), null).translate('es', 'en', [{ surface: 'casa', sentence: 'x' }]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.aiDisabled).toBe(true);
  });

  it('maps unknown errors to a generic message', () => {
    expect(describeAiError(new Error('boom'))).toBe('Translation failed.');
  });
});

describe('words API', () => {
  let server: Server;
  let base: string;
  const db = openDb(':memory:');
  let textId: number;

  beforeAll(async () => {
    seedSamples(db);
    textId = (db.prepare(`SELECT id FROM texts WHERE language = 'sr'`).get() as { id: number }).id;
    const fake: BatchTranslateFn = async ({ items }) => ({ items: items.map((_it, index) => ({ index, translation: 'chair', pos: 'noun', lemma: 'stolica' })) });
    server = createApp(db, { translator: createTranslator(db, fake), model: 'test' }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...init });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* csv */
    }
    return { status: res.status, body, headers: res.headers };
  };
  const post = (path: string, data: unknown) => api(path, { method: 'POST', body: JSON.stringify(data) });

  it('translates through the server', async () => {
    const r = await post('/api/translate', { language: 'sr', words: [{ surface: 'столицу', sentence: 'Марко је купио нову столицу.' }] });
    expect(r.body).toEqual({ ok: true, results: [{ translation: 'chair', pos: 'noun', lemma: 'stolica' }] });
  });

  it('saves words with context, upserts on the normalized key, creates SRS cards', async () => {
    const first = await post('/api/words/batch', {
      language: 'sr',
      textId,
      words: [{ surface: 'столицу', translation: 'chair', pos: 'noun', lemma: 'столица', sentence: 'Марко је купио нову столицу.', offset: 21, form: 'столицу' }],
    });
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(1);
    const w = first.body.words[0];
    expect(w.key).toBe('stolicu');
    expect(w.contexts[0].sourceTitle).toBe('Нова столица');
    expect(w.status).toBe('new');

    // Same word in Latin script from another sentence: same entry, second context, translation kept.
    const second = await post('/api/words/batch', {
      language: 'sr',
      textId,
      words: [{ surface: 'stolicu', translation: '', sentence: 'Mica skoči na stolicu.', offset: 15, form: 'stolicu' }],
    });
    expect(second.body).toMatchObject({ created: 0, updated: 1 });
    expect(second.body.words[0].contexts).toHaveLength(2);
    expect(second.body.words[0].translation).toBe('chair');

    const cards = db.prepare('SELECT COUNT(*) AS n FROM srs_state WHERE word_id = ?').get(w.id) as { n: number };
    expect(cards.n).toBe(1);
    const keys = await api('/api/words/keys?language=sr');
    expect(keys.body).toEqual([{ key: 'stolicu', status: 'new' }]);
  });

  it('looks up existing keys for the summary page', async () => {
    const r = await post('/api/words/lookup', { language: 'sr', keys: ['stolicu', 'nepostoji'] });
    expect(r.body.map((w: { key: string }) => w.key)).toEqual(['stolicu']);
  });

  it('lists, searches (accent-insensitive) and filters the library', async () => {
    await post('/api/words/batch', {
      language: 'es',
      textId: null,
      words: [
        { surface: 'sábado', translation: 'Saturday', sentence: 'El sábado.', offset: 3, form: 'sábado' },
        { surface: 'queso', translation: 'cheese', sentence: 'Compra queso.', offset: 7, form: 'queso' },
      ],
    });
    expect((await api('/api/words')).body).toHaveLength(3);
    expect((await api('/api/words?language=es')).body).toHaveLength(2);
    expect((await api('/api/words?q=sabado')).body.map((w: { surface: string }) => w.surface)).toEqual(['sábado']);
    expect((await api('/api/words?q=CHEESE')).body).toHaveLength(1);
    expect((await api('/api/words?q=skoči')).body[0].surface).toBe('столицу'); // matches context sentence
    expect((await api('/api/words?language=es&sort=alpha')).body.map((w: { surface: string }) => w.surface)).toEqual(['queso', 'sábado']);
    expect((await api('/api/words?status=known')).body).toHaveLength(0);
    expect((await api('/api/words?status=bogus')).status).toBe(400);
  });

  it('edits words, rejects duplicates, deletes with contexts', async () => {
    const [queso, sabado] = (await api('/api/words?language=es&sort=alpha')).body;
    const edited = await api(`/api/words/${queso.id}`, { method: 'PATCH', body: JSON.stringify({ translation: 'cheese (n.)', status: 'learning', notes: 'from market' }) });
    expect(edited.body).toMatchObject({ translation: 'cheese (n.)', status: 'learning', notes: 'from market' });
    const clash = await api(`/api/words/${queso.id}`, { method: 'PATCH', body: JSON.stringify({ surface: 'Sábado' }) });
    expect(clash.status).toBe(409);
    expect((await api(`/api/words/${sabado.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/words/${sabado.id}`)).status).toBe(404);
    const orphans = db.prepare('SELECT COUNT(*) AS n FROM word_contexts WHERE word_id = ?').get(sabado.id) as { n: number };
    expect(orphans.n).toBe(0);
  });

  it('rejects saving to a text that does not exist', async () => {
    const r = await post('/api/words/batch', { language: 'es', textId: 99999, words: [] });
    expect(r.status).toBe(404);
  });

  it('exports Anki CSV with headers, escaping and bold context', async () => {
    await post('/api/words/batch', {
      language: 'es',
      textId: null,
      words: [{ surface: 'dice', translation: 'says, "tells"', sentence: '«Prueba», le dice <b>.', offset: 13, form: 'dice' }],
    });
    const r = await api('/api/words/export.csv?language=es');
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="glossa-es-/);
    const lines = (r.body as string).trim().split('\n');
    expect(lines.slice(0, 4)).toEqual(['#separator:Comma', '#html:true', '#tags column:7', '#columns:Word,Translation,Context,Part of speech,Lemma,Source,Tags']);
    const dice = lines.find((l) => l.startsWith('"dice"'))!;
    expect(dice).toContain('"says, ""tells"""');
    expect(dice).toContain('le <b>dice</b> &lt;b&gt;.');
    expect(dice).toContain('glossa::es');
  });

  it('boldContext falls back to the plain sentence when the offset is stale', () => {
    expect(boldContext({ id: 1, textId: null, sentence: 'a b c', offset: 99, form: 'b', sourceTitle: null, createdAt: '' }, 'b')).toBe('a b c');
  });
});
