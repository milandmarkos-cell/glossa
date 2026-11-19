import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { DB } from './db.ts';
import { LOCAL_USER_ID } from './db.ts';
import { getText, insertText, listTexts } from './repo/texts.ts';
import { getSettings, saveSettings } from './repo/settings.ts';
import { deleteWord, findByKeys, getWord, listWords, saveWords, updateWord, wordsToAnkiCsv } from './repo/words.ts';
import { glossaryFor, type Content } from './content.ts';
import { gamePool, getQueue, review, stats } from './repo/study.ts';
import { CEFR_LEVELS, isSupportedLanguage } from '../shared/languages.ts';
import type { LanguageInfo, SavedKey, TextDetail } from '../shared/types.ts';

const language = z.string().refine(isSupportedLanguage, 'Unsupported language');
const optionalLanguage = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export interface AppOptions {
  content: Content;
}

const STATUS = z.enum(['new', 'learning', 'known']);
const shortText = (max: number) => z.string().max(max).nullish();

const SaveWordsBody = z.object({
  language,
  textId: z.number().int().positive().nullable(),
  words: z
    .array(
      z.object({
        surface: z.string().trim().min(1).max(100),
        translation: shortText(300),
        pos: shortText(40),
        lemma: shortText(100),
        sentence: z.string().max(2000),
        offset: z.number().int().min(0),
        form: z.string().max(100),
      }),
    )
    .max(1000),
});

const WordPatchBody = z
  .object({
    surface: z.string().trim().min(1).max(100),
    translation: shortText(300),
    pos: shortText(40),
    lemma: shortText(100),
    notes: shortText(2000),
    status: STATUS,
  })
  .partial();


const NewText = z.object({
  language,
  title: z.string().max(300).default(''),
  body: z
    .string()
    .max(200_000)
    .refine((b) => /\p{L}/u.test(b), 'The text has no words in it'),
  url: z.string().url().nullish(),
});

const SettingsPatch = z
  .object({
    nativeLanguage: language,
    targetLanguage: language,
    levels: z.record(z.string(), z.enum(CEFR_LEVELS)),
    interests: z.array(z.string().max(40)).max(30),
    newCardsPerDay: z.number().int().min(0).max(200),
    onboarded: z.boolean(),
    reader: z
      .object({
        fontSize: z.number().min(12).max(40),
        lineHeight: z.number().min(1.2).max(2.6),
        theme: z.enum(['system', 'light', 'dark']),
        showSaved: z.boolean(),
        script: z.enum(['original', 'latn', 'cyrl']),
      })
      .partial(),
  })
  .partial();

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
};

