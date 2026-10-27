// M3 chunk 19a (BP-18, F-4, F-5; Track A step 8): S10 Compete with leaderboard scopes and the Sites board tab.
// Written before the implementation.
//
// UI CONTRACT (data layer = store.leaderboards.scopes / standing / sitesBoard / settings; no role checks; all text in
// language files). Extends the S10 contract in compete.test.tsx, which stays true.
//   Scope switch on an individual standing board (inside that board's section): a radiogroup "Scope" with one radio
//     for each scope that BOTH applies to the viewer (`leaderboards.scopes`) and is switched on for THAT board
//     (`settings.boards[board].staffScopes`; 'site' is always on). Radios, in this order: "My site" (default,
//     checked), "My region", "My country", "All sites". It is not rendered when only My site is left. At a wider
//     scope the rows show "Jade M., Riverside" style names (first name, initial, site); at My site no site name.
//   Sites board: when the Sites board is on for the client (settings.siteBoard.enabled) and the client has more than
//     one site, a tablist "Board type" with tabs "People" (default) and "Sites". Both missing otherwise. The Sites tab
//     panel (role=tabpanel) holds:
//       radiogroup "Measure": one radio per switched-on measure in the order of `settings.siteBoard.measures`, labelled
//         "Compliance", "On-time completion", "Participation", "Knowledge"; the first is checked.
//       radiogroup "Period": "This month" (default), "This quarter".
//       radiogroup "Scope": as above but from `settings.siteBoard.staffScopes`; absent with only My site.
//       rows li data-testid="site-board-row" in rank order: rank (for example "1st"), site name, the value ("<n>%";
//         Knowledge as one decimal place), the text "Small site" for a small site; the viewer's own site row has
//         aria-current="true". Never a person's name or id.
//       a line data-testid="to-next" for the Participation measure when the viewer's site is not first:
//         "<n> more people with learning this month would move <Site> up one place" ("1 more person ..." for one).
//     A one-site client (Little Acorns) gets neither tablist nor Scope groups.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { LeaderboardScope, UserAccount } from '@sta/domain';
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

// The seed has no Oak Tree staff users, so the tests add two: Oscar Frost (Riverside) and Toby Ashby (Meadow).
const OSCAR = '01ZZ0C190000000000000000A1';
const TOBY = '01ZZ0C190000000000000000B1';
type Prep = { handle: StoreHandle; keys: SeedKeys };
type Config = { boardScopes?: LeaderboardScope[]; siteScopes?: LeaderboardScope[]; siteBoardOn?: boolean };

const staffUser = (keys: SeedKeys, id: string, personKey: 'oscarFrost' | 'tobyAshby'): UserAccount => ({
  id,
  side: 'staff',
  clientId: need(keys.clients['oakTree']),
  personId: need(keys.personas[personKey]),
  email: `${personKey}@example.test`,
  displayName: personKey === 'oscarFrost' ? 'Oscar Frost' : 'Toby Ashby',
  status: 'active',
  login: { method: 'pin', pinSet: true },
});

const prepare =
  (config: Config) =>
  async ({ handle, keys }: Prep) => {
    await handle.admin.bulkPut('users', [staffUser(keys, OSCAR, 'oscarFrost'), staffUser(keys, TOBY, 'tobyAshby')]);
    const fiona: ActorContext = {
      userId: need(keys.users['oakTreeGroupAdmin']),
      side: 'client',
      clientId: need(keys.clients['oakTree']),
      now: TODAY,
    };
    const current = await handle.store.leaderboards.settings(fiona);
    await handle.store.leaderboards.saveSettings(fiona, {
      ...current,
      boards: {
        ...current.boards,
        modulesCompleted: { enabled: true, staffScopes: config.boardScopes ?? ['site'] },
        modulesMastered: { enabled: true, staffScopes: ['site'] },
      },
      siteBoard: {
        ...current.siteBoard,
        enabled: config.siteBoardOn ?? true,
        measures: ['participation', 'compliance', 'onTime'],
        staffScopes: config.siteScopes ?? ['site', 'region', 'all'],
      },
    });
  };
