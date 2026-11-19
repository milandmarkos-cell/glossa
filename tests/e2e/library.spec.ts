import { expect, test, type Page } from '@playwright/test';
import { MERCADO, openText, textId, word } from './helpers.ts';

/** Library card whose headword is exactly `w` (context sentences may mention other words). */
const cardFor = (page: Page, w: string) => page.locator(`[data-testid=library-word][data-word="${w}"]`);

test('finish summary: edit and remove words before saving; library edit/filter/delete/export', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await openText(page, await textId(request, 'es', MERCADO));
  for (const w of ['tomates', 'cebollas', 'nietos']) {
    await word(page, w).first().click();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Finish reading' }).click();
  await expect(page.getByTestId('finish-row')).toHaveCount(3);
  // Saved under the dictionary form, with the dictionary translation prefilled.
  await expect(page.getByLabel('Word').first()).toHaveValue('tomate');
  await expect(page.getByTestId('finish-translation').first()).toHaveValue('tomato');
  await page.getByTestId('finish-translation').first().fill('tomato (fruit)');
  await page.getByRole('button', { name: 'Remove nieto' }).click();
  await page.getByRole('button', { name: 'Save 2 words' }).click();
  await expect(page.getByTestId('finish-done')).toContainText('Saved 2 words');

  await page.goto('/library?language=es');
  await expect(cardFor(page, 'tomate')).toContainText('tomato (fruit)');
  await expect(cardFor(page, 'nieto')).toHaveCount(0);

  // search is accent/case-insensitive and also matches context sentences
  await page.getByLabel('Search library').fill('TOMATO (FRUIT)');
  await expect(page.getByTestId('library-word')).toHaveCount(1);
  await page.getByLabel('Search library').fill('');

  // edit
  const card = cardFor(page, 'cebolla');
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Translation').fill('onions');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card).toContainText('onions');

  // status + filter
  await card.getByLabel('Status of cebolla').selectOption('learning');
  await page.getByRole('button', { name: 'Learning' }).click();
  await expect(cardFor(page, 'cebolla')).toBeVisible();
  await expect(cardFor(page, 'tomate')).toHaveCount(0); // still 'new'
  await page.getByRole('button', { name: 'All' }).click();

  // export
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Export for Anki/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^glossa-es-\d{4}-\d{2}-\d{2}\.csv$/);

  // delete with confirmation
  await card.getByRole('button', { name: 'Delete cebolla' }).click();
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(cardFor(page, 'cebolla')).toHaveCount(0);
  await page.reload();
  await expect(cardFor(page, 'cebolla')).toHaveCount(0);
});

test('finishing with nothing marked explains what to do', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/read/${await textId(request, 'ja', '日曜日の公園')}/finish`);
  await expect(page.getByText(/didn't mark any words/)).toBeVisible();
});

test('the app needs no API key: nothing key-like is served', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (r) => {
    if (/\.(js|css|html)$|\/$/.test(new URL(r.url()).pathname)) bodies.push(await r.text().catch(() => ''));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(bodies.length).toBeGreaterThan(0);
  for (const b of bodies) expect(b).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}|ANTHROPIC/);
});
