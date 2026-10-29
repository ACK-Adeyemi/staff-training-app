import { describe, expect, it } from 'vitest';
import type { PriceAdjustment } from '../schemas/m4';
import {
  cancelAdjustment,
  confirmAdjustment,
  effectiveDateFor,
  invoiceLinesFor,
  previewAdjustment,
  priceFor,
  replacedBy,
  supersede,
  submitAdjustment,
} from './index';

const AT = '2026-11-15T12:00:00.000Z';
const CONFIRMED = '2026-11-01T09:30:00.000Z';

function adj(over: Partial<PriceAdjustment> = {}): PriceAdjustment {
  return {
    id: 'adj-1',
    clientIds: ['client-1'],
    scope: { kind: 'plan' },
    type: 'percent',
    value: -10,
    reason: 'loyalty',
    noticeDays: 30,
    status: 'draft',
    createdBy: 'user-1',
    ...over,
  };
}

describe('adjustment lifecycle', () => {
  it('submits a draft', () => {
    expect(submitAdjustment(adj()).status).toBe('submitted');
  });

  it('refuses to submit anything that is not a draft', () => {
    for (const status of ['submitted', 'scheduled', 'active', 'ended', 'cancelled'] as const)
      expect(() => submitAdjustment(adj({ status }))).toThrow();
  });

  it('schedules on confirmation with confirmer, time and effective date after notice', () => {
    const out = confirmAdjustment(adj({ status: 'submitted' }), { confirmerId: 'user-2', confirmedAt: CONFIRMED });
    expect(out.status).toBe('scheduled');
    expect(out.confirmedBy).toBe('user-2');
    expect(out.confirmedAt).toBe(CONFIRMED);
    expect(out.effectiveAt).toBe(effectiveDateFor(CONFIRMED, 30));
  });

  it('goes straight to active when notice is zero days', () => {
    const out = confirmAdjustment(adj({ status: 'submitted', noticeDays: 0 }), {
      confirmerId: 'user-2',
      confirmedAt: CONFIRMED,
    });
    expect(out.status).toBe('active');
    expect(out.effectiveAt).toBe(CONFIRMED);
  });

  it('refuses to confirm a draft, or with an empty confirmer', () => {
    expect(() => confirmAdjustment(adj(), { confirmerId: 'user-2', confirmedAt: CONFIRMED })).toThrow();
    expect(() =>
      confirmAdjustment(adj({ status: 'submitted' }), { confirmerId: '', confirmedAt: CONFIRMED }),
    ).toThrow();
  });

  it('cancels from draft, submitted or scheduled', () => {
    for (const status of ['draft', 'submitted', 'scheduled'] as const)
      expect(cancelAdjustment(adj({ status })).status).toBe('cancelled');
  });

  it('refuses to cancel an active, ended or cancelled change', () => {
    for (const status of ['active', 'ended', 'cancelled'] as const)
      expect(() => cancelAdjustment(adj({ status }))).toThrow();
  });
});

