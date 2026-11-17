import { cyrToLat } from '../../shared/script.ts';

/** Web Speech API text-to-speech. Picks the best voice for the language; silently no-ops if unsupported. */
export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split('-')[0].toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    // Croatian/Bosnian voices read Serbian Latin well when no Serbian voice exists.
    (base === 'sr' ? voices.find((v) => /^(hr|bs)/i.test(v.lang)) : undefined)
  );
}

export function hasVoiceFor(lang: string): boolean {
  return ttsSupported() && pickVoice(lang) !== undefined;
}

export function speak(text: string, lang: string, rate = 0.9): void {
  if (!ttsSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(lang);
  // A Croatian/Bosnian fallback voice can't read Cyrillic: transliterate Serbian first.
  const spoken = voice && lang.startsWith('sr') && !voice.lang.toLowerCase().startsWith('sr') ? cyrToLat(text) : text;
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = lang;
  u.rate = rate;
  if (voice) u.voice = voice;
  synth.speak(u);
}
