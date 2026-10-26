// BP-13: expiry clusters by requirement and London week (plan M3 assumptions 31 and 34; brief 28.3).
//
// API under test (calendar/clusters.ts), pure:
//   expiryClusters(items: CalendarItem[]) => Cluster[]
//     Cluster = { requirementId: string; weekStart: string /* London Monday YYYY-MM-DD */; count: number;
//                 personIds: string[]; itemIds: string[]; earliestDate: string }
//     Only items of kind 'expiry' (with a requirementId and personId) are grouped, by requirement and London week
//     (Monday to Sunday). Sorted by weekStart, then larger count first, then requirementId.
//     earliestDate is the earliest expiry date in the cluster: the due date for "Assign refresher for a week" (assumption 34).
import { describe, expect, it } from 'vitest';
import { expiryClusters } from './clusters';

type Item = Parameters<typeof expiryClusters>[0][number];
let n = 0;
const expiry = (requirementId: string, personId: string, date: string, over: Partial<Item> = {}): Item => ({
  id: `i${n++}`,
  kind: 'expiry',
  date,
  titleKey: 'calendar.expiry',
  params: {},
  requirementId,
  personId,
  ...over,
});

describe('expiryClusters', () => {
  it('groups expiries of one requirement in the same Monday-to-Sunday week', () => {
    const items = [
      expiry('sg', 'p1', '2026-11-09'),
      expiry('sg', 'p2', '2026-11-11'),
      expiry('sg', 'p3', '2026-11-15'),
    ];
    const [c, ...rest] = expiryClusters(items);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ requirementId: 'sg', weekStart: '2026-11-09', count: 3, earliestDate: '2026-11-09' });
    expect(c!.personIds.sort()).toEqual(['p1', 'p2', 'p3']);
    expect(c!.itemIds).toEqual(items.map((i) => i.id));
  });

  it('puts Sunday and the next Monday in different weeks', () => {
    const c = expiryClusters([expiry('sg', 'p1', '2026-11-08'), expiry('sg', 'p2', '2026-11-09')]);
    expect(c.map((x) => [x.weekStart, x.count])).toEqual([
      ['2026-11-02', 1],
      ['2026-11-09', 1],
    ]);
  });

  it('keeps the week boundary right across the clock change on 25 October', () => {
    const c = expiryClusters([expiry('sg', 'p1', '2026-10-25'), expiry('sg', 'p2', '2026-10-26')]);
    expect(c.map((x) => x.weekStart)).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('keeps requirements apart', () => {
    const c = expiryClusters([expiry('sg', 'p1', '2026-11-10'), expiry('fa', 'p1', '2026-11-10')]);
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.requirementId).sort()).toEqual(['fa', 'sg']);
  });

  it('reports the earliest expiry date in a cluster, whatever the input order', () => {
    const c = expiryClusters([
      expiry('sg', 'p2', '2026-11-13'),
      expiry('sg', 'p1', '2026-11-10'),
      expiry('sg', 'p3', '2026-11-12'),
    ]);
    expect(c[0]!.earliestDate).toBe('2026-11-10');
  });

  it('ignores items that are not expiries', () => {
    const items = [
      expiry('sg', 'p1', '2026-11-10'),
      expiry('sg', 'p2', '2026-11-10', { kind: 'refresherStart' }),
      expiry('sg', 'p3', '2026-11-10', { kind: 'assignmentDue' }),
    ];
    expect(expiryClusters(items)).toEqual([expect.objectContaining({ count: 1, personIds: ['p1'] })]);
  });

  it('sorts by week, then bigger clusters first', () => {
    const c = expiryClusters([
      expiry('fa', 'p1', '2026-11-17'),
      expiry('sg', 'p1', '2026-11-10'),
      expiry('fa', 'p2', '2026-11-11'),
      expiry('fa', 'p3', '2026-11-12'),
    ]);
    expect(c.map((x) => [x.weekStart, x.requirementId, x.count])).toEqual([
      ['2026-11-09', 'fa', 2],
      ['2026-11-09', 'sg', 1],
      ['2026-11-16', 'fa', 1],
    ]);
  });

  it('counts a person once per cluster even if two expiry items name them', () => {
    const c = expiryClusters([expiry('sg', 'p1', '2026-11-10'), expiry('sg', 'p1', '2026-11-11')]);
    expect(c[0]!.personIds).toEqual(['p1']);
    expect(c[0]!.count).toBe(1);
  });

  it('returns nothing for no items', () => {
    expect(expiryClusters([])).toEqual([]);
  });
});
