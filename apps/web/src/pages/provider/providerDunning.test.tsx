// M4 chunk 12b (U layer): P9 "Dunning" at /provider/dunning (BP-9). Written before the implementation.
//
// UI CONTRACT
//   Data: store.dunning.overview(actor) (needs billing.read), store.dunning.extendGrace(actor, clientId, days) and
//   store.dunning.setPaused(actor, clientId, paused) (both need billing.manageDunning). The buttons are shown only when
//   holdsAnywhere(perms, 'billing.manageDunning') (never role names). Tom (read-only provider user) sees rows, no buttons.
//   Money uses formatPounds from src/demo/format. Account state is TEXT, using the existing keys provider.accountState.*
//   (pastDue reads "Payment overdue"). The page re-renders after a change (the store notifies subscribers).
//   Proposed language keys (en-GB):
//     provider.dunning.heading "Dunning"
//     provider.dunning.outstanding "Total outstanding: {amount}"
//     provider.dunning.recoveryRate "Recovery rate: {percent}%"
//     provider.dunning.noFailures "No payment failures yet"
//     provider.dunning.amount "Outstanding: {amount}"
//     provider.dunning.nextState "Next: {state} in {count} days"   (singular: "in 1 day")
//     provider.dunning.deletion "Deleted in {count} days"          (singular: "in 1 day")
//     provider.dunning.extendGrace "Extend grace"   provider.dunning.pause "Pause timeline"
//     provider.dunning.resume "Resume timeline"     provider.dunning.sensitive "Sensitive"
//     provider.dunning.daysLabel "Days to add (1 to 30)"   provider.dunning.confirm "Confirm"   provider.dunning.cancel "Cancel"
//   P9 /provider/dunning:
//     - h1 "Dunning".
//     - data-testid="dunning-summary": contains "Total outstanding: <formatPounds(outstandingPence)>" and either
//       "Recovery rate: N%" or "No payment failures yet" when recoveryRatePercent is null.
//     - data-testid="dunning-row" per overview row (same order), data-client-id = client id. Text contains the client name,
//       the account state label, "Outstanding: <pounds>", and "Next: <state label> in N days" when daysToNextState is set.
//       Closed accounts also say "Deleted in N days".
//     - Rows in pastDue or limited have buttons "Extend grace" and "Pause timeline" (or "Resume timeline" when paused).
//       Each button's accessible name includes the client name is NOT required; query them inside the row.
//       Each such button sits beside the visible text "Sensitive". Other rows have neither button.
//     - "Extend grace" opens a dialog/form with a number input labelled "Days to add (1 to 30)" and a "Confirm" button.
//       After confirming, the row's days to next state has grown by that amount.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';
import { formatPounds } from '../../demo/format';

// jsdom has no <dialog> methods.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.showModal !== 'function')
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  if (typeof proto.close !== 'function')
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
});
afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];

const openP9 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/dunning', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Dunning' });
  const rows = await screen.findAllByTestId('dunning-row');
  return { view, rows };
};

const rowFor = (rows: HTMLElement[], id: string) => rows.find((r) => r.getAttribute('data-client-id') === id)!;
const daysIn = (row: HTMLElement) => Number(/Next: .* in (\d+) days?/.exec(row.textContent)?.[1]);

