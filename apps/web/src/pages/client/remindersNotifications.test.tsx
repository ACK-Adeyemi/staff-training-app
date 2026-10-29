// M3 chunk 18a (BP-6 UI part, F-7): C16 Reminders and S13 Notifications. Written before the implementation. All
// new text goes in language files.
//
// UI CONTRACT (data layer = store.reminders.policy / savePolicy / digestPreview / chaseOverdue({ preview: true }) /
// send, store.organisation.updateSettings is NOT used; templates are saved with the policy form; store.notifications
// list / markRead / snooze, store.me.updatePrefs; Priya is the Account Owner, Jade a staff member, Mark has Paediatric
// first aid overdue):
//   C16 /client/reminders: h1 "Reminders". Gate reminders.view (can()); without it the h1 stays and role=alert
//     "You don't have access to this. Ask your manager." shows. Editing needs reminders.manage: without it the
//     values are shown but there is no "Save reminder settings" and no "Chase all overdue" button.
//   Form "Reminder settings": spinbutton "Weekly limit per person" (policy.weeklyCapPerPerson), time inputs
//     "Quiet hours from" and "Quiet hours to" (policy.quietHours), and for each kind a textbox "Message: Due soon",
//     "Message: Overdue", "Message: Expiring" (the tone default text, or the client's saved text) and a combobox
//     "Tone: <kind>" (Friendly, Neutral, Brief). Button "Save reminder settings" calls savePolicy and stores the
//     templates in the client's settings.reminderTemplates; success is role=status "Reminder settings saved.".
//     A negative cap, or a message using a placeholder other than {firstName}, {training}, {date}, or a message of
//     0 or over 300 characters, gives role=alert and stores nothing.
//   Region "Digest preview": a list "Overdue" and a list "Expiring soon" of full names equal to
//     digestPreview (text "Nobody" when empty). It says it is for managers only and never sent to staff.
//   Chase: button "Chase all overdue" opens dialog "Chase all overdue" from chaseOverdue({ preview: true }):
//     list "Will get a reminder" (full names = willSend) and list "Skipped" (full name plus a plain reason:
//     cap = "Weekly limit reached", paused = "Reminders paused", quietHours = "Quiet hours", awaitingCheck =
//     "Certificate waiting to be checked", accountState = "Account paused"). When willSend is empty the text
//     "Nobody will get a reminder." is shown and there is no "Send reminders" button. Button "Send reminders"
//     calls reminders.send(willSend ids), closes the dialog and shows role=status "Reminders sent: <n>.".
//   S13 /staff/notifications: each item is a list item. Unread items have a button "Mark as read" (existing). A
//     reminder notification (kind 'reminder', params reminderKind, offset, training, date) shows text containing
//     its training. Each item has a button "Remind me tomorrow"; clicking it calls notifications.snooze, the item
//     disappears and role=status "We will remind you tomorrow." shows. The stored snoozedUntil is 08:00 London
//     time the next London day. A group "Quiet hours" has time inputs "From" and "To" prefilled from
//     prefs.quietHours (blank when none) and a button "Save quiet hours" that calls me.updatePrefs({ quietHours })
//     and shows role=status "Quiet hours saved.". Clearing both and saving stores no quiet hours.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Notification } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const NO_ACCESS = "You don't have access to this. Ask your manager.";
const priya = (keys: SeedKeys) => actorFor('client', keys);
const jade = (keys: SeedKeys) => actorFor('staff', keys);
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const nameOf = async (c: Ctx, personId: string) => {
  const p = need(
    (await dump<{ id: string; firstName: string; lastName: string }>(c.handle, 'people')).find(
      (x) => x.id === personId,
    ),
  );
  return `${p.firstName} ${p.lastName}`;
};

