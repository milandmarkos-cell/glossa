# CLAUDE.md — working notes for Glossa

Read PLAN.md first (architecture, data model, decision log). This file is the operational guide and current status.

## What the app is (after the user's direction change)

The user does **not** want AI. Glossa is a library of **bundled original stories** (es, sr, ja × CEFR A1–C2 × topics) with **bundled dictionaries**. Learners tap unknown words, save them to a word library, and review them with SRS flashcards and games. All Claude/Anthropic code and dependencies were removed; don't reintroduce them unless asked.

## Status

| Area | State |
|---|---|
| Reader: tokenizer, tap-to-mark, highlight all forms (lemma), popover, settings, RTL, script toggle, keyboard | done |
| Content: 24 stories × es/sr/ja (4 per level), dictionaries with 100% coverage | done |
| Finish-reading summary + library (search/filter/edit/delete/Anki CSV) | done |
| Flashcards (SM-2), review hub with streak/mastery stats | done |
| Games: match, multiple choice, cloze, spelling, scramble | done |
| Unit tests (vitest), e2e (Playwright, desktop + phone) | done, all passing |
| Possible next: more stories, more languages, audio recordings, accounts/sync | not started |

## Commands

```bash
npm install
npm run dev            # server :3001 (tsx watch) + vite :5173 (proxies /api). Content is read at startup: restart after editing content/.
npm test               # vitest: tests/unit/** (includes the content coverage gate)
npm run test:e2e       # playwright: builds the client, runs the prod server on a :memory: DB, port 3101
npm run content:check  # lists story words missing from dictionaries (exits 1 if any)
npm run typecheck      # tsc --noEmit (TypeScript 7)
npm run build          # vite build → dist/
npm start              # tsx src/server/index.ts --production (serves API + dist on PORT)
```

DB file: `data/glossa.db` (gitignored; delete it to reset). Env (all optional): `PORT`, `DB_PATH`, `CONTENT_DIR`.

## Layout

- `content/<lang>/stories/*.md` — front matter `title`, `level` (A1–C2), `topics` (from `TOPICS` in languages.ts) + body (blank line = paragraph). Slug = `<lang>/<filename>`.
- `content/<lang>/dictionary.txt` — `form | translation | pos | lemma` per line (`#` comments). Keys are `normalizeKey(form)`, so Serbian entries match both scripts. Every lemma that differs from its form needs its own entry (the coverage check enforces it). Duplicate keys are an error.
- `src/shared/` — pure TS for client and server:
  - `languages.ts` (registry, CEFR, topics), `tokenize.ts` (Intl.Segmenter + Japanese repair rules), `normalize.ts`, `script.ts` (sr Cyrillic↔Latin)
  - `gloss.ts` (`lookupGloss`, `lemmaKeyFn`: forms share their lemma's match key), `srs.ts` (SM-2, Anki-style), `answer.ts` (accent-tolerant checking, hints, scramble), `types.ts`
- `src/server/` — Express 5 + better-sqlite3 via tsx
  - `content.ts` load/parse stories and dictionaries, `syncStories` (upsert by slug, retire removed), `glossaryFor`, `coverage`
  - `app.ts` routes; `db.ts` migrations (**append-only**); `repo/` texts, settings, words, study (queue, review, stats, game pool)
- `src/client/` — React 19 + Vite 8 + Tailwind v4 + react-router 8
  - `reader/` ReaderView (CSS-rule highlighting), WordPopover, ReaderSettings, highlight.ts
  - `pages/` Home (level/topic filters), Reader, Finish, Library, Study (hub), Flashcards, Game (all 5 games)
  - `study/` GameShell (pool loading, results, record), games registry, display helper; `lib/` api, settings, tts, marks
- `scripts/content-check.ts` — coverage report
- `tests/unit/`, `tests/fixtures/content/` (small es/sr fixture), `tests/e2e/`

## Conventions and gotchas

- Imports use explicit `.ts`/`.tsx`; ESM everywhere.
- Every user-owned row has `user_id` (v1: always `LOCAL_USER_ID = 1`). Bundled stories have `user_id NULL`, `source_type 'story'`, a `slug`.
- **Match keys are lemma keys**: the reader tokenizes with `lemmaKeyFn(glossary)`, so clicking "столицу" highlights столица, столици and столице. Saved words use the dictionary form as `surface`, and their `normalized_key` equals the lemma key, so the reader's "saved" underline matches.
- The reader never re-renders the token tree on mark: `[data-k]` CSS rules in one `<style>` plus imperative `aria-pressed`. Keep it that way (<100 ms on 3k words, ~45 ms on 34k with `content-visibility`).
- Click semantics: an unmarked word gets marked and opens its popover; clicking the same word with its popover open unmarks it; double-click (`e.detail > 1`) is ignored.
- Japanese tokenization: ICU splits are repaired in `mergeJapanese` (single-hiragana runs, katakana runs, single-kanji stem + okurigana + inflection endings, ます endings, ま|した, small っ). Some fragments remain (e.g. くだ|さい); they have dictionary entries pointing at the full word. **If you change these rules, run `npm run content:check ja`**: tokens change, so dictionary entries may need updating.
- SRS: games reschedule only new or due cards (`review()` with mode ≠ flashcard), so a game can't inflate intervals. The new-card limit counts first reviews today in the learner's time zone (`tz` = `getTimezoneOffset()`).
- Flashcard keyboard handling uses a single listener that reads state from a ref (`live`). Don't switch back to deps-based re-subscription: it drops fast keypresses right after a card changes.
- E2E: tests share one in-memory DB per run and run serially; earlier tests' saved words affect later queues. Use `data-word` / `data-testid` locators and wait for `/api/study/review` responses rather than timeouts.
- Playwright in the cloud sandbox: Chromium preinstalled; `require('playwright')` works globally; don't run `playwright install` there.

## API

`GET /api/health` · `GET /api/languages` · `GET/POST /api/texts` · `GET /api/texts/:id` (with `glossary`) · `GET/PUT /api/settings` ·
`GET /api/words?language&status&q&sort` · `GET /api/words/keys?language` · `GET /api/words/languages` · `POST /api/words/lookup` ·
`POST /api/words/batch` · `GET/PATCH/DELETE /api/words/:id` · `GET /api/words/export.csv?language` ·
`GET /api/study/queue?language&direction&tz` · `POST /api/study/review` · `GET /api/study/pool?language&n` · `GET /api/stats?language&tz`
