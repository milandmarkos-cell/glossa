import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb } from '../../src/server/db.ts';
import { seedSamples } from '../../src/server/seed.ts';
import { createApp } from '../../src/server/app.ts';

let server: Server;
let base: string;
const db = openDb(':memory:');

beforeAll(async () => {
  seedSamples(db);
  server = createApp(db, { aiEnabled: false, model: 'test' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: res.status, body: await res.json() };
};

describe('API', () => {
  it('seeds sample texts idempotently, each with source and license', async () => {
    expect(seedSamples(db)).toBe(0);
    const { body } = await api('/api/texts');
    expect(body.length).toBeGreaterThanOrEqual(3);
    for (const t of body) {
      expect(t.license).toBeTruthy();
      expect(t.sourceName).toBeTruthy();
    }
    expect(new Set(body.map((t: { language: string }) => t.language))).toEqual(new Set(['es', 'sr', 'ja', 'ar']));
  });

  it('filters by language and returns detail with body', async () => {
    const { body: list } = await api('/api/texts?language=ja');
    expect(list).toHaveLength(1);
    const { body: detail } = await api(`/api/texts/${list[0].id}`);
    expect(detail.body).toContain('公園');
    expect(detail.wordCount).toBeGreaterThan(20);
  });

  it('accepts pasted text and dedupes identical content', async () => {
    const payload = { language: 'es', title: '', body: 'Hola   mundo.\n\nSegundo párrafo.' };
    const a = await api('/api/texts', { method: 'POST', body: JSON.stringify(payload) });
    expect(a.status).toBe(201);
    expect(a.body.sourceType).toBe('user');
    expect(a.body.license).toMatch(/Personal use/);
    const b = await api('/api/texts', { method: 'POST', body: JSON.stringify({ ...payload, body: 'Hola mundo.\n\nSegundo  párrafo.' }) });
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
  });

  it('validates input', async () => {
    expect((await api('/api/texts', { method: 'POST', body: JSON.stringify({ language: 'xx', body: 'a' }) })).status).toBe(400);
    expect((await api('/api/texts/999999')).status).toBe(404);
    expect((await api('/api/nope')).status).toBe(404);
  });

  it('merges settings patches', async () => {
    const { body } = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ targetLanguage: 'sr', reader: { fontSize: 24 } }) });
    expect(body.targetLanguage).toBe('sr');
    expect(body.reader.fontSize).toBe(24);
    expect(body.reader.lineHeight).toBe(1.8);
  });

  it('reports AI disabled without a key', async () => {
    expect((await api('/api/health')).body).toEqual({ ok: true, ai: false, model: null });
  });
});
