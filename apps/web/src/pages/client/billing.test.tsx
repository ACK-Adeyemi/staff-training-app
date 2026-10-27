// M3 chunk 14 (BP-10, BP-11, BP-12 UI): C19 Billing, C20 Add-ons, the invoice print view, the mock pay page and
// Explain this in simpler words (S5 for staff, C6 Preview as a learner for admins). Written before the implementation.
// Contract the implementer must provide. All text comes from language files; new keys are listed in the chunk 14 report.
//   C19 /client/billing   (needs billing.view; without it role=alert t('errors.forbidden') and no nav link)
//        h1 t('billing.title'). Regions (accessible names):
//          t('billing.plan')      the price as "£x.xx" (planPrice.total) and the renewal date ("2 November 2026" style).
//          t('billing.usage')     one listitem per entitlement limit, text "{n} of {m} used" or t('billing.unlimited').
//          "Add-on usage"         a listitem per switched-on add-on with its name and t('addOns.usage', { used }).
//          t('billing.invoices')  one listitem per invoice: a link named like t('billing.invoice', { number }) whose
//                                 href ends /client/billing/invoices/<id>/print, plus the status word.
//          t('billing.details')   billing name, address, VAT number, and a button named /request a change/i that opens a
//                                 dialog (labels "Billing name", "Address", "VAT number", button /send request/i) and then
//                                 shows t('billing.requested'). The profile itself is not changed.
//        data-testid="payment-method": "{brand} ending {last4}", never any longer digit run.
//        Plan change: combobox "New plan" (option values are package ids), button t('billing.preview'), region
//        data-testid="plan-preview" with the new price as "£x.xx", textbox "Step-up code", button t('billing.confirmChange').
//        A wrong code shows role=alert, 123456 shows t('billing.changed'). Upgrades apply now; downgrades keep the plan.
//        Needs billing.manage; without it no plan-change or Pay controls.
//   C20 /client/billing/add-ons   (needs billing.view) h1 t('addOns.title'). One region per add-on named by the add-on
//        name ("AI Assistant"), showing t('addOns.on') or t('addOns.off') and the t('addOns.copy.<key>.what') sentence.
//        Holders of billing.manageAddOns see button t('addOns.turnOn') / t('addOns.turnOff') which open a dialog.
//        The turn-on dialog has data-testid addon-confirm-price (contains "£0.05" for the AI Assistant),
//        addon-confirm-start (contains "today"), addon-confirm-proration, addon-confirm-invoice (contains "next invoice")
//        and buttons /confirm/i and /cancel/i. Turn-off keeps the card On with the renewal date in its text.
//        Without billing.manageAddOns: no turn on/off buttons; a locked card with button t('addOns.request') opening a
//        dialog with a textbox labelled /note/i (maxlength 300) and /send request/i, then t('addOns.requested').
//        Holders see region t('addOns.requests') with pending requests (requester first name, add-on, note) and buttons
//        t('addOns.approve') / t('addOns.decline').
//   Invoice print /client/billing/invoices/:invoiceId/print   outside the client chrome (no navigation landmark).
//        h1 t('billing.invoice', { number }); billing name at issue, every line label with its amount, VAT
//        (t('billing.tax')) and Total (t('billing.total')); button /print/i calling window.print. No billing.view: alert.
//   Mock pay /client/billing/pay   (needs billing.manage) h1 matching /pay/i, t('billing.demoNote'), the fixed fake card
//        as "ending {last4}", NO textbox or number input, button t('billing.payNow'); clicking returns the account to
//        Active and shows t('billing.paid') (role=status).
//   Explain  S5 /staff/module/:id/lesson/:lessonId and C6 preview /client/modules/:id/preview/:lessonId:
//        entitled: button /explain this in simpler words/i; clicking shows data-testid="explain-result" with the text,
//        the words "Demo AI" and "Based on this lesson only". Staff not entitled: no button, no locked card, no payment
//        wording. Admin preview not entitled: data-testid="explain-locked" with "Ask someone with billing access" and,
//        for admins who cannot turn add-ons on, a button /request/i opening the same request dialog as C20.
//        Entitlement changes appear without a reload.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import { moduleIds, packageIds, addOnIds } from '@sta/content';
import type { Role, RoleAssignment } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { formatLondonDate, formatPounds } from '../../demo/format';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';
import { sgModule } from '../../test/quizHelpers';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const need = <T,>(v: T | undefined): T => {
  if (v === undefined) throw new Error('missing');
  return v;
};
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const littleAcorns =
  (userKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients['littleAcorns']),
    now: TODAY,
  });
