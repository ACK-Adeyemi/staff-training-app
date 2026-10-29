// M4 chunk 14c (U layer): P16 "Data requests" at /provider/data-requests (BP-12, brief 26.4). Written before the
// implementation (component `DataRequests` in ./DataRequests.tsx).
//
// UI CONTRACT
//   Data: store.dataRequests.list (dataRequests.manage; each row has dueInDays), create, complete({ evidence }),
//   reject({ notes }). Whole page needs holdsAnywhere(perms, 'dataRequests.manage') (never role names).
//   The page re-renders after a change. Time comes from the injected clock.
//   Proposed language keys (en-GB):
//     provider.dataRequests.heading "Data requests"   .noAccess "You do not have access to data requests."
//     .note (data-testid="dr-note"): one sentence, the client is the controller and the provider helps
//     .kind.{access,correction,erasure,other} "Access" "Correction" "Erasure" "Other"
//     .status.{open,done,rejected} "Open" "Done" "Rejected"
//     .received "Received {date}"   .due "Due {date}"
//     .dueIn "Due in {count} days" (singular "Due in 1 day", "Due today")   .overdue "Overdue by {count} days"
//     .dueSoon "Due soon" (badge: open and due within 7 days, including overdue)
//     .new "Log request"  .newKind "Kind"  .newRequester "Requester"  .newClient "Client (optional)"  .newNotes "Notes"
//     .submit "Log request"  .requesterError "Enter who made the request."
//     .done "Mark done"  .evidence "Evidence of completion"  .evidenceError "Enter the evidence."
//     .reject "Reject"  .reason "Reason"  .reasonError "Enter a reason."  .confirm "Save"
//   P16 /provider/data-requests:
//     - h1 "Data requests"; data-testid="dr-note" (non-empty sentence).
//     - data-testid="dr-row" per list() row, data-request-id. Row text: kind label, requester, client display name when
//       clientId is set, "Received <date>", "Due <date>", status word, due wording (open rows only), notes, and for
//       done rows the evidence; for rejected rows the reason.
//     - Open rows only: button "Mark done" reveals textbox "Evidence of completion" and a button "Save" that is
//       disabled until text is entered; button "Reject" reveals textbox "Reason" and a "Save" disabled until entered.
//     - Form (region "Log request"): combobox "Kind" (Access/Correction/Erasure/Other), textbox "Requester", combobox
//       "Client (optional)" (options by display name), textbox "Notes", button "Log request". Blank requester: an
//       alert/text "Enter who made the request." and nothing is added.
//     - Without dataRequests.manage: only "You do not have access to data requests."
//   Not tested: the link to the client's exports (no client exports route exists yet).
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataRequest } from '@sta/domain';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });

const openP16 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/data-requests', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Data requests' });
  return view;
};
const rows = () => screen.getAllByTestId('dr-row');
const rowWith = (text: string) => rows().find((r) => r.textContent?.includes(text))!;
const stored = async (view: Awaited<ReturnType<typeof openP16>>) =>
  (await view.handle.admin.dumpAll())['dataRequests'] as DataRequest[];
const OPEN_REQUESTER = 'A former member of staff';
const DONE_REQUESTER = 'A parent who contacted the provider';

