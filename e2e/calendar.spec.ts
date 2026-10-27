// M3 chunk 18b (BP-13, F-4, F-5; Track A step 2): calendars end to end, on phone and desktop. Written before the
// implementation. UI contract: apps/web/src/pages/staff/calendarStaff.test.tsx (S18) and
// apps/web/src/pages/client/calendarClient.test.tsx (C28). The clock is pinned at Monday 19 October 2026 09:00 UTC as
// the seeded Track A does. The downloaded .ics files are read back and parsed as RFC 5545 content lines.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { minimalPdf } from './helpers/files';
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
async function fastForward7(page: Page) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page)
    .getByRole('button', { name: /^Fast-forward 7 days?$/ })
    .click();
  await page.keyboard.press('Escape');
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

type Line = { name: string; params: string; value: string };
async function readIcs(download: Download): Promise<{ text: string; lines: Line[] }> {
  const text = readFileSync(await download.path()).toString('utf8');
  const lines = text
    .replace(/\r\n[ \t]/g, '')
    .split('\r\n')
    .filter((l) => l !== '')
    .map((line) => {
      const colon = line.indexOf(':');
      const [name = '', ...rest] = line.slice(0, colon).split(';');
      return { name, params: rest.join(';'), value: line.slice(colon + 1) };
    });
  return { text, lines };
}
const ALLOWED = new Set([
  'BEGIN',
  'END',
  'PRODID',
  'VERSION',
  'CALSCALE',
  'METHOD',
  'UID',
  'DTSTAMP',
  'DTSTART',
  'DTEND',
  'SUMMARY',
]);
function expectRfcShape(text: string, lines: Line[]) {
  expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  expect(text).not.toMatch(/(?<!\r)\n/);
  for (const raw of text.split('\r\n')) expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(75);
  expect(lines.find((l) => l.name === 'VERSION')?.value).toBe('2.0');
  expect(lines.some((l) => l.name === 'PRODID')).toBe(true);
  for (const l of lines) expect(ALLOWED.has(l.name), `property ${l.name} is allowed`).toBe(true);
  const events = lines.filter((l) => l.name === 'BEGIN' && l.value === 'VEVENT').length;
  expect(lines.filter((l) => l.name === 'END' && l.value === 'VEVENT')).toHaveLength(events);
  for (const n of ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY']) {
    expect(lines.filter((l) => l.name === n)).toHaveLength(events);
  }
  for (const l of lines.filter((x) => x.name === 'DTSTART' || x.name === 'DTEND')) {
    expect(l.params).toBe('VALUE=DATE');
    expect(l.value).toMatch(/^\d{8}$/);
  }
  expect(text).not.toMatch(/DESCRIPTION|LOCATION|URL|ATTENDEE|ORGANIZER|https?:/);
  return events;
}

test('Jade sees her Safeguarding refresher under Later, on a page that passes axe with 44px targets', async ({
  page,
}) => {
  await start(page);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/calendar');
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  const later = page.getByRole('region').filter({ has: page.getByRole('heading', { name: 'Later' }) });
  await expect(later.locator('li[data-kind="assignmentDue"]')).toContainText('Safeguarding and whistleblowing');
  await expect(page.locator('li[data-kind="planRenewal"], li[data-kind="invoiceDue"]')).toHaveCount(0);
  await noSeriousAxe(page);
  await expectTouchTarget(
    page.getByRole('button', { name: 'Download all (.ics)' }),
    page.getByRole('button', { name: /^Add to phone calendar/ }).first(),
    page.getByRole('button', { name: 'Start training' }).first(),
    page.getByRole('radio', { name: 'Month' }),
  );
  await page.getByRole('radio', { name: 'Month' }).check();
  await expect(page.getByRole('grid')).toBeVisible();
  await noSeriousAxe(page);
});

