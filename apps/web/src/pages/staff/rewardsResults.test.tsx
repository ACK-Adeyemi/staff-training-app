// M2 chunk 15 (F-1, F-3, BP-4): S7 results rewards.
// Contract the implementer must provide on /staff/module/:id/done after a passed attempt (English strings are the contract):
//   - region "XP earned" (h2) with a list of rows data-testid="xp-row" (data-kind = XpKind, data-amount = number) and a
//     total data-testid="xp-total" reading "+<n> XP". The total equals the sum of the rows, and rows come from xpForAttempt.
//   - element data-testid="celebration" (wraps the Celebration component) containing the message "Well done". With the
//     reduceMotion pref on it has no [data-confetti] children; otherwise it has some.
//   - when the pass turned the compliance ring green, the celebration message is "You're compliant".
//   - region "New badge" listing badges earned since the attempt started, including "Safeguarding ready".
//   - data-testid="position-line" reading "You're <ordinal> of <of> for questions answered correctly", using
//     leaderboards.standing('correctQuestions','allTime'); for a hidden person it adds "Only you can see this".
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
afterEach(cleanup);

const donePath = `/staff/module/${sgModule.id}/done`;
type Ctx = Parameters<NonNullable<Parameters<typeof renderRoute>[2]>['prepare'] & object>[0];
const passAll = async ({ handle, keys }: Ctx) => {
  const actor = actorFor('staff', keys);
  await completeAllLessons(handle, actor);
  await finishViaStore(handle, actor, 0);
};
const ordinal = (n: number) => {
  const r = new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(n);
  return `${n}${{ one: 'st', two: 'nd', few: 'rd', other: 'th' }[r as 'one' | 'two' | 'few' | 'other']}`;
};

describe('S7 XP earned and why', () => {
  it('lists XP rows by kind whose sum is the total, and includes the pass', async () => {
    await renderRoute(donePath, 'staff', { prepare: passAll });
    const region = await screen.findByRole('region', { name: 'XP earned' });
    const rows = await within(region).findAllByTestId('xp-row');
    expect(rows.length).toBeGreaterThan(0);
    const sum = rows.reduce((n, r) => n + Number(r.getAttribute('data-amount')), 0);
    expect(sum).toBeGreaterThan(0);
    expect(within(region).getByTestId('xp-total').textContent).toBe(`+${sum} XP`);
    for (const r of rows) {
      expect(r.getAttribute('data-kind')).toMatch(
        /^(lesson|correct|closedBookBonus|passed|mastery|earlyRefresher|weeklyGoal)$/,
      );
      expect(r.textContent).toMatch(/\d+ XP/);
    }
  });

  it('gives the closed-book bonus row for answers given with notes hidden', async () => {
    await renderRoute(donePath, 'staff', { prepare: passAll });
    const region = await screen.findByRole('region', { name: 'XP earned' });
    const kinds = (await within(region).findAllByTestId('xp-row')).map((r) => r.getAttribute('data-kind'));
    expect(kinds).toContain('closedBookBonus');
  });
});

describe('S7 celebration', () => {
  it('shows the celebration with confetti by default', async () => {
    await renderRoute(donePath, 'staff', { prepare: passAll });
    const c = await screen.findByTestId('celebration');
    expect(c.querySelectorAll('[data-confetti]').length).toBeGreaterThan(0);
  });

  it('is static (no confetti) when reduce motion is on', async () => {
    await renderRoute(donePath, 'staff', {
      prepare: async (ctx) => {
        await ctx.handle.store.me.updatePrefs(actorFor('staff', ctx.keys), { reduceMotion: true });
        await passAll(ctx);
      },
    });
    const c = await screen.findByTestId('celebration');
    expect(c.querySelectorAll('[data-confetti]')).toHaveLength(0);
    expect(c.textContent).toContain('Well done');
  });

  it('says "You\'re compliant" when the pass turned the ring green', async () => {
    await renderRoute(donePath, 'staff', { prepare: passAll });
    const c = await screen.findByTestId('celebration');
    await waitFor(() => {
      expect(c.textContent).toContain("You're compliant");
    });
  });

  it('is not shown for a failed attempt', async () => {
    await renderRoute(donePath, 'staff', {
      prepare: async ({ handle, keys }) => {
        const actor = actorFor('staff', keys);
        await completeAllLessons(handle, actor);
        await finishViaStore(handle, actor, 'all');
      },
    });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('celebration')).toBeNull();
  });
});

describe('S7 new badge and position', () => {
  it('shows the Safeguarding ready badge earned by this pass', async () => {
    await renderRoute(donePath, 'staff', { prepare: passAll });
    const region = await screen.findByRole('region', { name: 'New badge' });
    expect(within(region).getByText('Safeguarding ready')).toBeTruthy();
  });

  it('shows the private position from the Most questions answered correctly board', async () => {
    const { handle, keys } = await renderRoute(donePath, 'staff', { prepare: passAll });
    const line = await screen.findByTestId('position-line');
    const view = await handle.store.leaderboards.standing(actorFor('staff', keys), {
      board: 'correctQuestions',
      period: 'allTime',
    });
    const v = view.viewer!;
    expect(line.textContent).toContain(
      `You're ${ordinal(v.rank as number)} of ${v.of} for questions answered correctly`,
    );
  });

  it('tells a person who hides from leaderboards that only they can see their position', async () => {
    await renderRoute(donePath, 'staff', {
      prepare: async (ctx) => {
        await ctx.handle.store.me.updateProfile(actorFor('staff', ctx.keys), { hideFromLeaderboards: true });
        await passAll(ctx);
      },
    });
    const line = await screen.findByTestId('position-line');
    expect(line.textContent).toContain('Only you can see this');
  });
});