describe('P16 Data requests', () => {
  it('lists both seeded requests with kind, requester, client, dates, status words and due wording', async () => {
    const view = await openP16();
    expect(rows()).toHaveLength(2);
    const all = await stored(view);
    const open = all.find((r) => r.status === 'open')!;
    const done = all.find((r) => r.status === 'done')!;
    const clients = (await view.handle.admin.dumpAll())['clients'] as { id: string; displayName: string }[];
    const clientName = clients.find((c) => c.id === open.clientId)!.displayName;

    const openRow = rowWith(OPEN_REQUESTER);
    expect(openRow.getAttribute('data-request-id')).toBe(open.id);
    expect(openRow.textContent).toContain('Access');
    expect(openRow.textContent).toContain(clientName);
    expect(openRow.textContent).toContain('Received');
    expect(openRow.textContent).toContain('Due');
    expect(openRow.textContent).toContain('Open');
    expect(openRow.textContent).toContain('Due in 6 days');
    expect(openRow.textContent).not.toContain('Overdue');

    const doneRow = rowWith(DONE_REQUESTER);
    expect(doneRow.getAttribute('data-request-id')).toBe(done.id);
    expect(doneRow.textContent).toContain('Correction');
    expect(doneRow.textContent).toContain('Done');
    expect(doneRow.textContent).not.toContain('Overdue');
    expect(doneRow.textContent).not.toContain('Due in');
  });

  it('says Overdue by N days, in words, for an open request past its due date', async () => {
    await openP16({
      prepare: async ({ handle }) => {
        const dump = await handle.admin.dumpAll();
        const open = (dump['dataRequests'] as DataRequest[]).find((r) => r.status === 'open')!;
        const due = new Date(new Date(open.dueAt).getTime() - 9 * 86_400_000).toISOString();
        await handle.admin.bulkPut('dataRequests', [{ ...open, dueAt: due }]);
      },
    });
    expect(rowWith(OPEN_REQUESTER).textContent).toContain('Overdue by 3 days');
  });

  it('shows a Due soon badge on an open request due within 7 days, and not on the done one', async () => {
    await openP16();
    expect(within(rowWith(OPEN_REQUESTER)).getByText('Due soon')).toBeTruthy();
    expect(within(rowWith(DONE_REQUESTER)).queryAllByText('Due soon')).toHaveLength(0);
  });

  it('shows no Due soon badge when the open request is due in more than 7 days', async () => {
    await openP16({
      prepare: async ({ handle }) => {
        const dump = await handle.admin.dumpAll();
        const open = (dump['dataRequests'] as DataRequest[]).find((r) => r.status === 'open')!;
        const due = new Date(new Date(open.dueAt).getTime() + 10 * 86_400_000).toISOString();
        await handle.admin.bulkPut('dataRequests', [{ ...open, dueAt: due }]);
      },
    });
    expect(within(rowWith(OPEN_REQUESTER)).queryAllByText('Due soon')).toHaveLength(0);
  });

  it('explains that the client is the controller and the provider helps', async () => {
    await openP16();
    const note = screen.getByTestId('dr-note');
    expect((note.textContent ?? '').trim().length).toBeGreaterThan(20);
  });

  it('logs a request from the form with a due date one month after it was received', async () => {
    const view = await openP16();
    const clients = (await view.handle.admin.dumpAll())['clients'] as { id: string; displayName: string }[];
    const clientName = clients.find((c) => c.id === view.keys.clients['littleAcorns'])!.displayName;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'Erasure');
    await userEvent.type(screen.getByRole('textbox', { name: 'Requester' }), 'A nursery cook');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Client (optional)' }), clientName);
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Asked by email');
    await userEvent.click(screen.getByRole('button', { name: 'Log request' }));
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    const created = (await stored(view)).find((r) => r.requester === 'A nursery cook')!;
    expect(created.kind).toBe('erasure');
    expect(created.status).toBe('open');
    expect(created.clientId).toBe(view.keys.clients['littleAcorns']);
    expect(created.notes).toBe('Asked by email');
    const received = new Date(created.receivedAt);
    const expectedDue = new Date(received);
    expectedDue.setUTCMonth(expectedDue.getUTCMonth() + 1);
    expect(new Date(created.dueAt).toISOString().slice(0, 10)).toBe(expectedDue.toISOString().slice(0, 10));
    expect(rowWith('A nursery cook').textContent).toContain('Erasure');
  });

  it('logs a request without a client', async () => {
    const view = await openP16();
    await userEvent.type(screen.getByRole('textbox', { name: 'Requester' }), 'A visitor');
    await userEvent.click(screen.getByRole('button', { name: 'Log request' }));
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    const created = (await stored(view)).find((r) => r.requester === 'A visitor')!;
    expect(created.clientId).toBeUndefined();
  });

  it('shows an error and adds nothing when the requester is blank', async () => {
    const view = await openP16();
    await userEvent.click(screen.getByRole('button', { name: 'Log request' }));
    expect(await screen.findByText('Enter who made the request.')).toBeTruthy();
    expect(rows()).toHaveLength(2);
    expect(await stored(view)).toHaveLength(2);
  });

  it('keeps Mark done unavailable until evidence is entered, then shows Done and the evidence', async () => {
    const view = await openP16();
    const row = rowWith(OPEN_REQUESTER);
    await userEvent.click(within(row).getByRole('button', { name: 'Mark done' }));
    const save = within(row).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(within(row).getByRole('textbox', { name: 'Evidence of completion' }), 'Export sent on 20 Oct');
    expect(save.disabled).toBe(false);
    await userEvent.click(save);
    await waitFor(() => {
      expect(rowWith(OPEN_REQUESTER).textContent).toContain('Done');
    });
    expect(rowWith(OPEN_REQUESTER).textContent).toContain('Export sent on 20 Oct');
    const s = (await stored(view)).find((r) => r.requester === OPEN_REQUESTER)!;
    expect(s.status).toBe('done');
    expect(s.evidence).toBe('Export sent on 20 Oct');
    expect(within(rowWith(OPEN_REQUESTER)).queryAllByRole('button', { name: 'Mark done' })).toHaveLength(0);
  });

  it('requires a reason to reject, then shows Rejected and the reason', async () => {
    const view = await openP16();
    const row = rowWith(OPEN_REQUESTER);
    await userEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    const save = within(row).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(within(row).getByRole('textbox', { name: 'Reason' }), 'Could not verify identity');
    expect(save.disabled).toBe(false);
    await userEvent.click(save);
    await waitFor(() => {
      expect(rowWith(OPEN_REQUESTER).textContent).toContain('Rejected');
    });
    expect(rowWith(OPEN_REQUESTER).textContent).toContain('Could not verify identity');
    const s = (await stored(view)).find((r) => r.requester === OPEN_REQUESTER)!;
    expect(s.status).toBe('rejected');
  });

  it('offers Mark done and Reject only on open rows', async () => {
    await openP16();
    const doneRow = rowWith(DONE_REQUESTER);
    expect(within(doneRow).queryAllByRole('button', { name: 'Mark done' })).toHaveLength(0);
    expect(within(doneRow).queryAllByRole('button', { name: 'Reject' })).toHaveLength(0);
    const openRow = rowWith(OPEN_REQUESTER);
    expect(within(openRow).getByRole('button', { name: 'Mark done' })).toBeTruthy();
    expect(within(openRow).getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('shows only a no-access message to a user without dataRequests.manage', async () => {
    await renderRoute('/provider/data-requests', 'provider', as('raj'));
    expect(await screen.findByText('You do not have access to data requests.')).toBeTruthy();
    expect(screen.queryAllByTestId('dr-row')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Log request' })).toHaveLength(0);
  });
});
