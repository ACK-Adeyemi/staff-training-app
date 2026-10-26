// M2 chunk 15 (F-2, F-3): Jade sees the full Home order, History and XP tabs, and the record print view.
// Contract: control names and test ids as in apps/web/src/pages/staff/rewardsHome.test.tsx and rewardsProgress.test.tsx.
import { expect, test, type Page } from '@playwright/test';

async function signInAsJade(page: Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}

test('Home shows weekly goal, banners, latest badge and My notes in order, and a banner can be dismissed', async ({
  page,
}) => {
  await signInAsJade(page);
  const names = ['Next up', 'Weekly goal', 'Coming up', 'Competitions', 'Latest badge'];
  const tops: number[] = [];
  for (const n of names) {
    const box = await page.getByRole('region', { name: n }).boundingBox();
    expect(box, n).not.toBeNull();
    tops.push(box?.y ?? -1);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  await expect(page.getByRole('link', { name: 'My notes' })).toHaveAttribute('href', /\/staff\/notes$/);
  const banner = page.getByRole('region', { name: 'Competitions' });
  await expect(banner).toContainText('Staff bake-off');
  await banner.getByRole('button', { name: 'Dismiss Staff bake-off' }).click();
  await expect(banner).not.toContainText('Staff bake-off');
});

test('Progress has History and XP and level tabs and opens the record print view', async ({ page }) => {
  await signInAsJade(page);
  await page.goto('./#/staff/progress');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByTestId('timeline-item').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Weekly activity' })).toBeAttached();
  await page.getByRole('tab', { name: 'XP and level' }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByText(/\d+ XP in total/)).toBeVisible();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('link', { name: 'Download my record' }).click();
  await expect(page).toHaveURL(/#\/staff\/progress\/record$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My training record' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Completed training' })).toBeVisible();
});
