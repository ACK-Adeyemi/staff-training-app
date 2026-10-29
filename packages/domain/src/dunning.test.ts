import { describe, expect, it } from 'vitest';
import { daysUntil, recoveryRatePercent } from './dunning';
import { accountStateAt, nextTransition } from './accountState';
import { defaultDunningPolicy } from './index';
import type { PaymentAttempt, Subscription } from './schemas/commercial';

const att = (clientId: string, at: string, result: PaymentAttempt['result']): PaymentAttempt => ({
  id: `a-${clientId}-${at}`,
  clientId,
  invoiceId: 'i',
  at,
  result,
});

describe('recoveryRatePercent', () => {
  it('is null when nothing failed', () => {
    expect(recoveryRatePercent([att('a', '2026-01-01T00:00:00.000Z', 'success')])).toBeNull();
  });
  it('counts clients with a success after their first failure', () => {
    const list = [
      att('a', '2026-01-01T00:00:00.000Z', 'softDecline'),
      att('a', '2026-01-03T00:00:00.000Z', 'success'),
      att('b', '2026-01-01T00:00:00.000Z', 'hardDecline'),
      att('c', '2026-01-05T00:00:00.000Z', 'success'),
      att('c', '2026-01-02T00:00:00.000Z', 'hardDecline'),
    ];
    expect(recoveryRatePercent(list)).toBe(67);
  });
  it('ignores a success before the failure', () => {
    const list = [att('a', '2026-01-01T00:00:00.000Z', 'success'), att('a', '2026-01-02T00:00:00.000Z', 'hardDecline')];
    expect(recoveryRatePercent(list)).toBe(0);
  });
});

describe('daysUntil', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysUntil(new Date('2026-03-01T00:00:00Z'), new Date('2026-03-16T00:00:00Z'))).toBe(15);
    expect(daysUntil(new Date('2026-03-16T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))).toBe(0);
  });
});

describe('grace extension on a Limited account', () => {
  const sub = {
    clientId: 'c',
    packageId: 'p',
    state: 'limited',
    stateSince: '2026-03-01T00:00:00.000Z',
    billingContact: 'x@example.test',
  } as Subscription;
  const now = new Date('2026-03-02T12:00:00Z');
  it('delays the move to Read-only', () => {
    const plain = nextTransition(sub, defaultDunningPolicy, now)!;
    expect(plain.state).toBe('readOnly');
    const ext = new Date(plain.at.getTime() + 7 * 86_400_000);
    const extended = { ...sub, graceExtendedUntil: ext.toISOString() };
    expect(nextTransition(extended, defaultDunningPolicy, now)).toEqual({ state: 'readOnly', at: ext });
    expect(accountStateAt(sub, [], defaultDunningPolicy, new Date(plain.at.getTime() + 86_400_000))).toBe('readOnly');
    expect(accountStateAt(extended, [], defaultDunningPolicy, new Date(plain.at.getTime() + 86_400_000))).toBe(
      'limited',
    );
    expect(accountStateAt(extended, [], defaultDunningPolicy, new Date(ext.getTime() + 86_400_000))).toBe('readOnly');
  });
});
