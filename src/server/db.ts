import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

/** v1 is single-user; every user-owned row still carries user_id so auth can be added later. */
export const LOCAL_USER_ID = 1;

/** Forward-only migrations; index + 1 = PRAGMA user_version after applying. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO users (id, name) VALUES (1, 'Local learner');

  CREATE TABLE settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE texts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),          -- NULL = shared catalog text
    language TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    level TEXT,                                     -- CEFR estimate or requested level
    difficulty TEXT,                                -- JSON breakdown of the estimate
    topics TEXT NOT NULL DEFAULT '[]',              -- JSON array
    source_type TEXT NOT NULL,
    source_name TEXT NOT NULL,
    author TEXT,
    license TEXT NOT NULL,
    url TEXT,
    content_hash TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (language, content_hash)
  );
  CREATE INDEX texts_lang ON texts(language, created_at);

  CREATE TABLE text_lemmas (
    text_id INTEGER PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE words (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    language TEXT NOT NULL,
    surface TEXT NOT NULL,
    lemma TEXT,
    normalized_key TEXT NOT NULL,
    translation TEXT,
    pos TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','learning','known')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, language, normalized_key)
  );

  CREATE TABLE word_contexts (
    id INTEGER PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    text_id INTEGER REFERENCES texts(id) ON DELETE SET NULL,
    sentence TEXT NOT NULL,
    offset INTEGER NOT NULL DEFAULT 0,
    source_title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (word_id, sentence)
  );

  CREATE TABLE srs_state (
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL DEFAULT 'recognition' CHECK (card_type IN ('recognition','production')),
    user_id INTEGER NOT NULL REFERENCES users(id),
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    due TEXT NOT NULL DEFAULT (datetime('now')),
    last_reviewed TEXT,
    PRIMARY KEY (word_id, card_type)
  );
  CREATE INDEX srs_due ON srs_state(user_id, due);

  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL DEFAULT 'recognition',
    mode TEXT NOT NULL,
    grade INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX reviews_user_time ON reviews(user_id, reviewed_at);

  CREATE TABLE study_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    mode TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    items INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE translation_cache (
    kind TEXT NOT NULL,
    language TEXT NOT NULL,
    target TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (kind, language, target, input_hash)
  );
  `,
  // 2: the exact form the word had in its sentence (cloze needs it when the saved surface was edited).
  `
  ALTER TABLE word_contexts ADD COLUMN form TEXT;
  CREATE INDEX words_user_lang ON words(user_id, language, created_at);
  `,
  // 3: bundled stories are identified by a stable slug (content/<lang>/stories/<slug>.md) so edits update in place.
  `
  ALTER TABLE texts ADD COLUMN slug TEXT;
  CREATE UNIQUE INDEX texts_slug ON texts(slug) WHERE slug IS NOT NULL;
  UPDATE texts SET source_type = 'story' WHERE source_type = 'sample';
  `,
];

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
