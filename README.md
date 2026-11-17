# Glossa

Read real texts in the language you're learning, click the words you don't know, and study them later with spaced-repetition flashcards and games.

## Quick start

Requires Node 22+.

```bash
git clone <this repo> glossa && cd glossa
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY to turn on AI features
npm run dev                 # open http://localhost:5173
```

The app works without an API key: reading, marking words, the library and studying all work, and you type translations yourself. With a key, translations, AI-generated texts and lemma matching are turned on.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | API (port 3001) + Vite dev server (5173) with hot reload |
| `npm run build && npm start` | production: one process serves API + built app on `PORT` (default 3001) |
| `npm test` | unit + API tests (vitest) |
| `npm run test:e2e` | Playwright end-to-end test of the core flow |
| `npm run typecheck` | TypeScript, no emit |

## How it works

* Texts are split into words in the browser with `Intl.Segmenter`, so Japanese, Chinese and Thai work without spaces.
* When you click a word, every other occurrence lights up through one injected CSS rule, so the page doesn't re-render. That keeps it under 100 ms, even in very long texts.
* All third-party calls (Claude, Wikipedia, RSS) go through the server. Your API key stays in `.env` and never reaches the browser.
* Every text shows its source and license.

See [PLAN.md](PLAN.md) for the architecture, data model, milestones and design decisions.