const priya = (keys: SeedKeys) => actorFor('client', keys);
const daniel = littleAcorns('daniel');
const lessonId = need(sgModule.lessons[0]).id;
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

/** Daniel gets a role that can see billing but not turn add-ons on, so C19 and C20 open for him. */
async function danielSeesBilling({ handle, keys }: Ctx) {
  const userId = need(keys.users['daniel']);
  const role: Role = {
    id: '01TEST0000000000000000B1BB',
    owner: { clientId: need(keys.clients['littleAcorns']) },
    name: 'Billing viewer',
    description: 'Can see billing',
    colour: '#336699',
    permissionIds: ['billing.view', 'modules.view'],
    system: false,
    version: 1,
    updatedBy: need(keys.users['priya']),
    updatedAt: TODAY,
  };
  const assignments = await dump<RoleAssignment>(handle, 'roleAssignments');
  const mine = assignments.filter((a) => a.userId === userId).map((a) => ({ ...a, roleIds: [role.id] }));
  await handle.admin.bulkPut('roles', [role]);
  await handle.admin.bulkPut('roleAssignments', mine);
}
const aiOn = async ({ handle, keys }: Ctx) => {
  await handle.store.addOns.turnOn(priya(keys), addOnIds.aiAssistant);
};
const failPayment = async ({ handle, keys }: Ctx) => {
  await handle.admin.simulateFailedPayment(need(keys.clients['littleAcorns']), TODAY);
};
const card = (name: string) => screen.findByRole('region', { name });

