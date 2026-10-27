// M3 chunk 18a (BP-5, BP-6 UI part): C5 Auto-assign rules, C2 Add staff member and C3 job role edit (both fire
// rules). Written before the implementation. All new text goes in language files.
//
// UI CONTRACT (data layer = store.autoAssign.list / save / setEnabled / preview / history, store.people.add /
// update, store.jobRoles.list; Priya is the Account Owner):
//   Gate: C5 needs assign.manage (can()). Without it the page keeps its h1 and shows role=alert
//     "You don't have access to this. Ask your manager.".
//   C5 /client/rules: h1 "Auto-assign rules". One list item per rule (autoAssign.list), each with:
//     - the rule name,
//     - its plain-language sentence, built from the domain ruleSentence key + params, as text. The language keys
//       are rules.sentence.personAdded / roleChanged / requirementExpiring (the existing single string
//       rules.sentence must become that group). personAdded with a job role and no site reads
//       "When someone joins as Practitioner at any site, assign New starter induction, due in 14 days";
//       requirementExpiring reads "60 days before <requirement> expires, assign <training>, due in <n> days",
//     - a switch (role=switch, name = the rule name) whose aria-checked is the rule's enabled flag; toggling calls
//       setEnabled (the seeded Safeguarding refresher rule is OFF),
//     - the affected-now text "This would give training to <n> people now." where n equals
//       autoAssign.preview(rule).count (text, "Nobody would be given training right now." for 0),
//     - a button "Edit rule: <name>" and a button "History: <name>". History reveals a list (name "History") of the
//       people (full names) who were given training by that rule (autoAssign.history), or text when none.
//   Editor: button "Add a rule" opens a dialog "Add a rule" (edit: dialog "Edit rule") with textbox "Rule name",
//     combobox "When" (the three trigger labels), combobox "Job role" (Any job role + roles), combobox "Training to
//     give" (modules by title), spinbutton "Due in (days)" and button "Save rule" (autoAssign.save). A rule the
//     data layer refuses as duplicate shows role=alert "You already have a rule that does the same thing.".
//   C2 /client/people: with staff.manage a button "Add staff member" opens dialog "Add staff member" with
//     textboxes "First name" and "Last name", comboboxes "Primary site" and "Job role", date input "Start date" and
//     button "Add person". It calls people.add (status 'active'), closes, shows role=status "Added." and the person
//     is listed. The personAdded rules fire in that batch. Without staff.manage the button does not exist.
//   C3 /client/people/:id: with staff.manage a group "Job roles" with one checkbox per job role (checked for the
//     person's roles) and a button "Save job roles" that calls people.update({ jobRoleIds }) and shows role=status
//     "Saved.". roleChanged rules fire in that batch.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Assignment, Module } from '@sta/domain';
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
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