const R = {
  role: '01ZZ0C180000000000000000R2',
  user: '01ZZ0C180000000000000000V2',
  assign: '01ZZ0C180000000000000000A2',
};
async function addUser(c: Ctx, permissionIds: string[]) {
  const clientId = need(c.keys.clients['littleAcorns']);
  await c.handle.admin.bulkPut('roles', [
    {
      id: R.role,
      owner: { clientId },
      name: 'Test role',
      description: 'Test role',
      colour: '#996633',
      permissionIds,
      system: false,
      version: 1,
      updatedBy: c.keys.users['priya'],
      updatedAt: TODAY,
    },
  ]);
  await c.handle.admin.bulkPut('users', [
    {
      id: R.user,
      side: 'client',
      clientId,
      email: 'r2@example.test',
      displayName: 'Test user',
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    },
  ]);
  await c.handle.admin.bulkPut('roleAssignments', [
    {
      id: R.assign,
      userId: R.user,
      roleIds: [R.role],
      scope: { type: 'clients', ids: [clientId] },
      grants: [],
      denies: [],
      status: 'active',
    },
  ]);
}
const asTestUser = (keys: SeedKeys): ActorContext => ({
  userId: R.user,
  side: 'client',
  clientId: need(keys.clients['littleAcorns']),
  now: TODAY,
});
const capture = (set: (c: Ctx) => void) => (x: Ctx) => {
  set(x);
  return Promise.resolve();
};

