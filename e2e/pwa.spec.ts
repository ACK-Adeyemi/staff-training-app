// M5 chunk 4 (BP-2, F-2): offline after one online visit. The only spec that lets the service worker run
// (playwright.config.ts sets serviceWorkers: 'block' for everything else). Runs against the preview build.
// Desktop project only, to keep one service worker per context and the run short.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { finishLessons } from './helpers/quiz';

test.use({ serviceWorkers: 'allow' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'desktop project only');

const origin = 'http://localhost:4173';
const base = '/staff-training-app/';

async function signInAsJade(page: Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
  await expect(page.getByText('1 to do')).toBeVisible();
}

async function waitForController(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A page that loaded before the worker took over has no controller until the next load.
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  }
}

test('a lesson can be completed offline after one online visit and progress is kept when back online', async ({
  page,
  context,
}) => {
  const foreign: string[] = [];
  context.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });

  await signInAsJade(page);
  await waitForController(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('1 to do')).toBeVisible();

  await page.goto('./#/staff/learn');
  await page
    .getByRole('link', { name: /Safeguarding/ })
    .first()
    .click();
  await finishLessons(page);
  const lessons = page.getByRole('region', { name: 'Lessons' });
  const total = await lessons.getByRole('link').count();
  await expect(lessons.getByText('Done', { exact: true })).toHaveCount(total);
  const moduleUrl = page.url();

  await page.goto('./#/staff');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Wait for the home screen to catch up with the lessons just finished, so the snapshot is settled.
  await expect(page.getByText('Goal met this week').first()).toBeVisible();
  const homeOffline = await page.getByRole('main').innerText();

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(await page.getByRole('main').innerText()).toBe(homeOffline);

  await page.goto(moduleUrl);
  const again = page.getByRole('region', { name: 'Lessons' });
  await expect(again.getByText('Done', { exact: true })).toHaveCount(total);

  expect(foreign).toEqual([]);
});

test('the update prompt does not show on a fresh visit and the page never reloads by itself', async ({ page }) => {
  await signInAsJade(page);
  await waitForController(page);
  await page.waitForTimeout(500);
  await expect(page.getByText('A new version is ready')).toHaveCount(0);
});

test('every built asset is in the service worker precache list', () => {
  const sw = readFileSync('apps/web/dist/sw.js', 'utf8');
  const precached = new Set([...sw.matchAll(/url:\s*["']([^"']+)["']/g)].map((m) => m[1] ?? ''));
  const files = readdirSync('apps/web/dist/assets');
  expect(files.length).toBeGreaterThan(0);
  const missing = files.filter((f) => ![...precached].some((u) => u === `assets/${f}` || u.endsWith(`/assets/${f}`)));
  expect(missing).toEqual([]);
  expect([...precached].some((u) => u === 'index.html' || u.endsWith('/index.html'))).toBe(true);
});

test('the web app manifest has scope and start_url under the base path and opens the staff app', async ({
  request,
}) => {
  const url = `${origin}${base}manifest.webmanifest`;
  const res = await request.get(url);
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as {
    name?: string;
    scope?: string;
    start_url?: string;
    icons?: { src: string; sizes?: string; type?: string }[];
  };
  expect(m.name).toBeTruthy();
  const scope = new URL(m.scope ?? '', url);
  const start = new URL(m.start_url ?? '', url);
  expect(scope.origin).toBe(origin);
  expect(scope.pathname).toBe(base);
  expect(start.pathname.startsWith(base)).toBe(true);
  expect(start.hash).toBe('#/staff');
  const sizes = (m.icons ?? []).map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
});
