// M3 chunk 19b (BP-17, F-5): C12 competition builder eligibility pickers, deferred from M2 (plan M3 note 13). Written
// before the implementation.
//
// UI CONTRACT (data layer = store.competitions.save/list, store.jobRoles.list, store.teams.list, store.sites.list,
// store.people.list; domain = isEligible from competitions/status.ts. All text comes from language files. Builds on the
// existing builder contract in competitionBuilder.test.tsx; the form is unchanged except for one new fieldset.)
//
//   A group (fieldset, role "group") named "Who can take part" on the form for built-in and custom competitions, holding:
//     - group "Job roles": one checkbox per job role of the client, named by the role name. None ticked = all roles.
//     - group "Teams": one checkbox per team of the client, named by the team name. None ticked = all teams.
//     - group "Sites": one checkbox per site, named by the site name. ONLY rendered when `sites.list` returns more than
//       one site for the actor (multi-site). None ticked = all sites.
//     - group "Leave out": a textbox "Find a person" that narrows a list of checkboxes named "First Last" (non-archived
//       people of the client; with an empty search box all are listed). Ticking one adds the person to
//       eligibility.excludePersonIds; the ticked people stay visible while searching.
//     - an element data-testid="eligibility-summary" whose text is "<n> people can take part" ("1 person can take part"
//       for one), n = non-archived people for whom domain isEligible(candidate competition, person) is true.
//   Save draft stores eligibility { jobRoleIds?, teamIds?, siteIds?, excludePersonIds }. An empty picker group stores
//   no key for it (undefined), never an empty array. Editing an existing competition shows its eligibility pre-ticked.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import { isEligible, type Competition, type JobRole, type Person, type Site, type Team } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as Record<string, unknown[]>)[store] as R[];
const fiona = (keys: SeedKeys): ActorContext => ({
  userId: need(keys.users['oakTreeGroupAdmin']),
  side: 'client',
  clientId: need(keys.clients['oakTree']),
  now: actorFor('client', keys).now,
});

const who = () => screen.findByRole('group', { name: 'Who can take part' });
async function fillCustom(name: string) {
  await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), name);
  await userEvent.type(screen.getByRole('textbox', { name: 'Prize' }), 'A cake');
  for (const [label, value] of [
    ['Start date', '2026-11-02'],
    ['End date', '2026-11-09'],
  ] as const) {
    const el = screen.getByLabelText<HTMLInputElement>(label);
    await userEvent.clear(el);
    await userEvent.type(el, value);
  }
}
const saved = async (view: { handle: StoreHandle; keys: SeedKeys }, name: string, actor?: ActorContext) => {
  const list = await view.handle.store.competitions.list(actor ?? actorFor('client', view.keys));
  return need(list.find((c) => c.name === name));
};

