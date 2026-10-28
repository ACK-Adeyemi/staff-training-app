// M3 chunk 17 (BP-15, F-4): client side of external evidence. C27 Evidence to check (queue and review), the first
// aiders print page, and C3 upload on someone's behalf and Send reminder. Written before the implementation. New
// text goes in language files (evidenceFlow.* holds some of these English strings already).
//
// UI CONTRACT (data layer = store.evidenceFlow.queue / get / review / submit, store.attachments.upload,
// store.reminders.send; Priya is the Account Owner, Daniel a Supervisor, Mark the staff member):
//   Gates: C27 and the first aiders page need evidence.view (can()); decisions need evidence.approve. Without
//     evidence.view the page keeps its h1 and shows role=alert "You don't have access to this. Ask your manager.".
//   C27 list /client/evidence: h1 "Evidence to check". A table (caption "Evidence to check") with one row per
//     submission awaiting a check in the admin's read scope (never needsBetterCopy, approved or rejected), oldest
//     first. A row holds a link (the person's full name) to #/client/evidence/<id>, the requirement name, the
//     submitted date and "Waiting <n> working days"; when n is more than 3 the row also says "Waiting too long"
//     (text, not colour alone). Empty: "Nothing is waiting to be checked." With more than one site, the shell select
//     "Switch site" filters the rows (the same SiteScopeContext as other client lists).
//   C27 review /client/evidence/:id: h1 "Check a certificate". Region "Details" with the person's full name, the
//     requirement, the provider, "Date completed" and "Expiry date" and the certificate number. Region
//     "Certificate": an image shows as img (name contains "certificate") from a blob URL; a PDF shows a button "Open
//     the PDF" that calls window.open with a blob: URL. Group "Check these before you approve" with one checkbox per
//     requirement checklist item. Text "By approving, you confirm that you have checked this certificate."
//     Approve section: date inputs "Date completed" and "Expiry date" (prefilled yyyy-mm-dd, editable) inside the
//     form named "Approve"; button "Approve" calls evidenceFlow.review({ kind: 'approve', completedAt?, expiresAt? })
//     (dates only when changed) and shows role=status "Approved.". Button "Ask for a better copy" opens a dialog of
//     that name with textbox "Note to the person" and button "Send decision"; an empty note gives role=alert and
//     stores nothing. Button "Do not accept" opens a dialog of that name with combobox "Reason" (Not the right
//     course, Name does not match, Certificate has expired, Cannot read it, Other), optional textbox "Note to the
//     person" and "Send decision". For a submission the actor uploaded or that is about the actor, the three
//     decision buttons are disabled and the text "You can't approve a certificate you uploaded or one about
//     yourself." is shown. Without evidence.approve the decision buttons are not shown. A submission that is no
//     longer awaiting a check shows its status word and no decision buttons. Unknown id: role=alert.
//   First aiders /print/first-aiders (outside the chrome, no navigation landmark): h1 "First aiders", one h2 per
//     site, a list of active people whose Paediatric first aid Evidence is current, each item with the full name and
//     an approved external certificate adds "Approved by <approver> on <date>"; button "Print this list" calls
//     window.print. People whose first aid is overdue, archived people and other clients' people are not listed.
//   C3 /client/people/:id: with evidence.uploadForOthers, each requirement that accepts uploads has a button "Upload
//     certificate: <requirement>" that opens a dialog "Upload a certificate for <full name>" holding the same form
//     as S17 (Choose a file, Course provider, dates, "Send for checking"; images go through prepareImage). Submitting
//     calls attachments.upload (personId = that person) and evidenceFlow.submit({ personId }) and shows role=status
//     "Sent. Your manager will check it.". With reminders.manage a button "Send reminder" calls reminders.send
//     ([personId]) and shows role=status "Reminder sent."; without the permission neither button exists.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { EvidenceSubmission, Notification } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

