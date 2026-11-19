import { expect, test } from '@playwright/test';
import { openText, pressed, textId, word } from './helpers.ts';

/**
 * The core flow from the brief, in three languages (incl. Cyrillic and a non-space-separated script):
 * mark a word → every occurrence highlights → finish → word is in the library with its context.
 */
const cases = [
  { language: 'es', word: 'mercado', occurrences: 4 },
  { language: 'sr', word: 'столицу', occurrences: 5 },
  { language: 'ja', word: '公園', occurrences: 6 },
];

for (const c of cases) {
  test(`core flow in ${c.language}: mark → highlight all → finish → library`, async ({ page, request }) => {
    const id = await textId(request, c.language);
    await openText(page, id);

    await word(page, c.word).first().click();
    await expect(pressed(page)).toHaveCount(c.occurrences);
    for (const el of await pressed(page).all()) await expect(el).toHaveText(c.word);
    // highlight is a real visual change, not just an attribute
    const bg = await word(page, c.word).last().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // popover shows the (fake) translation fetched lazily in the background
    await expect(page.getByTestId('popover-translation')).toContainText(`‹${c.word.toLowerCase()}›`);
    await expect(page.getByTestId('marked-count')).toHaveText('1 word marked');

    await page.getByRole('button', { name: 'Finish reading' }).click();
    await expect(page.getByTestId('finish-row')).toHaveCount(1);
    await expect(page.getByTestId('finish-translation')).toHaveValue(`‹${c.word.toLowerCase()}›`);
    await page.getByRole('button', { name: 'Save 1 word' }).click();
    await expect(page.getByTestId('finish-done')).toContainText('Saved 1 word');

    await page.getByRole('link', { name: 'Open library' }).click();
    const card = page.getByTestId('library-word').filter({ hasText: c.word });
    await expect(card).toHaveCount(1);
    await expect(card.locator('mark')).toHaveText(c.word); // context sentence with the word highlighted

    // back in the reader the saved word gets the subtle "saved" style, and marks are cleared
    await openText(page, id);
    await expect(pressed(page)).toHaveCount(0);
    await expect(word(page, c.word).first()).toHaveCSS('text-decoration-style', 'dotted');
  });
}