describe('C12 eligibility pickers (single site)', () => {
  it('lists the client job roles and teams as checkboxes and no Sites group for a one-site client', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    const clientId = need(view.keys.clients['littleAcorns']);
    const roles = await view.handle.store.jobRoles.list(actorFor('client', view.keys));
    const teams = (await dump<Team>(view.handle, 'teams')).filter((t) => t.clientId === clientId);
    expect(roles.length).toBeGreaterThan(1);
    expect(teams.length).toBeGreaterThan(1);
    const box = await who();
    const roleGroup = within(box).getByRole('group', { name: 'Job roles' });
    expect(
      within(roleGroup)
        .getAllByRole('checkbox')
        .map((c) => (c as HTMLInputElement).labels?.[0]?.textContent),
    ).toEqual(expect.arrayContaining(roles.map((r) => r.name)));
    expect(within(roleGroup).getAllByRole('checkbox')).toHaveLength(roles.length);
    expect(within(within(box).getByRole('group', { name: 'Teams' })).getAllByRole('checkbox')).toHaveLength(
      teams.length,
    );
    expect(within(box).queryByRole('group', { name: 'Sites' })).toBeNull();
  });

  it('stores the ticked job role and team, and nothing for untouched groups', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    const clientId = need(view.keys.clients['littleAcorns']);
    const role = need((await view.handle.store.jobRoles.list(actorFor('client', view.keys)))[0]);
    const team = need((await dump<Team>(view.handle, 'teams')).find((t) => t.clientId === clientId));
    await fillCustom('Rooms cup');
    const box = await who();
    await userEvent.click(
      within(within(box).getByRole('group', { name: 'Job roles' })).getByRole('checkbox', { name: role.name }),
    );
    await userEvent.click(
      within(within(box).getByRole('group', { name: 'Teams' })).getByRole('checkbox', { name: team.name }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('region', { name: 'Draft' });
    const c = await saved(view, 'Rooms cup');
    expect(c.eligibility.jobRoleIds).toEqual([role.id]);
    expect(c.eligibility.teamIds).toEqual([team.id]);
    expect(c.eligibility.siteIds).toBeUndefined();
    expect(c.eligibility.excludePersonIds).toEqual([]);
  });

  it('stores no eligibility keys when nothing is ticked, meaning everyone', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    await fillCustom('Everyone cup');
    await who();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('region', { name: 'Draft' });
    const c = await saved(view, 'Everyone cup');
    expect(c.eligibility).toEqual({ excludePersonIds: [] });
  });

  it('leaves out a person found by search, keeping the ticked person visible while searching again', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    const clientId = need(view.keys.clients['littleAcorns']);
    const people = (await dump<Person>(view.handle, 'people')).filter(
      (p) => p.clientId === clientId && p.status !== 'archived',
    );
    const [a, b] = [need(people[0]), need(people[1])];
    const full = (p: Person) => `${p.firstName} ${p.lastName}`;
    await fillCustom('Without one');
    const out = within(await who()).getByRole('group', { name: 'Leave out' });
    expect(within(out).getAllByRole('checkbox')).toHaveLength(people.length);
    await userEvent.type(within(out).getByRole('textbox', { name: 'Find a person' }), a.lastName);
    await userEvent.click(within(out).getByRole('checkbox', { name: full(a) }));
    await userEvent.clear(within(out).getByRole('textbox', { name: 'Find a person' }));
    await userEvent.type(within(out).getByRole('textbox', { name: 'Find a person' }), b.lastName);
    expect(within(out).getByRole<HTMLInputElement>('checkbox', { name: full(a) }).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('region', { name: 'Draft' });
    expect((await saved(view, 'Without one')).eligibility.excludePersonIds).toEqual([a.id]);
  });

  it('shows how many people can take part and updates it as roles are ticked and people left out', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    const clientId = need(view.keys.clients['littleAcorns']);
    const people = (await dump<Person>(view.handle, 'people')).filter(
      (p) => p.clientId === clientId && p.status !== 'archived',
    );
    const roles = await view.handle.store.jobRoles.list(actorFor('client', view.keys));
    const role = need(
      roles.find(
        (r) => people.some((p) => p.jobRoleIds.includes(r.id)) && people.some((p) => !p.jobRoleIds.includes(r.id)),
      ),
    );
    const count = (pred: (p: Person) => boolean) => people.filter(pred).length;
    const text = (n: number) => (n === 1 ? '1 person can take part' : `${n} people can take part`);
    const summary = async () => (await screen.findByTestId('eligibility-summary')).textContent;
    await who();
    expect(await summary()).toBe(text(people.length));
    await userEvent.click(screen.getByRole('checkbox', { name: role.name }));
    const base: Competition['eligibility'] = { jobRoleIds: [role.id], excludePersonIds: [] };
    const expected = count((p) => isEligible({ eligibility: base }, p));
    expect(expected).toBeLessThan(people.length);
    await waitFor(async () => {
      expect(await summary()).toBe(text(expected));
    });
  });

  it('shows a saved competition eligibility ticked when editing', async () => {
    let editId = '';
    let role!: JobRole;
    let person!: Person;
    const view = await renderRoute('/client/competitions', 'client', {
      prepare: async ({ handle, keys }) => {
        const actor = actorFor('client', keys);
        const clientId = need(keys.clients['littleAcorns']);
        role = need((await handle.store.jobRoles.list(actor))[0]);
        person = need(
          (await dump<Person>(handle, 'people')).find((p) => p.clientId === clientId && p.status !== 'archived'),
        );
        const rest = { ...need((await handle.store.competitions.list(actor))[0]) };
        delete rest.winners;
        delete rest.finalStandings;
        editId = '0000000000000000000000ED17';
        await handle.store.competitions.save(actor, {
          ...rest,
          id: editId,
          name: 'Edit me',
          status: 'draft',
          startAt: '2026-11-02T00:00:00.000Z',
          endAt: '2026-11-09T23:59:59.000Z',
          eligibility: { jobRoleIds: [role.id], excludePersonIds: [person.id] },
        });
      },
    });
    expect(editId).not.toBe('');
    await view.router.navigate(`/client/competitions/${editId}/edit`);
    const box = await who();
    expect(within(box).getByRole<HTMLInputElement>('checkbox', { name: role.name }).checked).toBe(true);
    expect(
      within(within(box).getByRole('group', { name: 'Leave out' })).getByRole<HTMLInputElement>('checkbox', {
        name: `${person.firstName} ${person.lastName}`,
      }).checked,
    ).toBe(true);
  });
});

describe('C12 eligibility pickers (multi-site, Fiona)', () => {
  it('offers a Sites group listing every site and stores the ticked site', async () => {
    const view = await renderRoute('/client/competitions/new', 'client', { actor: fiona });
    const clientId = need(view.keys.clients['oakTree']);
    const sites = (await dump<Site>(view.handle, 'sites')).filter((s) => s.clientId === clientId);
    expect(sites.length).toBeGreaterThan(1);
    const meadow = need(sites.find((s) => s.name === 'Meadow'));
    await fillCustom('Meadow cup');
    const group = within(await who()).getByRole('group', { name: 'Sites' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(sites.length);
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Meadow' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('region', { name: 'Draft' });
    const c = await saved(view, 'Meadow cup', fiona(view.keys));
    expect(c.eligibility.siteIds).toEqual([meadow.id]);
  });
});
