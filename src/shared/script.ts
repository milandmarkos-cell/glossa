/** Serbian Cyrillic ↔ Latin transliteration (Gaj's Latin alphabet, 1:1 except lj/nj/dž digraphs). */

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

const LAT_TO_CYR: Record<string, string> = Object.fromEntries(
  Object.entries(CYR_TO_LAT).map(([c, l]) => [l, c]),
);

const CYR_RE = /[Ѐ-ӿ]/;

export function hasCyrillic(s: string): boolean {
  return CYR_RE.test(s);
}

function matchCase(src: string, out: string): string {
  if (src === src.toLowerCase()) return out;
  // Upper-case source: all caps if the following char is also upper ("ЉУБАВ" → "LJUBAV"), else title ("Љубав" → "Ljubav")
  return out.length > 1 ? out[0].toUpperCase() + out.slice(1) : out.toUpperCase();
}

export function cyrToLat(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const lat = CYR_TO_LAT[lower];
    if (lat === undefined) {
      out += ch;
      continue;
    }
    if (ch !== lower) {
      const next = text[i + 1];
      const allCaps = next !== undefined && next !== next.toLowerCase();
      out += allCaps ? lat.toUpperCase() : matchCase(ch, lat);
    } else {
      out += lat;
    }
  }
  return out;
}

export function latToCyr(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    const twoLower = two.toLowerCase();
    if (twoLower.length === 2 && (twoLower === 'lj' || twoLower === 'nj' || twoLower === 'dž')) {
      const cyr = LAT_TO_CYR[twoLower];
      out += two[0] !== two[0].toLowerCase() ? cyr.toUpperCase() : cyr;
      i++;
      continue;
    }
    const ch = text[i];
    const lower = ch.toLowerCase();
    const cyr = LAT_TO_CYR[lower];
    if (cyr === undefined) out += ch;
    else out += ch !== lower ? cyr.toUpperCase() : cyr;
  }
  return out;
}

export type DisplayScript = 'original' | 'latn' | 'cyrl';

export function toScript(text: string, script: DisplayScript): string {
  if (script === 'latn') return cyrToLat(text);
  if (script === 'cyrl') return latToCyr(text);
  return text;
}
