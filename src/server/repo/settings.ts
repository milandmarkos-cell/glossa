import type { DB } from '../db.ts';
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '../../shared/types.ts';

export function getSettings(db: DB, userId: number): Settings {
  const row = db.prepare('SELECT json FROM settings WHERE user_id = ?').get(userId) as { json: string } | undefined;
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  const stored = JSON.parse(row.json) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored, reader: { ...DEFAULT_SETTINGS.reader, ...stored.reader } };
}

export function saveSettings(db: DB, userId: number, patch: SettingsPatch): Settings {
  const current = getSettings(db, userId);
  const next: Settings = { ...current, ...patch, reader: { ...current.reader, ...patch.reader } };
  db.prepare(
    `INSERT INTO settings (user_id, json, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
  ).run(userId, JSON.stringify(next));
  return next;
}
