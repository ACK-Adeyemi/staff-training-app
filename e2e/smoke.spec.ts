// BP-2 and F-8: every M0 route renders a heading and has no serious or critical axe violations, in light and dark.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { shellRoutes } from './routes';

const routes = [
  { hash: '#/', name: 'D1 landing' },
  { hash: '#/demo/outbox', name: 'D3 outbox' },
  ...shellRoutes.map((r) => ({ hash: r.hash, name: `${r.hash} ${r.label}` })),
  { hash: '#/no/such/page', name: 'Not found' },
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} colour scheme`, () => {
    test.use({ colorScheme });
    for (const route of routes) {
      test(`${route.name} renders a heading and passes axe`, async ({ page }) => {
        await page.goto(route.hash === '#/' ? './' : `./${route.hash}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  });
}

test('the empty hash opens D1, and an unknown hash shows Not found with a way back', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Not found/i })).toHaveCount(0);
  await page.goto('./#/no/such/page');
  await expect(page.getByRole('heading', { level: 1, name: 'We could not find that page' })).toBeVisible();
  await page
    .getByRole('link', { name: /start|home|back/i })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/$|staff-training-app\/$/);
});
