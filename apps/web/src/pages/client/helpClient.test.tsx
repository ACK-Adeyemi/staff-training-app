// M3 chunk 20a (BP-16, F-3, F-5): C23 Help for client admins, at #/client/help. Written before the implementation.
// The components are the ones S14 to S16 use (contract: apps/web/src/pages/staff/helpStaff.test.tsx); this file checks
// what differs for admins. Priya (Account Owner) holds support.raise and support.viewOrgTickets; Daniel raised T-1003.
//
// UI CONTRACT:
//   C23 /client/help, h1 "Help" (inside the client shell, linked from More). Lists the CLIENT FAQs only, the same
//     search, categories and Was this helpful? vote (faqs.vote), the same What's new and Send feedback sheet (side
//     'client'), link "Raise a ticket" to #/client/help/ticket/new, and h2 "My tickets" (own tickets, filters Open /
//     Resolved / All, default Open; links go to #/client/help/ticket/<id>).
//     h2 "Organisation tickets" is shown only when can('support.viewOrgTickets'): it lists admin tickets of the client
//     and staff tickets shared with the manager, with the same filters, each link naming the ticket number, title and
//     who raised it (the person's display name). Private staff tickets never appear.
//   /client/help/ticket/new: same steps as S15, with no "Share with my manager" checkbox. Send ticket stores a ticket
//     with raiserSide 'client'. Admins can always raise tickets (not affected by allowStaffTickets).
//   /client/help/ticket/:id: same as S16. On a ticket Priya can read but did not raise (T-1003) the page shows the
//     messages and timeline but no "Reply" box and no Mark as resolved / Reopen / rating buttons.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { AppFeedback, FaqVote, Ticket } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, TODAY } from '../../test/harness';
import { addScreenshot, answerUpToReview } from '../../test/ticketWizard';

vi.mock('../../app/images', () => ({
  prepareImage: () =>
    Promise.resolve({
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0xff, 0xd9]),
      mime: 'image/jpeg',
    }),
}));
beforeAll(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined }));
});
afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const as =
  (key: string, side: 'staff' | 'client') =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[key]),
    side,
    clientId: need(keys.clients['littleAcorns']),
    now: TODAY,
  });
const priya = as('priya', 'client');
const jade = as('jade', 'staff');
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const ticketNumbered = async (handle: StoreHandle, number: string): Promise<Ticket> =>
  need((await dump<Ticket>(handle, 'tickets')).find((t) => t.number === number));
const baseTicket = {
  title: 'Quiz will not start',
  description: 'I press Start and nothing happens.',
  impact: 'question' as const,
  context: { screen: 'S1' },
};

