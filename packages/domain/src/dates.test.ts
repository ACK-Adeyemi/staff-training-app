// London-aware date helpers. The BST to GMT change in 2026 is on Sunday 25 October at 01:00 UTC.
// Conventions the implementation must follow (chosen where the plan left them open):
//  - addDays/addMonths move by London calendar days/months and keep the London wall-clock time.
//    Months clamp to the end of a shorter month (31 Jan + 1 month = 28 Feb).
//  - daysBetween(from, to) = London calendar date of `to` minus London calendar date of `from`
//    (signed integer). Time of day is ignored.
//  - startOfLondonDay and mondayOfWeek return a Date at 00:00 London time.
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, londonDateString, mondayOfWeek, startOfLondonDay } from './dates';

const d = (iso: string): Date => new Date(iso);
const iso = (date: Date): string => date.toISOString();

describe('addDays', () => {
  it.each([
    // [start, days, expected]
    ['2026-10-19T09:00:00.000Z', 0, '2026-10-19T09:00:00.000Z'],
    ['2026-10-19T09:00:00.000Z', 1, '2026-10-20T09:00:00.000Z'],
    ['2026-10-19T09:00:00.000Z', 30, '2026-11-18T10:00:00.000Z'], // 10:00 BST becomes 10:00 GMT
    ['2026-10-24T09:00:00.000Z', 1, '2026-10-25T10:00:00.000Z'], // across the change: same London 10:00
    ['2026-10-24T09:00:00.000Z', 2, '2026-10-26T10:00:00.000Z'],
    ['2026-10-26T10:00:00.000Z', -2, '2026-10-24T09:00:00.000Z'], // backwards over the change
    ['2026-10-19T09:00:00.000Z', -19, '2026-09-30T09:00:00.000Z'],
    ['2026-03-28T12:00:00.000Z', 2, '2026-03-30T11:00:00.000Z'], // GMT to BST (29 March 2026)
  ] as const)('addDays(%s, %i) is %s', (start, days, expected) => {
    expect(iso(addDays(d(start), days))).toBe(expected);
  });

  it('does not mutate its input', () => {
    const start = d('2026-10-19T09:00:00.000Z');
    addDays(start, 5);
    expect(iso(start)).toBe('2026-10-19T09:00:00.000Z');
  });
});

describe('addMonths', () => {
  it.each([
    ['2026-10-19T09:00:00.000Z', 1, '2026-11-19T10:00:00.000Z'], // 10:00 BST becomes 10:00 GMT
    ['2026-10-19T09:00:00.000Z', -2, '2026-08-19T09:00:00.000Z'],
    ['2026-01-31T12:00:00.000Z', 1, '2026-02-28T12:00:00.000Z'], // clamps to the shorter month
    ['2028-01-31T12:00:00.000Z', 1, '2028-02-29T12:00:00.000Z'], // leap year
    ['2026-10-19T09:00:00.000Z', 24, '2028-10-19T09:00:00.000Z'], // safeguarding renewal period
    ['2026-10-19T09:00:00.000Z', 36, '2029-10-19T09:00:00.000Z'], // first aid renewal period
    ['2026-12-15T12:00:00.000Z', 1, '2027-01-15T12:00:00.000Z'], // year rollover
    ['2026-10-19T09:00:00.000Z', 0, '2026-10-19T09:00:00.000Z'],
  ] as const)('addMonths(%s, %i) is %s', (start, months, expected) => {
    expect(iso(addMonths(d(start), months))).toBe(expected);
  });

  it('does not mutate its input', () => {
    const start = d('2026-10-19T09:00:00.000Z');
    addMonths(start, 3);
    expect(iso(start)).toBe('2026-10-19T09:00:00.000Z');
  });
});

describe('daysBetween', () => {
  it('is 0 for the same instant', () => {
    expect(daysBetween(d('2026-10-19T09:00:00Z'), d('2026-10-19T09:00:00Z'))).toBe(0);
  });

  it('is 0 for two times on the same London day', () => {
    expect(daysBetween(d('2026-10-18T23:00:00Z'), d('2026-10-19T22:59:00Z'))).toBe(0);
  });

  it('counts London midnight, not UTC midnight, as the boundary in BST', () => {
    // 22:59Z is 23:59 BST on 19 Oct; 23:00Z is 00:00 BST on 20 Oct.
    expect(daysBetween(d('2026-10-19T22:59:00Z'), d('2026-10-19T23:00:00Z'))).toBe(1);
  });

  it('counts London midnight in GMT too', () => {
    expect(daysBetween(d('2026-11-19T23:59:00Z'), d('2026-11-20T00:00:00Z'))).toBe(1);
  });

  it('counts 2 days across the 25-hour day when the clocks go back', () => {
    // Only 47 hours pass, but the London dates are 24 Oct and 26 Oct.
    expect(daysBetween(d('2026-10-24T09:00:00Z'), d('2026-10-26T09:00:00Z'))).toBe(2);
  });

  it('is 12 for the "expires in 12 days" case at 23:59 London', () => {
    // 31 Oct 2026 23:59 London (GMT) = 23:59Z; today 19 Oct 09:00Z.
    expect(daysBetween(d('2026-10-19T09:00:00Z'), d('2026-10-31T23:59:00Z'))).toBe(12);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween(d('2026-10-20T09:00:00Z'), d('2026-10-19T09:00:00Z'))).toBe(-1);
  });

  it('is 30 for a fast-forward of 30 days', () => {
    expect(daysBetween(d('2026-10-19T09:00:00Z'), d('2026-11-18T09:00:00Z'))).toBe(30);
  });
});

