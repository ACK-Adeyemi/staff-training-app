// M3 chunk 16 (F-1, BP-17 switcher part): the stats overview C9 at /client/stats. Written before the implementation.
// New text goes in language files (stats.* keys already hold most of these strings).
//
// UI CONTRACT (the implementer must provide; data layer = store.requirements, jobRoles, teams, sites, people,
// evidence, assignments, modules; domain = overview.ts: overviewByRequirement/Role/Team/Site, overdueAndExpiring,
// mostAndLeastCompleted, complianceTrend):
//   Access. `reports.view` held anywhere; otherwise role=alert "You don't have access to this. Ask your manager."
//   h1 "Stats". The shell's More menu has a link "Stats" to #/client/stats (label equals the h1).
//   Regions (each section aria-labelledby its h2). The four breakdowns are charts: role=img with a sentence naming
//   every value, a button "Show as a table" and then a table whose rows are [name, "<percent>%"] in the order of the
//   domain rows (one row per requirement, job role, team and site the actor can read):
//     "By requirement", "By job role", "By room", "By site" (By site is shown only when the client has more than one
//     readable site; Little Acorns has one, so it shows no By site region).
//   "Overdue": a list/table of overdue requirement and person pairs, "Expiring soon" likewise; empty text "No data yet."
//     Each row shows the person's name and the requirement name and a link to /client/people/<personId>.
//   "Most completed" and "Least completed": up to 3 rows each: module title and "<percent>%" (mostAndLeastCompleted).
//   "Compliance over time": chart plus a segmented choice with radios "30 days" (default) and "90 days"; its table
//     has 5 rows for 30 days and 13 for 90 days (complianceTrend(view, days)), columns Date and Percent.
//   Site switcher (SiteScopeContext, the shell's select "Switch site"): choosing one site limits every region to that
//     site's people: By site then lists only that site, and By requirement percentages use only its people.
//   A note "This is for managers and is never used to rank staff." is shown (stats.adminOnlyNote).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Role, RoleAssignment } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, TODAY } from '../../test/harness';

afterEach(cleanup);

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const clientActor =
  (userKey: string, clientKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients[clientKey]),
    now: TODAY,
  });
const fiona = clientActor('oakTreeGroupAdmin', 'oakTree');
const priya = clientActor('priya', 'littleAcorns');

const region = (name: string) => screen.findByRole('region', { name });
const tableOf = async (name: string) => {
  const r = await region(name);
  expect(within(r).getByRole('img')).toBeTruthy();
  fireEvent.click(within(r).getByRole('button', { name: 'Show as a table' }));
  return { r, table: await within(r).findByRole('table') };
};
const rowsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.querySelectorAll('th, td')].map((c) => c.textContent.trim()));

describe('C9 breakdowns', () => {
  it('lists every requirement with a percentage in a chart that has a table', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/stats', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Stats' })).toBeTruthy();
    const { r, table } = await tableOf('By requirement');
    const reqs = await ctx.handle.store.requirements.list(priya(ctx.keys));
    const rows = rowsOf(table);
    expect(rows.map((x) => x[0]).sort()).toEqual(reqs.map((q) => q.name).sort());
    for (const row of rows) expect(row[1]).toMatch(/^\d+%$/);
    const label = within(r).getByRole('img').getAttribute('aria-label') ?? '';
    for (const row of rows) expect(label).toContain(row[1] ?? '?');
  });

  it('breaks compliance down by job role and by room', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/stats', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const roles = rowsOf((await tableOf('By job role')).table).map((x) => x[0]);
    const teams = rowsOf((await tableOf('By room')).table).map((x) => x[0]);
    const actor = priya(ctx.keys);
    expect(roles.sort()).toEqual((await ctx.handle.store.jobRoles.list(actor)).map((j) => j.name).sort());
    expect(teams.sort()).toEqual((await ctx.handle.store.teams.list(actor)).map((j) => j.name).sort());
  });

  it('shows no By site region for a single-site client', async () => {
    await renderRoute('/client/stats', 'client');
    await region('By requirement');
    expect(screen.queryByRole('region', { name: 'By site' })).toBeNull();
  });

  it('shows By site with every site for a multi-site client, each as a percentage', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/stats', 'client', {
      actor: fiona,
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const rows = rowsOf((await tableOf('By site')).table);
    const sites = await ctx.handle.store.sites.list(fiona(ctx.keys));
    expect(sites.length).toBeGreaterThan(1);
    expect(rows.map((x) => x[0]).sort()).toEqual(sites.map((s) => s.name).sort());
    for (const row of rows) expect(row[1]).toMatch(/^\d+%$/);
  });
});

