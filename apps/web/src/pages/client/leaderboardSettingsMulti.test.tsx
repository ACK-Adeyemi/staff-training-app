// M3 chunk 19a (BP-18, F-4, F-5; Track A step 8): C14 Leaderboard settings for a multi-site client. Written before the
// implementation. The M2 C14 tests in competitions.test.tsx stay true for a one-site client (Little Acorns).
//
// UI CONTRACT (data layer = store.leaderboards.settings / saveSettings / sitesBoard / scopes; domain = availableScopes;
// gates with can() only; all text in language files). /client/leaderboards, h1 "Leaderboard settings":
//   Staff scopes per individual board (multi-site client): each board card holds a group named
//     "Staff scopes: <board title>" (for example "Staff scopes: Most modules completed") with one checkbox per scope that
//     APPLIES to the client: "My site" (always checked and disabled), "My region" (only when sites span more than one
//     region), "My country" (only when they span more than one country), "All sites" (more than one site). Ticking or
//     unticking saves at once (saveSettings, boards[board].staffScopes keeps 'site'). Disabled without competitions.manage.
//   Sites board: a region "Sites board" (h2) with
//     a switch "Sites board" (aria-checked = settings.siteBoard.enabled, saves at once);
//     group "Measures": checkboxes "Compliance", "On-time completion", "Participation", "Knowledge" (checked = in
//       settings.siteBoard.measures);
//     group "Staff scopes: Sites board": the same scope checkboxes (siteBoard.staffScopes);
//     spinbutton "Small site threshold" (siteBoard.smallSiteMinActive, 5 by default);
//     group "Leave out these sites": one checkbox per site (siteBoard.excludedSiteIds);
//     button "Save Sites board settings" saves the five staged fields together and shows role=status "Saved.". With no
//       measure ticked it saves nothing and shows role=alert "Choose at least one measure.".
//   Full ranking: a region "Full ranking" only for an actor with competitions.manage over the whole organisation
//     (Fiona; not a Site Manager). It holds radiogroup "Measure" (the switched-on measures, first checked), radiogroup
//     "Period" ("This month", "This quarter"), a select "Scope" whose options are exactly "All sites" and then each
//     region name ("South East", "South West"), and li data-testid="ranking-row" for EVERY site in the chosen scope in
//     rank order (rank, site name, value, "Small site" where small; excluded sites never appear). Each row has a button
//     "Drill down: <site>" opening a dialog named <site> with "<n> eligible people", the value and the rank.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Site } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, TODAY } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const oak =
  (userKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients['oakTree']),
    now: TODAY,
  });
const fiona = oak('oakTreeGroupAdmin');
const tariq = oak('riversideManager');
const settingsOf = (view: { handle: StoreHandle; keys: SeedKeys }) =>
  view.handle.store.leaderboards.settings(fiona(view.keys));
const checkbox = (group: HTMLElement, name: string) => within(group).getByRole<HTMLInputElement>('checkbox', { name });

describe('C14 staff scopes per board (BP-18)', () => {
  it('offers My site (locked on), My region and All sites for Oak Tree, but not My country', async () => {
    await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const group = await screen.findByRole('group', { name: 'Staff scopes: Most modules completed' });
    const boxes = within(group)
      .getAllByRole('checkbox')
      .map((c) => c.closest('label')?.textContent ?? '');
    expect(boxes).toEqual(['My site', 'My region', 'All sites']);
    const mySite = checkbox(group, 'My site');
    expect(mySite.checked).toBe(true);
    expect(mySite.disabled).toBe(true);
    expect(checkbox(group, 'My region').checked).toBe(false);
    expect(checkbox(group, 'All sites').checked).toBe(false);
  });

  it("saves one board's scopes without touching the others", async () => {
    const view = await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const group = await screen.findByRole('group', { name: 'Staff scopes: Most modules completed' });
    await userEvent.click(checkbox(group, 'My region'));
    await waitFor(async () => {
      const s = await settingsOf(view);
      expect(s.boards.modulesCompleted?.staffScopes).toEqual(expect.arrayContaining(['site', 'region']));
    });
    const s = await settingsOf(view);
    expect(s.boards.modulesMastered?.staffScopes).toEqual(['site']);
    await userEvent.click(checkbox(group, 'My region'));
    await waitFor(async () => {
      expect((await settingsOf(view)).boards.modulesCompleted?.staffScopes).toEqual(['site']);
    });
  });
});

