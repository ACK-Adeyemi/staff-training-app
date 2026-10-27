// F-9: no requests leave the preview origin, and the built index.html carries the CSP meta tag.
import { expect, test } from '@playwright/test';
import { installSpeechRecorder, readSpeechLog } from './helpers/speech';
import { m2Routes } from './routes';

const origin = 'http://localhost:4173';

test('every request while visiting D1 and the three shells stays on the preview origin', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  for (const hash of ['', '#/staff', '#/client', '#/provider', '#/demo/outbox']) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  expect(urls.length).toBeGreaterThan(0);
  const outside = urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(outside).toEqual([]);
});

test('the served index.html carries a restrictive Content-Security-Policy meta tag', async ({ request }) => {
  const res = await request.get('./');
  expect(res.ok()).toBe(true);
  const html = await res.text();
  const tag = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
  expect(tag).toBeTruthy();
  for (const directive of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "object-src 'none'"]) {
    expect(tag).toContain(directive);
  }
});

test('assets are served under the base path', async ({ request }) => {
  const html = await (await request.get('./')).text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1] ?? '');
  expect(assets.length).toBeGreaterThan(0);
  for (const a of assets) expect(a.startsWith('/staff-training-app/')).toBe(true);
});

test('F-10: the M2 routes, the dyslexia font and read-aloud make no request outside the origin', async ({ page }) => {
  await installSpeechRecorder(page);
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
  for (const r of m2Routes) {
    await page.goto(`./${r.hash}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  await page.goto('./#/staff/me/display');
  const font = page.getByRole('switch', { name: 'Dyslexia-friendly font' });
  await font.click();
  await expect(font).toHaveAttribute('aria-checked', 'true');
  await page.goto('./#/staff/learn');
  await page
    .getByRole('link', { name: /Safeguarding/ })
    .first()
    .click();
  await page.getByRole('region', { name: 'Lessons' }).getByRole('link').first().click();
  await page.getByRole('button', { name: 'Read this aloud' }).click();
  await expect.poll(async () => (await readSpeechLog(page)).spoken.length).toBeGreaterThan(0);
  expect((await readSpeechLog(page)).spoken.every((s) => s.localService)).toBe(true);
  const outside = urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(outside).toEqual([]);
});

test('the viewport meta tag does not disable zoom', async ({ request }) => {
  const html = await (await request.get('./')).text();
  const tag = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i)?.[0] ?? '';
  expect(tag).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
  expect(tag).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/i);
});

test('F-5: Export all data (ZIP) and the person export make no request outside the origin', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./#/client/data');
  await page.getByRole('button', { name: 'Export all data (ZIP)' }).click();
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" });
  await dialog.getByRole('textbox', { name: 'Confirmation code' }).fill('123456');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const outside = urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(outside).toEqual([]);
});
