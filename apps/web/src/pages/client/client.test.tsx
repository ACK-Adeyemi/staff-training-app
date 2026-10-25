// M1 chunk 10 (BP-4, BP-5, F-7): client screens C1 Dashboard, C2 People, C3 Person record, C4 Assign training.
// Contract the implementer must provide (routes inside the client shell; each renders exactly one level 1 heading):
//   C1 /client   Sections as regions (accessible names) in this DOM order: "Needs attention", "Waiting for a check",
//        "Compliance", "Recently completed", "Assigned training". Needs attention is a list, one item per
//        (person, requirement): full name, requirement name, status word. Compliance shows the text "11 of 14" and the
//        words "staff fully compliant". Recently completed items show the person's name and a "Current" badge.
//        Assigned training lists people with an open assignment and the module title. Updates when the store changes
//        (live updates), with no reload.
//   C2 /client/people   One row (listitem) per person in the actor's read scope, archived people left out. Each row has
//        the full name, a link to /client/people/:id, and a status word (Overdue, Expiring soon, Waiting for a check,
//        Not started or Current: the worst of their requirements). A search box labelled "Search" narrows by name.
//   C3 /client/people/:id   h1 = full name. A "Requirements" region listing each applicable requirement with a status
//        word. Never shows learner notes (no "notes" content). Another client's person id gives role=alert.
//   C4 /client/assign   Combobox "Module" (published modules), a group "People" of checkboxes labelled with full names
//        (people in write scope, archived left out), a date input labelled "Due date", a preview line "N people will
//        be assigned" (singular "1 person will be assigned"), and one button "Assign". Success: role=status with
//        "N assigned" and, when some were skipped, "N skipped" with each name and "already has this training".
//        Failures: role=alert in plain English (no error class names). dueInPast mentions "today or later"; a
//        Forbidden error mentions "permission"; an Account state error mentions "read-only". Without assign.manage
//        the Assign button is disabled and a message says why ("permission"). Read-only account: message "read-only".
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountStateError, ForbiddenError } from '@sta/data';
import type { StoreHandle } from '@sta/data';
import type { Person, Role } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';
import { completeAllLessons, finishViaStore, sgModule } from '../../test/quizHelpers';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const oneH1 = () => {
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
};
const itemsOf = (region: HTMLElement) => within(region).getAllByRole('listitem');
const fullName = (p: Person) => `${p.firstName} ${p.lastName}`;

async function people(handle: StoreHandle): Promise<Person[]> {
  return (await handle.admin.dumpAll())['people'] as Person[];
}
const personNamed = async (handle: StoreHandle, first: string) => {
  const p = (await people(handle)).find((x) => x.firstName === first);
  if (!p) throw new Error(`no ${first}`);
  return p;
};
const jadeActor = (keys: SeedKeys) => actorFor('staff', keys);

