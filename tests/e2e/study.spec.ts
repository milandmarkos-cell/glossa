import { expect, test } from '@playwright/test';
import { markAndSave, openText, textId } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

test('review hub, flashcards (again repeats in-session), and every game', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await openText(page, await textId(request, 'es', 'El partido del domingo'));
  await markAndSave(page, ['equipo', 'baloncesto', 'entrenador', 'balón', 'canastas', 'público', 'polideportivo', 'deporte']);

  // Hub
  await page.goto('/study?language=es');
  await expect(page.getByTestId('deck-recognition')).toContainText('new');
  await expect(page.getByTestId('stats')).toContainText('Words');

  // Flashcards: Again keeps the card in the session; Good finishes it.
  await page.getByTestId('deck-recognition').click();
  await expect(page.getByTestId('card-front')).toBeVisible();
  const before = Number((await page.getByTestId('remaining').innerText()).split(' ')[0]);
  const saved = () => page.waitForResponse((r) => r.url().includes('/api/study/review') && r.ok());
  await page.keyboard.press('Space');
  let review = saved();
  await page.getByRole('button', { name: /^Again/ }).click();
  await review;
  await expect(page.getByTestId('remaining')).toHaveText(`${before} left`); // the failed card stays in the session
  for (let i = 0; i < before + 2 && !(await page.getByTestId('session-done').isVisible()); i++) {
    await expect(page.getByTestId('card-back')).toBeHidden();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('card-back')).toBeVisible();
    review = saved();
    await page.keyboard.press('3');
    await review; // next card (or the end) is rendered once the answer is saved
  }
  await expect(page.getByTestId('session-done')).toContainText('Session complete');

  await page.goto('/study?language=es');
  await expect(page.getByTestId('stats')).toContainText('Day streak');
  await expect(page.getByTestId('stats')).toContainText('1 🔥');

  // Match pairs
  await page.goto('/study/match?language=es');
  await page.getByTestId('match-word').first().waitFor();
  for (const id of await page.getByTestId('match-word').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.id))) {
    await page.locator(`[data-testid=match-word][data-id="${id}"]`).click();
    await page.locator(`[data-testid=match-meaning][data-id="${id}"]`).click();
  }
  await expect(page.getByTestId('game-results')).toContainText('100%');

  // Multiple choice: answer everything right
  await page.goto('/study/choice?language=es');
  for (let i = 0; i < 12 && !(await page.getByTestId('game-results').isVisible()); i++) {
    await page.locator('[data-testid=choice-option][data-correct=true]').click();
    await page.waitForTimeout(800);
  }
  await expect(page.getByTestId('game-results')).toContainText('100%');

  // Fill the gap: give up on one, accent-less answer accepted with a note
  await page.goto('/study/cloze?language=es');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByTestId('type-feedback')).toContainText('The answer is');

  // Spelling and scramble load
  await page.goto('/study/spelling?language=es');
  await expect(page.getByTestId('type-input')).toBeVisible();
  await page.goto('/study/scramble?language=es');
  await expect(page.getByTestId('scramble-tile').first()).toBeVisible();
});

test('letter scramble is not offered for Japanese', async ({ page }) => {
  await page.goto('/study/scramble?language=ja');
  await expect(page.getByText(/isn't available for Japanese/)).toBeVisible();
});
