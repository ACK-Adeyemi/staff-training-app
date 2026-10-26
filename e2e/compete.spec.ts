// M2 chunk 16 (BP-2, BP-3, BP-8 step 7, F-5, F-6): S10 Compete and the client admin competition screens.
// Contract: labels, regions and test ids as listed in apps/web/src/pages/staff/compete.test.tsx,
// apps/web/src/pages/client/competitions.test.tsx and apps/web/src/pages/client/competitionBuilder.test.tsx.
// Both the phone and desktop projects run this. Jade, Hannah and Priya use separate pages of one context
// (shared IndexedDB, like separate tabs).
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const prizes = JSON.parse(readFileSync('packages/content/src/packs/nursery/prizes.json', 'utf8')) as string[];
const PINNED = new Date('2026-10-19T09:00:00.000Z');
const BOARD = 'Most questions answered correctly';

async function signInAs(page: Page, name: RegExp) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}
async function open(context: BrowserContext, who: RegExp | 'priya') {
  const page = await context.newPage();
  await page.clock.install({ time: PINNED });
  if (who === 'priya') await page.goto('./#/client');
  else await signInAs(page, who);
  return page;
}
const boardOf = (page: Page) => page.getByRole('region', { name: BOARD });

test('Jade sees Mastery Month and 2nd of 13; hiding removes her from Hannah and Priya; Priya switching a board off removes it from Hannah', async ({
  context,
}) => {
  test.setTimeout(120_000);
  const jade = await open(context, /Jade/);
  const hannah = await open(context, /Hannah/);
  const priya = await open(context, 'priya');

  await jade.goto('./#/staff/compete');
  await expect(jade.getByRole('heading', { level: 1, name: 'Compete' })).toBeVisible();
  await expect(jade.getByRole('region', { name: 'Live competitions' })).toContainText('Mastery Month');
  await jade.getByRole('button', { name: 'Details: Mastery Month' }).click();
  const dialog = jade.getByRole('dialog', { name: 'Mastery Month' });
  await expect(dialog.getByRole('heading', { name: 'How to win' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Leaderboard' })).toBeVisible();
  await jade.keyboard.press('Escape');
  await expect(boardOf(jade)).toContainText("You're 2nd of 13");

  // Hannah sees Jade and a count of 13 before Jade hides.
  await hannah.goto('./#/staff/compete');
  await expect(boardOf(hannah)).toContainText('of 13');
  await expect(boardOf(hannah)).toContainText('Jade');

  // Jade hides from leaderboards on S11.
  await jade.goto('./#/staff/me');
  await jade.getByRole('switch', { name: 'Hide me from leaderboards' }).click();
  await expect(jade.getByRole('switch', { name: 'Hide me from leaderboards' })).toHaveAttribute('aria-checked', 'true');

  // Hannah: the count drops by one and Jade's name is gone.
  await hannah.goto('./#/staff/compete');
  await expect(boardOf(hannah)).toContainText('of 12');
  await expect(boardOf(hannah)).not.toContainText('Jade');

  // Jade still sees her own private position, as if she were included (plan M2 assumption 9: 12 others plus her, so 13),
  // and no row of her own.
  await jade.goto('./#/staff/compete');
  await expect(boardOf(jade)).toContainText(/of 13\. Only you can see this/);
  await expect(boardOf(jade).locator('[aria-current="true"]')).toHaveCount(0);

  // Priya (C13): Jade's name is absent, even for admins.
  await priya.goto('./#/client/competitions');
  await priya.getByRole('region', { name: 'Live' }).getByRole('link', { name: 'Mastery Month' }).click();
  const lb = priya.getByRole('region', { name: 'Leaderboard' });
  await expect(lb.getByTestId('standing-row').first()).toBeVisible();
  await expect(lb).not.toContainText('Jade');

  // Priya (C14) switches the board off; it disappears from Hannah's S10 (and Hannah's other boards stay).
  await priya.goto('./#/client/leaderboards');
  const sw = priya.getByRole('switch', { name: BOARD });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await hannah.goto('./#/staff/compete');
  await expect(hannah.getByRole('region', { name: 'Standing boards' })).toBeVisible();
  await expect(boardOf(hannah)).toHaveCount(0);
  await expect(hannah.getByRole('region', { name: 'Most modules completed' })).toBeVisible();
  await expect(hannah.getByRole('button', { name: /Battle Room/ })).toBeDisabled();
});

test('Priya builds Mastery Month with Suggest a prize and publishes it; Jade sees the banner and the details sheet', async ({
  context,
}) => {
  test.setTimeout(120_000);
  const priya = await open(context, 'priya');
  const jade = await open(context, /Jade/);

  await priya.goto('./#/client/competitions');
  await priya.getByRole('link', { name: 'New competition' }).click();
  await expect(priya).toHaveURL(/#\/client\/competitions\/new$/);
  await priya.getByRole('radio', { name: 'Mastery Month' }).check();
  await expect(priya.getByTestId('template-why')).toContainText('It rewards real knowledge.');
  await priya.getByRole('textbox', { name: 'Name' }).fill('Winter Mastery');
  await priya.getByRole('textbox', { name: 'Description' }).fill('Master the most modules before the end of November.');

  const prize = priya.getByRole('textbox', { name: 'Prize' });
  let prev = '';
  for (let i = 0; i < 5; i++) {
    await priya.getByRole('button', { name: 'Suggest a prize' }).click();
    const v = await prize.inputValue();
    expect(prizes).toContain(v);
    expect(v).not.toBe(prev);
    prev = v;
  }
  await prize.fill(`${prev} (amount changed to £30)`);
  await expect(prize).toHaveValue(/£30/);
  await priya.getByRole('button', { name: 'Clear prize' }).click();
  await expect(prize).toHaveValue('');
  await expect(prize).toBeFocused();
  await priya.getByRole('button', { name: 'Suggest a prize' }).click();
  const finalPrize = await prize.inputValue();
  await expect(priya.getByText(/The client provides and pays for the prize/)).toBeVisible();

  await priya.getByLabel('Start date').fill('2026-10-19');
  await priya.getByLabel('End date').fill('2026-11-18');
  const lbSwitch = priya.getByRole('switch', { name: 'Show live leaderboard' });
  if ((await lbSwitch.getAttribute('aria-checked')) !== 'true') await lbSwitch.click();
  await expect(lbSwitch).toHaveAttribute('aria-checked', 'true');
  await priya.getByRole('button', { name: 'Publish' }).click();

  await expect(priya).toHaveURL(/#\/client\/competitions$/);
  const live = priya.getByRole('region', { name: 'Live' });
  await expect(live).toContainText('Winter Mastery');
  await expect(live.getByTestId('competition-row').filter({ hasText: 'Winter Mastery' })).toContainText('Live');

  // Jade's Home shows the banner below Next up with the prize line.
  await jade.goto('./#/staff');
  const banners = jade.getByRole('region', { name: 'Competitions' });
  const banner = banners.getByTestId('competition-banner').filter({ hasText: 'Winter Mastery' });
  await expect(banner).toContainText(finalPrize);
  const next = await jade.getByRole('region', { name: 'Next up' }).boundingBox();
  const bannerBox = await banner.boundingBox();
  expect(bannerBox?.y ?? 0).toBeGreaterThan(next?.y ?? Infinity);

  // Tapping it opens the details sheet.
  await banner
    .getByRole('button', { name: /Winter Mastery/ })
    .first()
    .click()
    .catch(async () => banner.click());
  const sheet = jade.getByRole('dialog', { name: 'Winter Mastery' });
  await expect(sheet).toContainText('Master the most modules before the end of November.');
  await expect(sheet).toContainText(finalPrize);
  await expect(sheet.getByRole('heading', { name: 'How to win' })).toBeVisible();
  await expect(sheet.getByRole('region', { name: 'Leaderboard' })).toBeVisible();
  await expect(sheet).toContainText('Nov');
});

test('Priya cancels the Staff bake-off after a confirmation', async ({ context }) => {
  const priya = await open(context, 'priya');
  await priya.goto('./#/client/competitions');
  await priya.getByRole('region', { name: 'Live' }).getByRole('link', { name: 'Staff bake-off' }).click();
  await expect(priya.getByRole('heading', { level: 1, name: 'Staff bake-off' })).toBeVisible();
  await priya.getByRole('button', { name: 'Cancel competition' }).click();
  const dialog = priya.getByRole('dialog', { name: 'Cancel this competition?' });
  await dialog.getByRole('button', { name: 'Yes, cancel competition' }).click();
  await expect(priya.getByText('Cancelled').first()).toBeVisible();
});