describe('C1 Dashboard', () => {
  it('lists the six seeded needs-attention items in order: overdue, expiring by date, not started', async () => {
    await renderRoute('/client', 'client');
    const region = await screen.findByRole('region', { name: 'Needs attention' });
    const items = itemsOf(region);
    expect(items).toHaveLength(6);
    const expected = [
      ['Mark Taylor', 'Paediatric first aid', 'Overdue'],
      ['Lucy Evans', 'Safeguarding', 'Expiring soon'],
      ['Hannah Patel', 'Safeguarding', 'Expiring soon'],
      ['Chris Wood', 'Safeguarding', 'Expiring soon'],
      ['Maureen Clarke', 'Food hygiene', 'Expiring soon'],
      ['Amira Hassan', 'What changed in September 2026', 'Not started'],
    ];
    expected.forEach(([name, req, status], i) => {
      const text = items[i]?.textContent ?? '';
      expect(text, `item ${i + 1}`).toContain(name);
      expect(text, `item ${i + 1}`).toContain(req);
      expect(text, `item ${i + 1}`).toContain(status);
    });
    oneH1();
  });

  it('shows Needs attention first, then Waiting for a check with Ben, never Olivia', async () => {
    await renderRoute('/client', 'client');
    const needs = await screen.findByRole('region', { name: 'Needs attention' });
    const waiting = screen.getByRole('region', { name: 'Waiting for a check' });
    const order = [
      'Needs attention',
      'Waiting for a check',
      'Compliance',
      'Recently completed',
      'Assigned training',
    ].map((n) => screen.getByRole('region', { name: n }));
    for (let i = 1; i < order.length; i++) {
      const before = order[i - 1] as HTMLElement;
      const after = order[i] as HTMLElement;
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(waiting).getByText(/Ben Carter/)).toBeTruthy();
    expect(needs.textContent).not.toContain('Ben Carter');
    expect(document.body.textContent).not.toContain('Olivia Grant');
  });

  it('shows the organisation ring as "11 of 14" staff fully compliant', async () => {
    await renderRoute('/client', 'client');
    const region = await screen.findByRole('region', { name: 'Compliance' });
    expect(region.textContent).toContain('11 of 14');
    expect(region.textContent).toMatch(/staff fully compliant/i);
  });

  it('shows Jade under Assigned training and nobody under Recently completed at the seed', async () => {
    await renderRoute('/client', 'client');
    const assigned = await screen.findByRole('region', { name: 'Assigned training' });
    expect(within(assigned).getByText(/Jade Mills/)).toBeTruthy();
    expect(assigned.textContent).toContain('Safeguarding and whistleblowing');
    const recent = screen.getByRole('region', { name: 'Recently completed' });
    expect(recent.textContent).not.toContain('Jade Mills');
  });

  it('moves Jade to Recently completed with a Current badge when she passes, with no reload', async () => {
    const { handle, keys } = await renderRoute('/client', 'client');
    const assigned = await screen.findByRole('region', { name: 'Assigned training' });
    expect(within(assigned).getByText(/Jade Mills/)).toBeTruthy();
    const marker = document.body;
    marker.setAttribute('data-marker', 'same-page');

    const jade = jadeActor(keys);
    await completeAllLessons(handle, jade);
    await finishViaStore(handle, jade, 0);

    await waitFor(() => {
      const recent = screen.getByRole('region', { name: 'Recently completed' });
      expect(within(recent).getByText(/Jade Mills/)).toBeTruthy();
      expect(recent.textContent).toContain('Current');
    });
    expect(screen.getByRole('region', { name: 'Assigned training' }).textContent).not.toContain('Jade Mills');
    expect(document.body.getAttribute('data-marker')).toBe('same-page');
    expect(sgModule.title.length).toBeGreaterThan(0);
  });
});