export function createApp(db: DB, opts: AppOptions) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // Single-user v1: every request acts as the local user. Swap for real auth later.
  const userId = LOCAL_USER_ID;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/texts', (req, res) => {
    const lang = typeof req.query.language === 'string' && req.query.language ? req.query.language : undefined;
    res.json(listTexts(db, userId, lang));
  });

  const withGlossary = (t: Omit<TextDetail, 'glossary'>): TextDetail => ({
    ...t,
    glossary: glossaryFor(opts.content.dictionaries.get(t.language), t.body, t.language),
  });

  /** Languages that have bundled stories, with counts. */
  app.get('/api/languages', (_req, res) => {
    const rows = db
      .prepare(`SELECT language AS code, COUNT(*) AS stories FROM texts WHERE source_type = 'story' GROUP BY language ORDER BY language`)
      .all() as LanguageInfo[];
    res.json(rows);
  });

  app.get('/api/texts/:id', (req, res) => {
    const text = getText(db, userId, idParam(req));
    if (!text) throw new HttpError(404, 'Text not found');
    res.json(withGlossary(text));
  });

  app.post('/api/texts', (req, res) => {
    const input = parse(NewText, req.body);
    const firstLine = input.body.trim().split('\n')[0].slice(0, 80);
    const r = insertText(db, {
      userId,
      language: input.language,
      title: input.title || firstLine,
      body: input.body,
      sourceType: 'user',
      sourceName: input.url ? new URL(input.url).hostname : 'Pasted by you',
      license: 'Personal use — provided by you',
      url: input.url ?? null,
    });
    res.status(r.created ? 201 : 200).json(withGlossary(getText(db, userId, r.id)!));
  });

  app.get('/api/settings', (_req, res) => {
    res.json(getSettings(db, userId));
  });

  app.put('/api/settings', (req, res) => {
    res.json(saveSettings(db, userId, parse(SettingsPatch, req.body)));
  });

  /** Normalized keys of saved words in a language (reader "saved" style). Registered before /:id. */
  app.get('/api/words/keys', (req, res) => {
    const lang = parse(language, req.query.language);
    const rows = db
      .prepare('SELECT normalized_key AS key, status FROM words WHERE user_id = ? AND language = ?')
      .all(userId, lang) as SavedKey[];
    res.json(rows);
  });

  // ---- Library ----
  app.get('/api/words', (req, res) => {
    const lang = optionalLanguage(req.query.language);
    if (lang) parse(language, lang);
    const status = req.query.status ? parse(STATUS, req.query.status) : undefined;
    const sort = req.query.sort === 'alpha' ? 'alpha' : 'recent';
    res.json(listWords(db, userId, { language: lang, status, q: typeof req.query.q === 'string' ? req.query.q : undefined, sort }));
  });

  app.get('/api/words/export.csv', (req, res) => {
    const lang = optionalLanguage(req.query.language);
    if (lang) parse(language, lang);
    const words = listWords(db, userId, { language: lang, sort: 'recent' });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="glossa-${lang ?? 'all'}-${date}.csv"`);
    res.send(wordsToAnkiCsv(words));
  });

  /** Which of these keys are already in the library (finish-reading summary). */
  app.post('/api/words/lookup', (req, res) => {
    const body = parse(z.object({ language, keys: z.array(z.string().max(100)).max(1000) }), req.body);
    res.json(findByKeys(db, userId, body.language, body.keys));
  });

  app.post('/api/words/batch', (req, res) => {
    const body = parse(SaveWordsBody, req.body);
    if (body.textId !== null && !getText(db, userId, body.textId)) throw new HttpError(404, 'Text not found');
    res.json(saveWords(db, userId, body.language, body.textId, body.words));
  });

  /** Languages the learner has saved words in (study page picker). */
  app.get('/api/words/languages', (_req, res) => {
    res.json(db.prepare('SELECT language AS code, COUNT(*) AS words FROM words WHERE user_id = ? GROUP BY language ORDER BY COUNT(*) DESC').all(userId));
  });

  app.get('/api/words/:id', (req, res) => {
    const word = getWord(db, userId, idParam(req));
    if (!word) throw new HttpError(404, 'Word not found');
    res.json(word);
  });

  app.patch('/api/words/:id', (req, res) => {
    const result = updateWord(db, userId, idParam(req), parse(WordPatchBody, req.body));
    if (result === null) throw new HttpError(404, 'Word not found');
    if (result === 'conflict') throw new HttpError(409, 'That word is already in your library.');
    res.json(result);
  });

  app.delete('/api/words/:id', (req, res) => {
    if (!deleteWord(db, userId, idParam(req))) throw new HttpError(404, 'Word not found');
    res.status(204).end();
  });

  // ---- Study (flashcards, games, stats) ----
  const tz = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : 0;
  };
  const cardType = z.enum(['recognition', 'production']);

  app.get('/api/study/queue', (req, res) => {
    const lang = parse(language, req.query.language);
    const type = req.query.direction ? parse(cardType, req.query.direction) : 'recognition';
    const s = getSettings(db, userId);
    res.json(getQueue(db, userId, { language: lang, cardType: type, newLimit: s.newCardsPerDay, now: new Date(), tzOffset: tz(req.query.tz) }));
  });

  app.post('/api/study/review', (req, res) => {
    const body = parse(
      z.object({
        wordId: z.number().int().positive(),
        cardType: cardType.default('recognition'),
        grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        mode: z.enum(['flashcard', 'match', 'choice', 'cloze', 'spelling', 'scramble']).default('flashcard'),
      }),
      req.body,
    );
    const r = review(db, userId, { ...body, now: new Date() });
    if (!r) throw new HttpError(404, 'Word not found');
    res.json(r);
  });

  app.get('/api/study/pool', (req, res) => {
    const lang = parse(language, req.query.language);
    const n = Math.min(50, Math.max(1, Number(req.query.n ?? 12) || 12));
    res.json(gamePool(db, userId, lang, n, new Date()));
  });

  app.get('/api/stats', (req, res) => {
    const lang = optionalLanguage(req.query.language);
    if (lang) parse(language, lang);
    res.json(stats(db, userId, lang, new Date(), tz(req.query.tz)));
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
