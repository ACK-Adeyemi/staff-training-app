// M3 chunk 19b (BP-7, F-4, F-5): themes on phone and desktop. Written before the implementation. UI contract:
// apps/web/src/pages/client/themes.test.tsx (C17 page) and apps/web/src/app/themeApplication.test.tsx (CSS variables
// --theme-primary, --theme-accent, --theme-tint and --theme-radius set on the html element). The clock is pinned at
// Monday 19 October 2026 09:00 UTC as the seeded Track A does; Fast-forward 30 + 7 + 7 days is 2 December, and a further
// 30 + 7 is 8 January.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

async function start(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  await page.goto('./');
}
async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}
async function fastForward(page: Page, ...steps: (30 | 7)[]) {
  for (const days of steps) {
    await page.keyboard.press('Shift+Alt+KeyP');
    await panel(page)
      .getByRole('button', { name: `Fast-forward ${days} days` })
      .click();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
  }
}
async function noSeriousAxe(page: Page) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
async function expectTouchTarget(...targets: ReturnType<Page['locator']>[]) {
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  }
}
const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n).trim().toLowerCase(), name);
const hexBox = (page: Page, group: string) => page.getByRole('group', { name: group }).getByRole('textbox');
async function setHex(page: Page, group: string, value: string) {
  await hexBox(page, group).fill(value);
}

const GREEN = '#1f6b3a';
const CHRISTMAS = '#b3202a';
const SPRING = '#2f7d32';

test('a theme that fails contrast is refused with the failing pairs listed, and nothing is saved', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/themes');
  await expect(page.getByRole('heading', { level: 1, name: 'Themes' })).toBeVisible();
  await expect(page.getByTestId('saved-count')).toHaveText('2 of 5 saved themes');
  await noSeriousAxe(page);

  await page.getByLabel('Theme name').fill('Too pale');
  await setHex(page, 'Main colour', '#ffee88');
  await setHex(page, 'Accent colour', '#ffff99');
  await setHex(page, 'Background tint', '#f3f7fb');
  const rows = page.getByTestId('contrast-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText('Fails');
  await expectTouchTarget(page.getByRole('button', { name: 'Save theme' }));
  await page.getByRole('button', { name: 'Save theme' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Button text on the main colour');
  await expect(alert).toContainText('Main colour on the page background');
  await expect(alert).toContainText('Accent colour on the page background');
  await expect(alert).not.toContainText('Text on the background tint');
  await expect(page.getByTestId('saved-count')).toHaveText('2 of 5 saved themes');

  // Fixing the colours saves it.
  await setHex(page, 'Main colour', '#1f5fa8');
  await setHex(page, 'Accent colour', '#0b7a5c');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByTestId('saved-count')).toHaveText('3 of 5 saved themes');
  await expect(page.getByRole('region', { name: 'Your themes' }).getByText('Too pale')).toBeVisible();
});

test('using a ready-made theme changes the staff app colours', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/themes');
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(GREEN);
  await page.getByRole('region', { name: 'Ready-made themes' }).getByRole('button', { name: 'Use Spring' }).click();
  await expect(page.getByRole('region', { name: 'Your themes' }).getByText('Spring')).toBeVisible();
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(SPRING);

  await page.goto('./');
  await jumpTo(page, /Jade/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(SPRING);
  await expect.poll(() => cssVar(page, '--theme-radius')).toBe('8px');
});

test('Fast-forward to 2 December turns the scheduled Christmas theme on and 8 January turns it off', async ({
  page,
}) => {
  await start(page);
  await jumpTo(page, /Jade/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(GREEN);

  await fastForward(page, 30, 7, 7);
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(CHRISTMAS);

  await fastForward(page, 30, 7);
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(GREEN);
});

test('the theme list shows the schedule and the scheduled theme reaches the admin app', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/themes');
  await expect(page.getByRole('region', { name: 'Your themes' })).toContainText('Shows 1 Dec 2026 to 6 Jan 2027');
  await fastForward(page, 30, 7, 7);
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(CHRISTMAS);
});

test('dark mode and high contrast ignore theme colours but keep the corner style', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/themes');
  await page.getByRole('button', { name: 'Edit Little Acorns green' }).click();
  await page.getByRole('radio', { name: 'Large' }).check();
  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect.poll(() => cssVar(page, '--theme-radius')).toBe('16px');
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(GREEN);

  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/me/display');
  await expect(page.getByRole('heading', { level: 1, name: 'Display and accessibility' })).toBeVisible();
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(GREEN);

  await page.getByRole('radiogroup', { name: 'Colour mode' }).getByRole('radio', { name: 'Dark' }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-colour-mode'))).toBe('dark');
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe('');
  await expect.poll(() => cssVar(page, '--theme-radius')).toBe('16px');

  await page.getByRole('radiogroup', { name: 'Colour mode' }).getByRole('radio', { name: 'Light' }).check();
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe(GREEN);
  await page.getByRole('radiogroup', { name: 'Contrast' }).getByRole('radio', { name: 'High' }).check();
  await expect.poll(() => cssVar(page, '--theme-primary')).toBe('');
  await expect.poll(() => cssVar(page, '--theme-radius')).toBe('16px');
  await noSeriousAxe(page);
});

test('the saved themes limit is explained when the package is full', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/themes');
  // Little Acorns keeps 2 and may keep 5: three more fill it, the sixth is refused.
  for (const name of ['Room one', 'Room two', 'Room three']) {
    await page.getByLabel('Theme name').fill(name);
    await setHex(page, 'Main colour', '#1f5fa8');
    await setHex(page, 'Accent colour', '#0b7a5c');
    await setHex(page, 'Background tint', '#f3f7fb');
    await page.getByRole('button', { name: 'Save theme' }).click();
    await expect(page.getByRole('region', { name: 'Your themes' }).getByText(name)).toBeVisible();
    await page.getByRole('button', { name: `Edit ${name}` }).waitFor();
    await page.reload();
  }
  await expect(page.getByTestId('saved-count')).toHaveText('5 of 5 saved themes');
  await page.getByLabel('Theme name').fill('One too many');
  await setHex(page, 'Main colour', '#1f5fa8');
  await setHex(page, 'Accent colour', '#0b7a5c');
  await setHex(page, 'Background tint', '#f3f7fb');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'You have reached the number of saved themes your package includes.',
  );
  await expect(page.getByTestId('saved-count')).toHaveText('5 of 5 saved themes');
});

test('the phone preview follows the builder', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/themes');
  const frame = page.getByRole('region', { name: 'Staff app preview' });
  await expect(frame).toBeVisible();
  await setHex(page, 'Main colour', '#8a1c1c');
  const primary = () =>
    frame
      .getByTestId('theme-preview')
      .evaluate((e) => (e as HTMLElement).style.getPropertyValue('--theme-primary').toLowerCase());
  await expect.poll(primary).toBe('#8a1c1c');
});
