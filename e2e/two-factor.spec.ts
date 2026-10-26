// M3 chunk 13 (BP-9): two-step sign-in for client admins, end to end. Desktop project only; each test has a fresh
// browser context. Contract: see apps/web/src/shells/foundations.test.tsx and apps/web/src/pages/client/foundations.test.tsx.
// Seed: Daniel is inside the 7-day grace (5 days left on 19 Oct 2026), Colin Reeve is past it, Priya is enrolled.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'desktop project only');

async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}

async function enrol(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: 'Start set-up' }).click();
  await expect(page.getByRole('img').first()).toBeVisible();
  await expect(page.getByText(/Or type this key: \S+/)).toBeVisible();
  await page.getByLabel('6-digit code').fill('111111');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('alert')).toContainText("That code isn't right");
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Confirm' }).click();
  const codes = page.getByRole('region', { name: 'Your recovery codes' });
  await expect(codes.getByRole('listitem')).toHaveCount(10);
  const shown = await codes.getByRole('listitem').allInnerTexts();
  await page.getByRole('button', { name: 'I have saved my codes' }).click();
  return shown.map((c) => c.trim());
}

async function signInWithRecoveryCode(page: Page, code: string) {
  await page.goto('./#/client/signin');
  await page.getByLabel('Email').fill('daniel.hughes@littleacornsnursery.test');
  await page.getByLabel('Password').fill('any password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel(/recovery code/i).fill(code);
  await page.getByRole('button', { name: 'Confirm' }).click();
}

test('an admin inside the grace period sees a calm banner and enrols with 123456', async ({ page }) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Daniel/);
  await expect(page).toHaveURL(/#\/client$/);
  const banner = page.getByTestId('two-factor-banner');
  await expect(banner).toContainText('Set up two-step sign-in, 5 days left');
  // Still fully usable: the dashboard is there.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await banner.getByRole('link').click();
  await expect(page).toHaveURL(/#\/client\/signin/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  const codes = await enrol(page);
  expect(new Set(codes).size).toBe(10);
  await expect(page).toHaveURL(/#\/client$/);
  await expect(page.getByTestId('two-factor-banner')).toHaveCount(0);
});

test('each recovery code works once', async ({ page }) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Daniel/);
  await page.getByTestId('two-factor-banner').getByRole('link').click();
  const codes = await enrol(page);
  const first = codes[0];
  if (first === undefined) throw new Error('no recovery code shown');

  await signInWithRecoveryCode(page, first);
  await expect(page).toHaveURL(/#\/client$/);

  await signInWithRecoveryCode(page, first);
  await expect(page.getByRole('alert')).toContainText("That code isn't right");
  await expect(page).toHaveURL(/#\/client\/signin/);

  // A different code still works.
  const second = codes[1];
  if (second === undefined) throw new Error('no second recovery code');
  await page.getByLabel(/recovery code/i).fill(second);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/#\/client$/);
});

test('an admin past the grace period is sent to enrolment from every client page until they enrol', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Colin/);
  await page.goto('./#/client/people');
  await expect(page).toHaveURL(/#\/client\/signin/);
  await expect(page.getByText('Set up two-step sign-in to carry on.')).toBeVisible();
  await page.goto('./#/client/reports');
  await expect(page).toHaveURL(/#\/client\/signin/);

  await enrol(page);
  await page.goto('./#/client/people');
  await expect(page).toHaveURL(/#\/client\/people$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('Fast-forward past the 7-day grace limits an unenrolled admin', async ({ page }) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Daniel/);
  await expect(page.getByTestId('two-factor-banner')).toBeVisible();
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('button', { name: 'Fast-forward 7 days' }).click();
  await page.keyboard.press('Escape');
  await page.goto('./#/client/people');
  await expect(page).toHaveURL(/#\/client\/signin/);
  await expect(page.getByRole('button', { name: 'Start set-up' })).toBeVisible();
});

test('staff are never asked for two-step sign-in', async ({ page }) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Jade/);
  await expect(page).toHaveURL(/#\/staff$/);
  await expect(page.getByText(/two-step/i)).toHaveCount(0);
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('button', { name: 'Fast-forward 30 days' }).click();
  await page.keyboard.press('Escape');
  await page.goto('./#/staff/progress');
  await expect(page).toHaveURL(/#\/staff\/progress$/);
  await expect(page.getByText(/two-step/i)).toHaveCount(0);
});
