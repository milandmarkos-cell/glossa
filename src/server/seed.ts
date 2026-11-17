import type { DB } from './db.ts';
import { insertText } from './repo/texts.ts';
import { SAMPLES, SAMPLE_LICENSE } from './samples.ts';

/** Idempotent: insertText dedupes on content hash. */
export function seedSamples(db: DB): number {
  let created = 0;
  for (const s of SAMPLES) {
    const r = insertText(db, {
      userId: null,
      language: s.language,
      title: s.title,
      body: s.body,
      level: s.level,
      topics: s.topics,
      sourceType: 'sample',
      sourceName: 'Glossa sample texts',
      author: 'Glossa',
      license: SAMPLE_LICENSE,
      url: null,
    });
    if (r.created) created++;
  }
  return created;
}
