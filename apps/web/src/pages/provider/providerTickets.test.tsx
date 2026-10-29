// M4 chunk 13a (U layer): P11 "Ticket inbox" at /provider/tickets (BP-10, brief 25.6). Written before the implementation.
//
// UI CONTRACT
//   Data: store.providerTickets.list(actor, filter?) (needs tickets.read) and store.providerTickets.assign(actor, id,
//   assigneeId) (needs tickets.write). The assign controls are shown only when holdsAnywhere(perms, 'tickets.write')
//   (never role names). Tom (read-only provider user) sees rows but no assign controls. Assignee names and options come
//   from store.providerTeam.list(actor) (ProviderTeamMember { userId, name }). Client names come from the clients.
//   The page re-renders after an assignment (the store notifies subscribers).
//   ROUTING NOTE: the nav item "Support" currently routes /provider/tickets to a Placeholder in src/app/routes.tsx. The
//   implementer replaces it. The page h1 is "Ticket inbox", which differs from the nav label "Support", so
//   src/app/routes.test.tsx and e2e/navigation.spec.ts (which compare the h1 with the nav label) must be updated with a
//   heading override, exactly as was done for P7 ("Packages and entitlements").
//   Proposed language keys (en-GB):
//     provider.tickets.heading "Ticket inbox"
//     provider.tickets.filters.status "Status"   .client "Client"   .assignee "Assignee"   .impact "Impact"
//     provider.tickets.filters.all "All"                 (first option in every select, value "")
//     provider.tickets.unassigned "Unassigned"
//     provider.tickets.assignToMe "Assign to me"
//     provider.tickets.dueIn "Response due in {count} hours"      (singular: "in 1 hour")
//     provider.tickets.overdueBy "Response overdue by {count} hours" (singular: "by 1 hour")
//     provider.tickets.responded "Resolved"   shown instead of a countdown when the ticket has firstResponseAt
//       (or has no responseDueAt, for example resolved or closed tickets)
//     provider.tickets.status.received "Received"  .inProgress "In progress"  .waitingForCustomer "Waiting for customer"
//       .resolved "Resolved"  .closed "Closed"
//     provider.tickets.impact.blocked "Blocked"  .workaround "Workaround available"  .question "Question"
//     provider.tickets.savedViews "Saved views"   provider.tickets.views.needsReply "Needs reply"
//     provider.tickets.views.breached "Breached"
//     provider.tickets.empty "No tickets match these filters"
//   P11 /provider/tickets:
//     - h1 "Ticket inbox".
//     - data-testid="ticket-row" per ticket from list() with the active filters, data-ticket-id = ticket id, same order as
//       list(). Text contains: ticket.title, the client's display name, the status label, the impact label, the assignee's
//       name or "Unassigned", and the countdown.
//     - Countdown: "Response due in N hours" when responseDueAt is set and not breached, "Response overdue by N hours"
//       with data-breached="true" on the row when breached (N = whole hours, rounded, minimum 1). Rows that are not
//       breached do not have data-breached="true". Tickets with no responseDueAt show neither text.
//     - Filters are <select>s labelled "Status", "Client", "Assignee", "Impact". Option values are the raw ids
//       (ticket status, clientId, userId, impact); the first option has value "" (All). Changing one re-queries/filters.
//     - Button "Assign to me" inside a row (tickets.write only); clicking assigns to the acting user and the row then
//       shows their name (and no longer offers the button).
//     - Each row has an <a> whose href ends with "#/provider/tickets/<id>" (to P12).
//     - region (role=region / <section aria-label>) named "Saved views" with buttons "Needs reply" (status received or
//       inProgress and no firstResponseAt) and "Breached" (breached = true). Clicking one narrows the rows to those that
//       match; the active button has aria-pressed="true".
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Ticket } from '@sta/domain';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Row = { ticket: Ticket; responseDueAt?: string; breached: boolean };

const openP11 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/tickets', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Ticket inbox' });
  const rows = await screen.findAllByTestId('ticket-row');
  const actor = { ...(opts?.actor ? opts.actor(view.keys) : actorFor('provider', view.keys)), now: TODAY };
  const data = await view.handle.store.providerTickets.list(actor);
  return { view, rows, actor, data };
};

const rowFor = (id: string) =>
  screen.getAllByTestId('ticket-row').find((r) => r.getAttribute('data-ticket-id') === id)!;