describe('C19 Billing', () => {
  it('shows the plan price and renewal date from the data layer', async () => {
    const { handle, keys } = await renderRoute('/client/billing', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(t('billing.title'));
    const o = await handle.store.billing.overview(priya(keys));
    const plan = await card(t('billing.plan'));
    expect(plan.textContent).toContain(formatPounds(o.planPrice.total));
    expect(plan.textContent).toContain(formatLondonDate(o.renewalAt));
  });

  it('lists usage against the limits', async () => {
    await renderRoute('/client/billing', 'client');
    const usage = await card(t('billing.usage'));
    const rows = within(usage).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.some((r) => /\d+ of \d+ used/.test(r.textContent))).toBe(true);
    for (const r of rows) expect(r.textContent).toMatch(/\d+ of \d+ used|Unlimited|Included|Not included/);
  });

  it('shows a meter for each switched-on add-on', async () => {
    await renderRoute('/client/billing', 'client', { prepare: aiOn });
    const meters = await card('Add-on usage');
    const row = within(meters).getByRole('listitem');
    expect(row.textContent).toContain('AI Assistant');
    expect(row.textContent).toContain(t('addOns.usage', { used: 0 }));
  });

  it('lists every invoice with a print view link and its status', async () => {
    const { handle, keys } = await renderRoute('/client/billing', 'client');
    const invoices = await handle.store.billing.invoices(priya(keys));
    expect(invoices.length).toBeGreaterThanOrEqual(6);
    const list = await card(t('billing.invoices'));
    expect(within(list).getAllByRole('listitem')).toHaveLength(invoices.length);
    for (const inv of invoices) {
      const link = within(list).getByRole('link', { name: new RegExp(inv.number) });
      expect(link.getAttribute('href')).toMatch(new RegExp(`/client/billing/invoices/${inv.id}/print$`));
    }
  });

  it('shows the payment method as brand and last four digits only', async () => {
    const { handle, keys } = await renderRoute('/client/billing', 'client');
    const o = await handle.store.billing.overview(priya(keys));
    const pm = need(o.paymentMethod);
    const el = await screen.findByTestId('payment-method');
    expect(el.textContent).toContain(`ending ${pm.last4}`);
    expect(el.textContent).not.toMatch(/\d{5,}/);
    expect(el.querySelector('input')).toBeNull();
  });

  it('previews an upgrade with the new price, asks for the step-up code and applies it at once', async () => {
    const { handle, keys } = await renderRoute('/client/billing', 'client');
    const select = await screen.findByRole('combobox', { name: 'New plan' });
    await userEvent.selectOptions(select, packageIds.group);
    await userEvent.click(screen.getByRole('button', { name: t('billing.preview') }));
    const preview = await screen.findByTestId('plan-preview');
    const p = await handle.store.billing.previewPlanChange(priya(keys), packageIds.group);
    expect(p.direction).toBe('upgrade');
    expect(preview.textContent).toContain(formatPounds(p.newPrice));
    await userEvent.type(screen.getByLabelText('Step-up code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: t('billing.confirmChange') }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((await handle.store.billing.overview(priya(keys))).packageId).toBe(packageIds.standard);
    const code = screen.getByLabelText('Step-up code');
    await userEvent.clear(code);
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: t('billing.confirmChange') }));
    expect(await screen.findByText(t('billing.changed'))).toBeTruthy();
    expect((await handle.store.billing.overview(priya(keys))).packageId).toBe(packageIds.group);
  });

  it('keeps the plan until renewal for a downgrade', async () => {
    const { handle, keys } = await renderRoute('/client/billing', 'client');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'New plan' }), packageIds.essentials);
    await userEvent.click(screen.getByRole('button', { name: t('billing.preview') }));
    await screen.findByTestId('plan-preview');
    await userEvent.type(screen.getByLabelText('Step-up code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: t('billing.confirmChange') }));
    await screen.findByText(t('billing.changed'));
    const o = await handle.store.billing.overview(priya(keys));
    expect(o.packageId).toBe(packageIds.standard);
    expect(o.pendingPackageId).toBe(packageIds.essentials);
  });

  it('sends billing details changes as a request and leaves the profile alone', async () => {
    const { handle } = await renderRoute('/client/billing', 'client');
    const details = await card(t('billing.details'));
    const before = (await dump<{ billingName: string }>(handle, 'billingProfiles'))[0];
    await userEvent.click(within(details).getByRole('button', { name: /request a change/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Billing name'));
    await userEvent.type(within(dialog).getByLabelText('Billing name'), 'Acorn Childcare Ltd');
    await userEvent.click(within(dialog).getByRole('button', { name: /send request/i }));
    expect(await screen.findByText(t('billing.requested'))).toBeTruthy();
    const requests = await dump<{ proposed?: unknown }>(handle, 'billingChangeRequests');
    expect(JSON.stringify(requests)).toContain('Acorn Childcare Ltd');
    expect((await dump<{ billingName: string }>(handle, 'billingProfiles'))[0]?.billingName).toBe(before?.billingName);
  });
});

describe('billing access (BP-10)', () => {
  it('gives Daniel no Billing or Add-ons navigation', async () => {
    await renderRoute('/client', 'client', { actor: daniel });
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('a[href="#/client/billing"]')).toBeNull();
    expect(document.querySelector('a[href="#/client/billing/add-ons"]')).toBeNull();
  });

  it('gives Priya navigation to both', async () => {
    await renderRoute('/client', 'client');
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('a[href="#/client/billing"]')).not.toBeNull();
    expect(document.querySelector('a[href="#/client/billing/add-ons"]')).not.toBeNull();
  });

  it.each(['/client/billing', '/client/billing/add-ons', '/client/billing/pay'])(
    'shows Daniel the no-access message on %s, not an empty page',
    async (path) => {
      await renderRoute(path, 'client', { actor: daniel });
      expect((await screen.findByRole('alert')).textContent).toContain(t('errors.forbidden'));
      expect(screen.queryByRole('button', { name: t('addOns.turnOn') })).toBeNull();
    },
  );

  it('shows Daniel the no-access message on an invoice print view', async () => {
    const { handle, keys } = await renderRoute('/client', 'client');
    const [inv] = await handle.store.billing.invoices(priya(keys));
    cleanup();
    await renderRoute(`/client/billing/invoices/${need(inv).id}/print`, 'client', { actor: daniel });
    expect((await screen.findByRole('alert')).textContent).toContain(t('errors.forbidden'));
    expect(screen.queryByText(need(inv).number)).toBeNull();
  });
});

