// M4 chunk 17b (U layer): P25 "Price changes" at /provider/pricing (BP-7, brief 23.11). Written before the
// implementation (components `Pricing` and `PriceChangesPanel` in ./Pricing.tsx).
//
// UI CONTRACT
//   Data: store.pricing.list / preview / draft / submit / confirm(id, stepUpCode) / cancel. The demo step-up code is
//   '123456'. The page needs holdsAnywhere(perms, 'billing.read') (list is refused without billing.read or the draft or
//   confirm permission); otherwise only the no-access message. "New change", "Save draft" and "Submit for confirmation"
//   need holdsAnywhere(perms, 'billing.draftPriceChanges') and are hidden without it; "Confirm" needs
//   'billing.confirmPriceChanges' and is hidden without it. "Cancel change" needs the draft permission. Never role names.
//   Seeded personas: providerOwner holds draft and confirm; raj (Billing) holds draft only; tom (Read-only) holds billing.read
//   only; sophie and megan hold no billing permission.
//   Proposed language keys (en-GB):
//     provider.pricing.heading "Price changes"  .noAccess "You do not have access to price changes."
//     .group.{draft,submitted,scheduled,active,ended} "Drafts", "Awaiting confirmation", "Scheduled", "Active", "Ended"
//     .status.{draft,submitted,scheduled,active,ended,cancelled} "Draft", "Awaiting confirmation", "Scheduled", "Active",
//       "Ended", "Cancelled"
//     .new "New change"  .clients "Clients"  .clients.{one,several,all} "One client", "Several clients", "All clients"
//     .client "Client"  .type "Type"  .type.{override,discount,increase} "Price override", "Percentage discount",
//       "Percentage increase"  .scope "Applies to"  .scope.{plan,addOn,invoice} "Plan", "One add-on", "Whole invoice"
//     .value "Value"  .reason "Reason"  .noticeDays "Notice days"  .endsAt "End date (optional)"
//     .preview "Preview"  .saveDraft "Save draft"  .submit "Submit for confirmation"  .confirm "Confirm"
//     .stepUp "Step-up code"  .confirmNow "Confirm change"  .cancel "Cancel change"
//     .wrongCode (role="alert") "That code is not right."  .stepUpRequired (role="alert") "Enter your step-up code."
//     .saved / .submitted / .confirmed / .cancelled (role="status") "Draft saved.", "Sent for confirmation.",
//       "Price change confirmed.", "Price change cancelled."
//     .preview.{current,new,effective,effect,warnings} column headings "Current price", "New price", "Takes effect",
//       "Monthly effect"
//     .warning.{increaseOver20,belowFloor} "This increase is over 20 per cent.", "The new price is below the minimum price."
//   P25 /provider/pricing:
//     - h1 "Price changes". Groups: data-testid="price-group" with data-status in draft|submitted|scheduled|active|ended
//       (cancelled changes sit in the ended group); each group has an h2 with its label. Only non-empty groups render.
//     - data-testid="price-row" (data-adjustment-id) per adjustment inside its group: client display names, the status label,
//       and the value ("-10%", "+5%" or the override in pounds).
//     - "New change" reveals a form. Radios "One client" (default; select "Client"), "Several clients" (checkbox per
//       client display name), "All clients". Selects "Type", "Applies to", "Reason" (options by value: override|discount|
//       increase, plan|addOn|invoice, loyalty|retention|introductory|annualReview|correction|other). Spinbuttons "Value"
//       (pounds for an override, a positive percentage for a discount or increase; a discount is stored as a negative
//       percent, an override in pence) and "Notice days" (default 30); date input "End date (optional)".
//     - "Preview" shows data-testid="price-preview": one data-testid="preview-row" (data-client-id) per selected client with
//       current price, new price (formatPounds), effective date (formatLondonDate) and monthly effect, equal to
//       store.pricing.preview for the same input; data-testid="preview-warning" per warning. Preview writes nothing.
//     - "Save draft" calls draft (nothing else), shows "Draft saved." and the new row in Drafts.
//     - Draft rows: "Submit for confirmation" (moves to Awaiting confirmation; nothing applies).
//     - Awaiting rows: "Confirm" reveals textbox "Step-up code" and "Confirm change". Wrong or empty code: role="alert"
//       message in the row, nothing applies. Right code: "Price change confirmed." and the row moves to Scheduled (or Active
//       when it is already due).
//     - "Cancel change" on draft, awaiting and scheduled rows: "Price change cancelled.", row moves to Ended as Cancelled.
//   PriceChangesPanel: P3 Billing tab (tab "Billing") shows data-testid="price-panel" with a "Price changes" h2 and the
//   same data-testid="price-row" rows for that client only.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { PriceAdjustment } from '@sta/domain';
import { actorFor, renderRoute } from '../../test/harness';
import { formatLondonDate, formatPounds } from '../../demo/format';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });
const CODE = '123456';

