// M4 chunk 14b (U layer): P15 "Account recovery" at /provider/recovery (BP-12, brief 26.3). Written before the
// implementation (component `Recovery` in ./Recovery.tsx).
//
// UI CONTRACT
//   Data: store.recovery.list (recovery.start), request (recovery.start), approve and complete (recovery.approve),
//   reject (recovery.start). Buttons show only when holdsAnywhere(perms, <permission>) (never role names).
//   The page re-renders after a change (the store notifies subscribers). Time comes from the injected clock.
//   Proposed language keys (en-GB):
//     provider.recovery.heading "Account recovery"     .noAccess "You do not have access to account recovery."
//     provider.recovery.approvals "Approved by {count} of 2"   .status.{open,approved,done,rejected}
//       "Open", "Approved", "Done", "Rejected"
//     provider.recovery.coolingOff "Cooling off ends in {hours} hours" (singular "1 hour")
//     provider.recovery.coolingOffNotSet "Cooling off starts when the request is approved" (any text, not asserted)
//     provider.recovery.completeWaiting "Complete is available when the cooling-off period has ended."
//     provider.recovery.approve "Approve"  .complete "Complete"  .reject "Reject"
//     provider.recovery.outcome "Outcome"  .outcome.reset2fa "Reset two-factor"  .outcome.transferOwner "Transfer Account Owner"
//     provider.recovery.checklist "Identity checks" with items "Call back to the number or email on record",
//       "Confirmation from another named client admin", "Checklist documented"
//     provider.recovery.new "New request"  .client "Client"  .person "Person"  .reason "Reason"  .submit "Start request"
//   P15 /provider/recovery:
//     - h1 "Account recovery". Region "Identity checks" lists the three checks as text.
//     - data-testid="recovery-row" per list() row (same order), data-request-id. Text has the client display name, the
//       subject's display name, the reason, "Approved by N of 2" and the status label.
//     - Approve button (in the row) only for an open request, when the viewer holds recovery.approve and has not
//       already approved it. Once approved the row text says "Cooling off ends in N hours" (from coolingOffEndsAt).
//     - Approved rows: button "Complete" (recovery.approve) disabled with the text
//       "Complete is available when the cooling-off period has ended." until the clock passes coolingOffEndsAt, plus a
//       combobox "Outcome" (Reset two-factor / Transfer Account Owner) used when completing.
//     - Form (recovery.start): comboboxes "Client" and "Person" (options by display name), textbox "Reason" (required),
//       combobox "Outcome", button "Start request". No recovery.start: only the no-access message.
//   The store clock is fixed in these tests, so "the clock has moved on" is set up by writing the request with a
//   cooling-off end time already in the past (admin.bulkPut), which is equivalent for the rules.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecoveryRequest } from '@sta/domain';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Prepare = (ctx: Parameters<NonNullable<NonNullable<Opts>['prepare']>>[0]) => Promise<void>;
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });
const HOUR = 3_600_000;
const iso = (offsetHours: number) => new Date(new Date(TODAY).getTime() + offsetHours * HOUR).toISOString();

/** Rewrites the single seeded request. */
const patchSeeded =
  (change: (r: RecoveryRequest, keys: Record<string, string>) => Partial<RecoveryRequest>): Prepare =>
  async ({ handle, keys }) => {
    const dump = await handle.admin.dumpAll();
    const r = (dump['recoveryRequests'] as RecoveryRequest[])[0]!;
    await handle.admin.bulkPut('recoveryRequests', [{ ...r, ...change(r, keys.users) }]);
  };

const openP15 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/recovery', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Account recovery' });
  return view;
};
const rows = () => screen.getAllByTestId('recovery-row');
const nameOf = async (view: Awaited<ReturnType<typeof openP15>>, id: string, store: 'users' | 'clients') =>
  ((await view.handle.admin.dumpAll())[store] as { id: string; displayName: string }[]).find((x) => x.id === id)!
    .displayName;

