// M2 chunk 15 (F-3, F-1): S2 Home full order.
// Contract on /staff, in document order (each a region named by its h2 unless noted):
//   ring ("to do" text), "Next up", "Weekly goal", "Coming up", "Competitions" (banners), "Latest badge", link "My notes".
//   - Weekly goal: element role img named "<done> of <goal> done this week", or "Goal met this week" when met.
//   - Competitions: one item (data-testid="competition-banner") per live competition showing its name and a button
//     "Dismiss <name>". Dismissal lasts for the session only (in memory), so a fresh render shows the banner again.
//   - Latest badge: the most recently earned badge name (language file badge.items.*.name).
//   - My notes: a link whose href ends /staff/notes.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { actorFor, renderRoute } from '../../test/harness';
import { completeAllLessons, finishViaStore } from '../../test/quizHelpers';

afterEach(cleanup);

const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('S2 section order', () => {
  it('shows ring, Next up, Weekly goal, Coming up, Competitions, Latest badge and My notes in that order', async () => {
    await renderRoute('/staff', 'staff');
    const ring = await screen.findByText('1 to do');
    const next = await screen.findByRole('region', { name: 'Next up' });
    const goal = await screen.findByRole('region', { name: 'Weekly goal' });
    const coming = await screen.findByRole('region', { name: 'Coming up' });
    const comps = await screen.findByRole('region', { name: 'Competitions' });
    const badge = await screen.findByRole('region', { name: 'Latest badge' });
    const notes = screen.getByRole('link', { name: 'My notes' });
    const seq = [ring, next, goal, coming, comps, badge, notes];
    for (let i = 0; i < seq.length - 1; i++) expect(before(seq[i]!, seq[i + 1]!)).toBe(true);
    expect(notes.getAttribute('href')).toMatch(/\/staff\/notes$/);
  });

  it('keeps due training above the competition banners', async () => {
    await renderRoute('/staff', 'staff');
    const next = await screen.findByRole('region', { name: 'Next up' });
    const comps = await screen.findByRole('region', { name: 'Competitions' });
    expect(before(next, comps)).toBe(true);
  });
});

describe('S2 weekly goal', () => {
  it('shows progress as "0 of 1 done this week" when no lesson was done this week', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle }) => {
        // Move any seeded lesson completions out of the current London week so the goal is unmet.
        const d = (await handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
        const recent = d.learningEvents!.filter(
          (e) => e['type'] === 'lessonCompleted' && String(e['at']) >= '2026-10-18T23:00:00.000Z',
        );
        await handle.admin.bulkPut(
          'learningEvents',
          recent.map((e) => ({ ...e, at: '2026-10-10T09:00:00.000Z' })),
        );
      },
    });
    const region = await screen.findByRole('region', { name: 'Weekly goal' });
    expect(within(region).getByRole('img', { name: '0 of 1 done this week' })).toBeTruthy();
  });

  it('shows "Goal met this week" once a lesson is completed this week', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle, keys }) => {
        await completeAllLessons(handle, actorFor('staff', keys));
      },
    });
    const region = await screen.findByRole('region', { name: 'Weekly goal' });
    await waitFor(() => {
      expect(within(region).getByRole('img', { name: 'Goal met this week' })).toBeTruthy();
    });
  });
});

describe('S2 competition banners', () => {
  it('shows a banner for the live Staff bake-off and dismisses it for the session only', async () => {
    const user = userEvent.setup();
    await renderRoute('/staff', 'staff');
    const region = await screen.findByRole('region', { name: 'Competitions' });
    const banners = await within(region).findAllByTestId('competition-banner');
    expect(banners.some((b) => b.textContent.includes('Staff bake-off'))).toBe(true);
    await user.click(within(region).getByRole('button', { name: 'Dismiss Staff bake-off' }));
    expect(within(region).queryByText('Staff bake-off')).toBeNull();
    cleanup();
    await renderRoute('/staff', 'staff');
    const again = await screen.findByRole('region', { name: 'Competitions' });
    expect(await within(again).findByText('Staff bake-off')).toBeTruthy();
  });

  it('does not show a banner for a competition that has not started', async () => {
    await renderRoute('/staff', 'staff');
    const region = await screen.findByRole('region', { name: 'Competitions' });
    await within(region).findAllByTestId('competition-banner');
    expect(within(region).queryByText('Closed-Book Challenge')).toBeNull();
  });
});

describe('S2 latest badge', () => {
  it('names the badge earned most recently', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle, keys }) => {
        const actor = actorFor('staff', keys);
        await completeAllLessons(handle, actor);
        await finishViaStore(handle, actor, 0);
      },
    });
    const region = await screen.findByRole('region', { name: 'Latest badge' });
    await waitFor(() => {
      expect(region.textContent).toMatch(/Safeguarding ready|Mastery/);
    });
  });
});
