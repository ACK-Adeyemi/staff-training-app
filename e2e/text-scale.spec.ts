// F-10: at 390px with the root font size doubled, D1 and the staff shell do not scroll sideways and every tab label is reachable.
import { expect, test } from '@playwright/test';
import { need, staffTabs } from './routes';

test.use({ viewport: { width: 390, height: 844 } });

async function scale(page: import('@playwright/test').Page) {
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
}

test('D1 has no horizontal scroll at 200% text', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await scale(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the staff shell has no horizontal scroll at 200% text and every tab label is visible', async ({ page }) => {
  await page.goto('./#/staff');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await scale(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const tab of staffTabs) {
    const link = nav.getByRole('link', { name: tab.label, exact: true });
    await expect(link).toBeVisible();
    const box = need(await link.boundingBox());
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});

test('client and provider shells have no horizontal scroll at 200% text', async ({ page }) => {
  for (const hash of ['#/client', '#/provider']) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await scale(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
  }
});
