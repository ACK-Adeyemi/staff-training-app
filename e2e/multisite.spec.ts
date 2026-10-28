// M3 chunk 19a (BP-17, BP-18, F-4, F-5; Track A step 8): the multi-site client on phone and desktop. Written before
// the implementation. UI contract: apps/web/src/pages/client/multiSite.test.tsx (C2, C1, switcher),
// leaderboardSettingsMulti.test.tsx (C14) and apps/web/src/pages/staff/competeScopes.test.tsx (S10). The clock is
// pinned at Monday 19 October 2026 09:00 UTC as the seeded Track A does.
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
const switcher = (page: Page) => page.getByRole('combobox', { name: 'Switch site' });

test('Fiona sees Oak Tree grouped by site, compares the sites, drills into Meadow and sees the Sites board', async ({
  page,
}) => {
  await start(page);
  await jumpTo(page, /Fiona/);

  // People grouped by site, with the counts, and Nadia once.
  await page.goto('./#/client/people');
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
  const groups = page.getByTestId('site-group');
  await expect(groups).toHaveCount(3);
  for (const site of ['Riverside', 'Hillside', 'Meadow']) {
    const group = groups.filter({ has: page.getByRole('button', { name: site, exact: true }) });
    await expect(group.getByTestId('site-group-stats')).toContainText(/\d+ people/);
    await expect(group.getByTestId('site-group-stats')).toContainText(/Compliance \d+%/);
  }
  await expect(page.getByRole('link', { name: 'Nadia Bell' })).toHaveCount(1);
  await expectTouchTarget(page.getByRole('button', { name: 'Riverside', exact: true }));
  await page.getByRole('button', { name: 'Hillside', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hillside', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await noSeriousAxe(page);

  // The comparison, most attention first, and the drill-in.
  await page.goto('./#/client');
  const comparison = page.getByRole('region', { name: 'Site comparison' });
  const cards = comparison.getByTestId('site-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('Meadow');
  await expect(cards.last()).toContainText('Riverside');
  await noSeriousAxe(page);
  await expectTouchTarget(comparison.getByRole('button', { name: 'Open Meadow' }));
  await comparison.getByRole('button', { name: 'Open Meadow' }).click();
  await expect(switcher(page).locator('option:checked')).toHaveText('Meadow');
  await expect(page.getByRole('region', { name: 'Site comparison' })).toHaveCount(0);

  // The filter follows to People: only Meadow, with Nadia under Also works here.
  await page.goto('./#/client/people');
  await expect(page.getByTestId('site-group')).toHaveCount(1);
  await expect(switcher(page).locator('option:checked')).toHaveText('Meadow');
  await expect(
    page.getByRole('region', { name: 'Also works here' }).getByRole('link', { name: 'Nadia Bell' }),
  ).toBeVisible();

  // Sites board on Participation: Riverside first; the region choice lists both regions.
  await page.goto('./#/client/leaderboards');
  const ranking = page.getByRole('region', { name: 'Full ranking' });
  await expect(ranking.getByRole('radio', { name: 'Participation' })).toBeChecked();
  await expect(ranking.getByTestId('ranking-row').first()).toContainText('Riverside');
  await expect(ranking.getByRole('combobox', { name: 'Scope' }).locator('option')).toHaveText([
    'All sites',
    'South East',
    'South West',
  ]);
  await noSeriousAxe(page);
});

test('Tariq, the Riverside Site Manager, sees only Riverside', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Tariq/);
  await page.goto('./#/client/people');
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nadia Bell' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Toby Ashby' })).toHaveCount(0);
  await expect(switcher(page)).toHaveCount(0);
  await page.goto('./#/client');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Site comparison' })).toHaveCount(0);
  await page.goto('./#/client/leaderboards');
  await expect(page.getByRole('region', { name: 'Full ranking' })).toHaveCount(0);
});

test('Little Acorns shows no multi-site screens or leaderboard scopes', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/people');
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
  await expect(page.getByTestId('site-group')).toHaveCount(0);
  await expect(switcher(page)).toHaveCount(0);
  await page.goto('./#/client');
  await expect(page.getByRole('region', { name: 'Site comparison' })).toHaveCount(0);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/compete');
  await expect(page.getByRole('heading', { level: 1, name: 'Compete' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Board type' })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Scope' })).toHaveCount(0);
});