const hoisted = vi.hoisted(() => ({
  prepared: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0xff, 0xd9]),
}));
vi.mock('../../app/images', () => ({
  prepareImage: () => Promise.resolve({ data: hoisted.prepared, mime: 'image/jpeg' }),
}));

beforeAll(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined }));
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
const ignore = (_: unknown): void => undefined;
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const as =
  (userKey: string, side: 'staff' | 'client' = 'client', clientKey = 'littleAcorns') =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side,
    clientId: need(keys.clients[clientKey]),
    now: TODAY,
  });
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const bytes = (text: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(text.length));
  for (let k = 0; k < text.length; k++) out[k] = text.charCodeAt(k);
  return out;
};
const PDF = () => bytes('%PDF-1.4\n% Fictional certificate for tests only.\n%%EOF\n');
const JPEG = () => new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0xff, 0xd9]);

/** A certificate file and submission for a person, sent by `byUser` (themselves, or an admin on their behalf). */
async function send(
  { handle, keys }: Ctx,
  who: { person: string; byUser: string; side?: 'staff' | 'client'; client?: string },
  opts: { image?: boolean; requirement?: string; onBehalf?: boolean } = {},
): Promise<EvidenceSubmission> {
  const actor = as(who.byUser, who.side ?? 'staff', who.client ?? 'littleAcorns')(keys);
  const personId = need(keys.personas[who.person]);
  const person = need(
    (await dump<{ id: string; primarySiteId: string }>(handle, 'people')).find((p) => p.id === personId),
  );
  const file = await handle.store.attachments.upload(actor, {
    purpose: 'certificate',
    title: 'Certificate (fictional)',
    mime: opts.image ? 'image/jpeg' : 'application/pdf',
    data: opts.image ? JPEG() : PDF(),
    personId,
    siteId: person.primarySiteId,
  });
  return handle.store.evidenceFlow.submit(actor, {
    requirementId: need(keys.requirements[opts.requirement ?? 'paediatricFirstAid']),
    ...(opts.onBehalf ? { personId } : {}),
    providerName: 'Approved paediatric first aid training provider',
    completedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2029-10-10T00:00:00.000Z',
    fileAttachmentId: file.id,
  });
}
const markSends = (c: Ctx, opts: { image?: boolean } = {}) => send(c, { person: 'mark', byUser: 'mark' }, opts);

