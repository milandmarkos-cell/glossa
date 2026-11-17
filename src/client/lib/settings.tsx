import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type ReaderPrefs, type Settings, type SettingsPatch } from '../../shared/types.ts';
import { api } from './api.ts';

interface SettingsCtx {
  settings: Settings;
  loaded: boolean;
  update: (patch: SettingsPatch) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

function applyTheme(theme: ReaderPrefs['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then(setSettings)
      .catch(() => {}) // offline/dev without server: defaults still work
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    applyTheme(settings.reader.theme);
    if (settings.reader.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.reader.theme]);

  // Optimistic: apply locally right away, persist in the background.
  const update = useCallback<SettingsCtx['update']>((patch) => {
    setSettings((s) => ({ ...s, ...patch, reader: { ...s.reader, ...patch.reader } }));
    api.saveSettings(patch).catch((e) => console.warn('Saving settings failed', e));
  }, []);

  return <Ctx.Provider value={{ settings, loaded, update }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