const openP25 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/pricing', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Price changes' });
  await screen.findAllByTestId('price-row');
  return view;
};
type View = Awaited<ReturnType<typeof openP25>>;
const stored = async (view: View) => (await view.handle.admin.dumpAll())['priceAdjustments'] as PriceAdjustment[];
const clientName = async (view: View, id: string) =>
  ((await view.handle.admin.dumpAll())['clients'] as { id: string; displayName: string }[]).find((c) => c.id === id)!
    .displayName;
const group = (status: string) =>
  screen.getAllByTestId('price-group').find((g) => g.getAttribute('data-status') === status);
const rowIn = (status: string) => within(group(status)!).getByTestId('price-row');
const mainStatus = () => within(screen.getByRole('main')).findByRole('status');
const byStatus = async (view: View, status: PriceAdjustment['status']) =>
  (await stored(view)).filter((a) => a.status === status);

const openForm = async (view: View) => {
  await userEvent.click(screen.getByRole('button', { name: 'New change' }));
  return view.keys.clients;
};
const fillOneClient = async (clientId: string, type: string, value: string, reason = 'loyalty') => {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Client' }), clientId);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), type);
  const v = screen.getByRole('spinbutton', { name: 'Value' });
  await userEvent.clear(v);
  await userEvent.type(v, value);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reason' }), reason);
};

describe('P25 Price changes: list', () => {
  it('groups the three seeded changes by status with the right labels', async () => {
    const view = await openP25();
    const heads = screen.getAllByTestId('price-group').map((g) => g.getAttribute('data-status'));
    expect(heads).toEqual(['draft', 'scheduled', 'active']);
    expect(within(group('draft')!).getByRole('heading', { level: 2 }).textContent).toBe('Drafts');
    expect(within(group('scheduled')!).getByRole('heading', { level: 2 }).textContent).toBe('Scheduled');
    expect(within(group('active')!).getByRole('heading', { level: 2 }).textContent).toBe('Active');
    const all = await stored(view);
    expect(
      screen
        .getAllByTestId('price-row')
        .map((r) => r.getAttribute('data-adjustment-id'))
        .sort(),
    ).toEqual(all.map((a) => a.id).sort());
  });

  it('shows client, status and value on each seeded row', async () => {
    const view = await openP25();
    const keys = view.keys.clients;
    const active = rowIn('active');
    expect(active.textContent).toContain(await clientName(view, keys.oakTree));
    expect(active.textContent).toContain('Active');
    expect(active.textContent).toContain('-10%');
    const scheduled = rowIn('scheduled');
    expect(scheduled.textContent).toContain(await clientName(view, keys.brookfield));
    expect(scheduled.textContent).toContain('Scheduled');
    expect(scheduled.textContent).toContain('+5%');
    expect(rowIn('draft').textContent).toContain(await clientName(view, keys.summitBuilders));
    expect(rowIn('draft').textContent).toContain('-15%');
  });
});

