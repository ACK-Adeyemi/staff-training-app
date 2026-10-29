// M4 chunk 17a (U layer): P24 "Profile changes" at /provider/profile-changes (BP-2, brief 30.3). Written before the
// implementation (component `ProfileChanges` in ./ProfileChanges.tsx).
//
// UI CONTRACT
//   Data: store.profileChanges.list (each row has billingName), keepBillingName, updateBillingName, askClient,
//   revertDisplayName; store.billingChanges.list, approve, editThenApprove(id, proposed), decline(id, reason).
//   Whole page needs holdsAnywhere(perms, 'clients.read'). The action buttons are enabled only with
//   holdsAnywhere(perms, 'clients.editBilling') (never role names); without it they are disabled.
//   The page re-renders after a change.
//   Proposed language keys (en-GB):
//     provider.profileChanges.heading "Profile changes"   .noAccess "You do not have access to profile changes."
//     .names.heading "Organisation name changes"   .billing.heading "Billing detail requests"
//     .oldName "Old name"  .newName "New name"  .billingName "Billing name"
//     .status.{pendingReview,billingKept,billingUpdated,clientAsked,reverted}
//       "Waiting for review", "Billing name kept", "Billing name updated", "Client asked", "Display name reverted"
//     .keep "Keep billing name"  .update "Update billing name to match"  .ask "Ask the client"
//     .revert "Revert display name"
//     .confirm.{kept,updated,asked,reverted} (role="status" text) "Billing name kept.", "Billing name updated for future
//       invoices.", "We have asked the client to confirm their billing details.", "Display name reverted."
//     .billing.status.{pending,approved,declined} "Waiting", "Approved", "Declined"
//     .billing.proposed "Proposed change"  .billing.reason "Reason given"
//     .billing.approve "Approve"  .billing.edit "Edit before approving"  .billing.decline "Decline"
//     .billing.fieldName "Billing name"  .billing.fieldAddress "Address"  .billing.fieldVat "VAT number"
//     .billing.save "Save and approve"  .billing.declineReason "Reason for declining"  .billing.confirmDecline "Send decision"
//     .billing.confirm.{approved,declined} (role="status") "Request approved.", "Request declined."
//   P24 /provider/profile-changes:
//     - h1 "Profile changes". data-testid="pc-row" per profileChanges.list() row (data-request-id), showing client
//       display name, "Old name" + old name, "New name" + new name, "Billing name" + billing name, the status label.
//     - Pending name rows: buttons "Keep billing name", "Update billing name to match", "Ask the client",
//       "Revert display name". Each calls its service once and shows its confirmation in a role="status"; the row then
//       shows the new status label and the review buttons are gone.
//     - data-testid="bc-row" per billingChanges.list() row (data-request-id): client display name, status, reason and
//       each proposed field value. Pending rows: "Approve", "Edit before approving" (reveals textboxes "Billing name",
//       "Address", "VAT number" pre-filled from proposed, and "Save and approve"), "Decline" (reveals textbox
//       "Reason for declining" and "Send decision", disabled until a reason is typed).
//     - Without clients.read: only "You do not have access to profile changes."
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { BillingChangeRequest, ProfileChangeRequest } from '@sta/domain';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });

const openP24 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/profile-changes', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Profile changes' });
  return view;
};
type View = Awaited<ReturnType<typeof openP24>>;
const pcRow = () => screen.getByTestId('pc-row');
const bcRow = () => screen.getByTestId('bc-row');
const dump = async (view: View) => view.handle.admin.dumpAll();
const storedPc = async (view: View) => (await dump(view))['profileChangeRequests'] as ProfileChangeRequest[];
const storedBc = async (view: View) => (await dump(view))['billingChangeRequests'] as BillingChangeRequest[];
const billingNameOf = async (view: View, clientId: string) =>
  ((await dump(view))['billingProfiles'] as { clientId: string; billingName: string }[]).find(
    (p) => p.clientId === clientId,
  )!.billingName;
const nameOf = async (view: View, clientId: string) =>
  ((await dump(view))['clients'] as { id: string; displayName: string }[]).find((c) => c.id === clientId)!.displayName;

