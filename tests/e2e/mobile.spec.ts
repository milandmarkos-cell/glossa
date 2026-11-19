import { expect, test } from '@playwright/test';
import { openText, pressed, textId, word } from './helpers.ts';

test('phone: tap marks a word, bottom sheet opens, no horizontal scroll', async ({ page, request }) => {
  await openText(page, await textId(request, 'ja'));
  await word(page, 'ポチ').first().tap();
  await expect(pressed(page)).toHaveCount(4);
  const sheet = page.getByTestId('word-popover');
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.y + box.height)).toBe(vp.height); // docked to the bottom
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.waitForTimeout(600); // two instant taps are a double-tap, which is deliberately ignored
  await word(page, 'ポチ').first().tap();
  await expect(pressed(page)).toHaveCount(0);

  for (const path of ['/', '/library']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});
