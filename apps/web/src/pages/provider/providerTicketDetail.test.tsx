// M4 chunk 13b (U layer): P12 "Ticket detail" at /provider/tickets/:id (BP-10, brief 25.6). Written before the implementation.
//
// UI CONTRACT
//   Data: store.providerTickets.list/messages/reply/addNote/setStatus/assign and store.savedReplies.list/insertText.
//   Controls are shown only when holdsAnywhere(perms, 'tickets.write') (never role names). Tom (read-only) sees the
//   thread and context but no composer, saved replies, status or assign controls. Re-tag, merge and link are not in
//   this chunk.
//   Proposed language keys (en-GB):
//     provider.ticket.conversation "Conversation"      provider.ticket.internalNote "Internal note" (badge text)
//     provider.ticket.context "Ticket details"         labels: .client "Client" .raisedBy "Raised by" .feature "Feature"
//       .issueType "Issue type" .impact "Impact" .status "Status"
//     provider.ticket.replyLabel "Reply to customer"   provider.ticket.send "Send reply"
//     provider.ticket.addNoteToggle "Add internal note"  provider.ticket.noteLabel "Internal note"  .addNote "Add note"
//     provider.ticket.savedReplies "Insert saved reply"  provider.ticket.statusLabel "Status"  .assignLabel "Assign to"
//   P12 /provider/tickets/:id:
//     - h1 = ticket title.
//     - region (role=region) named "Conversation" with one data-testid="ticket-message" per message from
//       providerTickets.messages(), in order. Internal notes have data-internal="true" and the visible text
//       "Internal note"; other messages do not have data-internal="true".
//     - region named "Ticket details" whose text has the client display name, the raiser's display name, the feature and
//       issue type labels (from @sta/content via labelKey), the impact label and the status label (provider.tickets.*).
//     - textarea labelled "Reply to customer" + button "Send reply": sends reply(), clears the box, new message appears.
//     - checkbox "Add internal note" reveals a textarea labelled "Internal note" and button "Add note" (addNote()).
//       The composer for replies and the note form are different controls: sending a reply never stores an internal
//       message and adding a note never stores a customer-visible one.
//     - select labelled "Insert saved reply": options are the saved reply titles (value = reply id) after an empty first
//       option; choosing one puts insertText() (with {{firstName}} replaced) into the "Reply to customer" textarea.
//     - select labelled "Status": values are raw statuses; choosing applies setStatus().
//     - select labelled "Assign to": values are team userIds, first option value "" (Unassigned); applies assign().
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import { fixedClock, type Ticket } from '@sta/domain';
import { issueTypes, supportFeatures } from '@sta/content';
import { AppProviders } from '../../app/providers';
import { routes } from '../../app/routes';
import { actorFor, makeDemo, renderRoute, t, TODAY } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Users = { id: string; displayName: string }[];

// renderRoute needs the final path up front, so resolve the ticket id first with a throwaway lookup of the same seed.
const openTicket = async (number: string, opts: Opts = {}) => {
  let found: Ticket | undefined;
  const probe = await renderRoute('/provider', 'provider', {
    prepare: async ({ handle, keys }) => {
      const rows = await handle.store.providerTickets.list({ ...actorFor('provider', keys), now: TODAY });
      found = rows.map((r) => r.ticket).find((x) => x.number === number);
    },
  });
  probe.unmount();
  const ticket = found!;
  const view = await renderRoute(`/provider/tickets/${ticket.id}`, 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: ticket.title });
  const actor = { ...(opts.actor ? opts.actor(view.keys) : actorFor('provider', view.keys)), now: TODAY };
  return { view, ticket, actor };
};

const messageEls = () => screen.getAllByTestId('ticket-message');

