# Glossa — Plan

> **Direction change (requested by the user):** no AI. Glossa ships a library of original stories at every CEFR level and topic, each word backed by a bundled dictionary. Learners tap unknown words, save them, and review with flashcards and games. The original brief's AI features (Claude translations, AI-generated texts, AI lemma maps) and external text sources (Wikipedia, RSS, Gutenberg) were dropped. Sections below are updated; superseded parts are marked.

## 0. Current scope

| Feature | How |
|---|---|
| Stories | `content/<lang>/stories/*.md`: 24 each for es, sr, ja (4 × A1–C2), 11 topics, original CC0 text |
| Translations | `content/<lang>/dictionary.txt`: form → translation, part of speech, dictionary form; 100% coverage is enforced by a unit test and `npm run content:check` |
| Lemma matching | dictionary forms replace the AI lemma map: all forms of a word share a match key, and the library stores the dictionary form |
| Reader | as below (§1), plus the popover shows "come: eats, from comer: to eat" |
| Library | search, filters, edit, status, delete, Anki CSV |
| Review | SM-2 flashcards (both directions, daily new limit, in-session relearning), 5 games weighted toward weak words, streak and mastery stats |
| Pasted texts | still supported; words the dictionary knows are translated, others are typed by the learner |


A reading-first vocabulary app: read real texts, click unknown words, save them with context, study them with spaced repetition and games.

This file is the source of truth for architecture, data model, milestones and **decisions**. Decisions made without asking the user are listed in §7 with a short rationale; revisit them freely.

---

## 1. Architecture

```
glossa/
├── package.json          one package (single `npm install`), npm scripts drive everything
├── .env.example          ANTHROPIC_API_KEY, CLAUDE_MODEL, PORT, DB_PATH, NATIVE_LANGUAGE
├── src/
│   ├── shared/           pure TS used by BOTH client and server (no DOM, no Node APIs)
│   │   ├── languages.ts  language registry (config-only language support)
│   │   ├── tokenize.ts   Intl.Segmenter tokenizer + sentence/paragraph structure
│   │   ├── normalize.ts  normalized match key (NFC, lowercase, strip punctuation, script fold)
│   │   ├── script.ts     Serbian Cyrillic ↔ Latin transliteration
│   │   ├── srs.ts        SM-2 (Anki-style) scheduler, pure functions      (M3)
│   │   ├── difficulty.ts CEFR estimate from frequency ranks + sentence length (M5)
│   │   └── types.ts      API DTOs shared by client and server
│   ├── server/           Node + Express 5 + better-sqlite3 (run with tsx)
│   │   ├── index.ts      app bootstrap, serves built client in production
│   │   ├── db.ts         connection + forward-only SQL migrations
│   │   ├── seed.ts       bundled sample texts (idempotent, deduped by hash)
│   │   ├── routes/       texts, words, study, discover, settings, stats
│   │   └── services/     claude.ts (SDK wrapper: batching, retries, cache), wikipedia.ts,
│   │                     rss.ts, gutenberg.ts, readability.ts, frequency.ts
│   └── client/           React 19 + TS + Vite + Tailwind v4 + react-router
│       ├── pages/        Home (discover), Reader, FinishSummary, Library, Study, Games, Stats, Settings, Onboarding
│       ├── reader/       ReaderView, WordPopover, highlight engine (CSS-rule injection)
│       └── lib/          api client, TTS (Web Speech), settings store
├── data/                 SQLite DB (gitignored), frequency lists cache
└── tests/
    ├── unit/             vitest: tokenizer, matching, SRS, difficulty
    └── e2e/              Playwright: core flow
```

* **One process in production**: Express serves `/api/*` and the built SPA. In dev, Vite (5173) proxies `/api` to Express (3001); `npm run dev` starts both.
* **All third-party calls go through the server** (Claude, Wikipedia, RSS, Gutenberg, URL fetch). The browser never sees `ANTHROPIC_API_KEY`; the client bundle is checked for the key name in a test.
* **Shared code is imported directly as TS source** by Vite and tsx — no build step between packages.

### Reading pipeline

1. Server stores the raw text body (paragraphs separated by blank lines). No server-side tokenization is needed for display.
2. Client tokenizes with `Intl.Segmenter(locale, {granularity: 'word'})` per paragraph, plus `granularity: 'sentence'` to attach a sentence index to each token. Only `isWordLike` segments become clickable `<span>`s; punctuation/whitespace stays plain text.
3. Each word token gets an integer **key id** (`data-k`), interned per text from its match key (normalized surface in M1, lemma in M6).
4. **Highlighting is CSS-rule injection, not React state per token**: marking a word updates one `<style>` element with `[data-k="17"]{…}` rules. Cost is O(marked words), independent of text length, so marking stays well under 100 ms on 3,000+ words and React never re-renders the token tree. Same mechanism for the "already saved" style.
5. Translations/POS are fetched lazily in the background (debounced batch to `/api/translate`) and cached server-side in `translation_cache` and client-side in memory.