const as =
  (userId: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId,
    side: 'staff',
    clientId: need(keys.clients['oakTree']),
    now: TODAY,
  });

const section = async (title: string) =>
  (await screen.findByRole('heading', { name: title })).closest('section') as HTMLElement;
const radios = (group: HTMLElement) =>
  within(group)
    .getAllByRole('radio')
    .map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent ?? '');
const siteRows = (panel: HTMLElement) => within(panel).queryAllByTestId('site-board-row');

async function openSites() {
  await userEvent.click(await screen.findByRole('tab', { name: 'Sites' }));
  return screen.findByRole('tabpanel');
}

describe('S10 scope switch on the individual boards (BP-18)', () => {
  it('offers only My site, My region and All sites on a board that has them switched on', async () => {
    await renderRoute('/staff/compete', 'staff', {
      actor: as(OSCAR),
      prepare: prepare({ boardScopes: ['site', 'region', 'all'] }),
    });
    const board = await section('Most modules completed');
    const scope = within(board).getByRole('radiogroup', { name: 'Scope' });
    expect(radios(scope)).toEqual(['My site', 'My region', 'All sites']);
    expect(within(scope).getByRole<HTMLInputElement>('radio', { name: 'My site' }).checked).toBe(true);
  });

  it('does not show a scope that applies but is switched off for that board, nor a scope on a My site only board', async () => {
    await renderRoute('/staff/compete', 'staff', {
      actor: as(OSCAR),
      prepare: prepare({ boardScopes: ['site', 'all'] }),
    });
    const completed = await section('Most modules completed');
    expect(radios(within(completed).getByRole('radiogroup', { name: 'Scope' }))).toEqual(['My site', 'All sites']);
    const mastered = await section('Most modules mastered');
    expect(within(mastered).queryByRole('radiogroup', { name: 'Scope' })).toBeNull();
  });

  it('shows names with the site at a wider scope and without it at My site', async () => {
    await renderRoute('/staff/compete', 'staff', {
      actor: as(OSCAR),
      prepare: prepare({ boardScopes: ['site', 'all'] }),
    });
    const board = await section('Most modules completed');
    await waitFor(() => {
      expect(within(board).queryAllByTestId('board-row').length).toBeGreaterThan(0);
    });
    for (const row of within(board).getAllByTestId('board-row'))
      expect(row.textContent).not.toMatch(/\w\., (Riverside|Hillside|Meadow)/);
    await userEvent.click(within(board).getByRole('radio', { name: 'All sites' }));
    await waitFor(() => {
      const text = within(board)
        .getAllByTestId('board-row')
        .map((r) => r.textContent)
        .join('|');
      expect(text).toMatch(/\w\., (Riverside|Hillside|Meadow)/);
    });
  });

  it('shows no Scope choice anywhere by default (every board My site only)', async () => {
    await renderRoute('/staff/compete', 'staff', { actor: as(OSCAR), prepare: prepare({}) });
    await section('Most modules completed');
    expect(screen.queryAllByRole('radiogroup', { name: 'Scope' })).toHaveLength(0);
  });

  it('shows Little Acorns staff no Scope choice and no Sites tab', async () => {
    await renderRoute('/staff/compete', 'staff');
    await screen.findByRole('heading', { level: 1, name: 'Compete' });
    await screen.findByRole('region', { name: 'Standing boards' });
    expect(screen.queryAllByRole('radiogroup', { name: 'Scope' })).toHaveLength(0);
    expect(screen.queryByRole('tablist', { name: 'Board type' })).toBeNull();
  });
});

