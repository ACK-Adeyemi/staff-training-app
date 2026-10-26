// M2 chunk 16 (BP-2, F-5, F-6): S10 Compete, /staff/compete. Contract the implementer must provide:
//   h1 "Compete". Hooks: useCompetitions, useStandings, useStandingBoard (data layer only; no role checks).
//   Region "Live competitions": ul of li data-testid="competition-card" (live ones only), each with the name, the prize
//     text and a button "Details: {name}" that opens a dialog named {name}. The dialog shows the description, the prize,
//     the dates, a "How to win" heading with the template text, and a "Leaderboard" region only when the live leaderboard
//     is on (rows li data-testid="standing-row"; the viewer's row has aria-current="true" and the text "You").
//     An ineligible viewer sees the details with the text "You are not eligible for this competition".
//   Region "Recently ended": the same card list for ended competitions. Their dialog has a region "Winners" (ul, one li per winner name).
//   Region "Standing boards": one region per switched-on board, named by its title (h2). The six titles:
//     "Most questions answered correctly", "Most modules completed", "Most modules mastered", "Most active weeks",
//     "Refresher champions", "Team board". A board that is switched off is not rendered at all.
//     Each board has a radiogroup "Period" with radios "All time" (default) and "This month", up to 10 li data-testid="board-row",
//     and a line "You're 2nd of 13" (ordinal + of N, from the board's viewer position). Own row is highlighted (aria-current="true").
//     A hidden viewer sees their own private position but no row of their own.
//   Button "Battle Room", disabled, with the text "Arrives in a later build".
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { actorFor, renderRoute } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

const BOARD = 'Most questions answered correctly';
const hannah = (keys: { users: Record<string, string> }) => ({
  ...actorFor('staff', keys as never),
  userId: keys.users.hannah!,
});

