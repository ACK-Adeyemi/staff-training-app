// F-9: no requests leave the preview origin, and the built index.html carries the CSP meta tag.
import { expect, test } from '@playwright/test';
import { exifJpeg } from './helpers/files';
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

// M3 chunk 21 (F-5): upload, .ics download, QR enrolment and Demo AI make no request outside the origin.
const PINNED = new Date('2026-10-19T09:00:00.000Z');
const offOrigin = (urls: string[]) =>
  urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
async function jump(page: import('@playwright/test').Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  const panel = page.getByRole('dialog', { name: 'Presenter panel' });
  await panel.getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel).toBeHidden();
}

test('F-5: a certificate upload, a .ics download and the Demo AI make no request outside the origin', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: PINNED });
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./');
  await jump(page, /Mark/);
  await page.goto('./#/staff/progress');
  await page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }).click();
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'certificate.jpg',
    mimeType: 'image/jpeg',
    buffer: await exifJpeg(page),
  });
  await page
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Approved paediatric first aid training provider');
  await page.getByLabel('Date you finished the course').fill('2026-10-12');
  await page.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await page.getByRole('button', { name: 'Send for checking' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent. Your manager will check it.' })).toBeVisible();

  await jump(page, /Jade/);
  await page.goto('./#/staff/calendar');
  const [ics] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (.ics)' }).click(),
  ]);
  expect(ics.suggestedFilename()).toMatch(/\.ics$/);

  await jump(page, /Priya/);
  await page.goto('./#/client/billing/add-ons');
  await page.getByRole('region', { name: 'AI Assistant' }).getByRole('button', { name: 'Turn on' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /confirm/i })
    .click();
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toContainText('On');
  await page.goto('./#/client/modules/01M0C0N7000000000000000201/preview/lesson-1');
  await page.getByRole('button', { name: /explain this in simpler words/i }).click();
  await expect(page.getByTestId('explain-result')).toContainText('Demo AI');
  expect(offOrigin(urls)).toEqual([]);
});

test('F-5: the QR code on two-step enrolment makes no request outside the origin', async ({ page }) => {
  await page.clock.install({ time: PINNED });
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./');
  await jump(page, /Daniel/);
  await page.getByTestId('two-factor-banner').getByRole('link').click();
  await page.getByRole('button', { name: 'Start set-up' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await expect(page.locator('main svg, main img, main canvas').first()).toBeVisible();
  expect(offOrigin(urls)).toEqual([]);
});

// M5 chunk 13 (F-8): tours, the practice quiz, Draft from a policy, Polish and read-aloud make no request outside the origin.
test('F-8: both tours, with Show me on every step, make no request outside the origin', async ({ page }) => {
  test.setTimeout(150_000);
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  for (const [button, steps] of [
    ['Client tour', 9],
    ['Provider tour', 7],
  ] as const) {
    await page.goto('./');
    await page.getByRole('button', { name: button }).click();
    await page
      .getByRole('dialog', { name: 'Start the tour from the beginning?' })
      .getByRole('button', { name: 'Confirm' })
      .click();
    for (let n = 1; n <= steps; n++) {
      const box = page.getByRole('complementary', { name: `Tour, step ${String(n)} of ${String(steps)}` });
      await expect(box).toBeVisible();
      await box.getByRole('button', { name: 'Show me' }).click();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await box.getByRole('button', { name: /^Next$|^Finish$/ }).click();
    }
  }
  expect(urls.length).toBeGreaterThan(0);
  expect(offOrigin(urls)).toEqual([]);
});

test('F-8: Polish staff screens, the practice quiz and read-aloud make no request outside the origin', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installSpeechRecorder(page);
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Kasia/ }).check();
  await page.getByLabel(/PIN/).fill('1234');
  await page.getByRole('button', { name: /Sign in|Zaloguj/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  for (const hash of ['#/staff', '#/staff/learn', '#/staff/me', '#/staff/help', '#/staff/progress']) {
    await page.goto('about:blank');
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  await page.goto('./#/staff/module/01M0C0N7000000000000000201/practice');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.goto('./#/staff/module/01M0C0N7000000000000000201');
  await page
    .getByRole('region', { name: /Lekcje|Lessons/ })
    .getByRole('link')
    .first()
    .click();
  await page.getByRole('button', { name: 'Przeczytaj to na głos' }).first().click();
  await expect.poll(async () => (await readSpeechLog(page)).spoken.length).toBeGreaterThan(0);
  expect(offOrigin(urls)).toEqual([]);
});

test('F-8: Draft from a policy and Quiz me for practice make no request outside the origin', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: PINNED });
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./');
  await jump(page, /Priya/);
  await page.goto('./#/client/billing/add-ons');
  const region = page.getByRole('region', { name: 'AI Assistant' });
  await region.getByRole('button', { name: 'Turn on' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /confirm/i })
    .click();
  await expect(region).toContainText('On');
  await page.goto('./#/client/modules/new');
  await page
    .getByRole('textbox', { name: 'Paste your policy' })
    .fill('Outings policy\n\n# Before we go\nA named adult counts the children.\n\n# On the way\nChildren hold hands.');
  await page.getByRole('button', { name: 'Make a draft' }).click();
  await expect(page.getByTestId('ai-label').first()).toBeVisible();
  await jump(page, /Jade/);
  await page.goto('./#/staff/module/01M0C0N7000000000000000201/practice');
  await expect(page.getByText('Demo AI').first()).toBeVisible();
  expect(offOrigin(urls)).toEqual([]);
});
