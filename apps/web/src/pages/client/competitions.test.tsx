// M2 chunk 16 (BP-2, F-5, F-6): C11 /client/competitions, C13 /client/competitions/:id, C14 /client/leaderboards.
// Contract the implementer must provide (gates with can('competitions.view') / can('competitions.manage') only):
//   C11: h1 "Competitions". Regions "Live", "Scheduled", "Ended" and "Draft", each a ul of li data-testid="competition-row"
//     showing the name and a status word ("Live", "Scheduled", "Ended", "Draft", with an icon, never colour alone). An empty
//     list shows "None". Each name is a link to /client/competitions/:id. Link "New competition" (managers only) goes to
//     /client/competitions/new. Link "Leaderboard settings" goes to /client/leaderboards. Without competitions.view: role alert.
//   C13: h1 is the competition name; the status word is shown. Region "Leaderboard" lists li data-testid="standing-row" with the
//     person's display name (admins always see it, even for a custom competition's absence: custom shows "No leaderboard for this
//     competition"). People hidden from leaderboards never appear. Buttons (managers only): "Extend end date" -> dialog "Extend end
//     date" with a date input "New end date" and button "Extend" (an earlier date shows role alert "A competition can only be made
//     longer, not shorter."); "Cancel competition" -> dialog "Cancel this competition?" with button "Yes, cancel competition";
//     "Record winners" (only when ended and no winners yet) -> region "Winners" lists the winners. Link "Edit" to .../edit
//     (draft or scheduled only). A cancelled competition shows the status word "Cancelled".
//   C14: h1 "Leaderboard settings". One switch per board named by its title ("Most questions answered correctly", ...),
//     aria-checked reflects settings. Switching saves immediately through leaderboards.saveSettings. Staff scopes: the text
//     "My site" is shown as selected and "Appears when your organisation has more than one site, region or country" is shown for the
//     others. Without competitions.manage the switches are disabled (Viewer). Privacy notes text: "People who hide themselves never appear".
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

type Rendered = Awaited<ReturnType<typeof renderRoute>>;
const idOf = async (r: Rendered, name: string) =>
  (await r.handle.store.competitions.list(actorFor('client', r.keys))).find((c) => c.name === name)!.id;
const BOARD = 'Most questions answered correctly';

const V = {
  role: '01ZZ0C160000000000000000R1',
  user: '01ZZ0C160000000000000000V1',
  assign: '01ZZ0C160000000000000000A1',
};
// A client user holding competitions.view only (no manage), as a Viewer would.
async function addViewer(r: { handle: Rendered['handle']; keys: Rendered['keys'] }) {
  const clientId = r.keys.clients['littleAcorns'];
  await r.handle.admin.bulkPut('roles', [
    {
      id: V.role,
      owner: { clientId },
      name: 'Test role',
      description: 'Test role',
      colour: '#996633',
      permissionIds: ['competitions.view'],
      system: false,
      version: 1,
      updatedBy: r.keys.users['priya'],
      updatedAt: TODAY,
    },
  ]);
  await r.handle.admin.bulkPut('users', [
    {
      id: V.user,
      side: 'client',
      clientId,
      email: 'v1@example.test',
      displayName: 'Test user',
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    },
  ]);
  await r.handle.admin.bulkPut('roleAssignments', [
    {
      id: V.assign,
      userId: V.user,
      roleIds: [V.role],
      scope: { type: 'clients', ids: [clientId] },
      grants: [],
      denies: [],
      status: 'active',
    },
  ]);
}
const asViewer = (k: Rendered['keys']) => ({ ...actorFor('client', k), userId: V.user });