describe('C14 Sites board settings (BP-18)', () => {
  it('shows what the seed set: on, three measures, the default threshold and no exclusions', async () => {
    await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const region = await screen.findByRole('region', { name: 'Sites board' });
    expect(within(region).getByRole('switch', { name: 'Sites board' }).getAttribute('aria-checked')).toBe('true');
    const measures = within(region).getByRole('group', { name: 'Measures' });
    expect(checkbox(measures, 'Participation').checked).toBe(true);
    expect(checkbox(measures, 'Compliance').checked).toBe(true);
    expect(checkbox(measures, 'On-time completion').checked).toBe(true);
    expect(checkbox(measures, 'Knowledge').checked).toBe(false);
    expect(within(region).getByRole<HTMLInputElement>('spinbutton', { name: 'Small site threshold' }).value).toBe('5');
    const excluded = within(region).getByRole('group', { name: 'Leave out these sites' });
    expect(
      within(excluded)
        .getAllByRole('checkbox')
        .map((c) => c.closest('label')?.textContent),
    ).toEqual(expect.arrayContaining(['Riverside', 'Hillside', 'Meadow']));
    for (const c of within(excluded).getAllByRole('checkbox')) expect((c as HTMLInputElement).checked).toBe(false);
  });

  it('switches the Sites board off at once', async () => {
    const view = await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const region = await screen.findByRole('region', { name: 'Sites board' });
    await userEvent.click(within(region).getByRole('switch', { name: 'Sites board' }));
    await waitFor(async () => {
      expect((await settingsOf(view)).siteBoard.enabled).toBe(false);
    });
  });

  it('saves measures, scopes, threshold and exclusions together', async () => {
    const view = await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const sites = ((await view.handle.admin.dumpAll()) as Record<string, Site[]>)['sites'] ?? [];
    const meadow = need(sites.find((s) => s.name === 'Meadow'));
    const region = await screen.findByRole('region', { name: 'Sites board' });
    await userEvent.click(checkbox(within(region).getByRole('group', { name: 'Measures' }), 'Compliance'));
    await userEvent.click(checkbox(within(region).getByRole('group', { name: 'Measures' }), 'Knowledge'));
    await userEvent.click(
      checkbox(within(region).getByRole('group', { name: 'Staff scopes: Sites board' }), 'My region'),
    );
    const threshold = within(region).getByRole('spinbutton', { name: 'Small site threshold' });
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '4');
    await userEvent.click(checkbox(within(region).getByRole('group', { name: 'Leave out these sites' }), 'Meadow'));
    await userEvent.click(within(region).getByRole('button', { name: 'Save Sites board settings' }));
    expect((await within(region).findByRole('status')).textContent).toBe('Saved.');
    const saved = (await settingsOf(view)).siteBoard;
    expect(saved.measures).toEqual(expect.arrayContaining(['participation', 'onTime', 'knowledge']));
    expect(saved.measures).not.toContain('compliance');
    expect(saved.staffScopes).toEqual(expect.arrayContaining(['site', 'region']));
    expect(saved.smallSiteMinActive).toBe(4);
    expect(saved.excludedSiteIds).toEqual([meadow.id]);
  });

  it('refuses to save with no measure ticked', async () => {
    const view = await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const before = (await settingsOf(view)).siteBoard.measures;
    const region = await screen.findByRole('region', { name: 'Sites board' });
    const measures = within(region).getByRole('group', { name: 'Measures' });
    for (const n of ['Participation', 'Compliance', 'On-time completion']) await userEvent.click(checkbox(measures, n));
    await userEvent.click(within(region).getByRole('button', { name: 'Save Sites board settings' }));
    expect((await within(region).findByRole('alert')).textContent).toBe('Choose at least one measure.');
    expect((await settingsOf(view)).siteBoard.measures).toEqual(before);
  });
});