describe('P9 Dunning', () => {
  it('lists every non-active client in overview order with name, state as text, amount outstanding and days to next state', async () => {
    const { view, rows } = await openP9();
    const overview = await view.handle.store.dunning.overview(actorFor('provider', view.keys));
    expect(overview.rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.getAttribute('data-client-id'))).toEqual(overview.rows.map((r) => r.clientId));
    for (const o of overview.rows) {
      const text = rowFor(rows, o.clientId).textContent;
      expect(text).toContain(o.clientName);
      expect(text).toContain(t(`provider.accountState.${o.state}` as Parameters<typeof t>[0]));
      expect(text).toContain(`Outstanding: ${formatPounds(o.amountOutstandingPence)}`);
      if (o.daysToNextState !== undefined && o.nextState) {
        expect(text).toContain(t(`provider.accountState.${o.nextState.state}` as Parameters<typeof t>[0]));
        expect(daysIn(rowFor(rows, o.clientId))).toBe(o.daysToNextState);
      } else expect(text).not.toContain('Next:');
    }
    // Active clients are not listed.
    expect(rows.map((r) => r.textContent).join(' ')).not.toContain('Little Acorns Nursery');
  });

  it('shows the total outstanding and the recovery rate in the summary', async () => {
    const { view } = await openP9();
    const overview = await view.handle.store.dunning.overview(actorFor('provider', view.keys));
    const summary = (await screen.findByTestId('dunning-summary')).textContent;
    expect(summary).toContain(`Total outstanding: ${formatPounds(overview.outstandingPence)}`);
    if (overview.recoveryRatePercent === null) expect(summary).toContain('No payment failures yet');
    else expect(summary).toContain(`Recovery rate: ${overview.recoveryRatePercent}%`);
  });

  it('says how many days a closed account has before its records are deleted', async () => {
    const { view, rows } = await openP9();
    const overview = await view.handle.store.dunning.overview(actorFor('provider', view.keys));
    const closed = overview.rows.find((r) => r.state === 'closed')!;
    expect(closed.daysToDeletion).toBeGreaterThan(0);
    const text = rowFor(rows, closed.clientId).textContent;
    expect(text).toContain(`Deleted in ${closed.daysToDeletion} day`);
    const others = rows.filter(
      (r) => r.getAttribute('data-client-id') !== closed.clientId && !r.textContent.includes('Closed'),
    );
    for (const r of others) expect(r.textContent).not.toContain('Deleted in');
  });

  it('shows Payment overdue for a client after a failed payment is simulated, and lists it with its amount', async () => {
    let littleAcorns = '';
    const { rows } = await openP9({
      prepare: async ({ handle, keys }) => {
        littleAcorns = keys.clients['littleAcorns']!;
        await handle.admin.simulateFailedPayment(littleAcorns, TODAY);
      },
    });
    const row = rowFor(rows, littleAcorns);
    expect(row).toBeTruthy();
    expect(row.textContent).toContain(t('provider.accountState.pastDue'));
    expect(row.textContent).toMatch(/Outstanding: £[1-9]/);
  });

  it('extends the grace period: Confirm after choosing days raises the days to the next state by that amount', async () => {
    const { view, rows } = await openP9();
    const willow = view.keys.clients['willowLane'];
    const row = rowFor(rows, willow);
    const before = daysIn(row);
    expect(before).toBeGreaterThan(0);
    await userEvent.click(within(row).getByRole('button', { name: 'Extend grace' }));
    const input = await screen.findByLabelText('Days to add (1 to 30)');
    await userEvent.clear(input);
    await userEvent.type(input, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(daysIn(rowFor(screen.getAllByTestId('dunning-row'), willow))).toBe(before + 7);
    });
  });

  it('offers Extend grace and Pause timeline with a Sensitive marker only on Payment overdue and Limited rows, and toggles to Resume timeline', async () => {
    const { view, rows } = await openP9();
    const overview = await view.handle.store.dunning.overview(actorFor('provider', view.keys));
    for (const o of overview.rows) {
      const row = rowFor(rows, o.clientId);
      const eligible = o.state === 'pastDue' || o.state === 'limited';
      expect(within(row).queryAllByRole('button', { name: 'Extend grace' })).toHaveLength(eligible ? 1 : 0);
      expect(within(row).queryAllByRole('button', { name: /^(Pause|Resume) timeline$/ })).toHaveLength(
        eligible ? 1 : 0,
      );
      if (eligible) expect(row.textContent).toContain('Sensitive');
    }
    const willow = rowFor(rows, view.keys.clients['willowLane']);
    await userEvent.click(within(willow).getByRole('button', { name: 'Pause timeline' }));
    await waitFor(() => {
      const again = rowFor(screen.getAllByTestId('dunning-row'), view.keys.clients['willowLane']);
      expect(within(again).getByRole('button', { name: 'Resume timeline' })).toBeTruthy();
      expect(within(again).queryAllByRole('button', { name: 'Pause timeline' })).toHaveLength(0);
    });
  });

  it('shows the read-only provider user the rows but no Extend grace or timeline buttons', async () => {
    await openP9({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }) });
    expect(screen.getAllByTestId('dunning-row').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: 'Extend grace' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /timeline$/ })).toHaveLength(0);
    expect(screen.queryByText('Sensitive')).toBeNull();
  });
});

// D2 presenter panel "Simulate failed payment" is already covered by src/shells/foundations.test.tsx
// (describe 'D2 Presenter panel: Simulate failed payment'), so no panel block is repeated here.
