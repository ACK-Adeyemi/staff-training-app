// M3 chunk 20b (BP-19, BP-12, F-4, F-5): C22 Data and retention, at #/client/data. Written before the implementation.
// Data layer: store.retention.schedule / update, store.exports.clientData(ctx, code) (step-up code is the demo code
// 123456), store.clients. The ZIP is built in the app (apps/web/src/app/zip.ts, fflate) and handed to the browser as a
// blob URL on an anchor with `download`, which these tests capture and read back.
//
// UI CONTRACT:
//   C22 /client/data, h1 "Data and retention" (client shell; linked from Settings and from Account status). Gate:
//     can('settings.view'); without it the page shows role=alert "You don't have access to this. Ask your manager."
//     and nothing else (no export button).
//   h2 "Retention settings": number inputs (labels) "Keep leaver records for (months)", "Keep leavers' notes for (days)",
//     "Keep detailed activity for (months)", "Keep feedback for (months)", "Keep closed tickets for (months)",
//     "Keep ticket attachments for (days)", "Keep trial data for (days)" showing client.settings.retention. Button
//     "Save retention settings" (only with settings.manage; otherwise the inputs are read-only and there is no button).
//     Success: role=status "Retention settings saved." and the data layer holds the new values. A value outside the
//     bounds (retentionPolicySchema, for example 6 months of leaver records) gives role=alert and stores nothing.
//   h2 "Scheduled deletions": a list (items) with one entry per retention.schedule() row, each showing the London date
//     of `at` (formatLondonDate) and a plain label ("Leaver records", "Leaver notes", "Certificate file",
//     "Your account"); with no rows the text "Nothing is scheduled for deletion."
//   h2 "Export all data": button "Export all data (ZIP)" (only with reports.export). It opens dialog "Confirm it's you"
//     with textbox "Confirmation code" and buttons "Download" and "Cancel". Blank code: role=alert "Enter your code to
//     continue."; wrong code: role=alert "That code is not right."; neither downloads anything. A right code downloads
//     <slug>-export-<London date>.zip (domain exportFileNames) and shows role=status "Your export is ready. It has
//     been saved to your device." Works in every account state until Deleted (Past due, Limited, Read-only, Closed).
//   h2 "If you cancel": text "You can export all your data at any time, including after you cancel, until your
//     account is deleted." and "Your records are deleted at the end of the Closed period unless you buy Records
//     Keeper."
//   Link "Account status" to #/client/account-status.
//   The ZIP holds the entries listed in plan assumption 48 (people.csv, requirements-status.csv, evidence.csv,
//   assignments.csv, attempts.csv, training-matrix.csv, data.json, README.txt, certificates/...), never learner notes.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { Client, Note } from '@sta/domain';
import { exportFileNames } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { formatLondonDate } from '../../demo/format';
import { captureDownloads } from '../../test/calendarHelpers';
import { actorFor, renderRoute, TODAY } from '../../test/harness';
import { readZip } from '../../test/zipHelpers';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(TODAY) + days * DAY).toISOString();
const need = <T,>(v: T | undefined | null): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const NO_ACCESS = "You don't have access to this. Ask your manager.";
const failPayment = async ({ handle, keys }: Ctx) => {
  await handle.admin.simulateFailedPayment(need(keys.clients['littleAcorns']), TODAY);
};
const littleAcorns = async (handle: StoreHandle, keys: SeedKeys) =>
  need((await dump<Client>(handle, 'clients')).find((c) => c.id === keys.clients['littleAcorns']));

// A client user holding only the given permissions for the whole client.
async function addUser(c: Ctx, permissionIds: string[]) {
  const clientId = need(c.keys.clients['littleAcorns']);
  await c.handle.admin.bulkPut('roles', [
    {
      id: '01ZZ0C220000000000000000R1',
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
      id: '01ZZ0C220000000000000000V1',
      side: 'client',
      clientId,
      email: 'r1@example.test',
      displayName: 'Test user',
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    },
  ]);
  await c.handle.admin.bulkPut('roleAssignments', [
    {
      id: '01ZZ0C220000000000000000A1',
      userId: '01ZZ0C220000000000000000V1',
      roleIds: ['01ZZ0C220000000000000000R1'],
      scope: { type: 'clients', ids: [clientId] },
      grants: [],
      denies: [],
      status: 'active',
    },
  ]);
}
const asTestUser = (keys: SeedKeys) => ({
  userId: '01ZZ0C220000000000000000V1',
  side: 'client' as const,
  clientId: need(keys.clients['littleAcorns']),
  now: TODAY,
});

