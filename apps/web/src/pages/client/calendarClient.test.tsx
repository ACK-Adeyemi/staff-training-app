// M3 chunk 18b (BP-13, F-4 client part): C28 Calendar. Written before the implementation.
// Seed (build pack 7.3): today is Monday 19 October 2026. The cluster week starts Monday 2 November 2026: Lucy Evans
// (Tue 3), Hannah Patel (Wed 4) and Chris Wood (Thu 5) have Safeguarding expiring. Food hygiene is expiring soon and
// Paediatric first aid has run out for Mark Taylor. Little Acorns' plan renews one month from today.
//
// UI CONTRACT (data layer: a new store.calendar service is assumed, with calendar.items(ctx, range, filters) returning
// the admin CalendarItem[] for the actor's scope, and billing dates included only for actors holding billing.view
// (the same `Billing` input the domain calendarItems takes). The page may instead derive items with the domain
// calendarItems / expiryClusters / firstAiderForecast / currentFirstAiders from existing reads. Whatever it does:
// it must not leak billing to actors without billing.view. Priya is the Account Owner, Daniel (Supervisor) has no
// billing permission and can open the page.
//   Gate: needs a calendar-relevant read (the page decides which); a user holding no permissions at all gets the h1
//     and role=alert "You don't have access to this. Ask your manager.".
//   C28 /client/calendar: h1 "Calendar". Radiogroup "View": radios "List" (default) and "Month" (MonthGrid, role=grid).
//     Agenda groups use the same headings as S18 ("Today", "This week", "Next week", "Later"); each item is a listitem
//     with data-kind (the domain CalendarKind) and its title as text. Button "See further" works as on S18.
//   Group "Filters": comboboxes "Team", "Training" (requirement names; "Any training" first) and, when the client has
//     several sites, "Site". "Training" narrows to expiries, refresher dates and rules for that requirement.
//   Region "Many expiring in the same week" (calendar.clusters): a list; each listitem reads "<n> <Requirement>
//     expiries" (for example "3 Safeguarding expiries"), the week ("Week of 2 November 2026") and a button "Assign
//     refresher for a week". The button opens dialog "Assign refresher for a week" with: the people (full names) in a
//     list named "People", the module that satisfies the requirement (text "Safeguarding and whistleblowing"), the due
//     date (earliest expiry in the week, text "3 November 2026"), people with an open assignment already in a list named
//     "Skipped", and buttons "Assign" (calls assignments.assign ONCE with moduleId, personIds and dueAt) and "Cancel".
//     Success: dialog closes and role=status "Assigned to <n> people." (n = people not skipped).
//   Region "First aiders forecast" (calendar.forecast): text "First aiders now: <n>" (currentFirstAiders count) and a
//     table of the next weeks, one row per week with the count in the last cell. Approving a first aid certificate
//     raises "now" and the counts.
//   Billing dates: items with data-kind planRenewal, invoiceDue, addOnTrialEnd, accountStateChange appear only for
//     actors holding billing.view.
//   Buttons: "Download all (.ics)" (Blob type text/calendar, titles and dates only, no person names) and "Print"
//     (window.print()). The site switcher (useSiteScope) filters items to that site's people.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Assignment, EvidenceSubmission, Module, Person } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';
import { captureDownloads, ICS_ALLOWED, parseIcs, readBlob } from '../../test/calendarHelpers';

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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const NO_ACCESS = "You don't have access to this. Ask your manager.";
const priya = (keys: SeedKeys) => actorFor('client', keys);
const asDaniel = (keys: SeedKeys): ActorContext => ({
  userId: need(keys.users['daniel']),
  side: 'client',
  clientId: need(keys.clients['littleAcorns']),
  now: TODAY,
});
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const items = () => Array.from(document.querySelectorAll<HTMLElement>('li[data-kind]'));
const BILLING_KINDS = ['planRenewal', 'invoiceDue', 'addOnTrialEnd', 'accountStateChange'];
const noop = (): void => undefined;

