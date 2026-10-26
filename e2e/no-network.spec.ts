// F-9: no requests leave the preview origin, and the built index.html carries the CSP meta tag.
import { expect, test } from '@playwright/test';

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
