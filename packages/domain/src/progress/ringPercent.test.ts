// F-4: the Home ring fills with the share of things that are done, and only reaches 100 when nothing is left to do.
import { describe, expect, it } from 'vitest';
import { staffRingPercent, type StaffRow } from './staff';
import { requirement } from './testFixtures';

const row = (status: StaffRow['status']): StaffRow => ({ requirement: requirement('R'), status });

describe('staffRingPercent', () => {
  it('is 100 when complete', () => {
    expect(staffRingPercent({ rows: [row('current')], toDo: 0, complete: true })).toBe(100);
  });
  it('is the share of rows that need no action', () => {
    expect(
      staffRingPercent({
        rows: [row('current'), row('current'), row('current'), row('overdue')],
        toDo: 1,
        complete: false,
      }),
    ).toBe(75);
  });
  it('counts open assignments that are not tied to a row', () => {
    expect(staffRingPercent({ rows: [row('current')], toDo: 1, complete: false })).toBe(50);
  });
  it('never shows 100 while something is left, and handles an empty list', () => {
    expect(
      staffRingPercent({
        rows: Array.from({ length: 300 }, () => row('current')).concat([row('overdue')]),
        toDo: 1,
        complete: false,
      }),
    ).toBe(99);
    expect(staffRingPercent({ rows: [], toDo: 0, complete: false })).toBe(0);
  });
});
