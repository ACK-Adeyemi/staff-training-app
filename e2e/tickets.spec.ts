// M3 chunk 20a (BP-16, F-3): Help, tickets and app feedback end to end. Written before the implementation.
// Contract: see apps/web/src/pages/staff/helpStaff.test.tsx (S14 to S16) and apps/web/src/pages/client/helpClient.test.tsx
// (C23). Seed: Jade (staff) has T-1002 (resolved); Priya has T-1001 (in progress); Daniel raised T-1003. A new ticket
// is T-1004. Screenshots go through the real app/images prepareImage (canvas), so stored files are re-encoded JPEGs.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { containsText, exifJpeg, GPS_MARKER } from './helpers/files';
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
const next = (page: Page) => page.getByRole('button', { name: 'Next' });
const stepHeading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });
const screenshotInput = (page: Page) => page.locator('input[type="file"]:not([capture])');

/** Walks the steps up to the screenshots step, answering Notes / Something isn't working / Just a question. */
async function toScreenshots(page: Page, title: string, description: string) {
  await expect(stepHeading(page, 'Check Help first')).toBeVisible();
  await next(page).click();
  await page.getByRole('radio', { name: 'Notes' }).check();
  await next(page).click();
  await page.getByRole('radio', { name: "Something isn't working" }).check();
  await next(page).click();
  await page.getByRole('radio', { name: 'Just a question' }).check();
  await next(page).click();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('textbox', { name: 'What happened?' }).fill(description);
  await next(page).click();
  await expect(stepHeading(page, 'Add screenshots (optional)')).toBeVisible();
}

