import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.ts';
import { seedSamples } from './seed.ts';
import { createApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'data/glossa.db';
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const db = openDb(DB_PATH);
const seeded = seedSamples(db);
if (seeded) console.log(`Seeded ${seeded} sample text(s)`);

const app = createApp(db, { aiEnabled, model: MODEL });

// Production: serve the built SPA from the same origin.
const dist = path.resolve('dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Glossa API on http://localhost:${PORT}  (AI features: ${aiEnabled ? `on, ${MODEL}` : 'off — set ANTHROPIC_API_KEY'})`);
});
