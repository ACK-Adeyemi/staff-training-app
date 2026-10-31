// BP-2 and F-8: every M0 route renders a heading and has no serious or critical axe violations, in light and dark.
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';
import { m2Routes, m3AllRoutes, m4Routes, shellRoutes } from './routes';

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
  { hash: `#/staff/module/${moduleId}/practice`, name: 'practice quiz' },
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
  ...m3AllRoutes.map((r) => ({
    hash: r.hash,
    name: `M3 ${r.hash} ${r.label}`,
  })),
  ...m4Routes.map((r) => ({ hash: r.hash, name: `M4 ${r.hash} ${r.label}` })),
  {
    hash: '',
    name: 'P12 ticket detail',
    resolve: async (page) => `#/provider/tickets/${await firstId(page, 'tickets')}`,
  },
  // M3 routes with ids (F-5): builder edit and lesson preview, evidence review.
  {
    hash: '',
    name: 'C7 module builder edit',
    resolve: async (page) =>
      `#/client/modules/${await firstId(page, 'modules', (m) => m['title'] === 'Fire evacuation at Little Acorns')}/edit`,
  },
  { hash: `#/client/modules/${moduleId}/preview/${String(lessonId)}`, name: 'C6 lesson preview' },
  {
    hash: '',
    name: 'P3 client detail',
    resolve: async (page) => `#/provider/clients/${await firstId(page, 'clients')}`,
  },
  { hash: '#/staff/progress/record', name: 'S8b training record' },
  { hash: `#/client/modules/${moduleId}/preview`, name: 'C6 module preview' },
  {
    hash: '',
    name: 'C19 invoice print view',
    resolve: async (page) => {
      // Invoices belong to several clients, so take the first link the signed-in client's own billing page shows.
      await page.goto('./#/client/billing');
      const href = await page.getByRole('region', { name: 'Invoices' }).getByRole('link').first().getAttribute('href');
      const invoiceId = String(href).split('/invoices/')[1]?.split('/')[0] ?? '';
      return `#/client/billing/invoices/${invoiceId}/print`;
    },
  },
  {
    hash: '',
    name: 'C16 competition edit',
    resolve: async (page) => `#/client/competitions/${await firstId(page, 'competitions')}/edit`,
  },
  {
    hash: '',
    name: 'C27 evidence review',
    resolve: async (page) =>
      `#/client/evidence/${await firstId(page, 'evidenceSubmissions', (s) => s['status'] === 'awaitingCheck')}`,
  },
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
    for (const route of [...m2Routes, ...m3AllRoutes, ...m4Routes].filter(
      (r, i, all) => all.findIndex((x) => x.hash === r.hash) === i,
    )) {
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

// M5 chunk 13 (BP-3): Kasia (Polish) walks the staff routes in light and dark. Each renders one heading and one main, passes
// axe, and carries <html lang="pl">. The practice quiz is also swept with the AI Assistant on (the sweep above sees the
// locked state only).
const polishStaffRoutes: { hash: string; name: string }[] = [
  { hash: '#/staff', name: 'S2 Home' },
  { hash: '#/staff/learn', name: 'Learn' },
  { hash: `#/staff/module/${moduleId}`, name: 'S4 module overview' },
  { hash: `#/staff/module/${moduleId}/lesson/${String(lessonId)}`, name: 'S5 lesson' },
  { hash: `#/staff/module/${moduleId}/quiz`, name: 'S6 quiz' },
  { hash: `#/staff/module/${moduleId}/practice`, name: 'practice quiz' },
  { hash: '#/staff/progress', name: 'S8 progress' },
  { hash: '#/staff/compete', name: 'Compete' },
  { hash: '#/staff/calendar', name: 'S18 calendar' },
  { hash: '#/staff/notes', name: 'My notes' },
  { hash: '#/staff/notifications', name: 'Notifications' },
  { hash: '#/staff/me', name: 'S11 Me' },
  { hash: '#/staff/me/display', name: 'Display and accessibility' },
  { hash: '#/staff/help', name: 'Help' },
  { hash: '#/staff/help/ticket/new', name: 'Raise a ticket' },
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Polish staff routes, ${colorScheme}`, () => {
    test.use({ colorScheme });
    for (const route of polishStaffRoutes) {
      test(`Kasia: ${route.name} renders a heading and passes axe in Polish`, async ({ page }) => {
        await page.goto('./#/staff/signin');
        await page.getByRole('radio', { name: /Kasia/ }).check();
        await page.getByLabel(/PIN/).fill('1234');
        await page.getByRole('button', { name: /Sign in|Zaloguj/ }).click();
        await expect(page).toHaveURL(/#\/staff$/);
        await page.goto('about:blank');
        await page.goto(`./${route.hash}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }

    test('the practice quiz passes axe with the AI Assistant on', async ({ page }) => {
      test.setTimeout(60_000);
      await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
      await page.goto('./');
      await page.keyboard.press('Shift+Alt+KeyP');
      const panel = page.getByRole('dialog', { name: 'Presenter panel' });
      await panel.getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name: /Priya/ }).click();
      await expect(panel).toBeHidden();
      await page.goto('./#/client/billing/add-ons');
      const region = page.getByRole('region', { name: 'AI Assistant' });
      if (!(await region.innerText()).includes('On')) {
        await region.getByRole('button', { name: 'Turn on' }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /confirm/i })
          .click();
      }
      await expect(region).toContainText('On');
      await page.keyboard.press('Shift+Alt+KeyP');
      await panel.getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name: /Jade/ }).click();
      await expect(panel).toBeHidden();
      await page.goto(`./#/staff/module/${moduleId}/practice`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('group').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}