// A client user holding only the given permissions, scoped to the whole client.
const R = {
  role: '01ZZ0C170000000000000000R1',
  user: '01ZZ0C170000000000000000V1',
  assign: '01ZZ0C170000000000000000A1',
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
      email: 'r1@example.test',
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
const NO_ACCESS = "You don't have access to this. Ask your manager.";
const priya = (keys: SeedKeys) => actorFor('client', keys);

describe('C27 Evidence to check: queue', () => {
  it('lists submissions awaiting a check, oldest first, each linked to its review page', async () => {
    let mark!: EvidenceSubmission;
    await renderRoute('/client/evidence', 'client', {
      prepare: async (x) => {
        mark = await markSends(x);
      },
    });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Evidence to check');
    const table = await screen.findByRole('table', { name: 'Evidence to check' });
    const rows = within(table).getAllByRole('row').slice(1);
    const names = rows.map((r) => within(r).getAllByRole('link')[0]?.textContent);
    expect(names).toEqual(['Ben Carter', 'Mark Taylor']);
    expect(
      within(rows[1] as HTMLElement)
        .getByRole('link', { name: 'Mark Taylor' })
        .getAttribute('href'),
    ).toBe(`#/client/evidence/${mark.id}`);
    expect(rows[1]?.textContent).toContain('Paediatric first aid');
  });

  it('leaves out Ellie (better copy asked for) and Kasia (approved)', async () => {
    await renderRoute('/client/evidence', 'client');
    const table = await screen.findByRole('table', { name: 'Evidence to check' });
    expect(table.textContent).not.toContain('Ellie Brown');
    expect(table.textContent).not.toContain('Kasia Nowak');
  });

  it('shows the waiting time and marks items waiting more than 3 working days with words', async () => {
    await renderRoute('/client/evidence', 'client', {
      prepare: async (x) => {
        ignore(await markSends(x));
      },
    });
    const table = await screen.findByRole('table', { name: 'Evidence to check' });
    const ben = within(table).getByRole('row', { name: /Ben Carter/ });
    const mark = within(table).getByRole('row', { name: /Mark Taylor/ });
    expect(ben.textContent).toMatch(/Waiting [4-9] working days/);
    expect(ben.textContent).toContain('Waiting too long');
    expect(mark.textContent).toMatch(/Waiting 0 working days|Waiting today/);
    expect(mark.textContent).not.toContain('Waiting too long');
  });

  it('says so when nothing is waiting', async () => {
    await renderRoute('/client/evidence', 'client', {
      prepare: async ({ handle, keys }) => {
        const ben = need(keys.submissions['ben']);
        await handle.store.evidenceFlow.review(priya(keys), ben, {
          kind: 'betterCopy',
          note: 'Please send a clearer copy.',
        });
      },
    });
    expect(await screen.findByText('Nothing is waiting to be checked.')).toBeTruthy();
  });

  it('filters by site for a group admin', async () => {
    const group = as('oakTreeGroupAdmin', 'client', 'oakTree');
    await renderRoute('/client/evidence', 'client', {
      actor: group,
      prepare: async (x) => {
        await send(x, { person: 'oscarFrost', byUser: 'oscarFrost', client: 'oakTree' });
        await send(x, { person: 'tobyAshby', byUser: 'tobyAshby', client: 'oakTree' });
      },
    });
    const table = await screen.findByRole('table', { name: 'Evidence to check' });
    expect(table.textContent).toContain('Oscar Frost');
    expect(table.textContent).toContain('Toby Ashby');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Switch site' }),
      screen.getByRole('option', { name: 'Riverside' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'Evidence to check' }).textContent).not.toContain('Toby Ashby');
    });
    expect(screen.getByRole('table', { name: 'Evidence to check' }).textContent).toContain('Oscar Frost');
  });

  it('shows the no-access message, not an empty page, without evidence.view', async () => {
    await renderRoute('/client/evidence', 'client', {
      actor: asTestUser,
      prepare: (c) => addUser(c, ['competitions.view']),
    });
    expect((await screen.findByRole('alert')).textContent).toContain(NO_ACCESS);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('C27 Evidence to check: review', () => {
  const open = async (
    opts: { actor?: (k: SeedKeys) => ActorContext; prepare?: (c: Ctx) => Promise<void>; image?: boolean } = {},
  ) => {
    let sub!: EvidenceSubmission;
    let c!: Ctx;
    const r = await renderRoute('/client', 'client', {
      ...(opts.actor ? { actor: opts.actor } : {}),
      prepare: async (x) => {
        c = x;
        if (opts.prepare) await opts.prepare(x);
        else sub = await markSends(x, { image: opts.image ?? false });
      },
    });
    return { r, c, sub: () => sub };
  };
  const go = async (r: Awaited<ReturnType<typeof open>>, id: string) => {
    await r.r.router.navigate(`/client/evidence/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'Check a certificate' });
  };
  const stored = async (c: Ctx, id: string) =>
    need((await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).find((s) => s.id === id));

  it('shows the details the person entered, the checklist and the approval statement', async () => {
    const o = await open();
    await go(o, o.sub().id);
    const details = screen.getByRole('region', { name: 'Details' });
    expect(details.textContent).toContain('Mark Taylor');
    expect(details.textContent).toContain('Paediatric first aid');
    expect(details.textContent).toContain('Approved paediatric first aid training provider');
    expect(details.textContent).toContain('10 October 2026');
    expect(details.textContent).toContain('10 October 2029');
    const list = screen.getByRole('group', { name: 'Check these before you approve' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByText('By approving, you confirm that you have checked this certificate.')).toBeTruthy();
  });

  it('shows an image certificate inline', async () => {
    const o = await open({ image: true });
    await go(o, o.sub().id);
    const viewer = screen.getByRole('region', { name: 'Certificate' });
    expect(within(viewer).getByRole('img', { name: /certificate/i })).toBeTruthy();
  });

  it('opens a PDF certificate in a new tab from a blob URL', async () => {
    const o = await open();
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    await go(o, o.sub().id);
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Certificate' })).getByRole('button', { name: 'Open the PDF' }),
    );
    expect(opened).toHaveBeenCalledTimes(1);
    expect(String(opened.mock.calls[0]?.[0])).toMatch(/^blob:/);
  });

  it('approves with the dates as entered, creating Evidence and no second submission', async () => {
    const o = await open();
    await go(o, o.sub().id);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect((await screen.findByRole('status')).textContent).toContain('Approved.');
    const s = await stored(o.c, o.sub().id);
    expect(s.status).toBe('approved');
    expect(s.reviewerId).toBe(o.c.keys.users['priya']);
    const ev = need(
      (
        await dump<{ id: string; personId: string; requirementId: string; expiresAt?: string }>(o.c.handle, 'evidence')
      ).find((e) => e.id === s.evidenceId),
    );
    expect(ev.expiresAt?.slice(0, 10)).toBe('2029-10-10');
  });

  it('approves with a corrected expiry date and records it on the Evidence', async () => {
    const o = await open();
    await go(o, o.sub().id);
    const form = screen.getByRole('form', { name: 'Approve' });
    fireEvent.change(within(form).getByLabelText('Expiry date'), { target: { value: '2029-09-30' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Approve' }));
    await screen.findByRole('status');
    const s = await stored(o.c, o.sub().id);
    const ev = need(
      (await dump<{ id: string; expiresAt?: string; completedAt: string }>(o.c.handle, 'evidence')).find(
        (e) => e.id === s.evidenceId,
      ),
    );
    expect(ev.expiresAt?.slice(0, 10)).toBe('2029-09-30');
    expect(ev.completedAt.slice(0, 10)).toBe('2026-10-10');
  });

  it('asks for a better copy with a note, and refuses an empty note', async () => {
    const o = await open();
    await go(o, o.sub().id);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ask for a better copy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ask for a better copy' });
    await user.click(within(dialog).getByRole('button', { name: 'Send decision' }));
    expect(within(dialog).getByRole('alert')).toBeTruthy();
    expect((await stored(o.c, o.sub().id)).status).toBe('awaitingCheck');
    await user.type(within(dialog).getByRole('textbox', { name: 'Note to the person' }), 'The date is cut off.');
    await user.click(within(dialog).getByRole('button', { name: 'Send decision' }));
    await waitFor(async () => {
      expect((await stored(o.c, o.sub().id)).status).toBe('needsBetterCopy');
    });
    expect((await stored(o.c, o.sub().id)).decisionNote).toBe('The date is cut off.');
  });

  it('does not accept with a reason and an optional note', async () => {
    const o = await open();
    await go(o, o.sub().id);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Do not accept' }));
    const dialog = await screen.findByRole('dialog', { name: 'Do not accept' });
    const reasons = within(within(dialog).getByRole('combobox', { name: 'Reason' }))
      .getAllByRole('option')
      .map((x) => x.textContent);
    expect(reasons).toEqual(
      expect.arrayContaining([
        'Not the right course',
        'Name does not match',
        'Certificate has expired',
        'Cannot read it',
        'Other',
      ]),
    );
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Reason' }), 'Certificate has expired');
    await user.click(within(dialog).getByRole('button', { name: 'Send decision' }));
    await waitFor(async () => {
      expect((await stored(o.c, o.sub().id)).status).toBe('rejected');
    });
    expect((await stored(o.c, o.sub().id)).rejectionReason).toBe('expired');
  });

  it('stops Priya approving a certificate she uploaded for Mark', async () => {
    const o = await open({
      prepare: async (x) => {
        ignore(await send(x, { person: 'mark', byUser: 'priya', side: 'client' }, { onBehalf: true }));
      },
    });
    const id = need(
      (await dump<EvidenceSubmission>(o.c.handle, 'evidenceSubmissions')).find(
        (s) => s.uploadedBy === o.c.keys.users['priya'],
      ),
    ).id;
    await go(o, id);
    expect(screen.getByText("You can't approve a certificate you uploaded or one about yourself.")).toBeTruthy();
    for (const name of ['Approve', 'Ask for a better copy', 'Do not accept']) {
      expect(screen.getByRole<HTMLButtonElement>('button', { name }).disabled).toBe(true);
    }
  });

  it('stops Daniel approving a certificate about himself, uploaded by Priya', async () => {
    const o = await open({
      actor: as('daniel'),
      prepare: async (x) => {
        ignore(await send(x, { person: 'daniel', byUser: 'priya', side: 'client' }, { onBehalf: true }));
      },
    });
    const id = need(
      (await dump<EvidenceSubmission>(o.c.handle, 'evidenceSubmissions')).find(
        (s) => s.personId === o.c.keys.personas['daniel'],
      ),
    ).id;
    await go(o, id);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Approve' }).disabled).toBe(true);
  });

  it("lets Daniel, a Supervisor at the same site, approve Mark's own upload", async () => {
    const o = await open({ actor: as('daniel') });
    await go(o, o.sub().id);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    // Daniel is in the two-step grace period, so the shell also shows a status banner: look for the message itself.
    await screen.findByText('Approved.');
    expect((await stored(o.c, o.sub().id)).reviewerId).toBe(o.c.keys.users['daniel']);
  });

  it('shows the details but no decision buttons to someone with evidence.view only', async () => {
    const o = await open({
      actor: asTestUser,
      prepare: async (x) => {
        await addUser(x, ['evidence.view']);
        o2 = await markSends(x);
      },
    });
    await go(o, o2.id);
    expect(screen.getByRole('region', { name: 'Details' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Do not accept' })).toBeNull();
  });

  it('shows the status and no decision buttons once a submission has been decided', async () => {
    const o = await open({ prepare: () => Promise.resolve() });
    await go(o, need(o.c.keys.submissions['kasia']));
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows the no-access message without evidence.view', async () => {
    const o = await open({ actor: asTestUser, prepare: (x) => addUser(x, ['competitions.view']) });
    await o.r.router.navigate(`/client/evidence/${need(o.c.keys.submissions['ben'])}`);
    expect((await screen.findByRole('alert')).textContent).toContain(NO_ACCESS);
  });

  it('shows an alert for an id that does not exist', async () => {
    const o = await open({ prepare: () => Promise.resolve() });
    await o.r.router.navigate('/client/evidence/01ZZNOSUCHSUBMISSION00000');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
let o2!: EvidenceSubmission;

describe('First aiders print page', () => {
  it('lists people with a current certificate for the site, with who approved it, and no navigation', async () => {
    await renderRoute('/print/first-aiders', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('First aiders');
    expect(screen.getByRole('heading', { level: 2, name: 'Little Acorns' })).toBeTruthy();
    const main = document.body.textContent;
    expect(main).toContain('Kasia Nowak');
    expect(main).toMatch(/Approved by Priya Shah on \d{1,2} \w+ \d{4}/);
    expect(main).not.toContain('Olivia Grant');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('adds Mark only once his certificate has been approved', async () => {
    await renderRoute('/print/first-aiders', 'client');
    await screen.findByRole('heading', { level: 1, name: 'First aiders' });
    expect(document.body.textContent).not.toContain('Mark Taylor');
    cleanup();
    await renderRoute('/print/first-aiders', 'client', {
      prepare: async (x) => {
        const s = await markSends(x);
        await x.handle.store.evidenceFlow.review(priya(x.keys), s.id, { kind: 'approve' });
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'First aiders' });
    expect(document.body.textContent).toContain('Mark Taylor');
  });

  it('prints from a button', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderRoute('/print/first-aiders', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Print this list' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('shows the no-access message without evidence.view', async () => {
    await renderRoute('/print/first-aiders', 'client', {
      actor: asTestUser,
      prepare: (c) => addUser(c, ['competitions.view']),
    });
    expect((await screen.findByRole('alert')).textContent).toContain(NO_ACCESS);
    expect(document.body.textContent).not.toContain('Kasia Nowak');
  });
});

describe('C3 upload on behalf and Send reminder', () => {
  const markPage = (keys: SeedKeys) => `/client/people/${need(keys.personas['mark'])}`;
  const open = async (
    opts: { actor?: (k: SeedKeys) => ActorContext; perms?: string[]; prepare?: (c: Ctx) => Promise<void> } = {},
  ) => {
    let c!: Ctx;
    const r = await renderRoute('/client', 'client', {
      ...(opts.actor ? { actor: opts.actor } : {}),
      prepare: async (x) => {
        c = x;
        if (opts.perms) await addUser(x, opts.perms);
        if (opts.prepare) await opts.prepare(x);
      },
    });
    await r.router.navigate(markPage(c.keys));
    await screen.findByRole('heading', { level: 1, name: 'Mark Taylor' });
    return { r, c };
  };

  it("uploads a certificate on Mark's behalf, recorded against him and uploaded by Priya", async () => {
    const { c } = await open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Upload certificate: Paediatric first aid' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload a certificate for Mark Taylor' });
    const input = need(dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])'));
    fireEvent.change(input, { target: { files: [new File([PDF()], 'paper.pdf', { type: 'application/pdf' })] } });
    await user.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Course provider' }),
      'Local authority paediatric first aid course',
    );
    fireEvent.change(within(dialog).getByLabelText('Date you finished the course'), {
      target: { value: '2026-10-12' },
    });
    fireEvent.change(within(dialog).getByLabelText('Expiry date on the certificate'), {
      target: { value: '2029-10-12' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Send for checking' }));
    expect((await within(dialog).findByRole('status')).textContent).toContain('Sent. Your manager will check it.');
    const subs = (await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).filter(
      (s) => s.personId === c.keys.personas['mark'],
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ status: 'awaitingCheck', uploadedBy: c.keys.users['priya'] });
  });

  it('hides the upload button without evidence.uploadForOthers', async () => {
    await open({ actor: asTestUser, perms: ['staff.view', 'evidence.view'] });
    expect(screen.queryByRole('button', { name: /^Upload certificate/ })).toBeNull();
  });

  it('sends Mark a reminder', async () => {
    // Mark's first aid certificate has already run out, which the reminder rules do not chase on their own (only an
    // open assignment past its due date, or a certificate about to run out, is chased). So Mark is given one.
    const { c } = await open({
      prepare: async ({ handle, keys }) => {
        const module = need((await dump<{ id: string }>(handle, 'modules'))[0]);
        await handle.admin.bulkPut('assignments', [
          {
            id: '01ZZ0C170000000000000000A2',
            clientId: need(keys.clients['littleAcorns']),
            personId: need(keys.personas['mark']),
            target: { moduleId: module.id },
            dueAt: '2026-10-01T00:00:00.000Z',
            source: 'manual',
            assignedBy: need(keys.users['priya']),
            createdAt: '2026-09-20T00:00:00.000Z',
            status: 'open',
          },
        ]);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Send reminder' }));
    expect((await screen.findByRole('status')).textContent).toContain('Reminder sent.');
    const notes = (await dump<Notification>(c.handle, 'notifications')).filter(
      (n) => n.userId === c.keys.users['mark'] && n.createdAt >= TODAY,
    );
    expect(notes.length).toBeGreaterThan(0);
  });

  it('hides Send reminder without reminders.manage', async () => {
    await open({ actor: asTestUser, perms: ['staff.view', 'evidence.view', 'reminders.view'] });
    expect(screen.queryByRole('button', { name: 'Send reminder' })).toBeNull();
  });
});