describe('P15 Account recovery', () => {
  it('lists the seeded open request with client, person, reason, approvals in words and status', async () => {
    const view = await openP15();
    expect(rows()).toHaveLength(1);
    const seeded = ((await view.handle.admin.dumpAll())['recoveryRequests'] as RecoveryRequest[])[0]!;
    const text = rows()[0]!.textContent;
    expect(rows()[0]!.getAttribute('data-request-id')).toBe(seeded.id);
    expect(text).toContain(await nameOf(view, seeded.clientId, 'clients'));
    expect(text).toContain(await nameOf(view, seeded.subjectUserId, 'users'));
    expect(text).toContain(seeded.reason);
    expect(text).toContain('Approved by 1 of 2');
    expect(text).toContain('Open');
  });

  it('shows the identity checks checklist', async () => {
    await openP15();
    const region = screen.getByRole('region', { name: 'Identity checks' });
    expect(region.textContent).toContain('Call back to the number or email on record');
    expect(region.textContent).toContain('Confirmation from another named client admin');
    expect(region.textContent).toContain('Checklist documented');
  });

  it('offers no Approve button to someone who already approved the request', async () => {
    await openP15({
      ...as('providerOwner'),
      prepare: patchSeeded((_r, users) => ({ approvals: [users['providerOwner']!] })),
    });
    expect(within(rows()[0]!).queryAllByRole('button', { name: 'Approve' })).toHaveLength(0);
    expect(rows()[0]!.textContent).toContain('Approved by 1 of 2');
  });

  it('lets a different owner give the second approval, then shows the status Approved and a cooling-off countdown', async () => {
    const view = await openP15({
      ...as('providerOwner'),
      prepare: patchSeeded(() => ({ coolingOffEndsAt: iso(48) })),
    });
    await userEvent.click(within(rows()[0]!).getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(rows()[0]!.textContent).toContain('Approved by 2 of 2');
    });
    expect(rows()[0]!.textContent).toContain('Approved');
    expect(rows()[0]!.textContent).toMatch(/Cooling off ends in 48 hours/);
    const stored = ((await view.handle.admin.dumpAll())['recoveryRequests'] as RecoveryRequest[])[0]!;
    expect(stored.status).toBe('approved');
    expect(stored.approvals).toHaveLength(2);
    expect(within(rows()[0]!).queryAllByRole('button', { name: 'Approve' })).toHaveLength(0);
  });

  it('disables Complete with an explanation while the cooling-off period has not ended', async () => {
    await openP15({
      ...as('providerOwner'),
      prepare: patchSeeded((_r, users) => ({
        status: 'approved',
        approvals: [users['sophie']!, users['raj']!],
        coolingOffEndsAt: iso(5),
      })),
    });
    const complete = within(rows()[0]!).getByRole('button', { name: 'Complete' });
    expect((complete as HTMLButtonElement).disabled).toBe(true);
    expect(rows()[0]!.textContent).toContain('Complete is available when the cooling-off period has ended.');
    expect(rows()[0]!.textContent).toMatch(/Cooling off ends in 5 hours/);
  });

  it('enables Complete once the cooling-off has ended, and choosing Reset two-factor completes the request', async () => {
    const view = await openP15({
      ...as('providerOwner'),
      prepare: patchSeeded((_r, users) => ({
        status: 'approved',
        approvals: [users['sophie']!, users['raj']!],
        coolingOffEndsAt: iso(-1),
      })),
    });
    const row = rows()[0]!;
    const complete: HTMLButtonElement = within(row).getByRole('button', { name: 'Complete' });
    expect(complete.disabled).toBe(false);
    expect(row.textContent).not.toContain('Complete is available when the cooling-off period has ended.');
    await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Outcome' }), 'Reset two-factor');
    await userEvent.click(complete);
    await waitFor(() => {
      expect(rows()[0]!.textContent).toContain('Done');
    });
    const stored = ((await view.handle.admin.dumpAll())['recoveryRequests'] as RecoveryRequest[])[0]!;
    expect(stored.status).toBe('done');
  });

  it('starts a new request from the form: client, person, reason and outcome', async () => {
    const view = await openP15();
    const clientName = await nameOf(view, view.keys.clients['littleAcorns'], 'clients');
    const personName = await nameOf(view, view.keys.users['priya'], 'users');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Client' }), clientName);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Person' }), personName);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'Left the organisation without a handover');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Outcome' }), 'Transfer Account Owner');
    await userEvent.click(screen.getByRole('button', { name: 'Start request' }));
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    const created = ((await view.handle.admin.dumpAll())['recoveryRequests'] as RecoveryRequest[]).find(
      (r) => r.subjectUserId === view.keys.users['priya'],
    )!;
    expect(created.reason).toBe('Left the organisation without a handover');
    expect(created.outcome).toBe('transferOwner');
    expect(created.status).toBe('open');
    expect(created.requester).toBe(view.keys.users['providerOwner']);
    expect(
      rows()
        .map((r) => r.textContent)
        .join(' '),
    ).toContain('Left the organisation without a handover');
  });

  it('does not create a request without a reason', async () => {
    const view = await openP15();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Client' }),
      await nameOf(view, view.keys.clients['littleAcorns'], 'clients'),
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Person' }),
      await nameOf(view, view.keys.users['priya'], 'users'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start request' }));
    expect(rows()).toHaveLength(1);
    expect((await view.handle.admin.dumpAll())['recoveryRequests'].length).toBe(1);
  });

  it('shows only a no-access message to a user without recovery.start', async () => {
    await renderRoute('/provider/recovery', 'provider', as('tom'));
    expect(await screen.findByText('You do not have access to account recovery.')).toBeTruthy();
    expect(screen.queryAllByTestId('recovery-row')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Start request' })).toHaveLength(0);
  });

  it('shows a user who can start but not approve the requests and the form, with no Approve button', async () => {
    await openP15(as('sophie'));
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Start request' })).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Approve' })).toHaveLength(0);
  });
});