async function open(opts: Parameters<typeof renderRoute>[2] = {}) {
  const view = await renderRoute('/client/calendar', 'client', opts);
  await screen.findByRole('heading', { level: 1, name: 'Calendar' });
  await waitFor(() => {
    expect(items().length).toBeGreaterThan(0);
  });
  return view;
}
async function expandAll() {
  const user = userEvent.setup();
  for (let i = 0; i < 6 && screen.queryByRole('button', { name: 'See further' }); i++) {
    await user.click(screen.getByRole('button', { name: 'See further' }));
  }
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'See further' })).toBeNull();
  });
}
const clusterRow = () =>
  within(screen.getByRole('region', { name: 'Many expiring in the same week' }))
    .getAllByRole('listitem')
    .find((li) => /3 Safeguarding expiries/.test(li.textContent)) as HTMLElement;

describe('C28 Calendar agenda', () => {
  it('lists upcoming expiries and assignment dates for the team under the four headings', async () => {
    await open();
    const kinds = items().map((li) => li.getAttribute('data-kind'));
    expect(kinds).toContain('expiry');
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toContain('Later');
  });

  it('narrows to one requirement with the Training filter', async () => {
    await open();
    expect(items().some((li) => /Food hygiene/.test(li.textContent))).toBe(true);
    const filters = screen.getByRole('group', { name: 'Filters' });
    await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Training' }), 'Safeguarding');
    await waitFor(() => {
      expect(items().some((li) => /Food hygiene/.test(li.textContent))).toBe(false);
    });
    expect(items().some((li) => /Safeguarding/.test(li.textContent))).toBe(true);
    expect(within(filters).getByRole('combobox', { name: 'Team' })).toBeTruthy();
  });

  it('switches to a month grid', async () => {
    await open();
    await userEvent.click(screen.getByRole('radio', { name: 'Month' }));
    expect(await screen.findByRole('grid')).toBeTruthy();
  });
});

