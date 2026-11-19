import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb } from '../../src/server/db.ts';
import { createApp } from '../../src/server/app.ts';
import { loadContent, syncStories } from '../../src/server/content.ts';

let server: Server;
let base: string;
const db = openDb(':memory:');
const content = loadContent('tests/fixtures/content');

beforeAll(async () => {
  syncStories(db, content.stories);
  server = createApp(db, { content }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: res.status, body: await res.json() };
};

describe('API', () => {
  it('lists bundled stories, each with source and license', async () => {
    const { body } = await api('/api/texts');
    expect(body).toHaveLength(2);
    for (const t of body) {
      expect(t.sourceType).toBe('story');
      expect(t.license).toMatch(/CC0/);
      expect(t.sourceName).toBeTruthy();
    }
    expect((await api('/api/languages')).body).toEqual([
      { code: 'es', stories: 1 },
      { code: 'sr', stories: 1 },
    ]);
  });

  it('returns text detail with a glossary covering its words and their lemmas', async () => {
    const { body: list } = await api('/api/texts?language=es');
    expect(list).toHaveLength(1);
    const { body: detail } = await api(`/api/texts/${list[0].id}`);
    expect(detail.body).toContain('Lucía come');
    expect(detail.glossary.come).toEqual({ translation: 'eats', pos: 'verb', lemma: 'comer' });
    expect(detail.glossary.comer.translation).toBe('to eat');
    expect(detail.glossary.lucia).toBeUndefined();
  });

  it('accepts pasted text and dedupes identical content', async () => {
    const payload = { language: 'es', title: '', body: 'Hola   mundo.\n\nSegundo párrafo.' };
    const a = await api('/api/texts', { method: 'POST', body: JSON.stringify(payload) });
    expect(a.status).toBe(201);
    expect(a.body.sourceType).toBe('user');
    expect(a.body.license).toMatch(/Personal use/);
    expect(a.body.glossary).toEqual({}); // no Spanish fixture entry for hola/mundo
    const b = await api('/api/texts', { method: 'POST', body: JSON.stringify({ ...payload, body: 'Hola mundo.\n\nSegundo  párrafo.' }) });
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
  });

  it('validates input', async () => {
    expect((await api('/api/texts', { method: 'POST', body: JSON.stringify({ language: 'xx', body: 'a' }) })).status).toBe(400);
    expect((await api('/api/texts', { method: 'POST', body: JSON.stringify({ language: 'es', body: '   \n\n  ' }) })).status).toBe(400);
    expect((await api('/api/texts', { method: 'POST', body: JSON.stringify({ language: 'es', body: '123 456 !!!' }) })).status).toBe(400);
    expect((await api('/api/texts/999999')).status).toBe(404);
    expect((await api('/api/nope')).status).toBe(404);
  });

  it('merges settings patches', async () => {
    const { body } = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ targetLanguage: 'sr', reader: { fontSize: 24 } }) });
    expect(body.targetLanguage).toBe('sr');
    expect(body.reader.fontSize).toBe(24);
    expect(body.reader.lineHeight).toBe(1.8);
  });

  it('health check', async () => {
    expect((await api('/api/health')).body).toEqual({ ok: true });
  });
});