const ids = () => screen.getAllByTestId('ticket-row').map((r) => r.getAttribute('data-ticket-id'));
const hours = (ms: number) => Math.max(1, Math.round(ms / 3_600_000));
const plural = (n: number) => `${n} hour${n === 1 ? '' : 's'}`;
const nameMap = async (
  view: Awaited<ReturnType<typeof openP11>>['view'],
  actor: Awaited<ReturnType<typeof openP11>>['actor'],
) => {
  const clients = (
    (await view.handle.admin.dumpAll()) as unknown as Record<string, { id: string; displayName: string }[]>
  )['clients']!;
  const team = await view.handle.store.providerTeam.list(actor);
  return {
    client: (id: string) => clients.find((c) => c.id === id)!.displayName,
    person: (id: string) => team.find((m) => m.userId === id)!.name,
  };
};
const statusLabel = (s: string) => t(`provider.tickets.status.${s}` as Parameters<typeof t>[0]);
const impactLabel = (s: string) => t(`provider.tickets.impact.${s}` as Parameters<typeof t>[0]);

describe('P11 Ticket inbox', () => {
  it('lists every ticket in list() order with subject, client, status, impact and assignee as text, each linking to its detail page', async () => {
    const { view, rows, actor, data } = await openP11();
    expect(data.length).toBeGreaterThan(3);
    expect(rows.map((r) => r.getAttribute('data-ticket-id'))).toEqual(data.map((r) => r.ticket.id));
    const names = await nameMap(view, actor);
    for (const { ticket } of data) {
      const row = rowFor(ticket.id);
      const text = row.textContent;
      expect(text).toContain(ticket.title);
      expect(text).toContain(names.client(ticket.clientId));
      expect(text).toContain(statusLabel(ticket.status));
      expect(text).toContain(impactLabel(ticket.impact));
      expect(text).toContain(ticket.assigneeId ? names.person(ticket.assigneeId) : 'Unassigned');
      const link = within(row)
        .getAllByRole('link')
        .find((a) => (a.getAttribute('href') ?? '').endsWith(`#/provider/tickets/${ticket.id}`));
      expect(link).toBeTruthy();
    }
  });

  it('shows "Response due in N hours" for an open ticket that is inside its target, and nothing of the sort once it has a first response', async () => {
    let fresh = '';
    const { data } = await openP11({
      prepare: async ({ handle, keys }) => {
        const priya = { ...actorFor('client', keys), now: TODAY };
        fresh = (
          await handle.store.tickets.raise(priya, {
            title: 'Cannot print the rota',
            description: 'The print button does nothing.',
            impact: 'blocked',
            context: {},
          })
        ).id;
      },
    });
    const freshRow = data.find((r) => r.ticket.id === fresh)!;
    expect(freshRow.responseDueAt).toBeDefined();
    expect(freshRow.breached).toBe(false);
    const n = hours(Date.parse(freshRow.responseDueAt!) - Date.parse(TODAY));
    const el = rowFor(fresh);
    expect(el.textContent).toContain(`Response due in ${plural(n)}`);
    expect(el.textContent).not.toContain('Response overdue');
    expect(el.getAttribute('data-breached')).not.toBe('true');

    const answered = data.find((r) => r.ticket.firstResponseAt !== undefined);
    expect(answered).toBeTruthy();
    const text = rowFor(answered!.ticket.id).textContent;
    expect(text).not.toMatch(/Response (due in|overdue by)/);
    expect(text).toContain('Resolved');
  });

  it('shows "Response overdue by N hours" with data-breached on every breached row, as text rather than colour', async () => {
    const { data } = await openP11();
    const breached = data.filter((r) => r.breached);
    expect(breached.length).toBeGreaterThan(0);
    for (const r of breached) {
      const row = rowFor(r.ticket.id);
      const n = hours(Date.parse(TODAY) - Date.parse(r.responseDueAt!));
      expect(row.textContent).toContain(`Response overdue by ${plural(n)}`);
      expect(row.getAttribute('data-breached')).toBe('true');
    }
    for (const r of data.filter((x) => !x.breached)) {
      expect(rowFor(r.ticket.id).getAttribute('data-breached')).not.toBe('true');
    }
  });

  it('filters by status, client, assignee and impact with labelled selects', async () => {
    let sophieId = '';
    let target = '';
    const { data } = await openP11({
      prepare: async ({ handle, keys }) => {
        sophieId = keys.users['sophie']!;
        const all = await handle.store.providerTickets.list({ ...actorFor('provider', keys), now: TODAY });
        target = all.find((r) => r.ticket.status === 'received')!.ticket.id;
        await handle.store.providerTickets.assign({ ...actorFor('provider', keys), now: TODAY }, target, sophieId);
      },
    });
    const wantIds = (f: (r: Row) => boolean) => data.filter(f).map((r) => r.ticket.id);

    const status = data.find((r) => r.ticket.status === 'resolved') ? 'resolved' : data[0]!.ticket.status;
    expect(new Set(data.map((r) => r.ticket.status)).size).toBeGreaterThan(1);
    await userEvent.selectOptions(screen.getByLabelText('Status'), status);
    await waitFor(() => {
      expect(ids()).toEqual(wantIds((r) => r.ticket.status === status));
    });
    expect(ids().length).toBeLessThan(data.length);
    await userEvent.selectOptions(screen.getByLabelText('Status'), '');
    await waitFor(() => {
      expect(ids()).toHaveLength(data.length);
    });

    const clientId = data[0]!.ticket.clientId;
    await userEvent.selectOptions(screen.getByLabelText('Client'), clientId);
    await waitFor(() => {
      expect(ids()).toEqual(wantIds((r) => r.ticket.clientId === clientId));
    });
    await userEvent.selectOptions(screen.getByLabelText('Client'), '');

    await userEvent.selectOptions(screen.getByLabelText('Assignee'), sophieId);
    await waitFor(() => {
      expect(ids()).toEqual([target]);
    });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '');

    const impact = data[0]!.ticket.impact;
    await userEvent.selectOptions(screen.getByLabelText('Impact'), impact);
    await waitFor(() => {
      expect(ids()).toEqual(wantIds((r) => r.ticket.impact === impact));
    });
  });

  it('assigns a ticket to the acting provider with "Assign to me" and then shows their name on that row', async () => {
    const { rows, view, actor, data } = await openP11();
    const names = await nameMap(view, actor);
    const open = data.find((r) => r.ticket.assigneeId === undefined)!;
    expect(open).toBeTruthy();
    const row = rowFor(open.ticket.id);
    expect(rows.length).toBeGreaterThan(0);
    await userEvent.click(within(row).getByRole('button', { name: 'Assign to me' }));
    await waitFor(() => {
      const again = rowFor(open.ticket.id);
      expect(again.textContent).toContain(names.person(actor.userId));
      expect(again.textContent).not.toContain('Unassigned');
      expect(within(again).queryAllByRole('button', { name: 'Assign to me' })).toHaveLength(0);
    });
    const stored = (await view.handle.store.providerTickets.list(actor)).find((r) => r.ticket.id === open.ticket.id)!;
    expect(stored.ticket.assigneeId).toBe(actor.userId);
  });

  it('applies the built-in Saved views: Needs reply and Breached each narrow the rows', async () => {
    const { data } = await openP11();
    const region = screen.getByRole('region', { name: 'Saved views' });

    const needs = data
      .filter((r) => (r.ticket.status === 'received' || r.ticket.status === 'inProgress') && !r.ticket.firstResponseAt)
      .map((r) => r.ticket.id);
    expect(needs.length).toBeGreaterThan(0);
    expect(needs.length).toBeLessThan(data.length);
    await userEvent.click(within(region).getByRole('button', { name: 'Needs reply' }));
    await waitFor(() => {
      expect(ids()).toEqual(needs);
    });
    expect(within(region).getByRole('button', { name: 'Needs reply' }).getAttribute('aria-pressed')).toBe('true');

    const breached = data.filter((r) => r.breached).map((r) => r.ticket.id);
    expect(breached.length).toBeLessThan(data.length);
    await userEvent.click(within(region).getByRole('button', { name: 'Breached' }));
    await waitFor(() => {
      expect(ids()).toEqual(breached);
    });
    expect(within(region).getByRole('button', { name: 'Breached' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the read-only provider user every row but no "Assign to me" buttons', async () => {
    await openP11({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }) });
    expect(screen.getAllByTestId('ticket-row').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: 'Assign to me' })).toHaveLength(0);
  });
});
