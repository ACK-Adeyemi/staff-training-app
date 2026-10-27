// M3 chunk 17 (BP-15, F-4 files part, F-5): external evidence end to end. Written before the implementation.
// Contract: see apps/web/src/pages/staff/evidenceStaff.test.tsx (S8, S17) and
// apps/web/src/pages/client/evidenceClient.test.tsx (C27, first aiders, C3). Seed: Mark's Paediatric first aid is
// overdue; Ben's safeguarding certificate waits (4 working days); Kasia's was approved earlier.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { containsText, exifJpeg, GPS_MARKER, minimalPdf, storedFileBytes } from './helpers/files';
import { readStore } from './helpers/idb';

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
const choosePlainFile = (page: Page) => page.locator('input[type="file"]:not([capture])');

/** Mark opens My compliance, picks Paediatric first aid, adds a file and sends it. */
async function markUploads(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  await page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Upload certificate' })).toBeVisible();
  await choosePlainFile(page).setInputFiles(file);
  await page
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Approved paediatric first aid training provider');
  await page.getByLabel('Date you finished the course').fill('2026-10-12');
  await page.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await page.getByRole('button', { name: 'Send for checking' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent. Your manager will check it.' })).toBeVisible();
}
async function danielReviews(page: Page, mark = true) {
  await jumpTo(page, /Daniel/);
  await page.goto('./#/client/evidence');
  await expect(page.getByRole('heading', { level: 1, name: 'Evidence to check' })).toBeVisible();
  if (mark) await page.getByRole('link', { name: 'Mark Taylor' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check a certificate' })).toBeVisible();
}

test('Mark uploads a photo of his certificate in under a minute and its location data is gone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone project only (390 by 844)');
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Mark/);
  const started = Date.now();
  await page.goto('./#/staff/progress');
  await expectTouchTarget(page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }));
  await page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Upload certificate' })).toBeVisible();
  await expectTouchTarget(
    page.getByRole('button', { name: 'Take a photo' }),
    page.getByRole('button', { name: 'Choose a file' }),
  );
  await noSeriousAxe(page);
  await choosePlainFile(page).setInputFiles({
    name: 'certificate.jpg',
    mimeType: 'image/jpeg',
    buffer: await exifJpeg(page),
  });
  await expect(page.getByRole('img', { name: 'Preview of your certificate' })).toBeVisible();
  await page.getByRole('button', { name: 'Add box' }).click();
  await page
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Approved paediatric first aid training provider');
  await page.getByLabel('Date you finished the course').fill('2026-10-12');
  await page.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await noSeriousAxe(page);
  await expectTouchTarget(page.getByRole('button', { name: 'Send for checking' }));
  await page.getByRole('button', { name: 'Send for checking' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent. Your manager will check it.' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);

  const files = (await readStore(page, 'attachments')).filter(
    (a) => a['purpose'] === 'certificate' && a['mime'] === 'image/jpeg',
  );
  expect(files).toHaveLength(1);
  const bytes = await storedFileBytes(page, String(files[0]?.['id']));
  expect(bytes.slice(0, 2)).toEqual([0xff, 0xd8]);
  expect(containsText(bytes, 'Exif')).toBe(false);
  expect(containsText(bytes, GPS_MARKER)).toBe(false);

  await page.goto('./#/staff/progress');
  await expect(page.getByRole('row', { name: /Paediatric first aid/ })).toContainText('Waiting for a check');
});

test("Daniel approves Mark's certificate, Mark turns current and appears on the first aiders list", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page);
  await markUploads(page, { name: 'certificate.pdf', mimeType: 'application/pdf', buffer: minimalPdf() });

  await danielReviews(page);
  await noSeriousAxe(page);
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('Mark Taylor');
  await expectTouchTarget(page.getByRole('button', { name: 'Approve' }));
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved.' })).toBeVisible();

  await page.goto('./#/print/first-aiders');
  await expect(page.getByRole('heading', { level: 1, name: 'First aiders' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Mark Taylor');
  await expect(page.getByRole('main')).toContainText('Approved by Daniel');
  await noSeriousAxe(page);

  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  const row = page.getByRole('row', { name: /Paediatric first aid/ });
  await expect(row).toContainText('Current');
  await expect(row).not.toContainText('Overdue');
});

test('a better copy and then a rejection show their messages to Mark, who can resubmit', async ({ page }) => {
  test.setTimeout(150_000);
  await start(page);
  await markUploads(page, { name: 'certificate.pdf', mimeType: 'application/pdf', buffer: minimalPdf() });

  await danielReviews(page);
  await page.getByRole('button', { name: 'Ask for a better copy' }).click();
  const better = page.getByRole('dialog', { name: 'Ask for a better copy' });
  await better.getByRole('textbox', { name: 'Note to the person' }).fill('The date is cut off. Please retake it.');
  await better.getByRole('button', { name: 'Send decision' }).click();
  await expect(better).toBeHidden();

  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  const row = page.getByRole('row', { name: /Paediatric first aid/ });
  await expect(row).toContainText('Needs a better copy');
  await expect(row).toContainText('The date is cut off. Please retake it.');
  await row.getByRole('link', { name: 'Resubmit: Paediatric first aid' }).click();
  await choosePlainFile(page).setInputFiles({
    name: 'retake.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf(),
  });
  await page
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Approved paediatric first aid training provider');
  await page.getByLabel('Date you finished the course').fill('2026-10-12');
  await page.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await page.getByRole('button', { name: 'Resubmit' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  const subs = (await readStore(page, 'evidenceSubmissions')).filter((s) => s['providerName'] !== undefined);
  expect(subs.filter((s) => s['status'] === 'awaitingCheck').length).toBeGreaterThan(0);

  await danielReviews(page);
  await page.getByRole('button', { name: 'Do not accept' }).click();
  const reject = page.getByRole('dialog', { name: 'Do not accept' });
  await reject.getByRole('combobox', { name: 'Reason' }).selectOption('Name does not match');
  await reject.getByRole('textbox', { name: 'Note to the person' }).fill('This one is for someone else.');
  await reject.getByRole('button', { name: 'Send decision' }).click();
  await expect(reject).toBeHidden();

  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  await expect(row).toContainText('Name does not match');
  await expect(row).toContainText('This one is for someone else.');
  await expect(row.getByRole('link', { name: 'Resubmit: Paediatric first aid' })).toBeVisible();
});

test('Daniel cannot approve a certificate Priya uploaded about him', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/people');
  await page.getByRole('link', { name: 'Daniel Hughes' }).click();
  await page.getByRole('button', { name: /^Upload certificate: Paediatric first aid/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload a certificate for Daniel Hughes' });
  await dialog.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'paper.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf(),
  });
  await dialog
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Local authority paediatric first aid course');
  await dialog.getByLabel('Date you finished the course').fill('2026-10-12');
  await dialog.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await dialog.getByRole('button', { name: 'Send for checking' }).click();
  await expect(dialog.getByRole('status')).toContainText('Sent. Your manager will check it.');

  await jumpTo(page, /Daniel/);
  await page.goto('./#/client/evidence');
  await page.getByRole('link', { name: 'Daniel Hughes' }).click();
  await expect(page.getByText("You can't approve a certificate you uploaded or one about yourself.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
});
