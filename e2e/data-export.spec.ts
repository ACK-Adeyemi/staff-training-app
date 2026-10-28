// M3 chunk 20b (BP-19, F-4, F-5): C22 Data and retention and the C3 person export and erase, end to end. Written
// before the implementation. The ZIP is downloaded and read back with fflate unzipSync. The step-up code is the demo
// code 123456. Priya (Account Owner) is the default client persona. See
// apps/web/src/pages/client/dataRetention.test.tsx and personData.test.tsx for the UI contract.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readStore } from './helpers/idb';

async function start(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  await page.goto('./#/client/data');
  await expect(page.getByRole('heading', { level: 1, name: 'Data and retention' })).toBeVisible();
}
async function noSeriousAxe(page: Page) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
async function readZipDownload(d: Download) {
  const files = unzipSync(new Uint8Array(readFileSync(await d.path())));
  return { files, names: Object.keys(files).sort(), text: (n: string) => strFromU8(files[n] ?? new Uint8Array()) };
}

test('Priya exports all data: the ZIP holds the CSV files, data.json and certificate files, and no notes', async ({
  page,
}) => {
  await start(page);
  await noSeriousAxe(page);
  const button = page.getByRole('button', { name: 'Export all data (ZIP)' });
  expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  await button.click();
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" });
  await dialog.getByRole('textbox', { name: 'Confirmation code' }).fill('000000');
  await dialog.getByRole('button', { name: 'Download' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('That code is not right.');
  await dialog.getByRole('textbox', { name: 'Confirmation code' }).fill('123456');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-export-2026-10-19\.zip$/);
  await expect(page.getByRole('status').filter({ hasText: 'Your export is ready.' })).toBeVisible();
  const zip = await readZipDownload(download);
  for (const n of [
    'people.csv',
    'requirements-status.csv',
    'evidence.csv',
    'assignments.csv',
    'attempts.csv',
    'training-matrix.csv',
    'data.json',
    'README.txt',
  ]) {
    expect(zip.names, n).toContain(n);
  }
  expect(zip.names.filter((n) => n.startsWith('certificates/') && !n.endsWith('/')).length).toBeGreaterThan(0);
  const data = JSON.parse(zip.text('data.json')) as { people: { firstName: string }[] };
  expect(data.people.some((p) => p.firstName === 'Kasia')).toBe(true);
  // Only this client: nobody from another organisation, and no learner notes or display preferences anywhere.
  expect(zip.text('people.csv')).not.toMatch(/Nadia|Tariq/);
  expect(zip.names.some((n) => n.toLowerCase().includes('note'))).toBe(false);
  expect(Object.keys(JSON.parse(zip.text('data.json')) as object)).not.toContain('notes');
  const notes = await readStore(page, 'notes');
  for (const note of notes) {
    const body = (note as { body?: string }).body;
    if (body) for (const n of zip.names) expect(zip.text(n)).not.toContain(body);
  }
});

test('Priya changes a retention setting and it is still there after a reload', async ({ page }) => {
  await start(page);
  const months = page.getByLabel('Keep leaver records for (months)');
  await months.fill('60');
  await page.getByRole('button', { name: 'Save retention settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Retention settings saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Keep leaver records for (months)')).toHaveValue('60');
  await months.fill('3');
  await page.getByRole('button', { name: 'Save retention settings' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('Priya exports one person and then anonymises them: the Evidence stays, the name goes', async ({ page }) => {
  await start(page);
  await page.goto('./#/client/people');
  await page.getByRole('link', { name: 'Kasia Nowak' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kasia Nowak' })).toBeVisible();

  await page.getByRole('button', { name: 'Export this person' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export this person' });
  await exportDialog.getByRole('textbox', { name: 'Confirmation code' }).fill('123456');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportDialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  const zip = await readZipDownload(download);
  expect((JSON.parse(zip.text('data.json')) as { people: unknown[] }).people).toHaveLength(1);
  expect(zip.text('people.csv')).toContain('Kasia');
  await page.keyboard.press('Escape');

  const evidenceBefore = (await readStore(page, 'evidence')).length;
  await page.getByRole('button', { name: 'Erase or anonymise' }).click();
  const dialog = page.getByRole('dialog', { name: 'Erase or anonymise Kasia Nowak' });
  await expect(
    dialog.getByText('Anonymise keeps their training records and certificates, without their name.'),
  ).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Type Kasia Nowak to confirm' }).fill('Kasia Nowak');
  await dialog.getByRole('textbox', { name: 'Confirmation code' }).fill('123456');
  await dialog.getByRole('button', { name: 'Erase' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kasia Nowak was anonymised.' })).toBeVisible();
  expect((await readStore(page, 'evidence')).length).toBe(evidenceBefore);
  const people = await readStore(page, 'people');
  expect(JSON.stringify(people)).not.toContain('Nowak');
});