describe('C16 Reminders', () => {
  it('shows the saved policy in the form', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', { prepare: capture((x) => (c = x)) });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Reminders');
    const policy = await c.handle.store.reminders.policy(priya(c.keys));
    const form = await screen.findByRole('form', { name: 'Reminder settings' });
    expect(within(form).getByRole<HTMLInputElement>('spinbutton', { name: 'Weekly limit per person' }).value).toBe(
      String(policy.weeklyCapPerPerson),
    );
    expect(within(form).getByLabelText<HTMLInputElement>('Quiet hours from').value).toBe(policy.quietHours.from);
    expect(within(form).getByLabelText<HTMLInputElement>('Quiet hours to').value).toBe(policy.quietHours.to);
  });

  it('saves a new weekly limit and quiet hours', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', { prepare: capture((x) => (c = x)) });
    const form = await screen.findByRole('form', { name: 'Reminder settings' });
    const cap = within(form).getByRole('spinbutton', { name: 'Weekly limit per person' });
    await userEvent.clear(cap);
    await userEvent.type(cap, '2');
    const from = within(form).getByLabelText('Quiet hours from');
    await userEvent.clear(from);
    await userEvent.type(from, '20:00');
    await userEvent.click(within(form).getByRole('button', { name: 'Save reminder settings' }));
    expect((await screen.findByRole('status')).textContent).toContain('Reminder settings saved.');
    const saved = await c.handle.store.reminders.policy(priya(c.keys));
    expect(saved.weeklyCapPerPerson).toBe(2);
    expect(saved.quietHours.from).toBe('20:00');
  });

  it('refuses a negative weekly limit and stores nothing', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', { prepare: capture((x) => (c = x)) });
    const before = await c.handle.store.reminders.policy(priya(c.keys));
    const form = await screen.findByRole('form', { name: 'Reminder settings' });
    const cap = within(form).getByRole('spinbutton', { name: 'Weekly limit per person' });
    await userEvent.clear(cap);
    await userEvent.type(cap, '-1');
    await userEvent.click(within(form).getByRole('button', { name: 'Save reminder settings' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await c.handle.store.reminders.policy(priya(c.keys))).toEqual(before);
  });

  it('saves a custom message and refuses an unknown placeholder', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', { prepare: capture((x) => (c = x)) });
    const form = await screen.findByRole('form', { name: 'Reminder settings' });
    const overdue = within(form).getByRole('textbox', { name: 'Message: Overdue' });
    await userEvent.clear(overdue);
    await userEvent.type(overdue, 'Hi {{firstName}, {{training} was due on {{date}.');
    await userEvent.click(within(form).getByRole('button', { name: 'Save reminder settings' }));
    expect((await screen.findByRole('status')).textContent).toContain('Reminder settings saved.');
    const clients = await dump<{ settings: { reminderTemplates: Record<string, { text?: string }> } }>(
      c.handle,
      'clients',
    );
    expect(
      clients.some(
        (x) => x.settings.reminderTemplates['overdue']?.text === 'Hi {firstName}, {training} was due on {date}.',
      ),
    ).toBe(true);

    await userEvent.clear(overdue);
    await userEvent.type(overdue, 'Hi {{surname}');
    await userEvent.click(within(form).getByRole('button', { name: 'Save reminder settings' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    const after = await dump<{ settings: { reminderTemplates: Record<string, { text?: string }> } }>(
      c.handle,
      'clients',
    );
    expect(JSON.stringify(after)).not.toContain('surname');
  });

  it('lists the digest preview people from the domain digest', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', { prepare: capture((x) => (c = x)) });
    const region = await screen.findByRole('region', { name: 'Digest preview' });
    const digest = await c.handle.store.reminders.digestPreview(priya(c.keys));
    expect(digest.overdue.length).toBeGreaterThan(0);
    const overdueList = within(region).getByRole('list', { name: 'Overdue' });
    for (const p of digest.overdue) expect(overdueList.textContent).toContain(await nameOf(c, p.personId));
    const expiringList = within(region).getByRole('list', { name: 'Expiring soon' });
    for (const p of digest.expiring) expect(expiringList.textContent).toContain(await nameOf(c, p.personId));
    expect(region.textContent).toMatch(/managers only/i);
  });

  it('previews Chase all overdue, then sends one reminder to each person listed', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', { prepare: capture((x) => (c = x)) });
    const notesBefore = (await dump<Notification>(c.handle, 'notifications')).length;
    const outboxBefore = (await dump<unknown>(c.handle, 'outbox')).length;
    await userEvent.click(await screen.findByRole('button', { name: 'Chase all overdue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Chase all overdue' });
    const preview = await c.handle.store.reminders.chaseOverdue(priya(c.keys), { preview: true });
    expect(preview.willSend.length).toBeGreaterThan(0);
    const willList = within(dialog).getByRole('list', { name: 'Will get a reminder' });
    for (const p of preview.willSend) expect(willList.textContent).toContain(await nameOf(c, p.personId));
    expect((await dump<Notification>(c.handle, 'notifications')).length).toBe(notesBefore);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send reminders' }));
    expect((await screen.findByRole('status')).textContent).toContain(`Reminders sent: ${preview.willSend.length}.`);
    await waitFor(async () => {
      expect((await dump<Notification>(c.handle, 'notifications')).length).toBeGreaterThan(notesBefore);
    });
    expect((await dump<unknown>(c.handle, 'outbox')).length).toBeGreaterThan(outboxBefore);
  });

  it('explains why people are skipped and offers no send when quiet hours cover now', async () => {
    let c!: Ctx;
    await renderRoute('/client/reminders', 'client', {
      prepare: async (x) => {
        c = x;
        const policy = await x.handle.store.reminders.policy(priya(x.keys));
        await x.handle.store.reminders.savePolicy(priya(x.keys), {
          ...policy,
          quietHours: { from: '08:00', to: '12:00' },
        });
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Chase all overdue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Chase all overdue' });
    const preview = await c.handle.store.reminders.chaseOverdue(priya(c.keys), { preview: true });
    expect(preview.willSend).toHaveLength(0);
    expect(preview.skipped.length).toBeGreaterThan(0);
    const skipped = within(dialog).getByRole('list', { name: 'Skipped' });
    expect(skipped.textContent).toContain('Quiet hours');
    expect(skipped.textContent).toContain(await nameOf(c, need(preview.skipped[0]).personId));
    expect(within(dialog).getByText('Nobody will get a reminder.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Send reminders' })).toBeNull();
  });

  it('shows values but no save or chase buttons with reminders.view only', async () => {
    await renderRoute('/client/reminders', 'client', {
      actor: asTestUser,
      prepare: (x) => addUser(x, ['reminders.view']),
    });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Reminders');
    expect(await screen.findByRole('spinbutton', { name: 'Weekly limit per person' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save reminder settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chase all overdue' })).toBeNull();
  });

  it('shows the no-access message without reminders.view', async () => {
    await renderRoute('/client/reminders', 'client', {
      actor: asTestUser,
      prepare: (x) => addUser(x, ['people.view']),
    });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Reminders');
    expect((await screen.findByRole('alert')).textContent).toContain(NO_ACCESS);
    expect(screen.queryByRole('form', { name: 'Reminder settings' })).toBeNull();
  });
});

describe('S13 Notifications', () => {
  const reminderNote = (c: Ctx): Notification => ({
    id: '01ZZ0C180000000000000000N1',
    clientId: need(c.keys.clients['littleAcorns']),
    userId: need(c.keys.users['jade']),
    kind: 'reminder',
    params: { reminderKind: 'dueSoon', offset: 7, training: 'Fire evacuation', date: '2026-10-26' },
    createdAt: '2026-10-19T08:00:00.000Z',
  });
  const putReminder = async (c: Ctx) => {
    await c.handle.admin.bulkPut('notifications', [reminderNote(c)]);
  };

  it('shows a reminder notification with its training and unread state', async () => {
    await renderRoute('/staff/notifications', 'staff', { prepare: putReminder });
    const item = (await within(await screen.findByRole('main')).findByText(/Fire evacuation/)).closest(
      'li',
    ) as HTMLElement;
    expect(within(item).getByRole('button', { name: 'Mark as read' })).toBeTruthy();
  });

  it('snoozes an item with Remind me tomorrow: it disappears and is stored until 08:00 London tomorrow', async () => {
    let c!: Ctx;
    await renderRoute('/staff/notifications', 'staff', {
      prepare: async (x) => {
        c = x;
        await putReminder(x);
      },
    });
    const item = (await within(await screen.findByRole('main')).findByText(/Fire evacuation/)).closest(
      'li',
    ) as HTMLElement;
    await userEvent.click(within(item).getByRole('button', { name: 'Remind me tomorrow' }));
    expect((await screen.findByRole('status')).textContent).toContain('We will remind you tomorrow.');
    await waitFor(() => {
      expect(within(screen.getByRole('main')).queryByText(/Fire evacuation/)).toBeNull();
    });
    const stored = need((await dump<Notification>(c.handle, 'notifications')).find((n) => n.id === reminderNote(c).id));
    // 19 October 2026 is British Summer Time (UTC+1), so 08:00 on the 20th is 07:00 UTC.
    expect(stored.snoozedUntil).toBe('2026-10-20T07:00:00.000Z');
  });

  it('brings a snoozed item back once 08:00 London tomorrow has passed', async () => {
    const snoozed = async (c: Ctx) => {
      await putReminder(c);
      await c.handle.store.notifications.snooze(jade(c.keys), reminderNote(c).id);
    };
    await renderRoute('/staff/notifications', 'staff', { prepare: snoozed });
    await screen.findByRole('heading', { level: 1 });
    expect(within(screen.getByRole('main')).queryByText(/Fire evacuation/)).toBeNull();
    cleanup();
    await renderRoute('/staff/notifications', 'staff', { prepare: snoozed, now: '2026-10-20T07:00:00.000Z' });
    expect(await within(await screen.findByRole('main')).findByText(/Fire evacuation/)).toBeTruthy();
  });

  it('saves quiet hours to the person prefs', async () => {
    let c!: Ctx;
    await renderRoute('/staff/notifications', 'staff', { prepare: capture((x) => (c = x)) });
    const group = await screen.findByRole('group', { name: 'Quiet hours' });
    await userEvent.type(within(group).getByLabelText('From'), '19:30');
    await userEvent.type(within(group).getByLabelText('To'), '06:30');
    await userEvent.click(within(group).getByRole('button', { name: 'Save quiet hours' }));
    expect((await screen.findByRole('status')).textContent).toContain('Quiet hours saved.');
    const me = await c.handle.store.me.get(jade(c.keys));
    expect(me.prefs.quietHours).toEqual({ from: '19:30', to: '06:30' });
  });

  it('clears quiet hours when both fields are emptied', async () => {
    let c!: Ctx;
    await renderRoute('/staff/notifications', 'staff', {
      prepare: async (x) => {
        c = x;
        await x.handle.store.me.updatePrefs(jade(x.keys), { quietHours: { from: '20:00', to: '07:00' } });
      },
    });
    const group = await screen.findByRole('group', { name: 'Quiet hours' });
    expect(within(group).getByLabelText<HTMLInputElement>('From').value).toBe('20:00');
    await userEvent.clear(within(group).getByLabelText('From'));
    await userEvent.clear(within(group).getByLabelText('To'));
    await userEvent.click(within(group).getByRole('button', { name: 'Save quiet hours' }));
    await screen.findByRole('status');
    const me = await c.handle.store.me.get(jade(c.keys));
    expect(me.prefs.quietHours).toBeUndefined();
  });
});