describe('C28 expiry clusters and Assign refresher for a week', () => {
  it('shows "3 Safeguarding expiries" for the week of 2 November 2026', async () => {
    await open();
    const region = screen.getByRole('region', { name: 'Many expiring in the same week' });
    const row = within(region)
      .getAllByRole('listitem')
      .find((li) => /3 Safeguarding expiries/.test(li.textContent));
    expect(row?.textContent).toMatch(/2 November 2026/);
    expect(within(row as HTMLElement).getByRole('button', { name: 'Assign refresher for a week' })).toBeTruthy();
  });

  it('previews Hannah, Chris and Lucy, the module and the earliest expiry as due date', async () => {
    await open();
    await userEvent.click(within(clusterRow()).getByRole('button', { name: 'Assign refresher for a week' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign refresher for a week' });
    const people = within(dialog).getByRole('list', { name: 'People' });
    for (const n of ['Hannah Patel', 'Chris Wood', 'Lucy Evans']) expect(people.textContent).toContain(n);
    expect(dialog.textContent).toContain('Safeguarding and whistleblowing');
    expect(dialog.textContent).toContain('3 November 2026');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('assigns everyone in the week with one assignments.assign call after one confirmation', async () => {
    let c!: Ctx;
    let spy!: ReturnType<typeof vi.spyOn>;
    await open({
      prepare: (x) => {
        c = x;
        spy = vi.spyOn(x.handle.store.assignments, 'assign');
        return Promise.resolve();
      },
    });
    const before = (await dump<Assignment>(c.handle, 'assignments')).length;
    await userEvent.click(within(clusterRow()).getByRole('button', { name: 'Assign refresher for a week' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign refresher for a week' });
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/Assigned to 3 people\./);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const people = await dump<Person>(c.handle, 'people');
    const modules = await dump<Module>(c.handle, 'modules');
    const sg = need(modules.find((m) => m.title === 'Safeguarding and whistleblowing'));
    const all = await dump<Assignment>(c.handle, 'assignments');
    expect(all.length).toBe(before + 3);
    for (const [first, last] of [
      ['Hannah', 'Patel'],
      ['Chris', 'Wood'],
      ['Lucy', 'Evans'],
    ] as const) {
      const p = need(people.find((x) => x.firstName === first && x.lastName === last));
      const a = all.find(
        (x) => x.personId === p.id && x.status === 'open' && 'moduleId' in x.target && x.target.moduleId === sg.id,
      );
      expect(a, `${first} has an open Safeguarding assignment`).toBeTruthy();
      expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(need(a).dueAt))).toBe(
        '2026-11-03',
      );
    }
  });

  it('skips and shows a person who already has an open assignment, and assigns the rest', async () => {
    let c!: Ctx;
    await open({
      prepare: async (x) => {
        c = x;
        const people = await dump<Person>(x.handle, 'people');
        const lucy = need(people.find((p) => p.firstName === 'Lucy' && p.lastName === 'Evans'));
        const modules = await dump<Module>(x.handle, 'modules');
        const sg = need(modules.find((m) => m.title === 'Safeguarding and whistleblowing'));
        await x.handle.store.assignments.assign(priya(x.keys), {
          moduleId: sg.id,
          personIds: [lucy.id],
          dueAt: '2026-12-01T09:00:00.000Z',
        });
      },
    });
    await userEvent.click(within(clusterRow()).getByRole('button', { name: 'Assign refresher for a week' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign refresher for a week' });
    expect(within(dialog).getByRole('list', { name: 'Skipped' }).textContent).toContain('Lucy Evans');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/Assigned to 2 people\./);
    });
    const people = await dump<Person>(c.handle, 'people');
    const lucy = need(people.find((p) => p.firstName === 'Lucy'));
    const openOnes = (await dump<Assignment>(c.handle, 'assignments')).filter(
      (a) => a.personId === lucy.id && a.status === 'open',
    );
    expect(openOnes).toHaveLength(1);
  });
});

describe('C28 first aiders forecast', () => {
  const nowAndCounts = () => {
    const region = screen.getByRole('region', { name: 'First aiders forecast' });
    const now = Number(/First aiders now: (\d+)/.exec(region.textContent)?.[1]);
    const rows = within(region).getAllByRole('row').slice(1);
    const counts = rows.map((r) => {
      const cells = within(r).getAllByRole('cell');
      return Number(cells[cells.length - 1]?.textContent);
    });
    return { now, counts };
  };

  it('shows the count of first aiders now and a table of the coming weeks', async () => {
    await open();
    const { now, counts } = nowAndCounts();
    expect(Number.isInteger(now)).toBe(true);
    expect(counts.length).toBeGreaterThanOrEqual(8);
    expect(counts.every((n) => Number.isInteger(n))).toBe(true);
  });

  it('rises by one in every week when a first aid certificate is approved', async () => {
    await open();
    const base = nowAndCounts();
    cleanup();
    await open({
      prepare: async (x) => {
        const actor = (u: string, side: 'staff' | 'client'): ActorContext => ({
          userId: need(x.keys.users[u]),
          side,
          clientId: need(x.keys.clients['littleAcorns']),
          now: TODAY,
        });
        const markId = need(x.keys.personas['mark']);
        const mark = need((await dump<Person>(x.handle, 'people')).find((p) => p.id === markId));
        const file = await x.handle.store.attachments.upload(actor('mark', 'staff'), {
          purpose: 'certificate',
          title: 'Certificate (fictional)',
          mime: 'application/pdf',
          data: new TextEncoder().encode('%PDF-1.4\n% Fictional certificate for tests only.\n%%EOF\n'),
          personId: mark.id,
          siteId: mark.primarySiteId,
        });
        const sub: EvidenceSubmission = await x.handle.store.evidenceFlow.submit(actor('mark', 'staff'), {
          requirementId: need(x.keys.requirements['paediatricFirstAid']),
          providerName: 'Approved paediatric first aid training provider',
          completedAt: '2026-10-10T00:00:00.000Z',
          expiresAt: '2029-10-10T00:00:00.000Z',
          fileAttachmentId: file.id,
        });
        await x.handle.store.evidenceFlow.review(actor('priya', 'client'), sub.id, { kind: 'approve' });
      },
    });
    const after = nowAndCounts();
    expect(after.now).toBe(base.now + 1);
    expect(after.counts).toHaveLength(base.counts.length);
    after.counts.forEach((n, i) => {
      expect(n).toBe((base.counts[i] as number) + 1);
    });
  });
});

describe('C28 billing dates need billing.view', () => {
  it('shows the plan renewal to Priya', async () => {
    await open();
    await expandAll();
    expect(items().some((li) => li.getAttribute('data-kind') === 'planRenewal')).toBe(true);
  });

  it('shows no billing dates to Daniel, who has no billing permission', async () => {
    await open({ actor: asDaniel });
    await expandAll();
    const kinds = items().map((li) => li.getAttribute('data-kind') ?? '');
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of BILLING_KINDS) expect(kinds).not.toContain(k);
  });
});

describe('C28 access', () => {
  it('keeps the heading and shows an alert for a user holding no permissions', async () => {
    const roleId = '01ZZ0C1B0000000000000000R1';
    const userId = '01ZZ0C1B0000000000000000V1';
    await renderRoute('/client/calendar', 'client', {
      prepare: async (x) => {
        const clientId = need(x.keys.clients['littleAcorns']);
        await x.handle.admin.bulkPut('roles', [
          {
            id: roleId,
            owner: { clientId },
            name: 'Nothing',
            description: 'Nothing',
            colour: '#996633',
            permissionIds: [],
            system: false,
            version: 1,
            updatedBy: x.keys.users['priya'],
            updatedAt: TODAY,
          },
        ]);
        await x.handle.admin.bulkPut('users', [
          {
            id: userId,
            side: 'client',
            clientId,
            email: 'none@example.test',
            displayName: 'No access',
            status: 'active',
            login: { method: 'emailPassword', pinSet: false },
          },
        ]);
        await x.handle.admin.bulkPut('roleAssignments', [
          {
            id: '01ZZ0C1B0000000000000000A1',
            userId,
            roleIds: [roleId],
            scope: { type: 'clients', ids: [clientId] },
            grants: [],
            denies: [],
            status: 'active',
          },
        ]);
      },
      actor: (keys) => ({ userId, side: 'client', clientId: need(keys.clients['littleAcorns']), now: TODAY }),
    });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Calendar');
    expect((await screen.findByRole('alert')).textContent).toContain(NO_ACCESS);
    expect(items()).toHaveLength(0);
  });
});

describe('C28 exports', () => {
  it('Download all (.ics) holds titles and dates only, including "3 Safeguarding expiries", and no names', async () => {
    const cap = captureDownloads();
    try {
      await open();
      await userEvent.click(screen.getByRole('button', { name: 'Download all (.ics)' }));
      await waitFor(() => {
        expect(cap.blobs).toHaveLength(1);
      });
      expect(cap.blobs[0]?.type).toMatch(/^text\/calendar/);
      const text = await readBlob(cap.blobs[0] as Blob);
      const lines = parseIcs(text);
      for (const l of lines) expect(ICS_ALLOWED.has(l.name)).toBe(true);
      const summaries = lines.filter((l) => l.name === 'SUMMARY').map((l) => l.value);
      expect(summaries.some((s) => s.includes('3 Safeguarding expiries'))).toBe(true);
      expect(text).not.toMatch(/Hannah|Chris|Lucy|Mark|Jade|Ben Carter|Ellie/);
      expect(lines.filter((l) => l.name === 'DTSTART').every((l) => l.params === 'VALUE=DATE')).toBe(true);
    } finally {
      cap.restore();
    }
  });

  it('Print calls window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(noop);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('C28 navigation', () => {
  it('has a nav link to the calendar named like the page heading', async () => {
    await renderRoute('/client/calendar', 'client');
    const h1 = await screen.findByRole('heading', { level: 1 });
    const links = Array.from(document.querySelectorAll('a[href="#/client/calendar"]'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((a) => a.textContent.trim() === h1.textContent.trim())).toBe(true);
  });
});
