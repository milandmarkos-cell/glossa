# CLAUDE.md — working notes for Glossa

Read PLAN.md first (architecture, data model, milestone plan, decision log §7). This file is the quick operational guide plus current status.

## Status

| Milestone | State |
|---|---|
| 1. Scaffold, DB, tokenizer, reader with mark + highlight-all | **done** |
| 2. Finish-reading flow + library (search/filter/edit/delete/CSV) | **done** |
| 3. Flashcards + SRS | next |
| 4. Games | todo |
| 5. Text discovery + level scoring + interests | todo |
| 6. Lemmas, translation/audio polish, RTL/script polish, onboarding, stats, e2e | todo |

## Commands

```bash
npm install
npm run dev          # server :3001 (tsx watch) + vite :5173 (proxies /api)
npm test             # vitest: tests/unit/**
npm run typecheck    # tsc --noEmit (TypeScript 7)
npm run build        # vite build → dist/
npm start            # NODE_ENV=production, serves API + dist on PORT
npm run test:e2e     # playwright: builds client, runs prod server on :memory: DB with GLOSSA_FAKE_AI=1 (port 3101)
```

`GLOSSA_FAKE_AI=1 npm run dev` uses a deterministic fake translator (`services/fakeAi.ts`, glosses look like `‹word›`). It's for e2e and for trying the AI UI without a key. Never on by default.

DB file: `data/glossa.db` (gitignored; delete it to reset; samples re-seed on start).

## Layout

- `src/shared/` — pure TS used by client AND server. No DOM or Node APIs here.
  - `languages.ts` language registry (config-only languages), CEFR levels, topics
  - `tokenize.ts` Intl.Segmenter tokenizer → tokens/sentences/paragraphs + interned key ids (`k`)
  - `normalize.ts` `normalizeKey` (match key) and `foldForAnswer` (accent-tolerant answers)
  - `script.ts` Serbian Cyrillic↔Latin
  - `types.ts` API DTOs, `Settings`, `DEFAULT_SETTINGS`
- `src/server/` — Express 5 + better-sqlite3, run through tsx (no server build step)
  - `app.ts` `createApp(db, opts)`: all routes (testable with an in-memory DB)
  - `index.ts` bootstrap (dotenv, open DB, seed, serve dist in prod)
  - `db.ts` migrations: an array of SQL strings, versioned with `PRAGMA user_version`. **Append only, never edit a shipped one.**
  - `repo/` data access: `texts.ts`, `settings.ts`, `words.ts` (upsert + contexts + SRS card creation, search, Anki CSV)
  - `services/claude.ts` translator: `createTranslator(db, batchFn)` caches per (language, native, normalized word, sentence) in `translation_cache`, batches ≤60 words/request, dedupes in-flight calls, returns `{ok:false, reason}` instead of throwing. `claudeBatchTranslate` = `client.beta.messages.parse` + `betaZodOutputFormat`, effort `low`, server-side refusal fallbacks (`fallbacks: 'default'`) for models that support them.
  - `samples.ts` + `seed.ts` sample texts (original, CC0)
- `src/client/` — React 19 + Vite 8 + Tailwind v4 + react-router 8 (`import … from 'react-router'`)
  - `reader/ReaderView.tsx` the core reader; `reader/highlight.ts` CSS-rule highlight engine; `WordPopover.tsx`; `ReaderSettings.tsx`
  - `pages/FinishPage.tsx` summary (edit/remove, save); `pages/LibraryPage.tsx` (client-side search/filter, edit, status, delete, export)
  - `lib/api.ts` fetch client; `lib/settings.tsx` settings context (optimistic, persisted server-side); `lib/tts.ts`
  - `lib/translations.ts` client translation store: requests within 250 ms are batched into one `/api/translate`; `useTranslation` for lazy lookups
  - `lib/marks.ts` per-text marked words in sessionStorage (`MarkedWord[]` with form, sentence, offset)
- `tests/unit/` — vitest (tokenizer/normalize/script, highlight CSS, texts API, words API + translator with a fake batch fn)
- `tests/e2e/` — Playwright (core flow in es/sr/ja, reader behaviour, perf <100 ms on 3k words, library, phone)

## Conventions and gotchas

- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`); ESM everywhere (`"type": "module"`).
- Every user-owned row has `user_id`; v1 always uses `LOCAL_USER_ID = 1` (`db.ts`). Shared catalog texts have `user_id NULL`.
- Texts are deduped on `(language, content_hash)`, where the hash is of whitespace/case-normalized body (`repo/texts.ts`).
- The reader never re-renders the token tree on mark. Marked/saved styles are `[data-k="N"]` rules in one `<style>` element, and `aria-pressed` is set imperatively on the occurrence spans. Keep it that way, because it is what keeps marking under 100 ms. `Passage` is memoised; its props must stay stable.
- Click semantics: an unmarked word gets marked and opens its popover; clicking the same word while its popover is open unmarks it; another occurrence of a marked word opens the popover (PLAN §7.6).
- Keyboard: the passage is one tab stop with a roving tabindex (`onFocus` keeps it in sync), ←/→ move by word (swapped in RTL), ↑/↓ move by paragraph, Enter/Space click, Esc closes.
- Serbian match keys are folded to Latin; the script toggle only changes display (`toScript` per token, so offsets stay valid).
- Marks persist per text in `sessionStorage` (`glossa:marks:<id>`) until the summary page saves them.
- The second click of a double-click (`e.detail > 1`) is ignored, so a double-click/double-tap can't undo its own mark. Clicks that end a text selection are ignored too. E2E taps need a pause of more than about 500 ms to unmark.
- Japanese: `mergeJapanese` in `tokenize.ts` repairs ICU splits (kanji stem + okurigana, single-hiragana runs, ます endings). Particles, copula and さん stay separate. Chinese and Korean are left as ICU gives them until lemma support (M6).
- URLs and emails are never clickable. German ß is folded to ss in match keys.
- Word identity is `normalizeKey(final surface)`: editing a surface on the summary page changes its key. Contexts store the exact `form` for cloze.
- Paragraphs use `content-visibility: auto`, which keeps marking about 45 ms even on 34k-word texts.
- Secrets: only the server reads `.env`. Vite `envDir` is the repo root, but only `VITE_*` vars reach the bundle, so never prefix secrets with `VITE_`.
- Claude: model from `CLAUDE_MODEL` (default `claude-opus-5-5`); use `@anthropic-ai/sdk` with structured outputs (`client.messages.parse` + `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`). Opus 5.5: no `temperature`, no `budget_tokens`, no assistant prefill; set `output_config.effort` explicitly.
- Playwright: Chromium is preinstalled in the cloud sandbox; `require('playwright')` works globally. Don't run `playwright install`.

## API (current)

`GET /api/health` · `GET/POST /api/texts` · `GET /api/texts/:id` · `GET/PUT /api/settings` ·
`POST /api/translate` · `GET /api/words?language&status&q&sort` · `GET /api/words/keys?language` ·
`POST /api/words/lookup` · `POST /api/words/batch` · `GET/PATCH/DELETE /api/words/:id` · `GET /api/words/export.csv?language`

## Next steps (Milestone 3: flashcards + SRS)

1. `src/shared/srs.ts`: SM-2 (Anki variant), Again/Hard/Good/Easy, pure functions + unit tests.
2. `GET /api/study/queue?language` (due cards + new cards up to `newCardsPerDay`), `POST /api/study/review` (updates `srs_state`, logs `reviews`, moves `words.status` new → learning → known).
3. Study page: front = word in its context sentence, back = translation + audio; reverse (production) direction; keyboard 1–4 / Space.
