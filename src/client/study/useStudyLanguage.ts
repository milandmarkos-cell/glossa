import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api.ts';
import { useSettings } from '../lib/settings.tsx';

/** Language to study: ?language=, else the learner's target language, else whichever has saved words. */
export function useStudyLanguage() {
  const [params] = useSearchParams();
  const { settings, loaded } = useSettings();
  const [available, setAvailable] = useState<{ code: string; words: number }[] | null>(null);

  useEffect(() => {
    api.wordLanguages().then(setAvailable, () => setAvailable([]));
  }, []);

  const fromUrl = params.get('language');
  let language: string | null = fromUrl;
  if (!language && loaded && available) {
    language = available.some((l) => l.code === settings.targetLanguage) ? settings.targetLanguage : (available[0]?.code ?? settings.targetLanguage);
  }
  return { language, available, ready: loaded && available !== null };
}
