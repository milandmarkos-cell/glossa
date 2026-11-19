import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { loadContent, syncStories } from './content.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'data/glossa.db';
const CONTENT_DIR = process.env.CONTENT_DIR ?? 'content';

const db = openDb(DB_PATH);
const content = loadContent(CONTENT_DIR);
const sync = syncStories(db, content.stories);
console.log(
  `Loaded ${content.stories.length} stories and ${[...content.dictionaries.values()].reduce((n, d) => n + d.size, 0)} dictionary entries` +
    (sync.created || sync.updated ? ` (${sync.created} new, ${sync.updated} updated)` : ''),
);

const app = createApp(db, { content });

// Production: serve the built SPA from the same origin.
const dist = path.resolve('dist');
// `--production` flag instead of NODE_ENV=… so `npm start` also works in Windows shells.
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
if (production && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Glossa on http://localhost:${PORT}`));
