import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.ts';
import { seedSamples } from './seed.ts';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from './app.ts';
import { claudeBatchTranslate, createTranslator } from './services/claude.ts';
import { fakeBatchTranslate } from './services/fakeAi.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'data/glossa.db';
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const db = openDb(DB_PATH);
const seeded = seedSamples(db);
if (seeded) console.log(`Seeded ${seeded} sample text(s)`);

// maxRetries: the SDK retries 408/409/429/5xx and connection errors with backoff.
const fakeAi = process.env.GLOSSA_FAKE_AI === '1';
const client = aiEnabled && !fakeAi ? new Anthropic({ maxRetries: 4, timeout: 60_000 }) : null;
const translator = createTranslator(db, fakeAi ? fakeBatchTranslate : client ? claudeBatchTranslate(client, MODEL) : null);
if (fakeAi) console.log('GLOSSA_FAKE_AI=1: using the fake translator (testing only)');
const app = createApp(db, { translator, model: fakeAi ? 'fake (GLOSSA_FAKE_AI)' : MODEL });

// Production: serve the built SPA from the same origin.
const dist = path.resolve('dist');
// `--production` flag instead of NODE_ENV=… so `npm start` also works in Windows shells.
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
if (production && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Glossa API on http://localhost:${PORT}  (AI features: ${aiEnabled ? `on, ${MODEL}` : 'off — set ANTHROPIC_API_KEY'})`);
});