const R = {
  role: '01ZZ0C180000000000000000R1',
  user: '01ZZ0C180000000000000000V1',
  assign: '01ZZ0C180000000000000000A1',
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

const rulesOf = (c: Ctx) => c.handle.store.autoAssign.list(priya(c.keys));
const ruleNamed = async (c: Ctx, text: string) => need((await rulesOf(c)).find((r) => r.name.includes(text)));
const jobRoleId = async (c: Ctx, name: string) =>
  need((await c.handle.store.jobRoles.list(priya(c.keys))).find((r) => r.name === name)).id;
const moduleId = async (c: Ctx, title: string) =>
  need((await dump<Module>(c.handle, 'modules')).find((m) => m.title === title)).id;
const ruleAssignments = async (c: Ctx): Promise<Assignment[]> =>
  (await dump<Assignment>(c.handle, 'assignments')).filter((a) => typeof a.source === 'object');
const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

describe('C5 Auto-assign rules', () => {
  it('shows each rule with its plain-language sentence', async () => {
    await renderRoute('/client/rules', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Auto-assign rules');
    const row = rowOf('New starter induction for new Practitioners');
    expect(row.textContent).toContain(
      'When someone joins as Practitioner at any site, assign New starter induction, due in 14 days',
    );
  });

  it('shows the off Safeguarding refresher rule with its sentence and the switch off', async () => {
    await renderRoute('/client/rules', 'client');
    await screen.findByRole('heading', { level: 1 });
    const row = rowOf('Safeguarding refresher 60 days before expiry');
    expect(row.textContent).toMatch(/60 days before .*Safeguarding.* expires, assign Safeguarding and whistleblowing/);
    expect(within(row).getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(
      within(rowOf('New starter induction for new Practitioners')).getByRole('switch').getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('shows an affected-now count equal to the domain preview for every rule', async () => {
    let c!: Ctx;
    await renderRoute('/client/rules', 'client', {
      prepare: (x) => {
        c = x;
        return Promise.resolve();
      },
    });
    await screen.findByRole('heading', { level: 1 });
    const rules = await rulesOf(c);
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const rule of rules) {
      const preview = await c.handle.store.autoAssign.preview(priya(c.keys), rule.id);
      const row = rowOf(rule.name);
      const expected =
        preview.count === 0 ? /Nobody would be given training/ : new RegExp(`to ${preview.count} (people|person) now`);
      expect(row.textContent).toMatch(expected);
    }
  });

  it('turning a rule on calls the data layer and the switch follows', async () => {
    let c!: Ctx;
    await renderRoute('/client/rules', 'client', {
      prepare: (x) => {
        c = x;
        return Promise.resolve();
      },
    });
    await screen.findByRole('heading', { level: 1 });
    const sw = within(rowOf('Safeguarding refresher 60 days before expiry')).getByRole('switch');
    await userEvent.click(sw);
    await waitFor(() => {
      expect(sw.getAttribute('aria-checked')).toBe('true');
    });
    expect((await ruleNamed(c, 'Safeguarding refresher')).enabled).toBe(true);
  });

  it('lists who a rule has assigned in its history', async () => {
    let c!: Ctx;
    await renderRoute('/client/rules', 'client', {
      prepare: async (x) => {
        c = x;
        const site = need(x.keys.sites['littleAcorns']);
        await x.handle.store.people.add(priya(x.keys), {
          primarySiteId: site,
          additionalSiteIds: [],
          teamIds: [],
          firstName: 'Nia',
          lastName: 'Historytest',
          jobRoleIds: [await jobRoleId(x, 'Practitioner')],
          startDate: '2026-10-19T00:00:00.000Z',
          status: 'active',
        });
      },
    });
    await screen.findByRole('heading', { level: 1 });
    expect(c).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'History: What changed in September 2026 for everyone' }));
    const list = await screen.findByRole('list', { name: 'History' });
    expect(list.textContent).toContain('Nia Historytest');
  });

  it('adds a rule through the editor and shows its sentence', async () => {
    let c!: Ctx;
    await renderRoute('/client/rules', 'client', {
      prepare: (x) => {
        c = x;
        return Promise.resolve();
      },
    });
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a rule' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Rule name' }), 'Room Leader induction');
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'When' }),
      "A person's job role changes",
    );
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Job role' }), 'Room Leader');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Training to give' }), 'Safer sleep');
    const due = within(dialog).getByRole('spinbutton', { name: 'Due in (days)' });
    await userEvent.clear(due);
    await userEvent.type(due, '21');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => {
      expect(screen.getByText('Room Leader induction')).toBeTruthy();
    });
    const saved = await ruleNamed(c, 'Room Leader induction');
    expect(saved.trigger.type).toBe('roleChanged');
    expect(saved.dueInDays).toBe(21);
    expect(saved.filters.jobRoleIds).toEqual([await jobRoleId(c, 'Room Leader')]);
  });

  it('refuses a duplicate rule with a plain message and stores nothing', async () => {
    let c!: Ctx;
    await renderRoute('/client/rules', 'client', {
      prepare: async (x) => {
        await x.handle.store.autoAssign.save(priya(x.keys), {
          name: 'Practitioner sleep training',
          enabled: true,
          trigger: { type: 'personAdded' },
          filters: { jobRoleIds: [await jobRoleId(x, 'Practitioner')] },
          action: { moduleId: await moduleId(x, 'Safer sleep') },
          dueInDays: 14,
        });
        c = x;
      },
    });
    await screen.findByRole('heading', { level: 1 });
    const before = (await rulesOf(c)).length;
    await userEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a rule' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Rule name' }), 'Copy');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'When' }), 'A new person is added');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Job role' }), 'Practitioner');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Training to give' }), 'Safer sleep');
    const due = within(dialog).getByRole('spinbutton', { name: 'Due in (days)' });
    await userEvent.clear(due);
    await userEvent.type(due, '14');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'You already have a rule that does the same thing.',
    );
    expect((await rulesOf(c)).length).toBe(before);
  });

  it('edits an existing rule from its Edit rule button', async () => {
    let c!: Ctx;
    await renderRoute('/client/rules', 'client', {
      prepare: (x) => {
        c = x;
        return Promise.resolve();
      },
    });
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit rule: What changed in September 2026 for everyone' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit rule' });
    const due = within(dialog).getByRole('spinbutton', { name: 'Due in (days)' });
    expect((due as HTMLInputElement).value).toBe('30');
    await userEvent.clear(due);
    await userEvent.type(due, '10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }));
    await waitFor(async () => {
      expect((await ruleNamed(c, 'What changed in September 2026')).dueInDays).toBe(10);
    });
  });

  it('shows the no-access message without assign.manage', async () => {
    await renderRoute('/client/rules', 'client', { actor: asTestUser, prepare: (x) => addUser(x, ['people.view']) });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Auto-assign rules');
    expect((await screen.findByRole('alert')).textContent).toContain(NO_ACCESS);
    expect(screen.queryByRole('button', { name: 'Add a rule' })).toBeNull();
  });
});

