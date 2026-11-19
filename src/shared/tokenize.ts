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
// URLs and email addresses are never vocabulary: their segments are made non-clickable.
const URL_OR_EMAIL = /\b(?:https?:\/\/|www\.)[^\s<>"«»]+[^\s<>"«».,;:!?)\]]|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

// Japanese: ICU often splits a kanji stem from its okurigana (飲|み|ます, 持|って|い|ます).
// Re-attach following hiragana to a kanji-only token unless the hiragana is a particle,
// copula or honorific (日曜日|の stays split).
const KANJI_ONLY = /^[\p{Script=Han}々〆]+$/u;
const HIRAGANA_ONLY = /^\p{Script=Hiragana}+$/u;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const JA_STOP = new Set([
  'は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'や', 'か', 'ね', 'よ', 'な', 'から', 'まで', 'より',
  'だけ', 'など', 'ぐらい', 'くらい', 'ので', 'のに', 'けど', 'けれど', 'には', 'では', 'とは', 'でも',
  'です', 'でした', 'だ', 'だった', 'でしょう', 'じゃ', 'さん', 'ちゃん', 'くん', 'さま', 'ごろ', 'ずつ',
]);

interface Seg {
  text: string;
  index: number; // offset within paragraph
  word: boolean;
  merged?: boolean;
}

const MASU = new Set(['ます', 'ました', 'ません', 'ましょう', 'まして', 'ませんでした']);
// Inflection endings that may follow an okurigana stem (飲み|ます, 持っ|て|い|ます).
const AUX = new Set([
  ...MASU, 'て', 'た', 'だ', 'い', 'いる', 'います', 'いました', 'いません', 'ている', 'ていた', 'ていて', 'てい', 'ていま',
  'ない', 'なかった', 'たい', 'たく', 'る', 'り', 'く', 'くて', 'かった', 'そう', 'れる', 'られる', 'ん', 'んで', 'んだ',
]);

const adjacent = (a: Seg, b: Seg) => b.index === a.index + a.text.length;

function mergeJapanese(input: Seg[]): Seg[] {
  // 1. Runs of single hiragana characters are a word ICU didn't know (ゆ|い → ゆい, く|れ → くれ).
  const segs: Seg[] = [];
  for (const sg of input) {
    const prev = segs[segs.length - 1];
    // Same script only: a hiragana run or a katakana run (コ|ロ → コロ).
    const script = (x: Seg) => (HIRAGANA_ONLY.test(x.text) ? 'h' : KANA_ONLY.test(x.text) ? 'k' : '');
    const single = (x: Seg) => x.word && x.text.length === 1 && script(x) !== '' && !JA_STOP.has(x.text);
    if (prev && single(sg) && adjacent(prev, sg) && prev.word && script(prev) === script(sg) && !JA_STOP.has(prev.text) && (prev.text.length === 1 || prev.merged)) {
      prev.text += sg.text;
      prev.merged = true;
    } else segs.push({ ...sg });
  }
  // 2. Single-kanji verb/adjective stem + okurigana (飲|み → 飲み, 持|って → 持って), then inflection endings.
  //    Only single kanji: compounds (一人, 計画) are complete words and what follows them is separate.
  // 3. Polite ます endings attach to the preceding word.
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const cur = { ...segs[i] };
    if (cur.word && KANJI_ONLY.test(cur.text) && [...cur.text].length === 1) {
      const first = segs[i + 1];
      const okurigana = (x: Seg | undefined): x is Seg =>
        !!x && x.word && HIRAGANA_ONLY.test(x.text) && !JA_STOP.has(x.text) && adjacent(cur, x) && ([...x.text].length <= 2 || AUX.has(x.text));
      if (okurigana(first)) {
        cur.text += first.text;
        i++;
        while (i + 1 < segs.length) {
          const nx = segs[i + 1];
          if (!nx.word || !AUX.has(nx.text) || !adjacent(cur, nx)) break;
          cur.text += nx.text;
          i++;
        }
      }
    }
    const prev = out[out.length - 1];
    if (prev && cur.word && prev.word && adjacent(prev, cur)) {
      const joins =
        // polite endings: 行き|ます
        (MASU.has(cur.text) && !JA_STOP.has(prev.text)) ||
        // ICU splits ました as ま|した (話しま|した, ありま|した)
        (prev.text.endsWith('ま') && ['した', 'す', 'せん', 'しょう', 'して'].includes(cur.text)) ||
        // a small っ can't start a word: だ|った, しか|った
        (cur.text.startsWith('っ') && HIRAGANA_ONLY.test(cur.text));
      if (joins) {
        prev.text += cur.text;
        continue;
      }
    }
    out.push(cur);
  }
  return out;
}

function urlRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(URL_OR_EMAIL)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}
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

    const urls = urlRanges(pText);
    const inUrl = (i: number) => urls.some(([a, b]) => i >= a && i < b);
    let segs: Seg[] = Array.from(seg.word.segment(pText), (w) => ({
      text: w.segment,
      index: w.index,
      word: !!w.isWordLike && HAS_LETTER.test(w.segment) && !inUrl(w.index),
    }));
    if (lang.code === 'ja') segs = mergeJapanese(segs);

    for (const w of segs) {
      const start = p.start + w.index;
      while (sIdx + 1 < sentStarts.length && start >= sentStarts[sIdx + 1]) sIdx++;
      const sentence = firstSentence + sIdx;
      if (w.word && lang.splitElision) {
        const m = ELISION.exec(w.text);
        if (m) {
          const clitic = m[1] + m[2];
          pushToken(clitic, start, true, sentence, pIndex);
          pushToken(w.text.slice(clitic.length), start + clitic.length, true, sentence, pIndex);
          continue;
        }
      }
      pushToken(w.text, start, w.word, sentence, pIndex);
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
