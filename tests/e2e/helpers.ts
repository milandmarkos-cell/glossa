import type { APIRequestContext, Page } from '@playwright/test';

export async function textId(request: APIRequestContext, language: string): Promise<number> {
  const texts = (await (await request.get(`/api/texts?language=${language}`)).json()) as { id: number; sourceType: string }[];
  const sample = texts.find((t) => t.sourceType === 'sample') ?? texts[0];
  if (!sample) throw new Error(`no text for ${language}`);
  return sample.id;
}

export async function openText(page: Page, id: number) {
  await page.goto(`/read/${id}`);
  await page.locator('[data-testid=passage] .w').first().waitFor();
}

/** All word spans whose text is exactly `word`. */
export const word = (page: Page, w: string) => page.locator('[data-testid=passage] .w', { hasText: new RegExp(`^${w}$`) });
export const pressed = (page: Page) => page.locator('[data-testid=passage] .w[aria-pressed="true"]');
