// Stored limited, readOnly and closed states: stateSince is the start of that state (docs/decisions.md).
// The dunning day is the first day of the stored state plus the London days since stateSince.
import { describe, expect, it } from 'vitest';
import { addDays, startOfLondonDay } from './dates';
import type { DunningPolicy, Subscription } from './schemas/commercial';
import { accountStateAt, nextTransition } from './accountState';

const policy: DunningPolicy = {
  graceDays: 14,
  limitedUntilDay: 30,
  readOnlyUntilDay: 60,
  closedUntilDay: 150,
  deleteWithinDays: 30,
};
const SINCE = '2026-03-02T12:00:00.000Z';
const sub = (state: Subscription['state']): Subscription => ({
  clientId: '00000000000000000000CLIENT1'.slice(-26),
  packageId: '000000000000000000000PKG10'.slice(-26),
  period: 'monthly',
  renewalAt: '2027-03-02T12:00:00.000Z',
  state,
  stateSince: SINCE,
  billingContact: 'billing@example.test',
});
const day = (n: number) => addDays(new Date(SINCE), n);

describe('stored state starts at stateSince', () => {
  it('limited: still limited through day 15 of the state, read-only after', () => {
    // Limited runs from dunning day 15 to 30, so 16 days (0..15 since start).
    expect(accountStateAt(sub('limited'), [], policy, day(0))).toBe('limited');
    expect(accountStateAt(sub('limited'), [], policy, day(15))).toBe('limited');
    expect(accountStateAt(sub('limited'), [], policy, day(16))).toBe('readOnly');
  });

  it('readOnly: read-only for 30 days then closed', () => {
    expect(accountStateAt(sub('readOnly'), [], policy, day(0))).toBe('readOnly');
    expect(accountStateAt(sub('readOnly'), [], policy, day(29))).toBe('readOnly');
    expect(accountStateAt(sub('readOnly'), [], policy, day(30))).toBe('closed');
  });

  it('closed: closed for 90 days then deleted', () => {
    expect(accountStateAt(sub('closed'), [], policy, day(0))).toBe('closed');
    expect(accountStateAt(sub('closed'), [], policy, day(89))).toBe('closed');
    expect(accountStateAt(sub('closed'), [], policy, day(90))).toBe('deleted');
  });

  it('nextTransition from a stored limited state lands on the same boundary', () => {
    const next = nextTransition(sub('limited'), policy, day(2));
    expect(next?.state).toBe('readOnly');
    expect(next?.at.getTime()).toBe(startOfLondonDay(day(16)).getTime());
  });

  it('a stored past due state still treats stateSince as day 0', () => {
    expect(accountStateAt(sub('pastDue'), [], policy, day(14))).toBe('pastDue');
    expect(accountStateAt(sub('pastDue'), [], policy, day(15))).toBe('limited');
  });
});