describe('P24 Profile changes: name changes', () => {
  it('shows old name, new name and billing name side by side for the seeded change', async () => {
    const view = await openP24();
    const req = (await storedPc(view))[0]!;
    const row = pcRow();
    expect(row.getAttribute('data-request-id')).toBe(req.id);
    const billing = await billingNameOf(view, req.clientId);
    expect(row.textContent).toContain(await nameOf(view, req.clientId));
    expect(row.textContent).toContain('Old name');
    expect(row.textContent).toContain('Oak Tree Nurseries');
    expect(row.textContent).toContain('New name');
    expect(row.textContent).toContain('Oak Tree Nurseries Group');
    expect(row.textContent).toContain('Billing name');
    expect(row.textContent).toContain(billing);
    expect(row.textContent).toContain('Waiting for review');
  });

  it('offers all four review actions on a pending change', async () => {
    await openP24();
    const row = within(pcRow());
    for (const name of ['Keep billing name', 'Update billing name to match', 'Ask the client', 'Revert display name'])
      expect(row.getByRole<HTMLButtonElement>('button', { name }).disabled).toBe(false);
  });

  it('Keep billing name records the decision, leaves the billing name alone and confirms', async () => {
    const view = await openP24();
    const req = (await storedPc(view))[0]!;
    const before = await billingNameOf(view, req.clientId);
    await userEvent.click(within(pcRow()).getByRole('button', { name: 'Keep billing name' }));
    expect((await screen.findByRole('status')).textContent).toContain('Billing name kept.');
    const after = (await storedPc(view))[0]!;
    expect(after.status).toBe('billingKept');
    expect(after.reviewerId).toBe(view.keys.users['providerOwner']);
    expect(await billingNameOf(view, req.clientId)).toBe(before);
    await waitFor(() => {
      expect(pcRow().textContent).toContain('Billing name kept');
    });
    expect(within(pcRow()).queryAllByRole('button', { name: 'Keep billing name' })).toHaveLength(0);
  });

  it('Update billing name to match changes the billing name and confirms', async () => {
    const view = await openP24();
    const req = (await storedPc(view))[0]!;
    await userEvent.click(within(pcRow()).getByRole('button', { name: 'Update billing name to match' }));
    expect((await screen.findByRole('status')).textContent).toContain('Billing name updated for future invoices.');
    expect((await storedPc(view))[0]!.status).toBe('billingUpdated');
    expect(await billingNameOf(view, req.clientId)).toBe('Oak Tree Nurseries Group');
    await waitFor(() => {
      expect(pcRow().textContent).toContain('Billing name updated');
    });
  });

  it('Ask the client records the request and confirms', async () => {
    const view = await openP24();
    await userEvent.click(within(pcRow()).getByRole('button', { name: 'Ask the client' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      'We have asked the client to confirm their billing details.',
    );
    expect((await storedPc(view))[0]!.status).toBe('clientAsked');
    await waitFor(() => {
      expect(pcRow().textContent).toContain('Client asked');
    });
  });

  it('Revert display name puts the client name back and confirms', async () => {
    const view = await openP24();
    const req = (await storedPc(view))[0]!;
    await userEvent.click(within(pcRow()).getByRole('button', { name: 'Revert display name' }));
    expect((await screen.findByRole('status')).textContent).toContain('Display name reverted.');
    expect((await storedPc(view))[0]!.status).toBe('reverted');
    expect(await nameOf(view, req.clientId)).toBe('Oak Tree Nurseries');
    await waitFor(() => {
      expect(pcRow().textContent).toContain('Display name reverted');
    });
  });
});

describe('P24 Profile changes: billing detail requests', () => {
  it('lists the seeded request with client, reason, proposed value and status', async () => {
    const view = await openP24();
    const req = (await storedBc(view))[0]!;
    const row = bcRow();
    expect(row.getAttribute('data-request-id')).toBe(req.id);
    expect(row.textContent).toContain(await nameOf(view, req.clientId));
    expect(row.textContent).toContain('3 Marina Court, Anytown AB9 2MN');
    expect(row.textContent).toContain('We have moved our head office.');
    expect(row.textContent).toContain('Waiting');
  });

  it('Approve applies the proposed address and confirms', async () => {
    const view = await openP24();
    const req = (await storedBc(view))[0]!;
    await userEvent.click(within(bcRow()).getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .map((s) => s.textContent)
          .join(' '),
      ).toContain('Request approved.');
    });
    const after = (await storedBc(view))[0]!;
    expect(after.status).toBe('approved');
    expect(after.reviewerId).toBe(view.keys.users['providerOwner']);
    const profile = ((await dump(view))['billingProfiles'] as { clientId: string; address: string }[]).find(
      (p) => p.clientId === req.clientId,
    )!;
    expect(profile.address).toBe('3 Marina Court, Anytown AB9 2MN');
    await waitFor(() => {
      expect(within(bcRow()).queryAllByRole('button', { name: 'Approve' })).toHaveLength(0);
    });
  });

  it('Edit before approving pre-fills the proposed values and saves the edited ones', async () => {
    const view = await openP24();
    const req = (await storedBc(view))[0]!;
    await userEvent.click(within(bcRow()).getByRole('button', { name: 'Edit before approving' }));
    const address = within(bcRow()).getByRole<HTMLInputElement>('textbox', { name: 'Address' });
    expect(address.value).toBe('3 Marina Court, Anytown AB9 2MN');
    await userEvent.clear(address);
    await userEvent.type(address, '5 Quay Road, Anytown AB9 3XY');
    await userEvent.type(within(bcRow()).getByRole('textbox', { name: 'VAT number' }), 'GB123456789');
    await userEvent.click(within(bcRow()).getByRole('button', { name: 'Save and approve' }));
    await waitFor(async () => {
      expect((await storedBc(view))[0]!.status).toBe('approved');
    });
    const after = (await storedBc(view))[0]!;
    expect(after.proposed.address).toBe('5 Quay Road, Anytown AB9 3XY');
    expect(after.proposed.vatNumber).toBe('GB123456789');
    const profile = (
      (await dump(view))['billingProfiles'] as { clientId: string; address: string; vatNumber?: string }[]
    ).find((p) => p.clientId === req.clientId)!;
    expect(profile.address).toBe('5 Quay Road, Anytown AB9 3XY');
    expect(profile.vatNumber).toBe('GB123456789');
  });

  it('Decline needs a reason, then records it and confirms', async () => {
    const view = await openP24();
    await userEvent.click(within(bcRow()).getByRole('button', { name: 'Decline' }));
    const send = within(bcRow()).getByRole<HTMLButtonElement>('button', { name: 'Send decision' });
    expect(send.disabled).toBe(true);
    await userEvent.type(
      within(bcRow()).getByRole('textbox', { name: 'Reason for declining' }),
      'Please send proof of the move',
    );
    expect(send.disabled).toBe(false);
    await userEvent.click(send);
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .map((s) => s.textContent)
          .join(' '),
      ).toContain('Request declined.');
    });
    const after = (await storedBc(view))[0]!;
    expect(after.status).toBe('declined');
    expect(after.reason).toBe('Please send proof of the move');
    await waitFor(() => {
      expect(bcRow().textContent).toContain('Declined');
    });
  });
});

describe('P24 Profile changes: permissions', () => {
  it('shows the rows but disables every action for someone without clients.editBilling', async () => {
    const view = await openP24(as('tom'));
    expect(pcRow().textContent).toContain('Oak Tree Nurseries Group');
    const buttons = [
      ...within(pcRow()).getAllByRole('button'),
      ...within(bcRow()).getAllByRole('button'),
    ] as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThanOrEqual(7);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect((await storedPc(view))[0]!.status).toBe('pendingReview');
  });

  it('shows only a no-access message to someone without clients.read', async () => {
    await renderRoute('/provider/profile-changes', 'provider', as('megan'));
    expect((await screen.findByText('You do not have access to profile changes.')).textContent).toBeTruthy();
    expect(screen.queryAllByTestId('pc-row')).toHaveLength(0);
    expect(screen.queryAllByTestId('bc-row')).toHaveLength(0);
  });
});
