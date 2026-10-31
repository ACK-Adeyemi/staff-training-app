// Shared helpers for the self-guided tour specs (M5 chunk 12, F-3, BP-1).
import { expect, type Locator, type Page } from '@playwright/test';

/** The tour box: an aside whose accessible name carries the step counter. */
export const overlay = (page: Page, n: number, m: number): Locator =>
  page.getByRole('complementary', { name: `Tour, step ${n} of ${m}` });
export const anyOverlay = (page: Page): Locator => page.getByRole('complementary', { name: /^Tour, / });
export const demoMenu = (page: Page): Locator => page.getByRole('dialog', { name: 'Demo menu' });

/** From D1: press the tour button, confirm "This resets the demo", and land on step 1. */
export async function startTour(page: Page, button: 'Client tour' | 'Provider tour', m: number): Promise<void> {
  await page.goto('./');
  await expect(anyOverlay(page)).toHaveCount(0); // the landing page keeps the box out of the way
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog', { name: 'Start the tour from the beginning?' });
  await expect(dialog).toContainText('This resets the demo');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(overlay(page, 1, m)).toBeVisible();
  await expect(overlay(page, 1, m).getByText(`Step 1 of ${m}`, { exact: true })).toBeVisible();
}

/** Presses Next (never Show me) until the box says step n of m. Tours only move when Next is pressed. */
export async function advanceTo(page: Page, n: number, m: number): Promise<void> {
  for (let i = 1; i < n; i++) await overlay(page, i, m).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(overlay(page, n, m)).toBeVisible();
}

export async function showMe(page: Page, n: number, m: number): Promise<void> {
  await overlay(page, n, m).getByRole('button', { name: 'Show me' }).click();
}

export async function openDemoMenu(page: Page): Promise<void> {
  await page.getByTestId('demo-badge').click();
  await expect(demoMenu(page)).toBeVisible();
}

/** The overlay must not push the page sideways or leave its buttons smaller than 44px. */
export async function expectOverlayUsable(page: Page, n: number, m: number): Promise<void> {
  const box = overlay(page, n, m);
  const r = await box.boundingBox();
  const vp = page.viewportSize();
  expect(r, 'overlay has a box').not.toBeNull();
  expect(r?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((r?.x ?? 0) + (r?.width ?? 0)).toBeLessThanOrEqual((vp?.width ?? 0) + 1);
  expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual((vp?.height ?? 0) + 1);
  for (const b of await box.getByRole('button').all()) {
    const bb = await b.boundingBox();
    expect(bb?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    expect(bb?.width ?? 0).toBeGreaterThanOrEqual(43.5);
  }
}
