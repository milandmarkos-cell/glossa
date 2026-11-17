# CLAUDE.md — working notes for Glossa

Read PLAN.md first (architecture, data model, milestone plan, decision log §7). This file is the quick operational guide plus current status.

## Status

| Milestone | State |
|---|---|
| 1. Scaffold, DB, tokenizer, reader with mark + highlight-all | **done** |
| 2. Finish-reading flow + library (search/filter/edit/delete/CSV) | next |
| 3. Flashcards + SRS | todo |
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
npm run test:e2e     # playwright (added in M6)
```

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
  - `repo/` data access (texts, settings); `samples.ts` + `seed.ts` sample texts (original, CC0)
- `src/client/` — React 19 + Vite 8 + Tailwind v4 + react-router 8 (`import … from 'react-router'`)
  - `reader/ReaderView.tsx` the core reader; `reader/highlight.ts` CSS-rule highlight engine; `WordPopover.tsx`; `ReaderSettings.tsx`
  - `lib/api.ts` fetch client; `lib/settings.tsx` settings context (optimistic, persisted server-side); `lib/tts.ts`
- `tests/unit/` — vitest (tokenizer/normalize/script, highlight CSS, API via real listener)

## Conventions and gotchas

- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`); ESM everywhere (`"type": "module"`).
- Every user-owned row has `user_id`; v1 always uses `LOCAL_USER_ID = 1` (`db.ts`). Shared catalog texts have `user_id NULL`.
- Texts are deduped on `(language, content_hash)`, where the hash is of whitespace/case-normalized body (`repo/texts.ts`).
- The reader never re-renders the token tree on mark. Marked/saved styles are `[data-k="N"]` rules in one `<style>` element, and `aria-pressed` is set imperatively on the occurrence spans. Keep it that way, because it is what keeps marking under 100 ms. `Passage` is memoised; its props must stay stable.
- Click semantics: an unmarked word gets marked and opens its popover; clicking the same word while its popover is open unmarks it; another occurrence of a marked word opens the popover (PLAN §7.6).
- Keyboard: the passage is one tab stop with a roving tabindex (`onFocus` keeps it in sync), ←/→ move by word (swapped in RTL), ↑/↓ move by paragraph, Enter/Space click, Esc closes.
- Serbian match keys are folded to Latin; the script toggle only changes display (`toScript` per token, so offsets stay valid).
- Marks persist per text in `sessionStorage` (`glossa:marks:<id>`) until "Finish reading" (M2).
- Secrets: only the server reads `.env`. Vite `envDir` is the repo root, but only `VITE_*` vars reach the bundle, so never prefix secrets with `VITE_`.
- Claude: model from `CLAUDE_MODEL` (default `claude-opus-5-5`); use `@anthropic-ai/sdk` with structured outputs (`client.messages.parse` + `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`). Opus 5.5: no `temperature`, no `budget_tokens`, no assistant prefill; set `output_config.effort` explicitly.
- Playwright: Chromium is preinstalled in the cloud sandbox; `require('playwright')` works globally. Don't run `playwright install`.

## Next steps (Milestone 2)

1. `POST /api/words/batch` saves marked words with context (upsert on `(user_id, language, normalized_key)`, append context).
2. `services/claude.ts`: batched translation (one request for all words, cached in `translation_cache`, retries, visible fallback).
3. Finish-reading summary page: edit or remove words before saving.
4. Library page: search, filter (language/status), edit, delete, CSV export for Anki.