describe('C11 Competitions list', () => {
  it('groups the four seeded competitions by status with status words', async () => {
    await renderRoute('/client/competitions', 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Competitions' })).toBeTruthy();
    const live = await screen.findByRole('region', { name: 'Live' });
    const names = (r: HTMLElement) =>
      within(r)
        .queryAllByTestId('competition-row')
        .map((x) => x.textContent);
    expect(names(live).join('|')).toContain('Mastery Month');
    expect(names(live).join('|')).toContain('Staff bake-off');
    expect(names(screen.getByRole('region', { name: 'Scheduled' })).join('|')).toContain('Closed-Book Challenge');
    expect(names(screen.getByRole('region', { name: 'Ended' })).join('|')).toContain('Autumn Complete and Win');
    expect(within(screen.getByRole('region', { name: 'Draft' })).getByText('None')).toBeTruthy();
    expect(within(live).getAllByText('Live').length).toBeGreaterThan(0);
  });

  it('links each name to its detail page, and offers New competition and Leaderboard settings', async () => {
    await renderRoute('/client/competitions', 'client');
    const live = await screen.findByRole('region', { name: 'Live' });
    expect(within(live).getByRole('link', { name: 'Mastery Month' }).getAttribute('href')).toMatch(
      /\/client\/competitions\/[^/]+$/,
    );
    expect(screen.getByRole('link', { name: 'New competition' }).getAttribute('href')).toMatch(
      /\/client\/competitions\/new$/,
    );
    expect(screen.getByRole('link', { name: 'Leaderboard settings' }).getAttribute('href')).toMatch(
      /\/client\/leaderboards$/,
    );
  });

  it('hides New competition from a user without competitions.manage', async () => {
    await renderRoute('/client/competitions', 'client', {
      prepare: addViewer,
      actor: asViewer,
    });
    await screen.findByRole('region', { name: 'Live' });
    expect(screen.queryByRole('link', { name: 'New competition' })).toBeNull();
  });
});

describe('C13 Competition detail', () => {
  it('shows the leaderboard to admins with display names', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    cleanup();
    const id = await idOf(r, 'Mastery Month');
    await renderRoute(`/client/competitions/${id}`, 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mastery Month' })).toBeTruthy();
    const lb = await screen.findByRole('region', { name: 'Leaderboard' });
    expect(within(lb).getAllByTestId('standing-row').length).toBeGreaterThanOrEqual(5);
    expect(lb.textContent).toContain('Jade');
  });

  it('never shows a person who hides from leaderboards, even to admins', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const id = await idOf(r, 'Mastery Month');
    cleanup();
    await renderRoute(`/client/competitions/${id}`, 'client', {
      prepare: async ({ handle, keys }) => {
        await handle.store.me.updatePrefs(actorFor('staff', keys), { hideFromLeaderboards: true });
      },
    });
    const lb = await screen.findByRole('region', { name: 'Leaderboard' });
    expect(within(lb).getAllByTestId('standing-row').length).toBeGreaterThan(0);
    expect(lb.textContent).not.toContain('Jade');
  });

  it('says a custom competition has no leaderboard', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const id = await idOf(r, 'Staff bake-off');
    cleanup();
    await renderRoute(`/client/competitions/${id}`, 'client');
    expect(await screen.findByText('No leaderboard for this competition')).toBeTruthy();
    expect(screen.queryByTestId('standing-row')).toBeNull();
  });

  it('extends the end date only to a later date', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const id = await idOf(r, 'Mastery Month');
    cleanup();
    const view = await renderRoute(`/client/competitions/${id}`, 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Extend end date' }));
    const dialog = await screen.findByRole('dialog', { name: 'Extend end date' });
    const input = within(dialog).getByLabelText<HTMLInputElement>('New end date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-10-20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Extend' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'A competition can only be made longer, not shorter.',
    );
    await userEvent.clear(input);
    await userEvent.type(input, '2026-12-31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Extend' }));
    await waitFor(async () => {
      const c = await view.handle.store.competitions.get(actorFor('client', view.keys), id);
      expect(c.endAt.startsWith('2026-12-31')).toBe(true);
    });
  });

  it('cancels only after a confirmation', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const id = await idOf(r, 'Staff bake-off');
    cleanup();
    const view = await renderRoute(`/client/competitions/${id}`, 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel competition' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this competition?' });
    expect((await view.handle.store.competitions.get(actorFor('client', view.keys), id)).status).not.toBe('cancelled');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel competition' }));
    await waitFor(async () => {
      expect((await view.handle.store.competitions.get(actorFor('client', view.keys), id)).status).toBe('cancelled');
    });
    expect(await screen.findByText('Cancelled')).toBeTruthy();
  });

  it('records winners once after the end and then lists them', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const id = await idOf(r, 'Autumn Complete and Win');
    cleanup();
    const view = await renderRoute(`/client/competitions/${id}`, 'client', {
      prepare: async ({ handle }) => {
        const d = (await handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
        const c = { ...d.competitions!.find((x) => x['id'] === id)! };
        delete c['winners'];
        delete c['finalStandings'];
        await handle.admin.bulkPut('competitions', [c]);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Record winners' }));
    const winners = await screen.findByRole('region', { name: 'Winners' });
    expect(within(winners).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Record winners' })).toBeNull();
    const c = await view.handle.store.competitions.get(actorFor('client', view.keys), id);
    expect(c.winners?.length).toBeGreaterThanOrEqual(1);
  });

  it('does not offer Record winners before the end or when winners exist', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const live = await idOf(r, 'Mastery Month');
    const ended = await idOf(r, 'Autumn Complete and Win');
    cleanup();
    await renderRoute(`/client/competitions/${live}`, 'client');
    await screen.findByRole('heading', { level: 1, name: 'Mastery Month' });
    expect(screen.queryByRole('button', { name: 'Record winners' })).toBeNull();
    cleanup();
    await renderRoute(`/client/competitions/${ended}`, 'client');
    await screen.findByRole('heading', { level: 1, name: 'Autumn Complete and Win' });
    expect(screen.queryByRole('button', { name: 'Record winners' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Winners' })).toBeTruthy();
  });

  it('shows a plain not-found message for an unknown competition', async () => {
    await renderRoute('/client/competitions/does-not-exist', 'client');
    expect((await screen.findByRole('alert')).textContent).toMatch(/not found|could not find/i);
  });
});

describe('C14 Leaderboard settings', () => {
  it('shows a switch per board, all on by default, with My site as the only scope in use', async () => {
    await renderRoute('/client/leaderboards', 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Leaderboard settings' })).toBeTruthy();
    const sw = await screen.findByRole('switch', { name: BOARD });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('My site').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Appears when your organisation has more than one site, region or country').length,
    ).toBeGreaterThan(0);
  });

  it('saves a board switched off, and leaderboards.standing then returns off', async () => {
    const view = await renderRoute('/client/leaderboards', 'client');
    await userEvent.click(await screen.findByRole('switch', { name: BOARD }));
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: BOARD }).getAttribute('aria-checked')).toBe('false');
    });
    const board = await view.handle.store.leaderboards.standing(actorFor('staff', view.keys), {
      board: 'correctQuestions',
      period: 'allTime',
    });
    expect(board.off).toBe(true);
    const s = await view.handle.store.leaderboards.settings(actorFor('client', view.keys));
    expect(s.boards.correctQuestions?.staffScopes).toEqual(['site']);
  });

  it('disables the switches for a client user without competitions.manage', async () => {
    await renderRoute('/client/leaderboards', 'client', {
      prepare: addViewer,
      actor: asViewer,
    });
    const sw = await screen.findByRole('switch', { name: BOARD });
    expect(sw).toHaveProperty('disabled', true);
  });
});
