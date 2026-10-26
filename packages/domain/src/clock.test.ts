// BP-5 (pure part): the injected clock and Fast-forward offset. Brief 9 / build pack 4.2.
import { describe, expect, it } from 'vitest';
import { fixedClock, nowIso, offsetClock, systemClock, type Clock } from './clock';

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = '2026-10-19T09:00:00.000Z';

describe('fixedClock', () => {
  it('always returns the instant it was built with', () => {
    const clock = fixedClock(TODAY);
    expect(clock.now().toISOString()).toBe(TODAY);
    expect(clock.now().toISOString()).toBe(TODAY);
  });

  it('accepts an ISO string without milliseconds', () => {
    expect(fixedClock('2026-10-19T09:00:00Z').now().toISOString()).toBe(TODAY);
  });

  it('returns a fresh Date each call so callers cannot move the clock by mutating it', () => {
    const clock = fixedClock(TODAY);
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe(TODAY);
  });
});

describe('offsetClock', () => {
  it('adds a positive offset (fast-forward 30 days)', () => {
    const clock = offsetClock(fixedClock(TODAY), 30 * DAY_MS);
    expect(clock.now().toISOString()).toBe('2026-11-18T09:00:00.000Z');
  });

  it('removes the offset when the offset is zero (Back to today)', () => {
    const clock = offsetClock(fixedClock(TODAY), 0);
    expect(clock.now().toISOString()).toBe(TODAY);
  });

  it('supports a negative offset', () => {
    const clock = offsetClock(fixedClock(TODAY), -DAY_MS);
    expect(clock.now().toISOString()).toBe('2026-10-18T09:00:00.000Z');
  });

  it('follows the base clock as it moves', () => {
    let current = new Date(TODAY);
    const base: Clock = { now: () => new Date(current.getTime()) };
    const clock = offsetClock(base, DAY_MS);
    expect(clock.now().toISOString()).toBe('2026-10-20T09:00:00.000Z');
    current = new Date('2026-10-19T10:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });

  it('does not change the base clock', () => {
    const base = fixedClock(TODAY);
    offsetClock(base, 7 * DAY_MS);
    expect(base.now().toISOString()).toBe(TODAY);
  });
});

describe('nowIso', () => {
  it('formats as ISO 8601 UTC with milliseconds and a Z suffix', () => {
    expect(nowIso(fixedClock('2026-10-19T09:00:00Z'))).toBe('2026-10-19T09:00:00.000Z');
  });

  it('uses UTC even when London is on BST', () => {
    // 2026-07-01 10:00 in London is 09:00 UTC.
    expect(nowIso(fixedClock('2026-07-01T09:00:00Z'))).toBe('2026-07-01T09:00:00.000Z');
  });

  it('reflects an offset clock', () => {
    expect(nowIso(offsetClock(fixedClock(TODAY), 12 * DAY_MS))).toBe('2026-10-31T09:00:00.000Z');
  });
});

describe('systemClock', () => {
  it('exposes now() returning a valid Date', () => {
    const value = systemClock.now();
    expect(value).toBeInstanceOf(Date);
    expect(Number.isNaN(value.getTime())).toBe(false);
  });
});