async function exportWith(code: string, opts: { now?: string; prepare?: (c: Ctx) => Promise<void> } = {}) {
  const cap = captureDownloads();
  const r = await renderRoute('/client/data', 'client', {
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.prepare ? { prepare: opts.prepare } : {}),
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Export all data (ZIP)' }));
  const dialog = within(await screen.findByRole('dialog', { name: "Confirm it's you" }));
  if (code) await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), code);
  await user.click(dialog.getByRole('button', { name: 'Download' }));
  return { cap, r, dialog };
}

describe('C22 page and gate', () => {
  it('has one h1 and the five sections', async () => {
    await renderRoute('/client/data', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Data and retention');
    for (const name of ['Retention settings', 'Scheduled deletions', 'Export all data', 'If you cancel']) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeTruthy();
    }
    // The More menu has an Account status link too, so look inside the page itself.
    const link = within(screen.getByRole('main')).getByRole('link', { name: 'Account status' });
    expect(link.getAttribute('href')).toBe('#/client/account-status');
  });

  it('shows Daniel (no settings access) the no-access message and no export button', async () => {
    await renderRoute('/client/data', 'client', {
      actor: (k) => ({ ...actorFor('client', k), userId: need(k.users['daniel']) }),
    });
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ACCESS);
    expect(screen.queryByRole('button', { name: 'Export all data (ZIP)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save retention settings' })).toBeNull();
  });

  it('lets a settings.view-only user read the settings but not save or export', async () => {
    await renderRoute('/client/data', 'client', {
      prepare: (x) => addUser(x, ['settings.view']),
      actor: asTestUser,
    });
    const input = await screen.findByLabelText('Keep leaver records for (months)');
    expect((input as HTMLInputElement).readOnly || (input as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save retention settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export all data (ZIP)' })).toBeNull();
  });
});

describe('C22 retention settings', () => {
  it('shows the stored values and saves a change through retention.update', async () => {
    let c!: Ctx;
    await renderRoute('/client/data', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    const stored = (await littleAcorns(c.handle, c.keys)).settings.retention;
    const months = await screen.findByLabelText<HTMLInputElement>('Keep leaver records for (months)');
    expect(months.value).toBe(String(stored.leaverRecordsMonths));
    const user = userEvent.setup();
    await user.clear(months);
    await user.type(months, '48');
    await user.click(screen.getByRole('button', { name: 'Save retention settings' }));
    expect((await screen.findByRole('status')).textContent).toContain('Retention settings saved.');
    await waitFor(async () => {
      const now = (await littleAcorns(c.handle, c.keys)).settings.retention;
      expect(now).toEqual({ ...stored, leaverRecordsMonths: 48 });
    });
  });

  it('refuses a value outside the bounds, says so, and stores nothing', async () => {
    let c!: Ctx;
    await renderRoute('/client/data', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    const before = (await littleAcorns(c.handle, c.keys)).settings.retention;
    const months = await screen.findByLabelText('Keep leaver records for (months)');
    const user = userEvent.setup();
    await user.clear(months);
    await user.type(months, '6');
    await user.click(screen.getByRole('button', { name: 'Save retention settings' }));
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
    expect(screen.queryByText('Retention settings saved.')).toBeNull();
    expect((await littleAcorns(c.handle, c.keys)).settings.retention).toEqual(before);
  });
});

describe('C22 scheduled deletions', () => {
  it('says nothing is scheduled when the schedule is empty', async () => {
    let rows = -1;
    await renderRoute('/client/data', 'client', {
      prepare: async (x) => {
        rows = (await x.handle.store.retention.schedule(actorFor('client', x.keys))).length;
      },
    });
    const section = (await screen.findByRole('heading', { level: 2, name: 'Scheduled deletions' })).closest('section');
    if (rows === 0) expect(within(need(section)).getByText('Nothing is scheduled for deletion.')).toBeTruthy();
    else expect(within(need(section)).getAllByRole('listitem')).toHaveLength(rows);
  });

  it('lists the account deletion date once the account is Closed, from retention.schedule', async () => {
    let c!: Ctx;
    await renderRoute('/client/data', 'client', {
      prepare: async (x) => {
        c = x;
        await failPayment(x);
      },
      now: at(70),
    });
    const rows = await c.handle.store.retention.schedule({ ...actorFor('client', c.keys), now: at(70) });
    const account = need(rows.find((r) => r.category === 'account'));
    const section = (await screen.findByRole('heading', { level: 2, name: 'Scheduled deletions' })).closest('section');
    const items = await within(need(section)).findAllByRole('listitem');
    expect(items).toHaveLength(rows.length);
    const mine = need(items.find((i) => i.textContent.includes('Your account')));
    expect(mine.textContent).toContain(formatLondonDate(account.at));
  });
});

describe('C22 cancellation summary', () => {
  it('explains exports and deletion in plain words', async () => {
    await renderRoute('/client/data', 'client');
    const section = (await screen.findByRole('heading', { level: 2, name: 'If you cancel' })).closest('section');
    const text = need(section).textContent;
    expect(text).toContain(
      'You can export all your data at any time, including after you cancel, until your account is deleted.',
    );
    expect(text).toContain('Records Keeper');
  });
});

describe('C22 Export all data (ZIP)', () => {
  it('asks for the code and refuses a blank code without downloading', async () => {
    const { cap, dialog } = await exportWith('');
    try {
      expect((await dialog.findByRole('alert')).textContent).toBe('Enter your code to continue.');
      expect(cap.blobs).toHaveLength(0);
    } finally {
      cap.restore();
    }
  });

  it('refuses a wrong code without downloading', async () => {
    const { cap, dialog } = await exportWith('000000');
    try {
      expect((await dialog.findByRole('alert')).textContent).toBe('That code is not right.');
      expect(cap.blobs).toHaveLength(0);
    } finally {
      cap.restore();
    }
  });

  it('downloads a ZIP named for the organisation and date with the CSV files, data.json, README and certificates', async () => {
    let c!: Ctx;
    const { cap } = await exportWith('123456', { prepare: (x) => ((c = x), Promise.resolve()) });
    try {
      expect((await screen.findByRole('status')).textContent).toContain('Your export is ready.');
      expect(cap.blobs).toHaveLength(1);
      const client = await littleAcorns(c.handle, c.keys);
      expect(cap.names).toEqual([exportFileNames(new Date(TODAY), client.displayName).zip]);
      const zip = await readZip(cap.blobs[0] as Blob);
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
      const bundle = await c.handle.store.exports.clientData(actorFor('client', c.keys), '123456');
      const data = JSON.parse(zip.text('data.json')) as { people: { id: string }[]; evidence: unknown[] };
      expect(data.people.map((p) => p.id).sort()).toEqual(bundle.people.map((p) => p.id).sort());
      expect(data.evidence).toHaveLength(bundle.evidence.length);
      expect(zip.text('people.csv')).toContain('Kasia');
      expect(zip.names.filter((n) => n.startsWith('certificates/') && !n.endsWith('/')).length).toBeGreaterThan(0);
      expect(zip.text('README.txt')).toContain('2026');
    } finally {
      cap.restore();
    }
  });

  it('never includes learner notes, display preferences or another client', async () => {
    const note: Note = {
      id: '01ZZ0C220000000000000000N1',
      clientId: '',
      personId: '',
      moduleId: '01ZZ0C220000000000000000M1',
      body: 'SECRET-LEARNER-NOTE-TEXT',
      starred: false,
      createdAt: TODAY,
      updatedAt: TODAY,
    };
    const { cap } = await exportWith('123456', {
      prepare: async (x) => {
        await x.handle.admin.bulkPut('notes', [
          { ...note, clientId: need(x.keys.clients['littleAcorns']), personId: need(x.keys.personas['mark']) },
        ]);
      },
    });
    try {
      await screen.findByRole('status');
      const zip = await readZip(cap.blobs[0] as Blob);
      for (const n of zip.names) {
        expect(n.toLowerCase(), n).not.toContain('note');
        expect(zip.text(n), n).not.toContain('SECRET-LEARNER-NOTE-TEXT');
      }
      expect(Object.keys(JSON.parse(zip.text('data.json')) as object)).not.toContain('notes');
      expect(zip.text('data.json')).not.toContain('"prefs"');
      expect(zip.text('people.csv')).not.toMatch(/Oak Tree|Willow Lane/);
    } finally {
      cap.restore();
    }
  });

  it.each([
    [8, 'pastDue'],
    [20, 'limited'],
    [40, 'readOnly'],
    [70, 'closed'],
  ] as const)('still exports on day %i of non-payment (%s)', async (days, state) => {
    const { cap, r } = await exportWith('123456', { prepare: failPayment, now: at(days) });
    try {
      await waitFor(() => {
        expect(cap.blobs).toHaveLength(1);
      });
      expect((await readZip(cap.blobs[0] as Blob)).names).toContain('data.json');
      const status = await r.handle.store.account.status({ ...actorFor('client', r.keys), now: at(days) });
      expect(status.state).toBe(state);
    } finally {
      cap.restore();
    }
  });
});