describe('P12 Ticket detail', () => {
  it('shows the ticket title as h1 and every message in order, with internal notes marked in words and by data-internal', async () => {
    let id = '';
    const { view, ticket, actor } = await openTicket('T-1001', {
      prepare: async ({ handle, keys }) => {
        const p = { ...actorFor('provider', keys), now: TODAY };
        const rows = await handle.store.providerTickets.list(p);
        id = rows.find((r) => r.ticket.number === 'T-1001')!.ticket.id;
        await handle.store.providerTickets.reply(p, id, { body: 'We are looking into the rota print problem.' });
        await handle.store.providerTickets.addNote(p, id, { body: 'Looks like the print CSS again, check with Dev.' });
      },
    });
    expect(ticket.id).toBe(id);
    const stored = await view.handle.store.providerTickets.messages(actor, ticket.id);
    expect(stored.some((m) => m.internal)).toBe(true);
    const region = screen.getByRole('region', { name: 'Conversation' });
    await waitFor(() => {
      expect(within(region).getAllByTestId('ticket-message')).toHaveLength(stored.length);
    });
    const els = within(region).getAllByTestId('ticket-message');
    stored.forEach((m, i) => {
      expect(els[i]!.textContent).toContain(m.body);
      if (m.internal) {
        expect(els[i]!.getAttribute('data-internal')).toBe('true');
        expect(els[i]!.textContent).toContain('Internal note');
      } else {
        expect(els[i]!.getAttribute('data-internal')).not.toBe('true');
        expect(els[i]!.textContent).not.toContain('Internal note');
      }
    });
  });

  it('shows the client, raiser, feature, issue type, impact and status in the context panel', async () => {
    let target = '';
    const probe = await renderRoute('/provider', 'provider', {
      prepare: async ({ handle, keys }) => {
        const rows = await handle.store.providerTickets.list({ ...actorFor('provider', keys), now: TODAY });
        target = rows.find(
          (r) =>
            supportFeatures.some((f) => f.id === r.ticket.featureId) &&
            issueTypes.some((i) => i.id === r.ticket.issueTypeId),
        )!.ticket.number;
      },
    });
    probe.unmount();
    expect(target).not.toBe('');
    const { view, ticket } = await openTicket(target);
    const dump = (await view.handle.admin.dumpAll()) as unknown as Record<string, unknown[]>;
    const client = (dump['clients'] as Users).find((c) => c.id === ticket.clientId)!;
    const raiser = (dump['users'] as Users).find((u) => u.id === ticket.raisedBy)!;
    const feature = supportFeatures.find((f) => f.id === ticket.featureId)!;
    const issue = issueTypes.find((i) => i.id === ticket.issueTypeId)!;
    const panel = screen.getByRole('region', { name: 'Ticket details' });
    const text = panel.textContent;
    expect(text).toContain(client.displayName);
    expect(text).toContain(raiser.displayName);
    expect(text).toContain(t(feature.labelKey as Parameters<typeof t>[0]));
    expect(text).toContain(t(issue.labelKey as Parameters<typeof t>[0]));
    expect(text).toContain(t(`provider.tickets.impact.${ticket.impact}` as Parameters<typeof t>[0]));
    expect(text).toContain(t(`provider.tickets.status.${ticket.status}` as Parameters<typeof t>[0]));
  });

  it('sends a reply as a customer-visible message and clears the box, and keeps internal notes in a separate form', async () => {
    const { view, ticket, actor } = await openTicket('T-1001');
    const before = (await view.handle.store.providerTickets.messages(actor, ticket.id)).length;

    await userEvent.type(screen.getByLabelText('Reply to customer'), 'Thanks, we have fixed this.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(async () => {
      expect(await view.handle.store.providerTickets.messages(actor, ticket.id)).toHaveLength(before + 1);
    });
    const afterReply = await view.handle.store.providerTickets.messages(actor, ticket.id);
    expect(afterReply.at(-1)).toMatchObject({ body: 'Thanks, we have fixed this.', internal: false, side: 'provider' });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLTextAreaElement>('Reply to customer').value).toBe('');
      expect(messageEls()).toHaveLength(before + 1);
    });

    expect(screen.queryByLabelText('Internal note')).toBeNull();
    await userEvent.click(screen.getByLabelText('Add internal note'));
    await userEvent.type(screen.getByLabelText('Internal note'), 'Customer is on a trial, be generous.');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Reply to customer').value).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(async () => {
      expect(await view.handle.store.providerTickets.messages(actor, ticket.id)).toHaveLength(before + 2);
    });
    const afterNote = await view.handle.store.providerTickets.messages(actor, ticket.id);
    expect(afterNote.at(-1)).toMatchObject({ body: 'Customer is on a trial, be generous.', internal: true });
    await waitFor(() => {
      const last = messageEls().at(-1)!;
      expect(last.getAttribute('data-internal')).toBe('true');
      expect(last.textContent).toContain('Customer is on a trial, be generous.');
    });
  });

  it('inserts a saved reply into the reply box with the raiser first name filled in', async () => {
    const { view, ticket, actor } = await openTicket('T-1001');
    const replies = await view.handle.store.savedReplies.list(actor);
    const withName = replies.find((r) => r.body.includes('{{firstName}}'))!;
    const select = screen.getByLabelText('Insert saved reply');
    for (const r of replies) expect(within(select).getByRole('option', { name: r.title })).toBeTruthy();
    await userEvent.selectOptions(select, withName.id);
    const expected = await view.handle.store.savedReplies.insertText(actor, withName.id, ticket.id);
    expect(expected).not.toContain('{{');
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLTextAreaElement>('Reply to customer').value).toBe(expected);
    });
  });

  it('changes the status and the assignee from the selects and stores both', async () => {
    const { view, ticket, actor } = await openTicket('T-1001');
    const next = ticket.status === 'waitingForCustomer' ? 'inProgress' : 'waitingForCustomer';
    await userEvent.selectOptions(screen.getByLabelText('Status'), next);
    await waitFor(async () => {
      const row = (await view.handle.store.providerTickets.list(actor)).find((r) => r.ticket.id === ticket.id)!;
      expect(row.ticket.status).toBe(next);
    });
    const sophie = view.keys.users['sophie'];
    await userEvent.selectOptions(screen.getByLabelText('Assign to'), sophie);
    await waitFor(async () => {
      const row = (await view.handle.store.providerTickets.list(actor)).find((r) => r.ticket.id === ticket.id)!;
      expect(row.ticket.assigneeId).toBe(sophie);
    });
    expect(screen.getByLabelText<HTMLSelectElement>('Assign to').value).toBe(sophie);
  });

  it('shows the read-only provider user the thread but no composer or controls', async () => {
    await openTicket('T-1001', { actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }) });
    expect(screen.getAllByTestId('ticket-message').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Reply to customer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    expect(screen.queryByLabelText('Add internal note')).toBeNull();
    expect(screen.queryByLabelText('Insert saved reply')).toBeNull();
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.queryByLabelText('Assign to')).toBeNull();
  });

  it('lets the customer see the reply and the new status on their own thread, but never the internal note', async () => {
    const { view, ticket } = await openTicket('T-1001');
    await userEvent.type(screen.getByLabelText('Reply to customer'), 'Please refresh and try again.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await userEvent.click(screen.getByLabelText('Add internal note'));
    await userEvent.type(screen.getByLabelText('Internal note'), 'SECRET staff-only remark.');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'waitingForCustomer');
    await waitFor(() => {
      expect(messageEls().at(-1)!.textContent).toContain('SECRET staff-only remark.');
    });
    await waitFor(async () => {
      const p = { ...actorFor('provider', view.keys), now: TODAY };
      const row = (await view.handle.store.providerTickets.list(p)).find((r) => r.ticket.id === ticket.id)!;
      expect(row.ticket.status).toBe('waitingForCustomer');
    });
    cleanup();

    const handle: StoreHandle = view.handle;
    const priya = { ...actorFor('client', view.keys), now: TODAY };
    const router = createMemoryRouter(routes, { initialEntries: [`/client/help/ticket/${ticket.id}`] });
    const demo = makeDemo('client', view.keys, handle);
    render(
      <AppProviders
        store={handle.store}
        clock={fixedClock(TODAY)}
        actor={priya}
        demo={demo}
        subscribe={(l) => handle.subscribe(l)}
      >
        <RouterProvider router={router} />
      </AppProviders>,
    );
    expect(await screen.findByText('Please refresh and try again.')).toBeTruthy();
    expect(screen.getAllByText(t('tickets.status.waitingForCustomer')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/SECRET staff-only remark/)).toBeNull();
    expect(document.body.textContent).not.toContain('SECRET staff-only remark');
  });
});