describe('C20 Add-ons', () => {
  it('shows a card per add-on with what it does and its state', async () => {
    await renderRoute('/client/billing/add-ons', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(t('addOns.title'));
    const ai = await card('AI Assistant');
    expect(ai.textContent).toContain(t('addOns.copy.aiAssistant.what'));
    expect(ai.textContent).toContain(t('addOns.off'));
  });

  it('asks for confirmation that states price, billing start, proration and the next invoice, then turns it on at once', async () => {
    const { handle, keys } = await renderRoute('/client/billing/add-ons', 'client');
    const ai = await card('AI Assistant');
    await userEvent.click(within(ai).getByRole('button', { name: t('addOns.turnOn') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('addon-confirm-price').textContent).toContain('£0.05');
    expect(within(dialog).getByTestId('addon-confirm-start').textContent).toMatch(/today/i);
    expect(within(dialog).getByTestId('addon-confirm-proration').textContent.trim().length).toBeGreaterThan(10);
    expect(within(dialog).getByTestId('addon-confirm-invoice').textContent).toMatch(/next invoice/i);
    // Nothing happens until the person confirms.
    const listing = () => handle.store.addOns.list(priya(keys));
    expect((await listing()).find((a) => a.addOnId === addOnIds.aiAssistant)?.status).toBe('off');
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm/i }));
    await waitFor(async () => {
      expect((await listing()).find((a) => a.addOnId === addOnIds.aiAssistant)?.status).toBe('on');
    });
    expect((await card('AI Assistant')).textContent).toContain(t('addOns.on'));
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const { handle, keys } = await renderRoute('/client/billing/add-ons', 'client');
    await userEvent.click(within(await card('AI Assistant')).getByRole('button', { name: t('addOns.turnOn') }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /cancel/i }));
    const l = await handle.store.addOns.list(priya(keys));
    expect(l.find((a) => a.addOnId === addOnIds.aiAssistant)?.status).toBe('off');
  });

  it('turns off by keeping the add-on until the renewal date', async () => {
    const { handle, keys } = await renderRoute('/client/billing/add-ons', 'client', { prepare: aiOn });
    const renewal = (await handle.store.billing.overview(priya(keys))).renewalAt;
    await userEvent.click(within(await card('AI Assistant')).getByRole('button', { name: t('addOns.turnOff') }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirm/i }));
    await waitFor(async () => {
      const row = (await handle.store.addOns.list(priya(keys))).find((a) => a.addOnId === addOnIds.aiAssistant);
      expect(row?.endsAt).toBe(renewal);
      expect(row?.status).toBe('on');
    });
    expect((await card('AI Assistant')).textContent).toContain(formatLondonDate(renewal));
  });

  it('shows an admin without billing.manageAddOns a locked card with a request, not a turn on button', async () => {
    const { handle, keys } = await renderRoute('/client/billing/add-ons', 'client', {
      actor: daniel,
      prepare: danielSeesBilling,
    });
    const ai = await card('AI Assistant');
    expect(within(ai).queryByRole('button', { name: t('addOns.turnOn') })).toBeNull();
    await userEvent.click(within(ai).getByRole('button', { name: t('addOns.request') }));
    const dialog = await screen.findByRole('dialog');
    const note = within(dialog).getByLabelText(/note/i);
    expect(note.getAttribute('maxlength')).toBe('300');
    await userEvent.type(note, 'For the new starters');
    await userEvent.click(within(dialog).getByRole('button', { name: /send request/i }));
    expect(await screen.findByText(t('addOns.requested'))).toBeTruthy();
    const mine = await handle.store.addOnRequests.list(daniel(keys));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ addOnId: addOnIds.aiAssistant, note: 'For the new starters', status: 'pending' });
  });

  async function pendingRequest({ handle, keys }: Ctx) {
    await danielSeesBilling({ handle, keys });
    await handle.store.addOnRequests.create(daniel(keys), { addOnId: addOnIds.aiAssistant, note: 'Please try it' });
  }

  it('lets a holder approve a request, which turns the add-on on', async () => {
    const { handle, keys } = await renderRoute('/client/billing/add-ons', 'client', { prepare: pendingRequest });
    const list = await card(t('addOns.requests'));
    const item = within(list).getByRole('listitem');
    expect(item.textContent).toContain('Daniel');
    expect(item.textContent).toContain('AI Assistant');
    expect(item.textContent).toContain('Please try it');
    await userEvent.click(within(item).getByRole('button', { name: t('addOns.approve') }));
    await waitFor(async () => {
      const row = (await handle.store.addOns.list(priya(keys))).find((a) => a.addOnId === addOnIds.aiAssistant);
      expect(row?.status).toBe('on');
    });
    expect((await handle.store.addOnRequests.list(priya(keys)))[0]?.status).toBe('approved');
  });

  it('lets a holder decline a request and leaves the add-on off', async () => {
    const { handle, keys } = await renderRoute('/client/billing/add-ons', 'client', { prepare: pendingRequest });
    const item = within(await card(t('addOns.requests'))).getByRole('listitem');
    await userEvent.click(within(item).getByRole('button', { name: t('addOns.decline') }));
    await waitFor(async () => {
      expect((await handle.store.addOnRequests.list(priya(keys)))[0]?.status).toBe('declined');
    });
    const row = (await handle.store.addOns.list(priya(keys))).find((a) => a.addOnId === addOnIds.aiAssistant);
    expect(row?.status).toBe('off');
  });
});

