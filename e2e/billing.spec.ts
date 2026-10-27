// M3 chunk 14 (BP-10, BP-11, BP-12, F-8; demo script Track A step 9): add-on request and approval, Explain unlock,
// and the account states after a simulated failed payment. Runs on the phone and desktop projects.
// Contract: see apps/web/src/pages/client/billing.test.tsx. Seed: Daniel (Supervisor, 5 days of two-step grace left on
// 19 Oct 2026) has no billing permission; Priya is the Account Owner.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const MODULE = '01M0C0N7000000000000000201';
const PREVIEW = `./#/client/modules/${MODULE}/preview/lesson-1`;
const STAFF_LESSON = `./#/staff/module/${MODULE}/lesson/lesson-1`;
const STAFF_MESSAGE = "Your organisation's account needs attention. Please speak to your manager.";
const PAYMENT_WORDS = /billing|payment|invoice|pay now|£/i;

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}

async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}

async function inPanel(page: Page, button: string | RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('button', { name: button }).click();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
}

/** Daniel enrols for two-step sign-in so the days that pass later do not lock him out. */
async function enrolDaniel(page: Page) {
  await jumpTo(page, /Daniel/);
  await page.getByTestId('two-factor-banner').getByRole('link').click();
  await page.getByRole('button', { name: 'Start set-up' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('button', { name: 'I have saved my codes' }).click();
  await expect(page).toHaveURL(/#\/client$/);
}

test('Daniel requests the AI Assistant, Priya approves it, and Daniel then sees Explain this in simpler words', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Daniel/);
  await expect(page.getByRole('link', { name: /^Billing$/ })).toHaveCount(0);

  await page.goto(PREVIEW);
  const locked = page.getByTestId('explain-locked');
  await expect(locked).toContainText(/ask someone with billing access/i);
  await expect(page.getByRole('button', { name: /explain this in simpler words/i })).toHaveCount(0);
  await locked.getByRole('button', { name: /request/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/note/i).fill('Would help new starters');
  await dialog.getByRole('button', { name: /send request/i }).click();
  await expect(page.getByText('Your request has been sent.')).toBeVisible();

  await jumpTo(page, /Priya/);
  await page.goto('./#/client/billing/add-ons');
  const requests = page.getByRole('region', { name: 'Requests' });
  await expect(requests).toContainText('Daniel');
  await expect(requests).toContainText('Would help new starters');
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await requests.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toContainText('On');

  await jumpTo(page, /Daniel/);
  await page.goto(PREVIEW);
  await page.getByRole('button', { name: /explain this in simpler words/i }).click();
  const result = page.getByTestId('explain-result');
  await expect(result).toContainText('Demo AI');
  await expect(result).toContainText('Based on this lesson only');
});

test('Priya turns the AI Assistant on from Add-ons and Jade sees Explain without a reload', async ({ page }) => {
  await pinClock(page);
  await page.goto('./');
  await jumpTo(page, /Jade/);
  await page.goto(STAFF_LESSON);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /explain this in simpler words/i })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(PAYMENT_WORDS);

  await jumpTo(page, /Priya/);
  await page.goto('./#/client/billing/add-ons');
  await page.getByRole('region', { name: 'AI Assistant' }).getByRole('button', { name: 'Turn on' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /confirm/i })
    .click();
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toContainText('On');

  await jumpTo(page, /Jade/);
  await page.goto(STAFF_LESSON);
  await expect(page.getByRole('button', { name: /explain this in simpler words/i })).toBeVisible();
});

test('Billing shows plan, invoices with a print view, and only the last four card digits, and passes axe', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/billing');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan and billing' })).toBeVisible();
  await expect(page.getByTestId('payment-method')).toContainText(/ending \d{4}/);
  const invoices = page.getByRole('region', { name: 'Invoices' });
  expect(await invoices.getByRole('listitem').count()).toBeGreaterThanOrEqual(6);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await invoices.getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/client\/billing\/invoices\/[^/]+\/print$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/INV/i);
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('a failed payment walks Priya and Daniel through Past due, Limited and Read-only, and Pay now restores Active', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await pinClock(page);
  await page.goto('./');
  await enrolDaniel(page);
  await jumpTo(page, /Priya/);
  await inPanel(page, 'Simulate failed payment');

  // Past due, day 0: people with billing access see it, with an amount and Fix this now.
  const banner = page.getByTestId('account-banner');
  await expect(banner).toContainText('Your last payment did not go through');
  await expect(banner).toContainText(/£\d/);
  await expect(banner.getByRole('button', { name: 'Fix this now' })).toBeVisible();
  await jumpTo(page, /Daniel/);
  await expect(page.getByTestId('account-banner')).toHaveCount(0);

  // Day 7: every admin sees it; Daniel has no amount and no Fix this now.
  await inPanel(page, 'Fast-forward 7 days');
  await expect(page.getByTestId('account-banner')).toContainText('Your last payment did not go through');
  await expect(page.getByTestId('account-banner')).toContainText(/billing access/i);
  await expect(page.getByTestId('account-banner')).not.toContainText(/£\d/);
  await expect(page.getByTestId('account-banner').getByRole('button', { name: 'Fix this now' })).toHaveCount(0);

  // Limited from day 15.
  await inPanel(page, 'Fast-forward 7 days');
  await inPanel(page, 'Fast-forward 1 day');
  await inPanel(page, 'Fast-forward 1 day');
  await expect(page.getByTestId('account-banner')).toContainText('Your account is limited');
  await jumpTo(page, /Priya/);
  await expect(page.getByTestId('account-banner')).toContainText('Your account is limited');

  // Read-only from day 31, and staff are told only to speak to their manager.
  await inPanel(page, 'Fast-forward 30 days');
  await expect(page.getByTestId('account-banner')).toContainText('Your account is read-only');
  await jumpTo(page, /Daniel/);
  await expect(page.getByTestId('account-banner')).toContainText('Your account is read-only');
  await jumpTo(page, /Jade/);
  await expect(page).toHaveURL(/#\/staff$/);
  const notice = page.getByTestId('staff-account-notice');
  await expect(notice).toContainText(STAFF_MESSAGE);
  await expect(notice).not.toContainText(PAYMENT_WORDS);

  // Pay now on the mock pay page returns the account to Active.
  await jumpTo(page, /Priya/);
  await page.getByTestId('account-banner').getByRole('button', { name: 'Fix this now' }).click();
  await expect(page).toHaveURL(/#\/client\/billing\/pay$/);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByText('Payment received. Thank you.')).toBeVisible();
  await page.goto('./#/client');
  await expect(page.getByTestId('account-banner')).toHaveCount(0);
  await jumpTo(page, /Jade/);
  await expect(page.getByTestId('staff-account-notice')).toHaveCount(0);
});
