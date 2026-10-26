// M1 chunk 11 (BP-6): the training matrix prints to PDF in Chromium (A4 landscape) without losing columns or rows.
// Needs the production build (scripts/check.sh builds first) and pdftotext (poppler-utils) on the machine.
// Writes test-results/matrix.pdf and test-results/matrix-print.png for the visual review recorded in docs/progress.md.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'desktop project only');

// A4 landscape is 1123 by 794 CSS px at 96 dpi; the 12mm margins take 45px from each side.
const PRINTABLE_WIDTH = 1123 - 2 * 45;

const pdfText = (file: string, layout: boolean): string =>
  execFileSync('pdftotext', [...(layout ? ['-layout'] : []), file, '-'], { encoding: 'utf8' });

test('Priya opens the matrix and prints it to a landscape PDF that keeps every person and column', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  await page.goto('./#/client/reports');
  await page.getByRole('link', { name: /training matrix/i }).click();
  await expect(page).toHaveURL(/#\/client\/reports\/matrix$/);
  const table = page.getByRole('table', { name: /training matrix/i });
  await expect(table).toBeVisible();

  const columns = (await table.getByRole('columnheader').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  const people = (await table.getByRole('rowheader').allInnerTexts()).map((s) => s.trim());
  expect(columns[0]).toBe('Name');
  expect(columns.length).toBeGreaterThan(4);
  for (const name of ['Maureen Clarke', 'Mark Taylor', 'Jade Mills']) expect(people).toContain(name);
  expect(people.join('|')).not.toContain('Olivia Grant');

  // Print view: A4 landscape printable width, navigation and the Demo badge gone.
  await page.setViewportSize({ width: PRINTABLE_WIDTH, height: 700 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByTestId('demo-badge')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.getByText('Inspector-ready training matrix')).toBeVisible();
  await expect(page.getByText('Contains personal data. Keep it safe.')).toBeVisible();
  for (const word of ['Due soon', 'Overdue', 'Not assigned']) {
    await expect(table.getByText(word).first()).toBeVisible();
  }
  const overflow = await page.evaluate((limit) => {
    const bad: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > limit + 1) bad.push(`${el.tagName} ${el.textContent.slice(0, 30)}`);
    }
    return { bad: bad.slice(0, 5), scrollWidth: document.documentElement.scrollWidth };
  }, PRINTABLE_WIDTH);
  expect(overflow.bad, 'elements wider than the printable width').toEqual([]);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(PRINTABLE_WIDTH + 1);

  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/matrix-print.png', fullPage: true });

  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  writeFileSync('test-results/matrix.pdf', pdf);
  expect(readFileSync('test-results/matrix.pdf').length).toBeGreaterThan(2000);

  const flat = pdfText('test-results/matrix.pdf', false);
  const layout = pdfText('test-results/matrix.pdf', true);
  const pages = layout.split('\f').filter((p) => p.trim().length > 0);
  expect(pages.length, 'a 14-person matrix fits in a few landscape pages').toBeLessThanOrEqual(3);

  // Landscape: the first page is wider than it is tall (pdftotext reports the page box in points).
  const info = execFileSync('pdfinfo', ['test-results/matrix.pdf'], { encoding: 'utf8' });
  const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  expect(Number(size?.[1])).toBeGreaterThan(Number(size?.[2]));

  expect(flat).toContain('Inspector-ready training matrix');
  expect(flat).toContain('Contains personal data. Keep it safe.');
  for (const name of people) {
    const [first, last] = name.split(' ');
    expect(flat, `${name} in the PDF`).toContain(first);
    expect(flat, `${name} in the PDF`).toContain(last);
  }
  // No truncation: every word of every column heading, including the last column, reaches the PDF.
  for (const heading of columns) {
    for (const word of heading.split(' ').filter((w) => w.length > 2)) {
      expect(flat, `column "${heading}" word "${word}" in the PDF`).toContain(word);
    }
  }
  const lastColumn = columns[columns.length - 1] as string;
  expect(flat).toContain(lastColumn.split(' ')[0]);
  for (const word of ['Due soon', 'Overdue', 'Not assigned']) expect(flat.replace(/\s+/g, ' ')).toContain(word);
});
