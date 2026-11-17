import { getLanguage } from './languages.ts';
import { normalizeKey } from './normalize.ts';

export interface Token {
  /** Index in the flat token list. */
  i: number;
  text: string;
  /** Char offsets into the full body. */
  start: number;
  end: number;
  /** Clickable word (letters present, not punctuation/whitespace/number). */
  word: boolean;
  /** Interned match-key id (word tokens only, else -1). */
  k: number;
  sentence: number;
  paragraph: number;
}

export interface Sentence {
  index: number;
  start: number;
  end: number;
  text: string;
  paragraph: number;
}

export interface Paragraph {
  index: number;
  start: number;
  end: number;
  /** Indices into `tokens` [first, last). */
  from: number;
  to: number;
}

export interface TokenizedText {
  language: string;
  body: string;
  tokens: Token[];
  sentences: Sentence[];
  paragraphs: Paragraph[];
  /** keys[k] is the match key string for key id k. */
  keys: string[];
  /** Number of word tokens. */
  wordCount: number;
}

export interface TokenizeOptions {
  /** Override match key (M6: lemma lookup). Receives the default normalized key. */
  keyFor?: (surface: string, normalized: string) => string;
}

const HAS_LETTER = /\p{L}/u;
// Elided clitic at word start: l', d', qu', j', n', s', c', m', t', dell', all', nell', sull'…
const ELISION = /^(\p{L}{1,4})(['’])(?=\p{L})/u;

const segmenterCache = new Map<string, { word: Intl.Segmenter; sentence: Intl.Segmenter }>();
function segmenters(locale: string) {
  let s = segmenterCache.get(locale);
  if (!s) {
    s = {
      word: new Intl.Segmenter(locale, { granularity: 'word' }),
      sentence: new Intl.Segmenter(locale, { granularity: 'sentence' }),
    };
    segmenterCache.set(locale, s);
  }
  return s;
}

/** Split body into paragraphs on blank lines, keeping char offsets. */
export function splitParagraphs(body: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /\n[ \t]*\n\s*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) out.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ start: last, end: body.length });
  // Trim leading/trailing whitespace inside each range.
  return out
    .map(({ start, end }) => {
      while (start < end && /\s/.test(body[start])) start++;
      while (end > start && /\s/.test(body[end - 1])) end--;
      return { start, end };
    })
    .filter((p) => p.end > p.start);
}

export function tokenize(body: string, language: string, opts: TokenizeOptions = {}): TokenizedText {
  const lang = getLanguage(language);
  const seg = segmenters(lang.locale);
  const tokens: Token[] = [];
  const sentences: Sentence[] = [];
  const paragraphs: Paragraph[] = [];
  const keyIds = new Map<string, number>();
  const keys: string[] = [];
  let wordCount = 0;

  const intern = (key: string) => {
    let id = keyIds.get(key);
    if (id === undefined) {
      id = keys.length;
      keys.push(key);
      keyIds.set(key, id);
    }
    return id;
  };

  const pushToken = (text: string, start: number, isWord: boolean, sentence: number, paragraph: number) => {
    let k = -1;
    if (isWord) {
      const norm = normalizeKey(text, lang.code);
      const key = opts.keyFor ? opts.keyFor(text, norm) : norm;
      if (key) {
        k = intern(key);
        wordCount++;
      } else isWord = false;
    }
    tokens.push({ i: tokens.length, text, start, end: start + text.length, word: isWord, k, sentence, paragraph });
  };

  splitParagraphs(body).forEach((p, pIndex) => {
    const pText = body.slice(p.start, p.end);
    const from = tokens.length;

    // Sentence boundaries within this paragraph.
    const sentStarts: number[] = [];
    for (const s of seg.sentence.segment(pText)) {
      const text = s.segment.trim();
      if (!text) continue;
      const lead = s.segment.length - s.segment.trimStart().length;
      const start = p.start + s.index + lead;
      sentStarts.push(start);
      sentences.push({ index: sentences.length, start, end: start + text.length, text, paragraph: pIndex });
    }
    const firstSentence = sentences.length - sentStarts.length;
    let sIdx = 0;

    for (const w of seg.word.segment(pText)) {
      const start = p.start + w.index;
      while (sIdx + 1 < sentStarts.length && start >= sentStarts[sIdx + 1]) sIdx++;
      const sentence = firstSentence + sIdx;
      const isWord = !!w.isWordLike && HAS_LETTER.test(w.segment);
      if (isWord && lang.splitElision) {
        const m = ELISION.exec(w.segment);
        if (m) {
          const clitic = m[1] + m[2];
          pushToken(clitic, start, true, sentence, pIndex);
          pushToken(w.segment.slice(clitic.length), start + clitic.length, true, sentence, pIndex);
          continue;
        }
      }
      pushToken(w.segment, start, isWord, sentence, pIndex);
    }
    paragraphs.push({ index: pIndex, start: p.start, end: p.end, from, to: tokens.length });
  });

  return { language: lang.code, body, tokens, sentences, paragraphs, keys, wordCount };
}

/** Context sentence for a token plus the token's char offset inside it. */
export function contextFor(t: TokenizedText, token: Token): { sentence: string; offset: number } {
  const s = t.sentences[token.sentence];
  if (!s) return { sentence: token.text, offset: 0 };
  return { sentence: s.text, offset: Math.max(0, token.start - s.start) };
}

/** All token indices sharing a key id. */
export function occurrences(t: TokenizedText, k: number): number[] {
  const out: number[] = [];
  for (const tok of t.tokens) if (tok.k === k) out.push(tok.i);
  return out;
}
