// M3 chunk 18a (BP-6, F-7): reminders and notifications end to end, on phone and desktop. Written before the
// implementation. UI contract: apps/web/src/pages/client/remindersNotifications.test.tsx (C16, S13) and rules.test.tsx
// (C5, C2, C3). Fast-forward runs the scheduled jobs (M3 assumption 27), which write reminder Notifications and
// Outbox messages and nothing else.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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
type Note = { id: string; userId: string; kind: string; createdAt: string; snoozedUntil?: string };
const reminderNotes = async (page: Page) =>
  ((await readStore(page, 'notifications')) as Note[]).filter((n) => n.kind === 'reminder');

test('Fast-forward 7 days adds reminders to the Outbox and notifications, no more than the default weekly limit', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/reminders');
  await expect(page.getByRole('heading', { level: 1, name: 'Reminders' })).toBeVisible();
  await noSeriousAxe(page);
  const outboxBefore = (await readStore(page, 'outbox')).length;
  const before = await reminderNotes(page);

  await fastForward7(page);

  const after = await reminderNotes(page);
  const added = after.filter((n) => !before.some((b) => b.id === n.id));
  expect(added.length).toBeGreaterThan(0);
  expect((await readStore(page, 'outbox')).length).toBeGreaterThanOrEqual(outboxBefore + added.length);
  const perUser = new Map<string, number>();
  for (const n of added) perUser.set(n.userId, (perUser.get(n.userId) ?? 0) + 1);
  for (const count of perUser.values()) expect(count).toBeLessThanOrEqual(3);
  const keys = ((await readStore(page, 'reminderLog')) as { key: string }[]).map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test('a weekly limit of 1 saved on Reminders holds after Fast-forward 7 days', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/reminders');
  const form = page.getByRole('form', { name: 'Reminder settings' });
  const cap = form.getByRole('spinbutton', { name: 'Weekly limit per person' });
  await expectTouchTarget(cap, form.getByRole('button', { name: 'Save reminder settings' }));
  await cap.fill('1');
  await form.getByRole('button', { name: 'Save reminder settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reminder settings saved.' })).toBeVisible();
  const before = await reminderNotes(page);

  await fastForward7(page);

  const added = (await reminderNotes(page)).filter((n) => !before.some((b) => b.id === n.id));
  expect(added.length).toBeGreaterThan(0);
  const perUser = new Map<string, number>();
  for (const n of added) perUser.set(n.userId, (perUser.get(n.userId) ?? 0) + 1);
  for (const count of perUser.values()) expect(count).toBe(1);
});

test('Chase all overdue previews who is reminded, then sends to the Outbox only', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/reminders');
  const outboxBefore = (await readStore(page, 'outbox')).length;
  await page.getByRole('button', { name: 'Chase all overdue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chase all overdue' });
  await expect(dialog.getByRole('list', { name: 'Will get a reminder' })).toContainText('Mark Taylor');
  await noSeriousAxe(page);
  expect((await readStore(page, 'outbox')).length).toBe(outboxBefore);
  await dialog.getByRole('button', { name: 'Send reminders' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Reminders sent: \d+\./ })).toBeVisible();
  expect((await readStore(page, 'outbox')).length).toBeGreaterThan(outboxBefore);
});

test('a staff member snoozes a reminder with Remind me tomorrow and it is hidden', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await jumpTo(page, /Priya/);
  const before = await reminderNotes(page);
  await fastForward7(page);
  const added = (await reminderNotes(page)).filter((n) => !before.some((b) => b.id === n.id));
  expect(added.length).toBeGreaterThan(0);
  const target = added[0] as Note;
  const users = (await readStore(page, 'users')) as { id: string; displayName: string }[];
  const first = (users.find((u) => u.id === target.userId)?.displayName ?? '').split(' ')[0] ?? '';
  expect(first).not.toBe('');

  await jumpTo(page, new RegExp(first));
  await page.goto('./#/staff/notifications');
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await noSeriousAxe(page);
  const items = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Remind me tomorrow' }) });
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  await expectTouchTarget(items.first().getByRole('button', { name: 'Remind me tomorrow' }));
  await items.first().getByRole('button', { name: 'Remind me tomorrow' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'We will remind you tomorrow.' })).toBeVisible();
  await expect(items).toHaveCount(count - 1);
  const stored = ((await readStore(page, 'notifications')) as Note[]).filter((n) => n.snoozedUntil);
  expect(stored.length).toBeGreaterThan(0);
  // 08:00 London on 27 October 2026 (after the clocks go back) is 08:00 UTC.
  expect(stored.some((n) => n.snoozedUntil === '2026-10-27T08:00:00.000Z')).toBe(true);
});

test('Priya sees the off Safeguarding refresher rule on Auto-assign rules', async ({ page }) => {
  await start(page);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/rules');
  await expect(page.getByRole('heading', { level: 1, name: 'Auto-assign rules' })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Safeguarding refresher 60 days before expiry' });
  await expect(row).toContainText(/60 days before .*Safeguarding.* expires, assign Safeguarding and whistleblowing/);
  await expect(row.getByRole('switch')).not.toBeChecked();
  await expectTouchTarget(row.getByRole('switch'));
  await noSeriousAxe(page);
});