test('Jade adds one item and then everything to her phone calendar; the files hold only titles and dates', async ({
  page,
}) => {
  await start(page);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/calendar');
  const item = page.locator('li[data-kind="assignmentDue"]').first();
  await expect(item).toBeVisible();

  const [one] = await Promise.all([
    page.waitForEvent('download'),
    item.getByRole('button', { name: /^Add to phone calendar/ }).click(),
  ]);
  expect(one.suggestedFilename()).toMatch(/\.ics$/);
  const single = await readIcs(one);
  expect(expectRfcShape(single.text, single.lines)).toBe(1);
  expect(single.lines.find((l) => l.name === 'SUMMARY')?.value).toMatch(/Safeguarding and whistleblowing/);
  expect(single.lines.find((l) => l.name === 'DTSTART')?.value).toBe('20261102');
  expect(single.lines.find((l) => l.name === 'DTEND')?.value).toBe('20261103');
  expect(single.lines.find((l) => l.name === 'DTSTAMP')?.value).toBe('20261019T090000Z');

  const listed = await page.locator('li[data-kind]').count();
  const [all] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (.ics)' }).click(),
  ]);
  const everything = await readIcs(all);
  expect(expectRfcShape(everything.text, everything.lines)).toBe(listed);
  expect(everything.text).not.toMatch(/Hannah|Chris Wood|Lucy|Priya|Daniel/);
  expect(everything.text).not.toMatch(/01[0-9A-HJKMNP-TV-Z]{24}/);
});

test('after Fast-forward the calendar moves the due date from Later to Next week and then Today', async ({ page }) => {
  test.setTimeout(150_000);
  await start(page);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/calendar');
  const group = (name: string) =>
    page.getByRole('region').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(group('Later').locator('li[data-kind="assignmentDue"]')).toHaveCount(1);
  await fastForward7(page);
  await page.goto('./#/staff/calendar');
  await expect(group('Next week').locator('li[data-kind="assignmentDue"]')).toHaveCount(1);
  await expect(group('Later').locator('li[data-kind="assignmentDue"]')).toHaveCount(0);
  await fastForward7(page);
  await page.goto('./#/staff/calendar');
  await expect(group('Today').locator('li[data-kind="assignmentDue"]')).toHaveCount(1);
});