describe('startOfLondonDay', () => {
  it.each([
    // [input, expected start]
    ['2026-10-19T09:00:00.000Z', '2026-10-18T23:00:00.000Z'], // BST
    ['2026-07-15T23:30:00.000Z', '2026-07-15T23:00:00.000Z'], // 00:30 BST on the 16th
    ['2026-07-15T22:59:59.999Z', '2026-07-14T23:00:00.000Z'], // 23:59:59.999 BST on the 15th
    ['2026-07-15T23:00:00.000Z', '2026-07-15T23:00:00.000Z'], // exactly midnight BST
    ['2026-01-15T23:30:00.000Z', '2026-01-15T00:00:00.000Z'], // GMT, near midnight UTC
    ['2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z'], // exactly midnight GMT
    ['2026-10-25T12:00:00.000Z', '2026-10-24T23:00:00.000Z'], // the 25-hour day starts in BST
    ['2026-10-25T00:30:00.000Z', '2026-10-24T23:00:00.000Z'], // 01:30 BST, first pass
    ['2026-10-25T01:30:00.000Z', '2026-10-24T23:00:00.000Z'], // 01:30 GMT, second pass of the hour
    ['2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z'], // first midnight in GMT
    ['2026-03-29T12:00:00.000Z', '2026-03-29T00:00:00.000Z'], // the 23-hour day starts in GMT
  ] as const)('startOfLondonDay(%s) is %s', (input, expected) => {
    expect(iso(startOfLondonDay(d(input)))).toBe(expected);
  });

  it('is idempotent', () => {
    const once = startOfLondonDay(d('2026-10-19T09:00:00Z'));
    expect(iso(startOfLondonDay(once))).toBe(iso(once));
  });
});

describe('mondayOfWeek', () => {
  // Monday 19 October 2026 (BST) is the start of the week; Sunday 25 October is its last day.
  it.each([
    ['Monday', '2026-10-19T09:00:00.000Z'],
    ['Tuesday', '2026-10-20T09:00:00.000Z'],
    ['Wednesday', '2026-10-21T09:00:00.000Z'],
    ['Thursday', '2026-10-22T09:00:00.000Z'],
    ['Friday', '2026-10-23T09:00:00.000Z'],
    ['Saturday', '2026-10-24T09:00:00.000Z'],
    ['Sunday (the day the clocks go back)', '2026-10-25T12:00:00.000Z'],
  ])('%s of that week gives Monday 19 October at London midnight', (_day, input) => {
    expect(iso(mondayOfWeek(d(input)))).toBe('2026-10-18T23:00:00.000Z');
  });

  it('keeps late Sunday night London time in the same week', () => {
    expect(iso(mondayOfWeek(d('2026-10-25T23:30:00Z')))).toBe('2026-10-18T23:00:00.000Z');
  });

  it('moves to the next week at London midnight, not UTC midnight', () => {
    // 2026-10-18T23:30Z is 00:30 BST on Monday 19 October.
    expect(iso(mondayOfWeek(d('2026-10-18T23:30:00Z')))).toBe('2026-10-18T23:00:00.000Z');
    // 2026-10-18T22:30Z is 23:30 BST on Sunday 18 October: previous week (Monday 12 October).
    expect(iso(mondayOfWeek(d('2026-10-18T22:30:00Z')))).toBe('2026-10-11T23:00:00.000Z');
  });

  it('returns GMT midnight for a Monday after the clocks change', () => {
    expect(iso(mondayOfWeek(d('2026-10-28T09:00:00Z')))).toBe('2026-10-26T00:00:00.000Z');
  });

  it('gives the cluster week Monday for today + 14 days', () => {
    // seed rule: cluster week = mondayOfWeek(today + 14 days); today is 19 Oct 2026.
    const clusterMonday = mondayOfWeek(addDays(d('2026-10-19T09:00:00Z'), 14));
    expect(iso(clusterMonday)).toBe('2026-11-02T00:00:00.000Z');
  });

  it('takes an explicit time zone as a second argument', () => {
    // In New York (EDT, UTC-4) 2026-10-19T02:00Z is still Sunday 18 October: Monday is 12 October 00:00 EDT.
    expect(iso(mondayOfWeek(d('2026-10-19T02:00:00Z'), 'America/New_York'))).toBe('2026-10-12T04:00:00.000Z');
  });

  it('defaults to Europe/London', () => {
    const date = d('2026-10-19T02:00:00Z');
    expect(iso(mondayOfWeek(date))).toBe(iso(mondayOfWeek(date, 'Europe/London')));
  });
});

describe('londonDateString', () => {
  it('gives the London calendar day, not the UTC day', () => {
    expect(londonDateString(d('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
    expect(londonDateString(d('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
    expect(londonDateString(d('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });
});
