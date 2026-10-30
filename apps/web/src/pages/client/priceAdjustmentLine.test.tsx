// Brief 23.11: the plan card shows the list price, a separate discount or increase line with its reason, and what is paid.
// Text comes from the en-GB language file; the data layer returns reason codes only.
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { formatPounds } from '../../demo/format';
import { renderRoute, t, TODAY } from '../../test/harness';

afterEach(cleanup);

const need = <T,>(v: T | undefined): T => {
  if (v === undefined) throw new Error('missing');
  return v;
};
const provider = (keys: SeedKeys, user: string): ActorContext => ({
  userId: need(keys.users[user]),
  side: 'provider',
  now: TODAY,
});

/** A confirmed change with no notice, so it applies now. */
const confirmNow = async (
  { handle, keys }: { handle: { store: import('@sta/data').DataStore }; keys: SeedKeys },
  value: number,
) => {
  const d = await handle.store.pricing.draft(provider(keys, 'raj'), {
    clientIds: [need(keys.clients['littleAcorns'])],
    scope: { kind: 'plan' },
    type: 'percent',
    value,
    reason: 'loyalty',
    noticeDays: 0,
  });
  await handle.store.pricing.submit(provider(keys, 'raj'), d.id);
  await handle.store.pricing.confirm(provider(keys, 'providerOwner'), d.id, '123456');
};

describe('C19 plan card price adjustment line', () => {
  it('shows the list price, a separate discount line with the reason and the price paid', async () => {
    await renderRoute('/client/billing', 'client', { prepare: (c) => confirmNow(c, -10) });
    const block = await screen.findByTestId('adjusted-price');
    const line = within(block).getByTestId('adjustment-line').textContent;
    expect(line).toContain(t('billing.adjustment.reason.loyalty'));
    expect(line).toContain(t('billing.adjustment.minus', { size: '10' }));
    expect(line).toMatch(/-£/);
    const list = /List price: (£[\d,.]+) a month/.exec(block.textContent);
    const paid = /Your price: (£[\d,.]+) a month/.exec(block.textContent);
    expect(list).not.toBeNull();
    expect(paid).not.toBeNull();
    const pence = (s: string) => Math.round(Number(s.replace(/[£,]/g, '')) * 100);
    expect(pence(paid![1]!)).toBe(Math.round((pence(list![1]!) * 90) / 100));
    expect(formatPounds(pence(paid![1]!))).toBe(paid![1]);
  });

  it('words an increase as an increase', async () => {
    await renderRoute('/client/billing', 'client', { prepare: (c) => confirmNow(c, 7) });
    const line = (await screen.findByTestId('adjustment-line')).textContent;
    expect(line).toContain(t('billing.adjustment.plus', { size: '7' }));
    expect(line).toContain('increase');
    expect(line).toMatch(/\+£/);
  });

  it('shows only the plain price when no change applies', async () => {
    await renderRoute('/client/billing', 'client');
    await screen.findByRole('region', { name: t('billing.plan') });
    expect(screen.queryByTestId('adjusted-price')).toBeNull();
  });
});