describe('C2 Add staff member', () => {
  it('adds a person, closes the dialog and fires the New starter rule in the same batch', async () => {
    let c!: Ctx;
    await renderRoute('/client/people', 'client', {
      prepare: (x) => {
        c = x;
        return Promise.resolve();
      },
    });
    const before = (await ruleAssignments(c)).length;
    await userEvent.click(await screen.findByRole('button', { name: 'Add staff member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add staff member' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'First name' }), 'Zara');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Last name' }), 'Newjoiner');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Primary site' }), 'Little Acorns');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Job role' }), 'Practitioner');
    await userEvent.type(within(dialog).getByLabelText('Start date'), '2026-10-19');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add person' }));
    expect((await screen.findByRole('status')).textContent).toContain('Added.');
    expect(screen.getByRole('link', { name: 'Zara Newjoiner' })).toBeTruthy();
    const person = need(
      (await dump<{ id: string; lastName: string }>(c.handle, 'people')).find((p) => p.lastName === 'Newjoiner'),
    );
    const mine = (await ruleAssignments(c)).filter((a) => a.personId === person.id);
    expect(mine.length).toBeGreaterThan(0);
    expect((await ruleAssignments(c)).length).toBeGreaterThan(before);
  });

  it('does not show the button without staff.manage', async () => {
    await renderRoute('/client/people', 'client', { actor: asTestUser, prepare: (x) => addUser(x, ['staff.view']) });
    await screen.findByRole('link', { name: 'Hannah Patel' });
    expect(screen.queryByRole('button', { name: 'Add staff member' })).toBeNull();
  });
});

describe('C3 job role edit', () => {
  const addRoleChangedRule = async (x: Ctx) => {
    await x.handle.store.autoAssign.save(priya(x.keys), {
      name: 'Practitioner switch',
      enabled: true,
      trigger: { type: 'roleChanged' },
      filters: { jobRoleIds: [await jobRoleId(x, 'Practitioner')] },
      action: { moduleId: await moduleId(x, 'Safer sleep') },
      dueInDays: 7,
    });
  };

  it('saves new job roles and fires a roleChanged rule once', async () => {
    let c!: Ctx;
    const view = await renderRoute('/client/people', 'client', {
      prepare: async (x) => {
        c = x;
        await addRoleChangedRule(x);
      },
    });
    const hannah = need(c.keys.personas['hannah']);
    await view.router.navigate(`/client/people/${hannah}`);
    const group = await screen.findByRole('group', { name: 'Job roles' });
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Practitioner' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save job roles' }));
    expect((await screen.findByRole('status')).textContent).toContain('Saved.');
    const rule = await ruleNamed(c, 'Practitioner switch');
    const made = (await ruleAssignments(c)).filter(
      (a) => a.personId === hannah && typeof a.source === 'object' && a.source.ruleId === rule.id,
    );
    expect(made).toHaveLength(1);
  });

  it('hides the job role editor without staff.manage', async () => {
    let c!: Ctx;
    const view = await renderRoute('/client/people', 'client', {
      actor: asTestUser,
      prepare: async (x) => {
        c = x;
        await addUser(x, ['staff.view']);
      },
    });
    await view.router.navigate(`/client/people/${need(c.keys.personas['hannah'])}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Save job roles' })).toBeNull();
  });
});
