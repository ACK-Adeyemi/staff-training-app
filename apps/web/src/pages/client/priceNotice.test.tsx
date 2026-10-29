// M4 chunk 17c: the client-side price notice on C19 Billing and C28 Calendar. Written before the implementation.
// Contract:
//   Data: store.billing.priceNotices(ctx) (needs billing.view) returns the actor's own client's scheduled or active
//   price changes as { id, type, scope, value, effectiveAt, endAt? }.
//   C19 /client/billing: a region data-testid="price-notice" named t('client.priceNotice.title') ("Price change"), one per
//     notice, with the change as "8%" (percent) or "£x.xx" (override or amount, formatPounds) and the effective date
//     (formatLondonDate, "18 November 2026" style). Its text comes from client.priceNotice.* language keys.
//     Nothing renders for an actor without billing.view, or when there are no notices.
//   C28 /client/calendar: a listitem with data-kind="priceChange" for the effective date, title t('client.priceNotice.title'),
//     for billing.view holders only.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { formatLondonDate } from '../../demo/format';
import { renderRoute, t, TODAY } from '../../test/harness';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | undefined): T => {
  if (v === undefined) throw new Error('missing');
  return v;
};
const asDaniel = (keys: SeedKeys): ActorContext => ({
  userId: need(keys.users['daniel']),
  side: 'client',
  clientId: need(keys.clients['littleAcorns']),
  now: TODAY,
});
const provider = (keys: SeedKeys): ActorContext => ({
  userId: need(keys.users['providerOwner']),
  side: 'provider',
  now: TODAY,
});
const items = () => Array.from(document.querySelectorAll<HTMLElement>('li[data-kind]'));

/** A provider drafts, submits and confirms a 7% increase for Little Acorns, effective 30 days from the demo today. */
async function confirmIncrease({ handle, keys }: Ctx) {
  const ctx = provider(keys);
  const raj = { ...ctx, userId: need(keys.users['raj']) };
  const d = await handle.store.pricing.draft(raj, {
    clientIds: [need(keys.clients['littleAcorns'])],
    scope: { kind: 'plan' },
    type: 'percent',
    value: 7,
    reason: 'annualReview',
  });
  await handle.store.pricing.submit(raj, d.id);
  return handle.store.pricing.confirm(ctx, d.id, '123456');
}
const prep = async (c: Ctx): Promise<void> => {
  await confirmIncrease(c);
};
const EFFECTIVE = '2026-11-18T09:00:00.000Z';

describe('C19 price notice on the plan card', () => {
  it('shows the new percent and effective date to a billing.view holder after a provider confirms', async () => {
    await renderRoute('/client/billing', 'client', { prepare: prep });
    const notice = await screen.findByTestId('price-notice');
    expect(t('client.priceNotice.title')).not.toBe('client.priceNotice.title');
    expect(within(notice).getByText(t('client.priceNotice.title'))).toBeTruthy();
    expect(notice.textContent).toContain('7%');
    expect(notice.textContent).toContain(formatLondonDate(EFFECTIVE));
  });

  it('shows no price notice when nothing is confirmed (a draft is invisible to the client)', async () => {
    await renderRoute('/client/billing', 'client', {
      prepare: async ({ handle, keys }) => {
        const raj = { ...provider(keys), userId: need(keys.users['raj']) };
        await handle.store.pricing.draft(raj, {
          clientIds: [need(keys.clients['littleAcorns'])],
          scope: { kind: 'plan' },
          type: 'percent',
          value: 7,
          reason: 'annualReview',
        });
      },
    });
    await screen.findByRole('region', { name: t('billing.plan') });
    expect(screen.queryByTestId('price-notice')).toBeNull();
  });

  it('shows no price notice on the billing page to a persona without billing.view', async () => {
    await renderRoute('/client/billing', 'client', {
      actor: asDaniel,
      prepare: prep,
    });
    await screen.findByRole('alert');
    expect(screen.queryByTestId('price-notice')).toBeNull();
  });
});

describe('C28 price notice on the calendar', () => {
  it('shows a priceChange entry for the effective date to a billing.view holder', async () => {
    await renderRoute('/client/calendar', 'client', { prepare: prep });
    await screen.findByRole('heading', { level: 1, name: 'Calendar' });
    await waitFor(() => {
      expect(items().some((li) => li.getAttribute('data-kind') === 'priceChange')).toBe(true);
    });
    const li = items().find((x) => x.getAttribute('data-kind') === 'priceChange')!;
    expect(li.textContent).toContain(t('client.priceNotice.title'));
  });

  it('shows no priceChange entry to a persona without billing.view', async () => {
    await renderRoute('/client/calendar', 'client', {
      actor: asDaniel,
      prepare: prep,
    });
    await screen.findByRole('heading', { level: 1, name: 'Calendar' });
    await waitFor(() => {
      expect(items().length).toBeGreaterThan(0);
    });
    expect(items().some((li) => li.getAttribute('data-kind') === 'priceChange')).toBe(false);
  });
});