describe('replacedBy', () => {
  const incoming = adj({ id: 'new', status: 'submitted' });

  it('finds active and scheduled changes with the same client, scope item and type', () => {
    const a = adj({ id: 'a', status: 'active' });
    const b = adj({ id: 'b', status: 'scheduled', clientIds: ['client-1', 'client-9'] });
    expect(replacedBy([a, b], incoming).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('ignores other types, other add-ons, other clients and inactive changes', () => {
    const addOnIncoming = adj({ id: 'n2', scope: { kind: 'addOn', addOnId: 'x' } });
    const others = [
      adj({ id: 'type', status: 'active', type: 'override', value: 100 }),
      adj({ id: 'scope', status: 'active', scope: { kind: 'addOn', addOnId: 'y' } }),
      adj({ id: 'client', status: 'active', clientIds: ['client-2'] }),
      adj({ id: 'ended', status: 'ended' }),
      adj({ id: 'draft', status: 'draft' }),
    ];
    expect(replacedBy(others, incoming)).toEqual([]);
    expect(
      replacedBy([adj({ id: 'same', status: 'active', scope: { kind: 'addOn', addOnId: 'x' } })], addOnIncoming),
    ).toHaveLength(1);
  });
});

describe('previewAdjustment', () => {
  const clients = [
    { clientId: 'client-1', listPrice: 10000 },
    { clientId: 'client-2', listPrice: 20000 },
  ];

  it('shows current price, new price and monthly effect per client, matching priceFor once effective', () => {
    const a = adj({ clientIds: ['client-1', 'client-2'], status: 'submitted', value: -10 });
    const { rows, warnings } = previewAdjustment({ clients, adjustment: a, at: AT });
    expect(rows.map((r) => [r.clientId, r.currentPrice, r.newPrice, r.monthlyEffect])).toEqual([
      ['client-1', 10000, 9000, -1000],
      ['client-2', 20000, 18000, -2000],
    ]);
    const effective = { ...a, status: 'active' as const, effectiveAt: AT, confirmedBy: 'u2' };
    expect(rows[0]?.newPrice).toBe(priceFor({ listPrice: 10000, scope: a.scope, adjustments: [effective], at: AT }));
    expect(warnings).toEqual([]);
  });

  it('dates the change after the notice period', () => {
    const { rows } = previewAdjustment({ clients, adjustment: adj({ status: 'submitted' }), at: AT });
    expect(rows[0]?.effectiveAt).toBe(effectiveDateFor(AT, 30));
  });

  it('warns about a percentage increase over 20 but not exactly 20', () => {
    const over = previewAdjustment({ clients, adjustment: adj({ value: 21 }), at: AT });
    expect(over.warnings).toContain('increaseOver20');
    const exact = previewAdjustment({ clients, adjustment: adj({ value: 20 }), at: AT });
    expect(exact.warnings).not.toContain('increaseOver20');
  });

  it('warns when a new price falls below the floor', () => {
    const a = adj({ type: 'override', value: 4000 });
    expect(previewAdjustment({ clients, adjustment: a, at: AT, floorPence: 5000 }).warnings).toContain('belowFloor');
    expect(previewAdjustment({ clients, adjustment: a, at: AT, floorPence: 4000 }).warnings).not.toContain(
      'belowFloor',
    );
  });
});

describe('invoiceLinesFor', () => {
  it('keeps the list price line and adds a separate adjustment line with reason and percentage', () => {
    const a = adj({ status: 'active', effectiveAt: '2026-11-01T00:00:00.000Z', confirmedBy: 'u2', reason: 'loyalty' });
    const lines = invoiceLinesFor({ listPrice: 10000, adjustments: [a], at: AT, label: 'Standard plan' });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ label: 'Standard plan', amount: 10000 });
    expect(lines[1]?.amount).toBe(-1000);
    expect(lines[1]?.adjustment).toEqual({ reason: 'loyalty', direction: 'discount', type: 'percent', value: -10 });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    expect(total).toBe(priceFor({ listPrice: 10000, scope: a.scope, adjustments: [a], at: AT }));
  });

  it('returns one line when no change applies yet', () => {
    const a = adj({ status: 'scheduled', effectiveAt: '2026-12-01T00:00:00.000Z', confirmedBy: 'u2' });
    expect(invoiceLinesFor({ listPrice: 10000, adjustments: [a], at: AT, label: 'Standard plan' })).toEqual([
      { label: 'Standard plan', amount: 10000 },
    ]);
  });
});

describe('supersede', () => {
  const old = adj({
    id: 'old',
    status: 'active',
    effectiveAt: '2026-10-01T00:00:00.000Z',
    confirmedBy: 'u2',
    clientIds: ['client-1', 'client-2'],
    value: -20,
  });
  const incoming = adj({
    id: 'new',
    status: 'scheduled',
    effectiveAt: '2026-12-01T00:00:00.000Z',
    confirmedBy: 'u2',
    value: -5,
  });
  let n = 0;
  const newId = () => `copy-${String(++n)}`;

  it('ends a fully replaced change at the new effective date, so the old price holds during notice', () => {
    const only = { ...old, clientIds: ['client-1'] };
    const { updates, replacedIds } = supersede([only], incoming, newId);
    expect(replacedIds).toEqual(['old']);
    expect(updates).toEqual([{ ...only, endsAt: incoming.effectiveAt }]);
    const price = (at: string) =>
      priceFor({ listPrice: 10000, scope: only.scope, adjustments: [...updates, incoming], at });
    expect(price('2026-11-15T00:00:00.000Z')).toBe(8000);
    expect(price('2026-12-01T00:00:00.000Z')).toBe(9500);
  });

  it('with partial client overlap, the other clients stay on the old change and the overlap ends at the switch', () => {
    const { updates } = supersede([old], incoming, newId);
    const kept = updates.find((u) => u.id === 'old');
    const copy = updates.find((u) => u.id !== 'old');
    expect(kept).toMatchObject({ clientIds: ['client-2'] });
    expect(kept?.endsAt).toBeUndefined();
    expect(copy).toMatchObject({ clientIds: ['client-1'], endsAt: incoming.effectiveAt, value: -20 });
  });

  it('a change that has not started yet and would start later never applies', () => {
    const later = {
      ...old,
      clientIds: ['client-1'],
      status: 'scheduled' as const,
      effectiveAt: '2026-12-15T00:00:00.000Z',
    };
    expect(supersede([later], incoming, newId).updates).toEqual([{ ...later, status: 'ended' }]);
  });

  it('leaves a change that already ends before the switch alone', () => {
    const ending = { ...old, clientIds: ['client-1'], endsAt: '2026-11-20T00:00:00.000Z' };
    expect(supersede([ending], incoming, newId)).toEqual({ updates: [], replacedIds: [] });
  });
});

describe('confirming with an end date', () => {
  it('refuses an end date on or before the effective date', () => {
    expect(() =>
      confirmAdjustment(adj({ status: 'submitted', endsAt: '2026-11-20T00:00:00.000Z' }), {
        confirmerId: 'u2',
        confirmedAt: CONFIRMED,
      }),
    ).toThrow();
  });
});
