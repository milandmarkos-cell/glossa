import { expect, test } from '@playwright/test';
import { openText, pressed, textId, word } from './helpers.ts';

/**
 * The core flow from the brief in Spanish, Serbian (Cyrillic) and Japanese (no spaces):
 * mark a word → every occurrence (every form of it) highlights → popover shows the dictionary entry →
 * finish → the dictionary form is in the library with its sentence → review it as a flashcard.
 */
const cases = [
  { language: 'es', title: 'El mercado del sábado', click: 'mercado', forms: ['mercado'], min: 4, gloss: 'market', saved: 'mercado' },
  { language: 'sr', title: 'Нова столица', click: 'столицу', forms: ['столицу', 'столица', 'столици', 'столице'], min: 11, gloss: 'chair', saved: 'столица' },
  { language: 'ja', title: '日曜日の公園', click: '公園', forms: ['公園'], min: 6, gloss: 'park', saved: '公園' },
];

for (const c of cases) {
  test(`core flow in ${c.language}: mark → highlight all forms → finish → library → flashcard`, async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    const id = await textId(request, c.language, c.title);
    await openText(page, id);

    await word(page, c.click).first().click();
    await expect(pressed(page)).toHaveCount(c.min);
    const marked = new Set(await pressed(page).allTextContents());
    for (const f of c.forms) expect(marked.has(f) || f === 'Столица').toBe(true);
    const bg = await word(page, c.click).last().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // Dictionary entry in the popover: instant, no API key.
    await expect(page.getByTestId('popover-translation')).toContainText(c.gloss);
    await expect(page.getByTestId('marked-count')).toHaveText('1 word marked');

    await page.getByRole('button', { name: 'Finish reading' }).click();
    await expect(page.getByTestId('finish-row')).toHaveCount(1);
    await expect(page.getByLabel('Word')).toHaveValue(c.saved);
    await expect(page.getByTestId('finish-translation')).toHaveValue(new RegExp(c.gloss));
    await page.getByRole('button', { name: 'Save 1 word' }).click();
    await expect(page.getByTestId('finish-done')).toContainText('Saved 1 word');

    await page.goto(`/library?language=${c.language}`);
    const card = page.locator(`[data-testid=library-word][data-word="${c.saved}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator('mark')).toHaveText(c.click); // the sentence it was found in, word highlighted

    // Back in the reader: saved style, marks cleared.
    await openText(page, id);
    await expect(pressed(page)).toHaveCount(0);
    await expect(word(page, c.click).first()).toHaveCSS('text-decoration-style', 'dotted');

    // Review it.
    await page.goto(`/study/flashcards?language=${c.language}&direction=recognition`);
    await expect(page.getByTestId('card-front')).toHaveText(c.saved);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('card-back')).toContainText(c.gloss);
    await page.keyboard.press('3'); // Good → next review tomorrow
    await expect(page.getByTestId('session-done')).toContainText('Session complete');
  });
}