test('Jade raises a ticket with two screenshots, one blurred with a drawn box, in under a minute on a phone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone project only (390 by 844)');
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Jade/);
  const started = Date.now();
  await page.goto('./#/staff/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  await expectTouchTarget(page.getByRole('link', { name: 'Raise a ticket' }));
  await page.getByRole('link', { name: 'Raise a ticket' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Raise a ticket' })).toBeVisible();
  await noSeriousAxe(page);
  await expectTouchTarget(next(page));

  await toScreenshots(page, 'My notes will not save', 'I type a note and it is gone when I come back.');
  await noSeriousAxe(page);

  // The same photo twice: the first gets a box drawn with the mouse, the second is left alone.
  const photo = { name: 'screen.jpg', mimeType: 'image/jpeg', buffer: await exifJpeg(page) };
  await screenshotInput(page).setInputFiles(photo);
  const first = page.getByRole('group', { name: 'Screenshot 1' });
  await expect(first.getByRole('img', { name: 'Preview of screenshot 1' })).toBeVisible();
  const image = await first.getByRole('img', { name: 'Preview of screenshot 1' }).boundingBox();
  if (!image) throw new Error('no image box');
  await page.mouse.move(image.x + image.width * 0.1, image.y + image.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width * 0.6, image.y + image.height * 0.3, { steps: 6 });
  await page.mouse.move(image.x + image.width * 0.9, image.y + image.height * 0.4, { steps: 6 });
  await page.mouse.up();
  await expect(first.getByRole('button', { name: 'Blur box 1' })).toBeVisible();
  await screenshotInput(page).setInputFiles(photo);
  const second = page.getByRole('group', { name: 'Screenshot 2' });
  await expect(second.getByRole('img', { name: 'Preview of screenshot 2' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Blur box 1' })).toHaveCount(0);
  await expectTouchTarget(first.getByRole('button', { name: 'Remove image' }));
  await next(page).click();

  await expect(stepHeading(page, 'Check and send')).toBeVisible();
  const sent = page.getByRole('group', { name: 'Sent with your ticket' });
  await expectTouchTarget(sent.getByRole('button', { name: 'Remove: Device and browser' }));
  await sent.getByRole('button', { name: 'Remove: Device and browser' }).click();
  await expect(sent.getByText('Removed')).toBeVisible();
  await noSeriousAxe(page);
  await expectTouchTarget(page.getByRole('button', { name: 'Send ticket' }));
  await page.getByRole('button', { name: 'Send ticket' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your ticket T-1004 has been sent.' })).toBeVisible();
  await page.getByRole('link', { name: 'See my tickets' }).click();
  await expect(page.getByRole('link', { name: /T-1004.*My notes will not save/ })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);

  // Stored: the removed context item is gone, and both images are clean re-encoded JPEGs.
  const tickets = await readStore(page, 'tickets');
  const ticket = tickets.find((t) => t['number'] === 'T-1004');
  expect(ticket).toBeTruthy();
  const context = ticket?.['context'] as Record<string, string>;
  expect(Object.keys(context)).not.toContain('device');
  expect(Object.keys(context)).toContain('screen');
  const messages = (await readStore(page, 'ticketMessages')).filter((m) => m['ticketId'] === ticket?.['id']);
  expect(messages).toHaveLength(1);
  const ids = messages[0]?.['attachmentIds'] as string[];
  expect(ids).toHaveLength(2);
  const files = await readStore(page, 'attachments');
  const bytesOf = (id: string): number[] => {
    const row = files.find((f) => f['id'] === id);
    expect(row?.['purpose']).toBe('ticketScreenshot');
    expect(row?.['mime']).toBe('image/jpeg');
    return Array.from(row?.['data'] as ArrayLike<number>);
  };
  const [blurred, plain] = [bytesOf(ids[0] ?? ''), bytesOf(ids[1] ?? '')];
  for (const bytes of [blurred, plain]) {
    expect(bytes.slice(0, 2)).toEqual([0xff, 0xd8]);
    expect(containsText(bytes, 'Exif')).toBe(false);
    expect(containsText(bytes, GPS_MARKER)).toBe(false);
    expect(containsText(bytes, 'http://ns.adobe.com/xap')).toBe(false);
    expect(containsText(bytes, 'XMP')).toBe(false);
  }
  // The blurred copy is not the same encode as the untouched copy of the same file.
  expect(blurred).not.toEqual(plain);
});

test('a ticket shows in My tickets with its number, opens as a thread and takes a reply', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/help/ticket/new');
  await toScreenshots(page, 'Quiz will not start', 'I press Start and nothing happens.');
  await next(page).click();
  await expect(stepHeading(page, 'Check and send')).toBeVisible();
  await page.getByRole('button', { name: 'Send ticket' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your ticket T-1004 has been sent.' })).toBeVisible();
  await page.getByRole('link', { name: 'See my tickets' }).click();
  await page.getByRole('link', { name: /T-1004.*Quiz will not start/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ticket T-1004' })).toBeVisible();
  await noSeriousAxe(page);
  await page.getByRole('textbox', { name: 'Reply' }).fill('It also happens on the second quiz.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(
    page.getByRole('list', { name: 'Messages' }).getByText('It also happens on the second quiz.'),
  ).toBeVisible();
});

test('Jade finds an answer in Help, votes on it, and sends app feedback that goes to the product team', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/help');
  await page.getByLabel('Search help').fill('text size');
  await page.getByRole('button', { name: 'How do I change the text size?' }).click();
  await expect(page.getByText(/Choose a bigger text size/)).toBeVisible();
  await expectTouchTarget(page.getByRole('button', { name: 'Yes' }));
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thanks for letting us know.' })).toBeVisible();
  expect((await readStore(page, 'faqVotes')).map((v) => v['faqId'])).toContain('staff-textSize');

  await page.getByRole('button', { name: 'Send feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send feedback about the app' });
  await expect(dialog.getByText('This goes to the product team, not to your manager.')).toBeVisible();
  await noSeriousAxe(page);
  await dialog.getByRole('radio', { name: 'Praise' }).check();
  await dialog.getByRole('textbox', { name: 'Tell us more' }).fill('The quizzes are clear.');
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Thank you. The product team will read this.' }),
  ).toBeVisible();
  expect((await readStore(page, 'appFeedback')).some((f) => f['text'] === 'The quizzes are clear.')).toBe(true);
});

test('Priya sees organisation tickets on Help and can read but not answer a ticket Daniel raised', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  await noSeriousAxe(page);
  await expect(page.getByRole('button', { name: 'How do I add staff and invite them?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'How do I see what I must complete?' })).toHaveCount(0);
  const org = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Organisation tickets' }) });
  await expect(org.getByRole('link', { name: /T-1003/ })).toBeVisible();
  await expect(org.getByRole('link', { name: /T-1002/ })).toHaveCount(0);
  await org.getByRole('link', { name: /T-1003/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ticket T-1003' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Reply' })).toHaveCount(0);
});

test('Jade cannot raise a ticket once the organisation switches staff tickets off', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/settings');
  await page.getByRole('checkbox', { name: /Let staff raise support tickets/ }).uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Raise a ticket' })).toHaveCount(0);
  await page.goto('./#/staff/help/ticket/new');
  await expect(page.getByRole('alert')).toContainText(
    'Support requests from staff are switched off. Ask your manager.',
  );
});
