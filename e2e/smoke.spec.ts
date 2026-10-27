// BP-2 and F-8: every M0 route renders a heading and has no serious or critical axe violations, in light and dark.
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';
import { m2Routes, m3BillingRoutes, m3Routes, shellRoutes } from './routes';

// M1 routes with ids: the module id is the seed's Safeguarding module; lessons come from its module.json;
// people and attachments are read from the app's own IndexedDB once the seed has loaded.
const moduleId = '01M0C0N7000000000000000201';
const lessonId = (
  JSON.parse(readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8')) as {
    lessons: { id: string }[];
  }
).lessons[0]?.id;

async function firstId(page: Page, store: string, pick?: (r: Record<string, unknown>) => boolean): Promise<string> {
  await page.goto('./#/staff');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const rows = await readStore(page, store);
  const row = pick ? rows.find(pick) : rows[0];
  return String(row?.['id']);
}

type Route = { hash: string; name: string; resolve?: (page: Page) => Promise<string> };
const m1Routes: Route[] = [
  { hash: '#/staff/signin', name: 'S1 sign in' },
  { hash: `#/staff/module/${moduleId}`, name: 'S4 module overview' },
  { hash: `#/staff/module/${moduleId}/lesson/${String(lessonId)}`, name: 'S5 lesson' },
  { hash: `#/staff/module/${moduleId}/quiz`, name: 'S6 quiz' },
  { hash: `#/staff/module/${moduleId}/done`, name: 'S7 results' },
  { hash: `#/staff/module/${moduleId}/certificate`, name: 'certificate' },
  {
    hash: '',
    name: 'organisation document',
    resolve: async (page) => `#/doc/${await firstId(page, 'attachments')}`,
  },
  { hash: '#/staff/progress', name: 'S8 progress' },
  { hash: '#/staff/notifications', name: 'notifications' },
  { hash: '#/client', name: 'C1 dashboard' },
  { hash: '#/client/people', name: 'C2 people' },
  {
    hash: '',
    name: 'C3 person record',
    resolve: async (page) =>
      `#/client/people/${await firstId(page, 'people', (p) => p['firstName'] === 'Jade' && p['lastName'] === 'Mills')}`,
  },
  { hash: '#/client/assign', name: 'C4 assign' },
  { hash: '#/client/reports', name: 'reports index' },
  { hash: '#/client/reports/matrix', name: 'C15 matrix' },
  { hash: `#/client/modules/${moduleId}/stats`, name: 'C8 module stats' },
];

const routes: Route[] = [
  { hash: '#/', name: 'D1 landing' },
  { hash: '#/demo/outbox', name: 'D3 outbox' },
  ...shellRoutes.map((r) => ({ hash: r.hash, name: `${r.hash} ${r.label}` })),
  { hash: '#/no/such/page', name: 'Not found' },
  ...m1Routes,
  ...m2Routes.map((r) => ({ hash: r.hash, name: `M2 ${r.hash} ${r.label}` })),
  ...[...m3Routes, ...m3BillingRoutes].map((r) => ({ hash: r.hash, name: `M3 ${r.hash} ${r.label}` })),
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} colour scheme`, () => {
    test.use({ colorScheme });
    for (const route of routes) {
      test(`${route.name} renders a heading and passes axe`, async ({ page }) => {
        const hash = route.resolve ? await route.resolve(page) : route.hash;
        await page.goto(hash === '#/' ? './' : `./${hash}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  });
}

// F-10: the M2 routes also pass axe with high contrast on (and in dark), at the project's viewport.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`high contrast, ${colorScheme}`, () => {
    test.use({ colorScheme });
    for (const route of m2Routes) {
      test(`${route.hash} passes axe with high contrast (${colorScheme})`, async ({ page }) => {
        await page.goto(`./${route.hash}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-contrast', 'high');
        });
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
