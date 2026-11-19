import { describe, expect, it } from 'vitest';
import { checkAnswer, hint, letters, scramble, shuffle } from '../../src/shared/answer.ts';

describe('checkAnswer (accent-tolerant)', () => {
  it('accepts exact answers regardless of case and stray punctuation', () => {
    expect(checkAnswer('Sartén', 'sartén', 'es')).toBe('exact');
    expect(checkAnswer('  sartén. ', 'sartén', 'es')).toBe('exact');
  });
  it('accepts missing accents but reports them', () => {
    expect(checkAnswer('sarten', 'sartén', 'es')).toBe('accents');
    expect(checkAnswer('nino', 'niño', 'es')).toBe('accents');
    expect(checkAnswer('cas', 'čaš', 'sr')).toBe('accents');
  });
  it('accepts Serbian in either script', () => {
    expect(checkAnswer('stolica', 'столица', 'sr')).toBe('exact');
    expect(checkAnswer('љубав', 'ljubav', 'sr')).toBe('exact');
  });
  it('rejects wrong or empty answers', () => {
    expect(checkAnswer('sartenes', 'sartén', 'es')).toBe('wrong');
    expect(checkAnswer('', 'sartén', 'es')).toBe('wrong');
    expect(checkAnswer('か', 'が', 'ja')).toBe('wrong'); // dakuten matters
  });
});

describe('hints, letters and scrambling', () => {
  it('reveals letters progressively', () => {
    expect(hint('sartén', 2, 'es')).toBe('sa····');
    expect(hint('a la vez', 1, 'es')).toBe('a ·· ···');
  });
  it('keeps combining accents with their letter', () => {
    expect(letters('Café', 'fr')).toEqual(['C', 'a', 'f', 'é']);
  });
  it('scrambles into a different order with the same letters', () => {
    for (const w of ['perro', 'sartén', 'ab']) {
      const s = scramble(w, 'es');
      expect(s.join('')).not.toBe(w);
      expect([...s].sort()).toEqual([...letters(w, 'es')].sort());
    }
    expect(scramble('aa', 'es')).toEqual(['a', 'a']);
  });
  it('shuffle keeps all items', () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