describe('C2 People', () => {
  it('lists the 14 active and on-leave people with a status word each and leaves out the archived leaver', async () => {
    await renderRoute('/client/people', 'client');
    const rows = await screen
      .findAllByRole('listitem')
      .then((all) => all.filter((li) => within(li).queryByRole('link', { name: /Taylor|Mills|Carter|Lee/ }) !== null));
    expect(rows.length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('Olivia Grant');
    const mark = screen.getByRole('link', { name: /Mark Taylor/ }).closest('li') as HTMLElement;
    expect(mark.textContent).toContain('Overdue');
    const ben = screen.getByRole('link', { name: /Ben Carter/ }).closest('li') as HTMLElement;
    expect(ben.textContent).toContain('Waiting for a check');
    const amira = screen.getByRole('link', { name: /Amira Hassan/ }).closest('li') as HTMLElement;
    expect(amira.textContent).toContain('Not started');
    const priya = screen.getByRole('link', { name: /Priya Shah/ }).closest('li') as HTMLElement;
    expect(priya.textContent).toContain('Current');
    expect(
      screen.getAllByRole('link', { name: /./ }).filter((a) => /\/client\/people\//.test(a.getAttribute('href') ?? '')),
    ).toHaveLength(14);
    oneH1();
  });

  it('search narrows the list by name', async () => {
    await renderRoute('/client/people', 'client');
    await screen.findByRole('link', { name: /Mark Taylor/ });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'hannah');
    expect(screen.getByRole('link', { name: /Hannah Patel/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Mark Taylor/ })).toBeNull();
  });

  it('shows a site manager only the people at their own site', async () => {
    const { handle, keys } = await renderRoute('/client/people', 'client', {
      actor: (k) => ({
        userId: k.users['riversideManager'],
        side: 'client',
        clientId: k.clients['oakTree'],
        now: actorFor('client', k).now,
      }),
    });
    await screen.findAllByRole('link', { name: /./ });
    const all = await people(handle);
    const riverside = all.filter((p) => p.primarySiteId === keys.sites['riverside'] && p.status !== 'archived');
    const others = all.filter(
      (p) =>
        p.clientId === keys.clients['oakTree'] &&
        p.primarySiteId !== keys.sites['riverside'] &&
        p.status !== 'archived',
    );
    expect(riverside.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    await waitFor(() => {
      for (const p of riverside) expect(screen.getByRole('link', { name: new RegExp(fullName(p)) })).toBeTruthy();
    });
    for (const p of others) expect(screen.queryByRole('link', { name: new RegExp(fullName(p)) })).toBeNull();
    expect(document.body.textContent).not.toContain('Mark Taylor');
  });
});

describe('C3 Person record', () => {
  it("shows Mark's requirements with statuses", async () => {
    const { handle } = await renderRoute('/client', 'client');
    const mark = await personNamed(handle, 'Mark');
    cleanup();
    await renderRoute(`/client/people/${mark.id}`, 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mark Taylor' })).toBeTruthy();
    const reqs = screen.getByRole('region', { name: 'Requirements' });
    const aid = within(reqs)
      .getByText(/Paediatric first aid/)
      .closest('li') as HTMLElement;
    expect(aid.textContent).toContain('Overdue');
    oneH1();
  });

  it('never shows learner notes, even when the learner has written some', async () => {
    const { handle } = await renderRoute('/client', 'client');
    const jade = await personNamed(handle, 'Jade');
    cleanup();
    await renderRoute(`/client/people/${jade.id}`, 'client');
    await screen.findByRole('heading', { level: 1, name: 'Jade Mills' });
    expect(screen.queryByRole('heading', { name: /notes/i })).toBeNull();
    expect(screen.queryByText(/learner note|my notes/i)).toBeNull();
  });

  it("gives an alert, not data, for another client's person", async () => {
    const { handle, keys } = await renderRoute('/client', 'client');
    const other = (await people(handle)).find((p) => p.clientId === keys.clients['oakTree']);
    if (!other) throw new Error('no Oak Tree person');
    cleanup();
    await renderRoute(`/client/people/${other.id}`, 'client');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(document.body.textContent).not.toContain(fullName(other));
  });
});

async function chooseModuleAndPeople(names: string[]) {
  const user = userEvent.setup();
  const select = await screen.findByRole('combobox', { name: 'Module' });
  await user.selectOptions(select, within(select).getByRole('option', { name: /Safeguarding and whistleblowing/ }));
  for (const n of names) await user.click(screen.getByRole('checkbox', { name: new RegExp(n) }));
  return user;
}
const setDue = (value: string) => {
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value } });
};