describe('C14 full ranking for group admins (BP-18, Track A step 8)', () => {
  it('ranks every site, Riverside first on Participation, with Meadow marked small', async () => {
    await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const region = await screen.findByRole('region', { name: 'Full ranking' });
    const measure = within(region).getByRole('radiogroup', { name: 'Measure' });
    expect(within(measure).getByRole<HTMLInputElement>('radio', { name: 'Participation' }).checked).toBe(true);
    await waitFor(() => {
      expect(within(region).getAllByTestId('ranking-row')).toHaveLength(3);
    });
    const rows = within(region).getAllByTestId('ranking-row');
    expect(rows[0]?.textContent).toContain('Riverside');
    const meadow = need(rows.find((r) => r.textContent.includes('Meadow')));
    expect(meadow.textContent).toContain('Small site');
    expect(rows[0]?.textContent).not.toContain('Small site');
  });

  it('lists exactly All sites, South East and South West as scopes, and South East ranks two sites', async () => {
    await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const region = await screen.findByRole('region', { name: 'Full ranking' });
    const scope = within(region).getByRole('combobox', { name: 'Scope' });
    expect(
      within(scope)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All sites', 'South East', 'South West']);
    await userEvent.selectOptions(scope, 'South East');
    await waitFor(() => {
      expect(within(region).getAllByTestId('ranking-row')).toHaveLength(2);
    });
    const text = within(region)
      .getAllByTestId('ranking-row')
      .map((r) => r.textContent)
      .join('|');
    expect(text).toContain('Riverside');
    expect(text).toContain('Hillside');
    expect(text).not.toContain('Meadow');
  });

  it('drills down into a site with its eligible people, value and rank', async () => {
    await renderRoute('/client/leaderboards', 'client', { actor: fiona });
    const region = await screen.findByRole('region', { name: 'Full ranking' });
    await userEvent.click(await within(region).findByRole('button', { name: 'Drill down: Meadow' }));
    const dialog = await screen.findByRole('dialog', { name: 'Meadow' });
    expect(dialog.textContent).toMatch(/\d+ eligible people/);
    expect(dialog.textContent).toMatch(/\d+%/);
    expect(dialog.textContent).toContain('Small site');
  });

  it('leaves an excluded site out of the ranking', async () => {
    await renderRoute('/client/leaderboards', 'client', {
      actor: fiona,
      prepare: async ({ handle, keys }) => {
        const admin = fiona(keys);
        const current = await handle.store.leaderboards.settings(admin);
        const sites = ((await handle.admin.dumpAll()) as Record<string, Site[]>)['sites'] ?? [];
        await handle.store.leaderboards.saveSettings(admin, {
          ...current,
          siteBoard: { ...current.siteBoard, excludedSiteIds: [need(sites.find((s) => s.name === 'Meadow')).id] },
        });
      },
    });
    const region = await screen.findByRole('region', { name: 'Full ranking' });
    await waitFor(() => {
      expect(within(region).getAllByTestId('ranking-row')).toHaveLength(2);
    });
    expect(region.textContent).not.toContain('Drill down: Meadow');
  });

  it('does not show the full ranking to a Site Manager', async () => {
    await renderRoute('/client/leaderboards', 'client', { actor: tariq });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 1 }) ?? screen.queryByRole('alert')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading')).toBeNull();
    });
    expect(screen.queryByRole('region', { name: 'Full ranking' })).toBeNull();
  });
});
