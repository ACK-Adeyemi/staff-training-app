import { describe, expect, it } from 'vitest';
import type { PriceAdjustment } from '../schemas/m4';
import { DEFAULT_NOTICE_DAYS, effectiveDateFor, priceFor } from './index';

const AT = '2026-11-15T12:00:00.000Z';
const PLAN = { kind: 'plan' } as const;

function adj(over: Partial<PriceAdjustment> & Pick<PriceAdjustment, 'type' | 'value'>): PriceAdjustment {
  return {
    id: 'adj-1',
    clientIds: ['client-1'],
    scope: { kind: 'plan' },
    reason: 'loyalty',
    noticeDays: 30,
    effectiveAt: '2026-11-01T00:00:00.000Z',
    status: 'active',
    createdBy: 'user-1',
    confirmedBy: 'user-2',
    confirmedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

describe('priceFor', () => {
  it('returns the list price when there are no adjustments', () => {
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [], at: AT })).toBe(10000);
  });

  it('applies an override in place of the list price', () => {
    const a = adj({ type: 'override', value: 8000 });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(8000);
  });

  it('applies the override first and the percentage second, whatever the array order', () => {
    const o = adj({ id: 'o', type: 'override', value: 8000 });
    const p = adj({ id: 'p', type: 'percent', value: -10 });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [p, o], at: AT })).toBe(7200);
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [o, p], at: AT })).toBe(7200);
  });

  it('applies a percentage increase to the list price', () => {
    const p = adj({ type: 'percent', value: 5 });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [p], at: AT })).toBe(10500);
  });

  it('never goes below zero', () => {
    const p = adj({ type: 'percent', value: -100 });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [p], at: AT })).toBe(0);
    const o = adj({ type: 'override', value: 0 });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [o], at: AT })).toBe(0);
  });

  it('rounds to the nearest penny', () => {
    const p = adj({ type: 'percent', value: -10 });
    // 1005 * 0.9 = 904.5 -> 905
    expect(priceFor({ listPrice: 1005, scope: PLAN, adjustments: [p], at: AT })).toBe(905);
    // 999 * 0.9 = 899.1 -> 899
    expect(priceFor({ listPrice: 999, scope: PLAN, adjustments: [p], at: AT })).toBe(899);
    const r = priceFor({ listPrice: 999, scope: PLAN, adjustments: [p], at: AT });
    expect(Number.isInteger(r)).toBe(true);
  });

  it('does not apply a scheduled change before its effective date', () => {
    const a = adj({ type: 'percent', value: -10, status: 'scheduled', effectiveAt: '2026-12-01T00:00:00.000Z' });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(10000);
  });

  it('applies a scheduled change from its effective date exactly', () => {
    const a = adj({ type: 'percent', value: -10, status: 'scheduled', effectiveAt: AT });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(9000);
  });

  it('applies a scheduled change once its effective date has passed', () => {
    const a = adj({ type: 'percent', value: -10, status: 'scheduled', effectiveAt: '2026-11-10T00:00:00.000Z' });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(9000);
  });

  it('applies an active change before its end date', () => {
    const a = adj({ type: 'percent', value: -10, endsAt: '2026-12-01T00:00:00.000Z' });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(9000);
  });

  it('returns the list price at and after the end date', () => {
    const a = adj({ type: 'percent', value: -10, endsAt: AT });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(10000);
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: '2027-01-01T00:00:00.000Z' })).toBe(10000);
  });

  it('returns the list price when a cancelled change would otherwise apply', () => {
    const a = adj({ type: 'override', value: 5000, status: 'cancelled' });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(10000);
  });

  it('ignores ended changes', () => {
    const a = adj({ type: 'override', value: 5000, status: 'ended', endsAt: '2026-11-10T00:00:00.000Z' });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(10000);
  });

  it.each(['draft', 'submitted'] as const)('ignores %s changes', (status) => {
    const a = adj({ type: 'override', value: 5000, status, effectiveAt: undefined, confirmedBy: undefined });
    expect(priceFor({ listPrice: 10000, scope: PLAN, adjustments: [a], at: AT })).toBe(10000);
  });

  it('only applies an add-on change to that add-on', () => {
    const a = adj({ type: 'percent', value: -50, scope: { kind: 'addOn', addOnId: 'addon-1' } });
    expect(priceFor({ listPrice: 2000, scope: { kind: 'addOn', addOnId: 'addon-1' }, adjustments: [a], at: AT })).toBe(
      1000,
    );
    expect(priceFor({ listPrice: 2000, scope: { kind: 'addOn', addOnId: 'addon-2' }, adjustments: [a], at: AT })).toBe(
      2000,
    );
    expect(priceFor({ listPrice: 2000, scope: PLAN, adjustments: [a], at: AT })).toBe(2000);
  });

  it('does not apply a plan change to an add-on', () => {
    const a = adj({ type: 'override', value: 100 });
    expect(priceFor({ listPrice: 2000, scope: { kind: 'addOn', addOnId: 'addon-1' }, adjustments: [a], at: AT })).toBe(
      2000,
    );
  });
});

describe('notice period', () => {
  it('defaults to 30 days', () => {
    expect(DEFAULT_NOTICE_DAYS).toBe(30);
  });

  it('adds the notice days to the confirmation date', () => {
    expect(effectiveDateFor('2026-11-01T09:30:00.000Z', 30)).toBe('2026-12-01T09:30:00.000Z');
    expect(effectiveDateFor('2026-11-01T09:30:00.000Z', 7)).toBe('2026-11-08T09:30:00.000Z');
  });

  it('applies at once with 0 days', () => {
    expect(effectiveDateFor('2026-11-01T09:30:00.000Z', 0)).toBe('2026-11-01T09:30:00.000Z');
  });

  it('carries across a year end', () => {
    expect(effectiveDateFor('2026-12-15T00:00:00.000Z', 30)).toBe('2027-01-14T00:00:00.000Z');
  });
});
