import type { APIRequestContext, Page } from '@playwright/test';

/** Id of a bundled story by language and title (or the first story in that language). */
export async function textId(request: APIRequestContext, language: string, title?: string): Promise<number> {
  const texts = (await (await request.get(`/api/texts?language=${language}`)).json()) as { id: number; title: string; sourceType: string }[];
  const t = texts.find((x) => x.sourceType === 'story' && (!title || x.title === title));
  if (!t) throw new Error(`no story for ${language} ${title ?? ''}`);
  return t.id;
}

export async function openText(page: Page, id: number) {
  await page.goto(`/read/${id}`);
  await page.locator('[data-testid=passage] .w').first().waitFor();
}

/** All word spans whose text is exactly `w`. */
export const word = (page: Page, w: string) => page.locator('[data-testid=passage] .w', { hasText: new RegExp(`^${w}$`) });
export const pressed = (page: Page) => page.locator('[data-testid=passage] .w[aria-pressed="true"]');

/** Mark words (closing each popover) and save them via the summary page. */
export async function markAndSave(page: Page, words: string[]) {
  for (const w of words) {
    await word(page, w).first().click();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Finish reading' }).click();
  await page.getByRole('button', { name: /^Save \d+ words?$/ }).click();
  await page.getByTestId('finish-done').waitFor();
}

export const MERCADO = 'El mercado del sábado';