describe('P25 Price changes: new change and preview', () => {
  it('defaults notice days to 30 and offers the three types, three scopes and one, several or all clients', async () => {
    const view = await openP25();
    await openForm(view);
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Notice days' }).value).toBe('30');
    const type = screen.getByRole('combobox', { name: 'Type' });
    expect(
      within(type)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Price override', 'Percentage discount', 'Percentage increase']);
    const scope = screen.getByRole('combobox', { name: 'Applies to' });
    expect(
      within(scope)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Plan', 'One add-on', 'Whole invoice']);
    for (const name of ['One client', 'Several clients', 'All clients'])
      expect(screen.getByRole('radio', { name })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'One client' }).checked).toBe(true);
    expect(screen.getByLabelText('End date (optional)')).toBeTruthy();
  });

  it('previews current price, new price, effective date and revenue effect exactly as the data layer does', async () => {
    const view = await openP25();
    const keys = await openForm(view);
    await fillOneClient(keys.oakTree, 'increase', '8', 'annualReview');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const rows = await screen.findAllByTestId('preview-row');
    const actor = { ...actorFor('provider', view.keys), now: '2026-10-19T09:00:00.000Z' };
    const expected = await view.handle.store.pricing.preview(actor, {
      clientIds: [keys.oakTree],
      scope: { kind: 'plan' },
      type: 'percent',
      value: 8,
      reason: 'annualReview',
      noticeDays: 30,
    });
    expect(rows).toHaveLength(expected.rows.length);
    expect(rows[0]!.getAttribute('data-client-id')).toBe(keys.oakTree);
    const text = rows[0]!.textContent;
    const r = expected.rows[0]!;
    expect(text).toContain(formatPounds(r.currentPrice));
    expect(text).toContain(formatPounds(r.newPrice));
    expect(text).toContain(formatLondonDate(r.effectiveAt));
    expect(text).toContain(formatPounds(Math.abs(r.monthlyEffect)));
    expect(r.newPrice).toBeGreaterThan(r.currentPrice);
  });

  it('warns when an increase is over 20 per cent, and writes nothing while previewing', async () => {
    const view = await openP25();
    const before = await stored(view);
    const keys = await openForm(view);
    await fillOneClient(keys.oakTree, 'increase', '25');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const warning = await screen.findByTestId('preview-warning');
    expect(warning.textContent).toContain('This increase is over 20 per cent.');
    expect(await stored(view)).toEqual(before);
  });

  it('previews one row per client for All clients', async () => {
    const view = await openP25();
    await openForm(view);
    await userEvent.click(screen.getByRole('radio', { name: 'All clients' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'discount');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Value' }), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const rows = await screen.findAllByTestId('preview-row');
    const clients = (await view.handle.admin.dumpAll())['clients'];
    expect(rows).toHaveLength(clients.length);
  });

  it('previews only the ticked clients for Several clients', async () => {
    const view = await openP25();
    const keys = await openForm(view);
    await userEvent.click(screen.getByRole('radio', { name: 'Several clients' }));
    await userEvent.click(screen.getByRole('checkbox', { name: await clientName(view, keys.oakTree) }));
    await userEvent.click(screen.getByRole('checkbox', { name: await clientName(view, keys.brookfield) }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'discount');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Value' }), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const rows = await screen.findAllByTestId('preview-row');
    expect(rows.map((r) => r.getAttribute('data-client-id')).sort()).toEqual([keys.oakTree, keys.brookfield].sort());
  });

  it('Save draft stores a negative percent for a discount, with the default notice, an end date and the reason', async () => {
    const view = await openP25();
    const keys = await openForm(view);
    await fillOneClient(keys.littleAcorns, 'discount', '12', 'retention');
    await userEvent.type(screen.getByLabelText('End date (optional)'), '2027-10-19');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect((await mainStatus()).textContent).toContain('Draft saved.');
    const drafts = await byStatus(view, 'draft');
    const mine = drafts.find((d) => d.clientIds.includes(keys.littleAcorns))!;
    expect(mine).toMatchObject({ type: 'percent', value: -12, reason: 'retention', noticeDays: 30 });
    expect(mine.scope).toEqual({ kind: 'plan' });
    expect(mine.endsAt?.slice(0, 10)).toBe('2027-10-19');
    await waitFor(() => {
      expect(within(group('draft')!).getAllByTestId('price-row')).toHaveLength(2);
    });
  });

  it('saves a price override in pence, scoped to the whole invoice when chosen', async () => {
    const view = await openP25();
    const keys = await openForm(view);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Applies to' }), 'invoice');
    await fillOneClient(keys.littleAcorns, 'override', '45.50', 'other');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await mainStatus();
    const mine = (await byStatus(view, 'draft')).find((d) => d.clientIds.includes(keys.littleAcorns))!;
    expect(mine).toMatchObject({ type: 'override', value: 4550 });
    expect(mine.scope).toEqual({ kind: 'invoice' });
  });
});

describe('P25 Price changes: submit, confirm, cancel', () => {
  it('Submit for confirmation moves the draft to Awaiting confirmation and applies nothing', async () => {
    const view = await openP25();
    const before = (await byStatus(view, 'draft'))[0]!;
    await userEvent.click(within(rowIn('draft')).getByRole('button', { name: 'Submit for confirmation' }));
    expect((await mainStatus()).textContent).toContain('Sent for confirmation.');
    const after = (await stored(view)).find((a) => a.id === before.id)!;
    expect(after.status).toBe('submitted');
    expect(after.confirmedBy).toBeUndefined();
    expect(after.effectiveAt).toBeUndefined();
    await waitFor(() => {
      expect(group('submitted')).toBeTruthy();
    });
    expect(rowIn('submitted').textContent).toContain('Awaiting confirmation');
    expect(within(group('submitted')!).getByRole('heading', { level: 2 }).textContent).toBe('Awaiting confirmation');
  });

  const toAwaiting = async () => {
    await userEvent.click(within(rowIn('draft')).getByRole('button', { name: 'Submit for confirmation' }));
    await waitFor(() => {
      expect(group('submitted')).toBeTruthy();
    });
  };

  it('Confirm with the right step-up code schedules the change, records the confirmer and confirms', async () => {
    const view = await openP25();
    await toAwaiting();
    const id = rowIn('submitted').getAttribute('data-adjustment-id')!;
    await userEvent.click(within(rowIn('submitted')).getByRole('button', { name: 'Confirm' }));
    await userEvent.type(within(rowIn('submitted')).getByRole('textbox', { name: 'Step-up code' }), CODE);
    await userEvent.click(within(rowIn('submitted')).getByRole('button', { name: 'Confirm change' }));
    expect((await mainStatus()).textContent).toContain('Price change confirmed.');
    const after = (await stored(view)).find((a) => a.id === id)!;
    expect(['scheduled', 'active']).toContain(after.status);
    expect(after.confirmedBy).toBe(view.keys.users['providerOwner']);
    expect(after.effectiveAt).toBeDefined();
    await waitFor(() => {
      expect(group('submitted')).toBeUndefined();
    });
    expect(screen.getAllByTestId('price-row').some((r) => r.getAttribute('data-adjustment-id') === id)).toBe(true);
  });

  it('a wrong step-up code shows an error and applies nothing', async () => {
    const view = await openP25();
    await toAwaiting();
    const id = rowIn('submitted').getAttribute('data-adjustment-id')!;
    await userEvent.click(within(rowIn('submitted')).getByRole('button', { name: 'Confirm' }));
    await userEvent.type(within(rowIn('submitted')).getByRole('textbox', { name: 'Step-up code' }), '000000');
    await userEvent.click(within(rowIn('submitted')).getByRole('button', { name: 'Confirm change' }));
    expect((await within(rowIn('submitted')).findByRole('alert')).textContent).toContain('That code is not right.');
    const after = (await stored(view)).find((a) => a.id === id)!;
    expect(after.status).toBe('submitted');
    expect(after.confirmedBy).toBeUndefined();
    expect(after.effectiveAt).toBeUndefined();
    expect(within(screen.getByRole('main')).queryAllByText('Price change confirmed.')).toHaveLength(0);
  });

  it('an empty step-up code asks for it and applies nothing', async () => {
    const view = await openP25();
    await toAwaiting();
    const id = rowIn('submitted').getAttribute('data-adjustment-id')!;
    await userEvent.click(within(rowIn('submitted')).getByRole('button', { name: 'Confirm' }));
    await userEvent.click(within(rowIn('submitted')).getByRole('button', { name: 'Confirm change' }));
    expect((await within(rowIn('submitted')).findByRole('alert')).textContent).toContain('Enter your step-up code.');
    expect((await stored(view)).find((a) => a.id === id)!.status).toBe('submitted');
  });

  it('Cancel change on a draft ends it as Cancelled', async () => {
    const view = await openP25();
    const id = rowIn('draft').getAttribute('data-adjustment-id')!;
    await userEvent.click(within(rowIn('draft')).getByRole('button', { name: 'Cancel change' }));
    expect((await mainStatus()).textContent).toContain('Price change cancelled.');
    expect((await stored(view)).find((a) => a.id === id)!.status).toBe('cancelled');
    await waitFor(() => {
      expect(group('draft')).toBeUndefined();
    });
    expect(rowIn('ended').textContent).toContain('Cancelled');
  });

  it('Cancel change on a scheduled increase cancels it so the client keeps the previous price', async () => {
    const view = await openP25();
    const id = rowIn('scheduled').getAttribute('data-adjustment-id')!;
    await userEvent.click(within(rowIn('scheduled')).getByRole('button', { name: 'Cancel change' }));
    await mainStatus();
    expect((await stored(view)).find((a) => a.id === id)!.status).toBe('cancelled');
    await waitFor(() => {
      expect(group('scheduled')).toBeUndefined();
    });
  });
});

describe('P25 Price changes: permissions', () => {
  it('lets Raj (draft permission only) draft and submit but shows no Confirm button', async () => {
    const view = await openP25(as('raj'));
    expect(screen.getByRole('button', { name: 'New change' })).toBeTruthy();
    await userEvent.click(within(rowIn('draft')).getByRole('button', { name: 'Submit for confirmation' }));
    await waitFor(() => {
      expect(group('submitted')).toBeTruthy();
    });
    expect(screen.queryAllByRole('button', { name: 'Confirm' })).toHaveLength(0);
    expect((await byStatus(view, 'submitted')).length).toBe(1);
  });

  it('shows Tom (read only) the list with no way to create, submit, confirm or cancel', async () => {
    await openP25(as('tom'));
    for (const name of ['New change', 'Submit for confirmation', 'Confirm', 'Cancel change', 'Save draft'])
      expect(screen.queryAllByRole('button', { name })).toHaveLength(0);
  });

  it('shows only a no-access message to someone without billing permissions', async () => {
    const view = await renderRoute('/provider/pricing', 'provider', as('megan'));
    expect((await screen.findByText('You do not have access to price changes.')).textContent).toBeTruthy();
    expect(screen.queryAllByTestId('price-row')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'New change' })).toHaveLength(0);
    expect((await stored(view)).length).toBe(3);
  });

  it('shows Sophie (support) the no-access message too', async () => {
    await renderRoute('/provider/pricing', 'provider', as('sophie'));
    expect((await screen.findByText('You do not have access to price changes.')).textContent).toBeTruthy();
  });
});

describe('PriceChangesPanel on the P3 Billing tab', () => {
  it("lists only that client's price changes", async () => {
    // The seed is deterministic, so ids from one store are valid in the next.
    const { keys } = await renderRoute('/provider', 'provider');
    cleanup();
    await renderRoute(`/provider/clients/${keys.clients.brookfield}`, 'provider');
    await userEvent.click(await screen.findByRole('tab', { name: 'Billing' }));
    const panel = await screen.findByTestId('price-panel');
    expect(within(panel).getByRole('heading', { level: 2, name: 'Price changes' })).toBeTruthy();
    const rows = await within(panel).findAllByTestId('price-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('+5%');
    expect(rows[0]!.textContent).toContain('Scheduled');
  });
});