### Claude integration (superseded: removed at the user's request)

* `@anthropic-ai/sdk`, model from `CLAUDE_MODEL` (default `claude-opus-5-5`), structured outputs (`output_config.format` via `zodOutputFormat`) so every response is validated JSON.
* Batched: all words of a "finish reading" go in **one** request; lemma map is one request per text at import.
* Cached in SQLite keyed by (task, language, native language, input hash).
* SDK retries (429/5xx/connection) with `maxRetries: 4`; on failure the API returns `{ok:false, reason}` and the UI shows a visible fallback ("Translation unavailable — you can type it") rather than failing the flow. Without an API key the app is fully usable except AI features.

---

## 2. Data model (SQLite)

All user-owned rows carry `user_id` (v1: always `1`, a seeded local user) so auth can be added later.

| table | columns | notes |
|---|---|---|
| `users` | id, name, created_at | seeded `id=1` |
| `settings` | user_id PK, json, updated_at | native language, target language, level per language, interests, new-cards/day, reader prefs |
| `texts` | id, user_id (NULL = shared catalog), language, title, body, level, difficulty (JSON breakdown), topics (JSON array), source_type, source_name, author, license, url, content_hash, word_count, created_at | `UNIQUE(language, content_hash)` dedupes fetched/generated texts |
| `text_lemmas` | text_id PK, data (JSON surface→lemma), model, created_at | M6 lemma cache |
| `words` | id, user_id, language, surface, lemma, normalized_key, translation, pos, notes, status (`new`/`learning`/`known`), created_at, updated_at | `UNIQUE(user_id, language, normalized_key)` |
| `word_contexts` | id, word_id, text_id (nullable), sentence, offset (char offset of word in sentence), source_title, created_at | many per word |
| `srs_state` | word_id, card_type (`recognition`/`production`), user_id, ease, interval_days, reps, lapses, due, last_reviewed | PK(word_id, card_type) |
| `reviews` | id, user_id, word_id, card_type, mode (`flashcard`/`match`/`mc`/`cloze`/`spelling`/`scramble`), grade (1-4), correct, reviewed_at | drives streaks, stats, weak-word weighting |
| `study_sessions` | id, user_id, mode, started_at, ended_at, items, correct | |
| `translation_cache` | kind, language, target, input_hash, json, created_at | PK(kind, language, target, input_hash) |

Migrations are a forward-only ordered list of SQL strings in `db.ts`, tracked with `PRAGMA user_version`.

---

## 3. Languages (config-only)

`src/shared/languages.ts` holds one entry per language:

```ts
{ code: 'sr', name: 'Serbian', nativeName: 'Српски / Srpski', locale: 'sr', dir: 'ltr',
  spaced: true, alphabetic: true, scripts: ['cyrl','latn'], keyScript: 'latn',
  ttsLang: 'sr-RS', frequency: { source: 'hermitdave', code: 'sr' },
  wikipedia: 'sr', wikinews: 'sr', rss: [...], gutenbergLang: 'sr' }
```

Initial set: en, es, fr, de, it, pt, ru, sr, pl, ja, zh, ko, ar. Adding one = adding one object.

---

## 4. Matching

* **Normalized key** (M1): `NFC` → `toLocaleLowerCase(locale)` → strip `\p{P}`/`\p{S}` at edges and inside except intra-word apostrophes/hyphens → for languages with `keyScript`, fold to that script (Serbian Cyrillic → Latin, so `столица` and `stolica` match).
* **Lemma key** (M6): `text_lemmas` map from Claude, generated once per text at import; key becomes `lemma:<normalized lemma>`; falls back to normalized surface when absent.

---

## 5. Difficulty / level (superseded: stories carry an authored CEFR level)

* Frequency source: Hermit Dave's FrequencyWords (OpenSubtitles 2018, CC BY-SA 4.0), top 50k per language, downloaded on demand to `data/freq/` and cached; wordfreq-style rank lookup. For CJK where tokenization differs, the same Intl.Segmenter tokenization is used on the list side.
* Score = weighted blend of: share of tokens outside top-1k/2k/5k/10k ranks, median rank, average sentence length (in tokens). Mapped to A1–C2 by thresholds, **with the breakdown stored and shown** ("72% top-1k words, 9% rare, avg sentence 14 words → B1").
* AI-generated texts use the requested level (estimate shown alongside).
* "~X% of words you likely know": tokens whose key is in your library with status `known`, or whose rank is below a level-dependent cutoff (A1≈500 … C2≈20,000).

---

## 6. Milestones

> Status lives in CLAUDE.md. Milestone 5 (Wikipedia/RSS/AI texts) was replaced by bundled stories and dictionaries; milestone 6's lemma work by dictionary forms.

