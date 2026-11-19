import { expect, test } from '@playwright/test';
import { MERCADO, openText, pressed, textId, word } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
});

test('click again unmarks; other occurrence opens popover; Unmark button', async ({ page, request }) => {
  await openText(page, await textId(request, 'es', MERCADO));
  const queso = word(page, 'queso');
  await queso.first().click();
  await expect(pressed(page)).toHaveCount(3);
  await queso.first().click(); // same word, popover open → unmark
  await expect(pressed(page)).toHaveCount(0);
  await expect(page.getByTestId('word-popover')).toBeHidden();

  await queso.first().click();
  await page.keyboard.press('Escape');
  await queso.nth(1).click(); // another occurrence of a marked word → popover, still marked
  await expect(page.getByTestId('word-popover')).toBeVisible();
  await expect(pressed(page)).toHaveCount(3);
  await page.getByTestId('word-popover').getByRole('button', { name: 'Unmark' }).click();
  await expect(pressed(page)).toHaveCount(0);
});

test('double-click does not undo its own mark or select text', async ({ page, request }) => {
  await openText(page, await textId(request, 'es', MERCADO));
  await word(page, 'queso').first().dblclick();
  await expect(pressed(page)).toHaveCount(3);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
});

test('keyboard: arrows move by word, Enter marks, Escape closes; one tab stop', async ({ page, request }) => {
  await openText(page, await textId(request, 'es', MERCADO));
  await expect(page.locator('[data-testid=passage] [tabindex="0"]')).toHaveCount(1);
  await word(page, 'Todos').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(word(page, 'sábados')).toBeFocused();
  await page.keyboard.press('Enter');
  // sábados and sábado share a dictionary form, so both highlight.
  await expect.poll(async () => [...new Set(await pressed(page).allTextContents())]).toEqual(['sábados', 'sábado']);
  await expect(page.getByTestId('word-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('word-popover')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(word(page, 'El').first()).toBeFocused();
});

test('marks survive a reload until the text is finished', async ({ page, request }) => {
  await openText(page, await textId(request, 'es', MERCADO));
  await word(page, 'naranja').click();
  await page.reload();
  await expect(pressed(page)).toHaveText(['naranjas', 'naranja']); // all forms of naranja
  await expect(page.getByTestId('marked-count')).toHaveText('1 word marked');
});

test('right-to-left text (pasted Arabic) renders RTL and highlights all occurrences', async ({ page, request }) => {
  const res = await request.post('/api/texts', { data: { language: 'ar', title: 'المكتبة', body: 'تذهب سارة إلى المكتبة. المكتبة قريبة من بيتها، والمكتبة جميلة.' } });
  await openText(page, (await res.json()).id);
  await expect(page.getByTestId('passage')).toHaveAttribute('dir', 'rtl');
  await word(page, 'المكتبة').first().click();
  await expect(pressed(page)).toHaveCount(2); // والمكتبة (with the "and" prefix) is a different token
});

test('Serbian script toggle changes display, keeps marks', async ({ page, request }) => {
  await openText(page, await textId(request, 'sr', 'Нова столица'));
  await word(page, 'столицу').first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Aa' }).click();
  await page.getByRole('button', { name: 'Latinica' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('h1')).toHaveText('Nova stolica');
  await expect(pressed(page).first()).toHaveText('stolicu');
  await expect(pressed(page)).toHaveCount(11); // every form of столица
  // reset for other tests
  await page.getByRole('button', { name: 'Aa' }).click();
  await page.getByRole('button', { name: 'Original' }).click();
});

test('reader settings: font size and dark theme apply and persist', async ({ page, request }) => {
  await openText(page, await textId(request, 'es', MERCADO));
  await page.getByRole('button', { name: 'Aa' }).click();
  await page.getByRole('button', { name: 'Increase' }).first().click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.getByTestId('passage')).toHaveCSS('font-size', '22px');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByTestId('passage')).toHaveCSS('font-size', '22px');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Aa' }).click();
  await page.getByRole('button', { name: 'Decrease' }).first().click();
  await page.getByRole('button', { name: 'System' }).click();
});

test('home lists stories by level and topic; every text shows its source and license', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('text-card')).toHaveCount(24);
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: 'C2' }).click();
  await expect(page.getByTestId('text-card')).toHaveCount(4);
  await page.getByRole('group', { name: 'Topic' }).getByRole('button', { name: 'Technology' }).click();
  await expect(page.getByTestId('text-card')).toHaveCount(1);
  await expect(page).toHaveURL(/level=C2/);
  await page.goto('/');
  await page.goto('/');
  for (const lang of ['es', 'sr', 'ja']) {
    await page.getByLabel('Learning').selectOption(lang);
    await expect(page.getByTestId('attribution').first()).toContainText('License:');
  }
  await page.getByLabel('Learning').selectOption('es');
});

test('marking stays under 100 ms on a 3,000+ word text', async ({ page, request }) => {
  const vocab = 'el gato negro duerme en la casa grande mientras la lluvia cae sobre el tejado y los niños juegan con una pelota roja cerca del río'.split(' ');
  const paras: string[] = [];
  for (let p = 0; p < 40; p++) {
    const sents = Array.from({ length: 6 }, (_, s) => Array.from({ length: 14 }, (_, i) => vocab[(p * 7 + s * 3 + i * 5) % vocab.length]).join(' ') + '.');
    paras.push(sents.join(' '));
  }
  const res = await request.post('/api/texts', { data: { language: 'es', title: 'Long text', body: paras.join('\n\n') } });
  const text = await res.json();
  expect(text.wordCount).toBeGreaterThanOrEqual(3000);
  await openText(page, text.id);
  const timings = await page.evaluate(async () => {
    const spans = [...document.querySelectorAll<HTMLElement>('[data-testid=passage] .w')];
    const out: number[] = [];
    for (const i of [10, 1000, 2000, 3000]) {
      const t0 = performance.now();
      spans[i].click();
      getComputedStyle(spans[i]).backgroundColor;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(performance.now() - t0);
    }
    return out;
  });
  for (const t of timings) expect(t).toBeLessThan(100);
});

test('pasting a text opens it in the reader; empty text is rejected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Paste your own text/ }).click();
  await page.getByTestId('paste-body').fill('Hoy es lunes. Mañana es martes.');
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page).toHaveURL(/\/read\/\d+$/);
  await expect(word(page, 'lunes')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: /Paste your own text/ }).click();
  await page.getByTestId('paste-body').fill('123 !!!');
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByText(/no words/)).toBeVisible();
});
