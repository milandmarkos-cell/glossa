# Glossa

Read short stories in the language you're learning, tap the words you don't know, and practise them afterwards with flashcards and games.

* **72 original stories** in Spanish, Serbian (Cyrillic, with a Latin toggle) and Japanese, 4 per CEFR level from A1 to C2 across 11 topics.
* **Every word has a built-in translation.** Each language has a dictionary covering every word in its stories, so translations are instant and work offline. No AI and no API key.
* **Tap a word** and every occurrence lights up, including its other forms (столица, столицу, столици). Tap it again to unmark it.
* **Finish reading** to review the words you marked, then save them. They're stored under their dictionary form (comer, not come) with the sentence you found them in.
* **Review** with spaced-repetition flashcards (both directions) and five games: match pairs, multiple choice, fill the gap, spelling and letter scramble.

## Quick start

Requires Node 22.12 or newer.

```bash
git clone https://github.com/milandmarkos-cell/glossa.git && cd glossa
npm install
npm run dev                 # open http://localhost:5173
```

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | API (port 3001) and Vite dev server (5173) with hot reload |
| `npm run build && npm start` | production: one process serves the API and the built app on `PORT` (default 3001) |
| `npm test` | unit and API tests (vitest), including a check that the dictionaries cover every story word |
| `npm run test:e2e` | Playwright end-to-end tests (first time on a new machine: `npx playwright install chromium`) |
| `npm run content:check` | lists any story words missing from the dictionaries |
| `npm run typecheck` | TypeScript, no emit |

## Adding stories

Stories live in `content/<language>/stories/*.md`:

```markdown
---
title: El mercado del sábado
level: A2
topics: culture, cooking
---
Todos los sábados, Lucía va al mercado de su barrio…
```

Translations live in `content/<language>/dictionary.txt`, one word form per line:

```
form | translation | part of speech | dictionary form
come | eats | verb | comer
comer | to eat | verb
```

Run `npm run content:check`. It prints every word in your new story that the dictionary doesn't know yet, in the same format, ready to fill in. Restart the server to load the changes; stories update in place.

See [PLAN.md](PLAN.md) for the architecture and design decisions.