| # | Scope | Done when |
|---|---|---|
| **1** | Scaffold, DB + migrations, shared language registry, tokenizer + normalize + script fold, sample texts (es, sr, ja), text list, reading view with click-to-mark, highlight-all-occurrences, popover with audio, reader settings (font size, line height, dark mode), keyboard navigation | unit tests pass, app runs, marking is instant on a 3k-word text |
| **2** | Finish-reading flow (summary with edit/remove, batched translation, save with context), library page (search, filter, edit, delete, CSV export for Anki), "saved" style in reader | save→library works without API key (manual translation) and with it |
| **3** | Flashcards + SM-2 SRS (Again/Hard/Good/Easy, context front, reverse direction, daily queue, new-card limit) | SRS unit tests; review updates `srs_state` |
| **4** | Games: match pairs (timed), multiple choice (translation / fill sentence), cloze (accent-tolerant + hint), spelling (audio/translation), letter scramble (skipped for CJK); weak-word weighting; SRS updates | each game playable from library |
| **5** | Discovery: Wikipedia/Wikinews, Global Voices RSS, Gutenberg/Wikisource, AI-generated texts, paste text/URL (readability); level scoring; interests; DB cache + dedupe; attribution on every text | difficulty unit tests; each source returns text with license |
| **6** | Lemma matching, translation/audio polish, per-paragraph translation, RTL + Arabic sample, Serbian script toggle, onboarding, streaks/mastery/stats, Playwright e2e of core flow | Definition of done in the brief |

After each milestone: `npm test`, `npm run typecheck`, run the app and click through, fix, commit, update CLAUDE.md.

---

## 7. Decisions (made autonomously)

1. **Name**: "Glossa".
2. **Single npm package** instead of workspaces: one install, shared code imported as source by both Vite and tsx. Simplest path to "running in under 5 commands".
3. **better-sqlite3 + hand-written SQL migrations** (no ORM): small schema, synchronous API, easy to read.
4. **Server runs TypeScript through `tsx`** in dev and prod; no separate server build.
5. **Highlighting by injected CSS rules keyed on interned integer ids** (see §1) — the only approach that keeps clicks O(1) w.r.t. text length without virtualisation.
6. **Click semantics** (the brief has both "click again to unmark" and "clicking a marked word opens a popover"): click an unmarked word → marks it and opens its popover; click the word whose popover is open → unmarks it; click a different occurrence of a marked word → opens the popover (with an "Unmark" button). So click-click on one word = mark, unmark.
7. **Keyboard**: the passage is a single tab stop with a roving focus over words (←/→ word, ↑/↓ paragraph, Enter/Space = click, Esc = close popover). 3,000 tab stops would be unusable.
8. **Serbian match keys are folded to Latin** so both scripts highlight together; the script toggle only changes display.
9. **SRS: SM-2 (Anki variant)** with four grades; simpler to reason about and test than FSRS; `srs_state` keeps fields so FSRS could replace it later. One schedule per (word, direction).
10. **Games grade into SRS** with a lighter touch than flashcards: correct = Good, wrong = Again, hint/slow = Hard, only if the card is due or new (so games can't inflate intervals for words not due).
11. **Sample texts are original**, written for this project and released CC0 — no copyright risk.
12. **Model default** `claude-opus-5-5`, overridable with `CLAUDE_MODEL`.
13. **Native language** defaults to English (configurable in settings/onboarding).
14. **No API key → graceful degradation**: reading, marking, library, SRS and games work; translations become manual entry; AI-generated texts and lemma maps are disabled with a visible notice.
15. **Double-click is not a toggle**: the second click of a double-click is ignored, so a reflexive double-click/double-tap marks a word rather than marking and unmarking it.
16. **Japanese token repair**: ICU splits kanji stems from okurigana (飲|み|ます), so a small rule-based merge keeps verbs whole until lemma support lands. Chinese and Korean wait for M6 lemmas.
17. **Refusal fallbacks**: translation requests use server-side `fallbacks: "default"` on models that support it, so a rare refusal is retried on a fallback model instead of failing.
18. **`GLOSSA_FAKE_AI=1`**: a deterministic fake translator for e2e and key-less demos; off by default.

19. **No AI, bundled content** (user request): a shared per-language dictionary instead of per-story glossaries, because stories reuse most words, and pasted texts benefit too. One gloss per form (ambiguous forms list senses separated by `;`).
20. **Dictionary forms as word identity**: saved words use the lemma as surface and key, and contexts keep the exact form seen. This replaces the planned AI lemma map.
21. **Japanese segmentation** uses Intl.Segmenter plus repair rules, not a morphological analyser (kuromoji's dictionary is ~20 MB). Remaining fragments get dictionary entries.
22. **Review hub** combines flashcards, games and stats on one page; games only reschedule cards that are new or due.
