import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { DB } from './db.ts';
import { LOCAL_USER_ID } from './db.ts';
import { getText, insertText, listTexts } from './repo/texts.ts';
import { getSettings, saveSettings } from './repo/settings.ts';
import { CEFR_LEVELS, isSupportedLanguage } from '../shared/languages.ts';
import type { SavedKey } from '../shared/types.ts';

export interface AppOptions {
  /** Whether an Anthropic API key is configured (AI features enabled). */
  aiEnabled: boolean;
  model: string;
}

const language = z.string().refine(isSupportedLanguage, 'Unsupported language');

const NewText = z.object({
  language,
  title: z.string().max(300).default(''),
  body: z.string().min(1).max(200_000),
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
    res.json({ ok: true, ai: opts.aiEnabled, model: opts.aiEnabled ? opts.model : null });
  });

  app.get('/api/texts', (req, res) => {
    const lang = typeof req.query.language === 'string' && req.query.language ? req.query.language : undefined;
    res.json(listTexts(db, userId, lang));
  });

  app.get('/api/texts/:id', (req, res) => {
    const text = getText(db, userId, idParam(req));
    if (!text) throw new HttpError(404, 'Text not found');
    res.json(text);
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
    res.status(r.created ? 201 : 200).json(getText(db, userId, r.id));
  });

  app.get('/api/settings', (_req, res) => {
    res.json(getSettings(db, userId));
  });

  app.put('/api/settings', (req, res) => {
    res.json(saveSettings(db, userId, parse(SettingsPatch, req.body)));
  });

  /** Normalized keys of saved words in a language (reader "saved" style). */
  app.get('/api/words/keys', (req, res) => {
    const lang = parse(language, req.query.language);
    const rows = db
      .prepare('SELECT normalized_key AS key, status FROM words WHERE user_id = ? AND language = ?')
      .all(userId, lang) as SavedKey[];
    res.json(rows);
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