describe('C23 Help: FAQs, What is new, feedback', () => {
  it('has one h1 and lists the client FAQs only', async () => {
    await renderRoute('/client/help', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Help');
    expect(screen.getByRole('button', { name: 'How do I add staff and invite them?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'How do I see what I must complete?' })).toBeNull();
  });

  it('searches the client FAQs and records one vote per user', async () => {
    let c!: Ctx;
    await renderRoute('/client/help', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Search help'), 'authenticator');
    expect(screen.queryByRole('button', { name: 'How do I add staff and invite them?' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'What is two-step sign-in?' }));
    const vote = within(screen.getByRole('group', { name: 'Was this helpful?' }));
    await user.click(vote.getByRole('button', { name: 'Yes' }));
    await user.click(vote.getByRole('button', { name: 'No' }));
    await waitFor(async () => {
      const votes = (await dump<FaqVote>(c.handle, 'faqVotes')).filter((v) => v.faqId === 'client-twoStep');
      expect(votes).toHaveLength(1);
      expect(votes[0]).toMatchObject({ userId: c.keys.users['priya'], helpful: false });
    });
  });

  it("shows What's new and sends app feedback as a client admin", async () => {
    let c!: Ctx;
    await renderRoute('/client/help', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 2, name: "What's new" })).toBeTruthy();
    expect(screen.getByText('Calendar and reminders')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Send feedback about the app' }));
    expect(dialog.getByText('This goes to the product team, not to your manager.')).toBeTruthy();
    expect(dialog.getByRole('link', { name: 'Need a reply? Raise a ticket instead.' }).getAttribute('href')).toBe(
      '#/client/help/ticket/new',
    );
    await user.click(dialog.getByRole('radio', { name: 'Problem' }));
    await user.type(dialog.getByRole('textbox', { name: 'Tell us more' }), 'The matrix is slow to open.');
    await user.click(dialog.getByRole('button', { name: 'Send feedback' }));
    expect((await screen.findByRole('status')).textContent).toContain('Thank you. The product team will read this.');
    const rows = (await dump<AppFeedback>(c.handle, 'appFeedback')).filter(
      (r) => r.userId === c.keys.users['priya'] && r.text === 'The matrix is slow to open.',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ side: 'client', kind: 'problem', text: 'The matrix is slow to open.' });
  });
});

describe('C23 Help: My tickets and Organisation tickets', () => {
  it('lists Priya own open ticket under My tickets and not the others', async () => {
    let c!: Ctx;
    await renderRoute('/client/help', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    const mine = (await screen.findByRole('heading', { level: 2, name: 'My tickets' })).closest('section');
    const link = await within(need(mine)).findByRole('link', {
      name: /T-1001.*Training matrix export opens in one column/,
    });
    expect(link.textContent).toContain('In progress');
    expect(link.getAttribute('href')).toBe(`#/client/help/ticket/${(await ticketNumbered(c.handle, 'T-1001')).id}`);
    expect(within(need(mine)).queryByRole('link', { name: /T-1003/ })).toBeNull();
  });

  it("lists admin tickets under Organisation tickets with the raiser's name, and no private staff ticket", async () => {
    await renderRoute('/client/help', 'client');
    const org = (await screen.findByRole('heading', { level: 2, name: 'Organisation tickets' })).closest('section');
    const scope = within(need(org));
    expect((await scope.findByRole('link', { name: /T-1003.*How do I add a Site Manager\?/ })).textContent).toContain(
      'Daniel',
    );
    expect(scope.getByRole('link', { name: /T-1001/ }).textContent).toContain('Priya');
    expect(scope.queryByRole('link', { name: /T-1002/ })).toBeNull();
    const user = userEvent.setup();
    await user.click(scope.getByRole('button', { name: 'All' }));
    expect(scope.queryByRole('link', { name: /T-1002/ })).toBeNull();
  });

  it('adds a staff ticket to Organisation tickets once the staff member shares it with the manager', async () => {
    await renderRoute('/client/help', 'client', {
      prepare: async ({ handle, keys }) => {
        await handle.store.tickets.raise(jade(keys), { ...baseTicket, sharedWithManager: true });
      },
    });
    const org = (await screen.findByRole('heading', { level: 2, name: 'Organisation tickets' })).closest('section');
    expect((await within(need(org)).findByRole('link', { name: /T-1015.*Quiz will not start/ })).textContent).toContain(
      'Jade',
    );
  });

  it('shows a ticket Priya raised herself only under My tickets filters, and the empty text when none match', async () => {
    await renderRoute('/client/help', 'client');
    const user = userEvent.setup();
    const mine = within(
      need((await screen.findByRole('heading', { level: 2, name: 'My tickets' })).closest('section')),
    );
    await user.click(mine.getByRole('button', { name: 'Resolved' }));
    expect(mine.getByText('You have no tickets.')).toBeTruthy();
  });
});

describe('C23 Raise a ticket and thread', () => {
  it('raises an admin ticket without a Share with my manager box, even when staff tickets are off', async () => {
    let c!: Ctx;
    await renderRoute('/client/help/ticket/new', 'client', {
      prepare: async (x) => {
        c = x;
        await x.handle.store.organisation.updateSettings(priya(x.keys), { allowStaffTickets: false });
      },
    });
    const user = userEvent.setup();
    await answerUpToReview(
      user,
      { title: 'Export is slow', description: 'The matrix takes a minute to open.', feature: 'Reports' },
      async () => {
        addScreenshot('one.png');
        await screen.findByRole('group', { name: 'Screenshot 1' });
      },
    );
    expect(screen.queryByRole('checkbox', { name: 'Share with my manager' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    expect((await screen.findByRole('status')).textContent).toContain('Your ticket T-1015 has been sent.');
    expect(screen.getByRole('link', { name: 'See my tickets' }).getAttribute('href')).toBe('#/client/help');
    const t = await ticketNumbered(c.handle, 'T-1015');
    expect(t).toMatchObject({ raiserSide: 'client', featureId: 'reports', sharedWithManager: false });
  });

  it('shows the thread with the support reply and lets Priya reply and resolve her own ticket', async () => {
    let c!: Ctx;
    const r = await renderRoute('/client', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    const t = await ticketNumbered(c.handle, 'T-1001');
    await r.router.navigate(`/client/help/ticket/${t.id}`);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Ticket T-1001');
    const msgs = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
    expect(msgs[1]?.textContent).toContain('Choose "comma separated" when your spreadsheet asks');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'That worked, thank you.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => {
      expect(within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem')).toHaveLength(3);
    });
    await user.click(screen.getByRole('button', { name: 'Mark as resolved' }));
    await waitFor(async () => {
      expect((await ticketNumbered(c.handle, 'T-1001')).status).toBe('resolved');
    });
    const rate = within(await screen.findByRole('group', { name: 'Was this helpful?' }));
    await user.click(rate.getByRole('button', { name: 'Yes' }));
    await waitFor(async () => {
      expect((await ticketNumbered(c.handle, 'T-1001')).satisfaction).toBe('up');
    });
  });

  it("reads Daniel's ticket from Organisation tickets but cannot reply, resolve or rate it", async () => {
    let c!: Ctx;
    const r = await renderRoute('/client', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    await r.router.navigate(`/client/help/ticket/${(await ticketNumbered(c.handle, 'T-1003')).id}`);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Ticket T-1003');
    expect(screen.getByText('I want to give a new manager access to only their own site.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as resolved' })).toBeNull();
  });

  it("gives a plain not-found message for a staff member's private ticket", async () => {
    let c!: Ctx;
    const r = await renderRoute('/client', 'client', { prepare: (x) => ((c = x), Promise.resolve()) });
    await r.router.navigate(`/client/help/ticket/${(await ticketNumbered(c.handle, 'T-1002')).id}`);
    expect((await screen.findByRole('alert')).textContent).toContain('We could not find that.');
    expect(screen.queryByText(/My notes did not show/)).toBeNull();
  });
});