describe('S10 live competitions', () => {
  it('lists the live competitions with prize and no scheduled or ended ones', async () => {
    await renderRoute('/staff/compete', 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Compete' })).toBeTruthy();
    const region = await screen.findByRole('region', { name: 'Live competitions' });
    const cards = within(region).getAllByTestId('competition-card');
    expect(cards.map((c) => c.textContent).join('|')).toContain('Mastery Month');
    expect(cards.map((c) => c.textContent).join('|')).toContain('Staff bake-off');
    expect(region.textContent).not.toContain('Closed-Book Challenge');
    expect(region.textContent).not.toContain('Autumn Complete and Win');
  });

  it('opens a details sheet with how to win, dates, prize and the leaderboard when it is on', async () => {
    await renderRoute('/staff/compete', 'staff');
    await userEvent.click(await screen.findByRole('button', { name: 'Details: Mastery Month' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mastery Month' });
    expect(within(dialog).getByRole('heading', { name: 'How to win' })).toBeTruthy();
    expect(dialog.textContent).toContain('Master the most modules in the period');
    expect(dialog.textContent).toContain('Prize');
    const lb = within(dialog).getByRole('region', { name: 'Leaderboard' });
    expect(within(lb).getAllByTestId('standing-row').length).toBeGreaterThan(0);
    expect(lb.querySelector('[aria-current="true"]')?.textContent).toContain('You');
  });

  it('shows no leaderboard region for a custom competition', async () => {
    await renderRoute('/staff/compete', 'staff');
    await userEvent.click(await screen.findByRole('button', { name: 'Details: Staff bake-off' }));
    const dialog = await screen.findByRole('dialog', { name: 'Staff bake-off' });
    expect(within(dialog).queryByRole('region', { name: 'Leaderboard' })).toBeNull();
  });

  it('hides the rows from staff while the live leaderboard is off', async () => {
    await renderRoute('/staff/compete', 'staff', {
      prepare: async ({ handle }) => {
        const d = (await handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
        const mm = d.competitions!.find((c) => c['name'] === 'Mastery Month')!;
        await handle.admin.bulkPut('competitions', [{ ...mm, liveLeaderboard: false }]);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Details: Mastery Month' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mastery Month' });
    expect(within(dialog).queryByTestId('standing-row')).toBeNull();
  });

  it('shows an empty message when nothing is live', async () => {
    await renderRoute('/staff/compete', 'staff', {
      prepare: async ({ handle }) => {
        const d = (await handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
        await handle.admin.bulkPut(
          'competitions',
          d.competitions!.filter((c) => c['status'] !== 'cancelled').map((c) => ({ ...c, status: 'cancelled' })),
        );
      },
    });
    expect(await screen.findByText('There are no competitions running at the moment.')).toBeTruthy();
  });

  it('tells an ineligible person they are not eligible while still showing the details', async () => {
    await renderRoute('/staff/compete', 'staff', {
      prepare: async ({ handle, keys }) => {
        const d = (await handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
        const mm = d.competitions!.find((c) => c['name'] === 'Mastery Month')!;
        const jade = d.users!.find((u) => u['id'] === keys.users.jade)!;
        const elig = mm['eligibility'] as { excludePersonIds: string[] };
        await handle.admin.bulkPut('competitions', [
          { ...mm, eligibility: { ...elig, excludePersonIds: [jade['personId']] } },
        ]);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Details: Mastery Month' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mastery Month' });
    expect(dialog.textContent).toContain('You are not eligible for this competition');
    expect(dialog.textContent).toContain('How to win');
  });

  it('announces recorded winners in the details of an ended competition', async () => {
    await renderRoute('/staff/compete', 'staff');
    const ended = await screen.findByRole('region', { name: 'Recently ended' });
    await userEvent.click(within(ended).getByRole('button', { name: 'Details: Autumn Complete and Win' }));
    const dialog = await screen.findByRole('dialog', { name: 'Autumn Complete and Win' });
    const winners = within(dialog).getByRole('region', { name: 'Winners' });
    expect(within(winners).getAllByRole('listitem').length).toBe(1);
  });
});

describe('S10 standing boards', () => {
  it('shows only the switched-on boards and shows Jade 2nd of 13 for questions answered correctly', async () => {
    await renderRoute('/staff/compete', 'staff');
    const board = await screen.findByRole('region', { name: BOARD });
    expect(within(board).getByText("You're 2nd of 13")).toBeTruthy();
    expect(within(board).getAllByTestId('board-row').length).toBeLessThanOrEqual(13);
    expect(within(board).getByRole('radio', { name: 'All time' })).toHaveProperty('checked', true);
    expect(within(board).getByRole('radio', { name: 'This month' })).toBeTruthy();
    const standings = screen.getByRole('region', { name: 'Standing boards' });
    expect(within(standings).getAllByRole('region').length).toBe(6);
  });

  it('highlights the own row and never shows more than ten rows unless tied', async () => {
    await renderRoute('/staff/compete', 'staff');
    const board = await screen.findByRole('region', { name: BOARD });
    const rows = within(board).getAllByTestId('board-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(11);
    expect(board.querySelectorAll('[aria-current="true"]').length).toBe(1);
  });

  it('switches to This month', async () => {
    await renderRoute('/staff/compete', 'staff');
    const board = await screen.findByRole('region', { name: BOARD });
    await userEvent.click(within(board).getByRole('radio', { name: 'This month' }));
    expect(within(board).getByRole('radio', { name: 'This month' })).toHaveProperty('checked', true);
  });

  it('removes a board the client switched off', async () => {
    await renderRoute('/staff/compete', 'staff', {
      prepare: async ({ handle, keys }) => {
        const priya = actorFor('client', keys);
        const s = await handle.store.leaderboards.settings(priya);
        await handle.store.leaderboards.saveSettings(priya, {
          ...s,
          boards: { ...s.boards, correctQuestions: { enabled: false, staffScopes: ['site'] } },
        });
      },
    });
    await screen.findByRole('region', { name: 'Standing boards' });
    expect(screen.queryByRole('region', { name: BOARD })).toBeNull();
    expect(screen.getByRole('region', { name: 'Most modules completed' })).toBeTruthy();
  });

  it('drops Hannah-visible rows and count by one when Jade hides from leaderboards, and never names her', async () => {
    const base = await renderRoute('/staff/compete', 'staff', { actor: hannah });
    const baseBoard = await screen.findByRole('region', { name: BOARD });
    const m = /of (\d+)/.exec(baseBoard.textContent);
    expect(m).not.toBeNull();
    const n = Number(m![1]);
    expect(baseBoard.textContent).toContain('Jade');
    base.unmount();
    cleanup();
    await renderRoute('/staff/compete', 'staff', {
      actor: hannah,
      prepare: async ({ handle, keys }) => {
        await handle.store.me.updatePrefs(actorFor('staff', keys), { hideFromLeaderboards: true });
      },
    });
    const board = await screen.findByRole('region', { name: BOARD });
    await waitFor(() => {
      expect(board.textContent).toContain(`of ${n - 1}`);
    });
    expect(board.textContent).not.toContain('Jade');
    await userEvent.click(await screen.findByRole('button', { name: 'Details: Mastery Month' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mastery Month' });
    expect(dialog.textContent).not.toContain('Jade');
  });

  it('lets a hidden person still see their own private position but no own row', async () => {
    await renderRoute('/staff/compete', 'staff', {
      prepare: async ({ handle, keys }) => {
        await handle.store.me.updatePrefs(actorFor('staff', keys), { hideFromLeaderboards: true });
      },
    });
    const board = await screen.findByRole('region', { name: BOARD });
    expect(board.textContent).toMatch(/of \d+/);
    expect(board.querySelector('[aria-current="true"]')).toBeNull();
  });

  it('shows the Battle Room button disabled with the later-build note', async () => {
    await renderRoute('/staff/compete', 'staff');
    const btn = await screen.findByRole('button', { name: /Battle Room/ });
    expect(btn).toHaveProperty('disabled', true);
    expect(screen.getByText('Arrives in a later build')).toBeTruthy();
  });
});