test('Home and My compliance link to the calendar', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff');
  await page.getByRole('link', { name: 'See calendar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  await page.goto('./#/staff/progress');
  await page.getByRole('main').getByRole('link', { name: 'Calendar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
});

test('Track A step 2: Priya sees 3 Safeguarding expiries, assigns the week, and Hannah, Chris and Lucy have open assignments', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/calendar');
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  const cluster = page
    .getByRole('region', { name: 'Many expiring in the same week' })
    .getByRole('listitem')
    .filter({ hasText: '3 Safeguarding expiries' });
  await expect(cluster).toContainText('2 November 2026');
  await noSeriousAxe(page);
  await expectTouchTarget(cluster.getByRole('button', { name: 'Assign refresher for a week' }));

  await cluster.getByRole('button', { name: 'Assign refresher for a week' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign refresher for a week' });
  for (const name of ['Hannah Patel', 'Chris Wood', 'Lucy Evans']) await expect(dialog).toContainText(name);
  await expect(dialog).toContainText('3 November 2026');
  await noSeriousAxe(page);
  const before = (await readStore(page, 'assignments')).length;
  expect(before).toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Assigned to 3 people.' })).toBeVisible();

  const people = (await readStore(page, 'people')) as { id: string; firstName: string; lastName: string }[];
  const modules = (await readStore(page, 'modules')) as { id: string; title: string }[];
  const sg = modules.find((m) => m.title === 'Safeguarding and whistleblowing');
  const assignments = (await readStore(page, 'assignments')) as {
    personId: string;
    status: string;
    target: { moduleId?: string };
  }[];
  expect(assignments.length).toBe(before + 3);
  for (const first of ['Hannah', 'Chris', 'Lucy']) {
    const p = people.find((x) => x.firstName === first);
    expect(
      assignments.some((a) => a.personId === p?.id && a.status === 'open' && a.target.moduleId === sg?.id),
      `${first} has an open Safeguarding assignment`,
    ).toBe(true);
  }

  await page.goto('./#/client/rules');
  const row = page.getByRole('listitem').filter({ hasText: 'Safeguarding refresher 60 days before expiry' });
  await expect(row).toContainText(/60 days before .*Safeguarding.* expires, assign Safeguarding and whistleblowing/);
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('Priya filters, switches to Month, downloads the team .ics with counts not names, and prints', async ({
  page,
}) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/calendar');
  await expect(page.locator('li[data-kind="expiry"]').first()).toBeVisible();
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('combobox', { name: 'Training' })
    .selectOption('Safeguarding');
  await expect(page.locator('li[data-kind]').filter({ hasText: 'Food hygiene' })).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('combobox', { name: 'Training' })
    .selectOption({ index: 0 });
  await page.getByRole('radio', { name: 'Month' }).check();
  await expect(page.getByRole('grid')).toBeVisible();
  await noSeriousAxe(page);
  await page.getByRole('radio', { name: 'List' }).check();

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (.ics)' }).click(),
  ]);
  const { text, lines } = await readIcs(dl);
  expectRfcShape(text, lines);
  expect(lines.some((l) => l.name === 'SUMMARY' && l.value.includes('3 Safeguarding expiries'))).toBe(true);
  expect(text).not.toMatch(/Hannah|\bChris\b|Lucy|Mark Taylor|Jade|Ben Carter|Ellie/);

  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await page.getByRole('button', { name: 'Print' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});

test('billing dates show for Priya and not for Daniel', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  const expand = async () => {
    for (let i = 0; i < 6 && (await page.getByRole('button', { name: 'See further' }).count()) > 0; i++) {
      await page.getByRole('button', { name: 'See further' }).click();
    }
  };
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/calendar');
  await expect(page.locator('li[data-kind]').first()).toBeVisible();
  await expand();
  await expect(page.locator('li[data-kind="planRenewal"]')).toHaveCount(1);

  await jumpTo(page, /Daniel/);
  await page.goto('./#/client/calendar');
  await expect(page.locator('li[data-kind]').first()).toBeVisible();
  await expand();
  await expect(
    page.locator(
      'li[data-kind="planRenewal"], li[data-kind="invoiceDue"], li[data-kind="addOnTrialEnd"], li[data-kind="accountStateChange"]',
    ),
  ).toHaveCount(0);
});

test("the first aiders forecast rises when Daniel approves Mark's first aid certificate", async ({ page }) => {
  test.setTimeout(150_000);
  await start(page);
  const read = async () => {
    const region = page.getByRole('region', { name: 'First aiders forecast' });
    await expect(region).toContainText('First aiders now:');
    const now = Number(/First aiders now: (\d+)/.exec((await region.textContent()) ?? '')?.[1]);
    const lastCells = await region.getByRole('row').locator('td:last-child').allTextContents();
    return { now, counts: lastCells.map(Number) };
  };
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/calendar');
  const base = await read();

  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  await page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }).click();
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'certificate.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf(),
  });
  await page
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Approved paediatric first aid training provider');
  await page.getByLabel('Date you finished the course').fill('2026-10-12');
  await page.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await page.getByRole('button', { name: 'Send for checking' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent. Your manager will check it.' })).toBeVisible();

  await jumpTo(page, /Daniel/);
  await page.goto('./#/client/evidence');
  await expect(page.getByRole('heading', { level: 1, name: 'Evidence to check' })).toBeVisible();
  await page.getByRole('link', { name: 'Mark Taylor' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved.' })).toBeVisible();

  await page.goto('./#/client/calendar');
  const after = await read();
  expect(after.now).toBe(base.now + 1);
  expect(after.counts).toHaveLength(base.counts.length);
  after.counts.forEach((n, i) => {
    expect(n).toBe((base.counts[i] as number) + 1);
  });
});