describe('C9 attention lists, completion and trends', () => {
  it('shows overdue and expiring lists, or No data yet, with people and requirements named', async () => {
    await renderRoute('/client/stats', 'client');
    const overdue = await region('Overdue');
    const expiring = await region('Expiring soon');
    for (const r of [overdue, expiring]) {
      const links = within(r).queryAllByRole('link');
      if (links.length === 0) expect(r.textContent).toContain('No data yet.');
      else expect(links[0]?.getAttribute('href')).toMatch(/\/client\/people\/[^/]+$/);
    }
    expect(
      overdue.querySelectorAll('li, tbody tr').length + expiring.querySelectorAll('li, tbody tr').length,
    ).toBeGreaterThan(0);
  });

  it('lists most and least completed modules, at most three each, with percentages', async () => {
    await renderRoute('/client/stats', 'client');
    const most = await region('Most completed');
    const least = await region('Least completed');
    for (const r of [most, least]) {
      const items = r.querySelectorAll('li, tbody tr');
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(3);
      expect(r.textContent).toMatch(/\d+%/);
    }
  });

  it('shows a 30 day trend by default and a 90 day trend on request, each with a table', async () => {
    await renderRoute('/client/stats', 'client');
    const r = await region('Compliance over time');
    expect(within(r).getByRole<HTMLInputElement>('radio', { name: '30 days' }).checked).toBe(true);
    fireEvent.click(within(r).getByRole('button', { name: 'Show as a table' }));
    expect(rowsOf(await within(r).findByRole('table'))).toHaveLength(5);
    await userEvent.click(within(r).getByRole('radio', { name: '90 days' }));
    await waitFor(() => {
      expect(rowsOf(within(r).getByRole('table'))).toHaveLength(13);
    });
  });

  it('says the numbers are never used to rank staff', async () => {
    await renderRoute('/client/stats', 'client');
    expect(await screen.findByText('This is for managers and is never used to rank staff.')).toBeTruthy();
  });
});

describe('C9 site switcher (BP-17)', () => {
  it('limits By site to the chosen site for a group admin', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/stats', 'client', {
      actor: fiona,
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await tableOf('By site');
    const sites = await ctx.handle.store.sites.list(fiona(ctx.keys));
    const riverside = need(sites.find((s) => s.name.includes('Riverside')));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Switch site' }), riverside.id);
    await waitFor(() => {
      const r = screen.getByRole('region', { name: 'By site' });
      if (!within(r).queryByRole('table')) fireEvent.click(within(r).getByRole('button', { name: 'Show as a table' }));
      expect(rowsOf(within(r).getByRole('table')).map((x) => x[0])).toEqual([riverside.name]);
    });
  });
});

describe('C9 permissions (F-4)', () => {
  it('shows the no-access message without reports.view', async () => {
    const daniel = clientActor('daniel', 'littleAcorns');
    await renderRoute('/client/stats', 'client', {
      actor: daniel,
      prepare: async ({ handle, keys }) => {
        const userId = need(keys.users['daniel']);
        const role: Role = {
          id: '01TEST0000000000000000C9C9',
          owner: { clientId: need(keys.clients['littleAcorns']) },
          name: 'No stats role',
          description: 'Test only',
          colour: '#336699',
          permissionIds: ['modules.view'],
          system: false,
          version: 1,
          updatedBy: need(keys.users['priya']),
          updatedAt: TODAY,
        };
        const all = ((await handle.admin.dumpAll()) as unknown as { roleAssignments: RoleAssignment[] })
          .roleAssignments;
        await handle.admin.bulkPut('roles', [role]);
        await handle.admin.bulkPut(
          'roleAssignments',
          all.filter((a) => a.userId === userId).map((a) => ({ ...a, roleIds: [role.id] })),
        );
      },
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      "You don't have access to this. Ask your manager.",
    );
    expect(screen.queryByRole('region', { name: 'By requirement' })).toBeNull();
  });
});