describe('S10 Sites board tab (BP-18, Track A step 8)', () => {
  it('shows People and Sites tabs, People first, to Oak Tree staff when the Sites board is on', async () => {
    await renderRoute('/staff/compete', 'staff', { actor: as(OSCAR), prepare: prepare({}) });
    const tabs = await screen.findByRole('tablist', { name: 'Board type' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['People', 'Sites']);
    expect(within(tabs).getByRole('tab', { name: 'People' }).getAttribute('aria-selected')).toBe('true');
  });

  it('hides the tabs when the Sites board is switched off', async () => {
    await renderRoute('/staff/compete', 'staff', { actor: as(OSCAR), prepare: prepare({ siteBoardOn: false }) });
    await screen.findByRole('region', { name: 'Standing boards' });
    expect(screen.queryByRole('tablist', { name: 'Board type' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Sites' })).toBeNull();
  });

  it("opens on Participation with Riverside first, the viewer's own site marked, and no person names", async () => {
    await renderRoute('/staff/compete', 'staff', {
      actor: as(OSCAR),
      prepare: prepare({ siteScopes: ['site', 'all'] }),
    });
    const panel = await openSites();
    const measure = within(panel).getByRole('radiogroup', { name: 'Measure' });
    expect(radios(measure)).toEqual(['Participation', 'Compliance', 'On-time completion']);
    expect(within(measure).getByRole<HTMLInputElement>('radio', { name: 'Participation' }).checked).toBe(true);
    expect(within(panel).getByRole<HTMLInputElement>('radio', { name: 'This month' }).checked).toBe(true);
    await userEvent.click(within(panel).getByRole('radio', { name: 'All sites' }));
    await waitFor(() => {
      expect(siteRows(panel)).toHaveLength(3);
    });
    const rows = siteRows(panel);
    expect(rows[0]?.textContent).toContain('Riverside');
    expect(rows[0]?.textContent).toContain('1st');
    expect(rows[0]?.textContent).toMatch(/\d+%/);
    expect(rows[0]?.getAttribute('aria-current')).toBe('true');
    expect(rows.filter((r) => r.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(panel.textContent).not.toMatch(/Oscar|Toby|Nadia/);
  });

  it('limits My region to Riverside and Hillside for a Riverside member', async () => {
    await renderRoute('/staff/compete', 'staff', { actor: as(OSCAR), prepare: prepare({}) });
    const panel = await openSites();
    expect(radios(within(panel).getByRole('radiogroup', { name: 'Scope' }))).toEqual([
      'My site',
      'My region',
      'All sites',
    ]);
    await userEvent.click(within(panel).getByRole('radio', { name: 'My region' }));
    await waitFor(() => {
      expect(siteRows(panel)).toHaveLength(2);
    });
    const text = siteRows(panel)
      .map((r) => r.textContent)
      .join('|');
    expect(text).toContain('Riverside');
    expect(text).toContain('Hillside');
    expect(text).not.toContain('Meadow');
  });

  it('marks Meadow a small site and says what would move it up one place', async () => {
    await renderRoute('/staff/compete', 'staff', { actor: as(TOBY), prepare: prepare({}) });
    const panel = await openSites();
    await userEvent.click(within(panel).getByRole('radio', { name: 'All sites' }));
    await waitFor(() => {
      expect(siteRows(panel)).toHaveLength(3);
    });
    const meadow = need(siteRows(panel).find((r) => r.textContent.includes('Meadow')));
    expect(meadow.textContent).toContain('Small site');
    expect(meadow.getAttribute('aria-current')).toBe('true');
    expect(within(panel).getByTestId('to-next').textContent).toMatch(
      /^\d+ more (people|person) with learning this month would move Meadow up one place$/,
    );
  });

  it('switches measure and period, re-ranking the sites', async () => {
    await renderRoute('/staff/compete', 'staff', { actor: as(OSCAR), prepare: prepare({}) });
    const panel = await openSites();
    await userEvent.click(within(panel).getByRole('radio', { name: 'All sites' }));
    await waitFor(() => {
      expect(siteRows(panel)).toHaveLength(3);
    });
    await userEvent.click(within(panel).getByRole('radio', { name: 'Compliance' }));
    await waitFor(() => {
      expect(within(panel).getByRole<HTMLInputElement>('radio', { name: 'Compliance' }).checked).toBe(true);
    });
    const values = siteRows(panel).map((r) => Number(/(\d+)%/.exec(r.textContent)?.[1]));
    expect(values).toHaveLength(3);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    await userEvent.click(within(panel).getByRole('radio', { name: 'This quarter' }));
    await waitFor(() => {
      expect(within(panel).getByRole<HTMLInputElement>('radio', { name: 'This quarter' }).checked).toBe(true);
    });
    expect(siteRows(panel).length).toBeGreaterThan(0);
  });
});