describe('invoice print view', () => {
  async function open() {
    const first = await renderRoute('/client', 'client');
    const [inv] = await first.handle.store.billing.invoices(priya(first.keys));
    cleanup();
    const invoice = need(inv);
    const view = await renderRoute(`/client/billing/invoices/${invoice.id}/print`, 'client');
    return { ...view, invoice };
  }

  it('shows the invoice as issued, outside the client chrome, with VAT and total', async () => {
    const { invoice } = await open();
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toContain(invoice.number);
    expect(screen.getByText(invoice.billingNameAtIssue, { exact: false })).toBeTruthy();
    for (const line of invoice.lines)
      expect(screen.getAllByText(line.label, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(t('billing.tax'), { exact: false })).toBeTruthy();
    expect(document.body.textContent).toContain(formatPounds(invoice.tax));
    expect(document.body.textContent).toContain(formatPounds(invoice.total));
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('prints through the browser print dialog', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    await open();
    await userEvent.click(await screen.findByRole('button', { name: /print/i }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('mock pay page', () => {
  it('has a fixed fake card and no card entry fields, and Pay now returns the account to Active', async () => {
    const { handle, keys } = await renderRoute('/client/billing/pay', 'client', { prepare: failPayment });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toMatch(/pay/i);
    expect(screen.getByText(t('billing.demoNote'))).toBeTruthy();
    expect(document.body.textContent).toMatch(/ending \d{4}/);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(document.querySelector('input[autocomplete^="cc-"]')).toBeNull();
    expect((await handle.store.account.status(priya(keys))).state).toBe('pastDue');
    await userEvent.click(screen.getByRole('button', { name: t('billing.payNow') }));
    expect(await screen.findByText(t('billing.paid'))).toBeTruthy();
    expect((await handle.store.account.status(priya(keys))).state).toBe('active');
  });
});

describe('Explain this in simpler words', () => {
  const staffLesson = `/staff/module/${moduleIds.safeguardingAndWhistleblowing}/lesson/${lessonId}`;
  const previewLesson = `/client/modules/${moduleIds.safeguardingAndWhistleblowing}/preview/${lessonId}`;
  const explainButton = () => screen.findByRole('button', { name: /explain this in simpler words/i });

  it('S5 shows staff the button when the add-on is on, and a Demo AI answer based on the lesson only', async () => {
    const { handle, keys } = await renderRoute(staffLesson, 'staff', { prepare: aiOn });
    await userEvent.click(await explainButton());
    const result = await screen.findByTestId('explain-result');
    expect(result.textContent).toContain('Demo AI');
    expect(result.textContent).toContain('Based on this lesson only');
    expect(result.textContent.length).toBeGreaterThan(60);
    const row = (await handle.store.addOns.list(priya(keys))).find((a) => a.addOnId === addOnIds.aiAssistant);
    expect(row?.usageThisPeriod).toBe(1);
  });

  it('S5 shows staff nothing, and no payment or locked wording, when the add-on is off', async () => {
    await renderRoute(staffLesson, 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /explain this in simpler words/i })).toBeNull();
    expect(screen.queryByTestId('explain-locked')).toBeNull();
    expect(document.body.textContent).not.toMatch(/billing|payment|add-on|upgrade|£/i);
  });

  it('C6 preview shows an admin the Demo AI text when entitled', async () => {
    await renderRoute(previewLesson, 'client', { prepare: aiOn });
    await userEvent.click(await explainButton());
    const result = await screen.findByTestId('explain-result');
    expect(result.textContent).toContain('Demo AI');
    expect(result.textContent).toContain('Based on this lesson only');
  });

  it('C6 preview shows a calm locked card when not entitled, with no button', async () => {
    await renderRoute(previewLesson, 'client');
    const locked = await screen.findByTestId('explain-locked');
    expect(locked.textContent).toMatch(/ask someone with billing access/i);
    expect(screen.queryByRole('button', { name: /explain this in simpler words/i })).toBeNull();
  });

  it('C6 preview lets Daniel send a request from the locked card', async () => {
    const { handle, keys } = await renderRoute(previewLesson, 'client', {
      actor: daniel,
      prepare: async (ctx) => {
        await danielSeesBilling(ctx);
      },
    });
    const locked = await screen.findByTestId('explain-locked');
    await userEvent.click(within(locked).getByRole('button', { name: /request/i }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /send request/i }));
    await waitFor(async () => {
      expect(await handle.store.addOnRequests.list(daniel(keys))).toHaveLength(1);
    });
  });

  it('shows the button without a reload once the add-on is turned on', async () => {
    const { handle, keys } = await renderRoute(previewLesson, 'client');
    await screen.findByTestId('explain-locked');
    await handle.store.addOns.turnOn(priya(keys), addOnIds.aiAssistant);
    expect(await explainButton()).toBeTruthy();
    expect(screen.queryByTestId('explain-locked')).toBeNull();
  });
});