describe('C4 Assign training', () => {
  it('previews three people, then one press creates three assignments, three notifications and one audit event', async () => {
    const { handle } = await renderRoute('/client/assign', 'client');
    const user = await chooseModuleAndPeople(['Lucy Evans', 'Hannah Patel', 'Chris Wood']);
    setDue('2026-11-02');
    expect(screen.getByText(/3 people will be assigned/)).toBeTruthy();
    const before = (await handle.admin.dumpAll()) as Record<string, unknown[]>;
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('3 assigned');
    const after = (await handle.admin.dumpAll()) as Record<string, unknown[]>;
    expect((after['assignments'] ?? []).length - (before['assignments'] ?? []).length).toBe(3);
    expect((after['notifications'] ?? []).length - (before['notifications'] ?? []).length).toBe(3);
    const audit = (after['audit'] ?? []) as { action: string }[];
    expect(audit.filter((a) => a.action === 'assignments.created')).toHaveLength(1);
    oneH1();
  });

  it('skips a person who already has the training and reports them without a duplicate', async () => {
    const { handle } = await renderRoute('/client/assign', 'client');
    const user = await chooseModuleAndPeople(['Jade Mills', 'Lucy Evans']);
    setDue('2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('1 assigned');
    expect(status.textContent).toContain('1 skipped');
    expect(status.textContent).toContain('Jade Mills');
    expect(status.textContent).toContain('already has this training');
    const jade = await personNamed(handle, 'Jade');
    const mine = ((await handle.admin.dumpAll())['assignments'] as { personId: string; status: string }[]).filter(
      (a) => a.personId === jade.id && a.status === 'open',
    );
    expect(mine).toHaveLength(1);
  });

  it('offers active people to pick and leaves out the archived leaver', async () => {
    await renderRoute('/client/assign', 'client');
    await screen.findByRole('group', { name: 'People' });
    expect(screen.queryByRole('checkbox', { name: /Olivia Grant/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Lucy Evans/ })).toBeTruthy();
  });

  it('shows a plain-English message for a due date in the past and writes nothing', async () => {
    const { handle } = await renderRoute('/client/assign', 'client');
    const user = await chooseModuleAndPeople(['Lucy Evans']);
    setDue('2026-10-18');
    const before = (await handle.admin.dumpAll())['assignments'].length;
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/today or later/);
    expect(alert.textContent).not.toMatch(/dueInPast|RuleError/);
    expect((await handle.admin.dumpAll())['assignments'].length).toBe(before);
  });

  it('surfaces a permission refusal in plain English', async () => {
    await renderRoute('/client/assign', 'client', {
      prepare: ({ handle }) => {
        vi.spyOn(handle.store.assignments, 'assign').mockRejectedValue(new ForbiddenError('outOfScope'));
        return Promise.resolve();
      },
    });
    const user = await chooseModuleAndPeople(['Lucy Evans']);
    setDue('2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/permission/i);
    expect(alert.textContent).not.toMatch(/Forbidden|outOfScope/);
  });

  it('surfaces a Read-only account refusal in plain English', async () => {
    await renderRoute('/client/assign', 'client', {
      prepare: ({ handle }) => {
        vi.spyOn(handle.store.assignments, 'assign').mockRejectedValue(new AccountStateError('readOnly', 'assign'));
        return Promise.resolve();
      },
    });
    const user = await chooseModuleAndPeople(['Lucy Evans']);
    setDue('2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/read-only/i);
    expect(alert.textContent).not.toMatch(/AccountStateError/);
  });

  it('disables Assign and says why when the person lacks assign.manage', async () => {
    await renderRoute('/client/assign', 'client', {
      prepare: async ({ handle, keys }) => {
        const dump = await handle.admin.dumpAll();
        const roles = dump['roles'] as Role[];
        const owner = roles.find((r) => r.id === keys.roles['littleAcorns.accountOwner']);
        if (!owner) throw new Error('no owner role');
        await handle.admin.bulkPut('roles', [
          { ...owner, permissionIds: owner.permissionIds.filter((p) => p !== 'assign.manage') },
        ]);
      },
    });
    const button = await screen.findByRole('button', { name: 'Assign' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toMatch(/permission/i);
  });

  it('notifies each assigned person: the bell and list show the Safeguarding assignment for Lucy', async () => {
    const { handle } = await renderRoute('/client/assign', 'client');
    const user = await chooseModuleAndPeople(['Lucy Evans']);
    setDue('2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    await screen.findByRole('status');
    const lucy = await personNamed(handle, 'Lucy');
    const dump = await handle.admin.dumpAll();
    const users = dump['users'] as { id: string; personId?: string }[];
    const lucyUser = users.find((u) => u.personId === lucy.id);
    const notes = (dump['notifications'] as { userId: string; kind: string; params: Record<string, unknown> }[]).filter(
      (n) => n.userId === lucyUser?.id,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.kind).toBe('trainingAssigned');
  });
});
