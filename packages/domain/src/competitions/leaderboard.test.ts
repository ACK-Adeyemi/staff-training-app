// BP-2: ranking with shared ties, the top-10 view, private position, and hidden people (plan M2 assumptions 8, 9, 17).
import { describe, expect, it } from 'vitest';
import { adminLeaderboardView, displayName, leaderboardView, rankEntries } from './leaderboard';
import { staff } from './testFixtures';

type Entry = { id: string; name: string; value: number };
const names = (xs: string[]) => new Map(xs.map((n) => [`id-${n}`, n]));
const entries = (pairs: [string, number][]): Entry[] => pairs.map(([n, v]) => ({ id: `id-${n}`, name: n, value: v }));
/** 14 distinct people with values 14 down to 1 named P01..P14. */
const fourteen = (): Entry[] =>
  Array.from({ length: 14 }, (_, i) => ({
    id: `id-P${i + 1}`,
    name: `P${String(i + 1).padStart(2, '0')}`,
    value: 14 - i,
  }));
const view = (over: Record<string, unknown> = {}) =>
  leaderboardView({
    entries: fourteen(),
    viewerId: 'id-P01',
    hiddenIds: new Set<string>(),
    rowsVisible: true,
    limit: 10,
    ...over,
  });

describe('rankEntries: standard competition ranking with shared ties', () => {
  it('ranks 1, 2, 2, 4 and orders a tie by display name, not by input order', () => {
    const values = new Map([
      ['id-Zoe', 8],
      ['id-Abe', 8],
      ['id-Top', 10],
      ['id-Low', 5],
    ]);
    const out = rankEntries(values, names(['Zoe', 'Abe', 'Top', 'Low']));
    expect(out.map((r) => [r.name, r.rank, r.value])).toEqual([
      ['Top', 1, 10],
      ['Abe', 2, 8],
      ['Zoe', 2, 8],
      ['Low', 4, 5],
    ]);
  });

  it('gives the same result however the values arrive (never by who got there first)', () => {
    const pairs: [string, number][] = [
      ['Cy', 3],
      ['Al', 3],
      ['Bo', 3],
      ['Di', 9],
    ];
    const forward = rankEntries(new Map(pairs.map(([n, v]) => [`id-${n}`, v])), names(['Cy', 'Al', 'Bo', 'Di']));
    const backward = rankEntries(
      new Map([...pairs].reverse().map(([n, v]) => [`id-${n}`, v])),
      names(['Cy', 'Al', 'Bo', 'Di']),
    );
    expect(forward).toEqual(backward);
    expect(forward.map((r) => r.name)).toEqual(['Di', 'Al', 'Bo', 'Cy']);
    expect(forward.map((r) => r.rank)).toEqual([1, 2, 2, 2]);
  });

  it('keeps people with zero in the ranking, all sharing the last rank', () => {
    const out = rankEntries(
      new Map([
        ['id-A', 2],
        ['id-B', 0],
        ['id-C', 0],
      ]),
      names(['A', 'B', 'C']),
    );
    expect(out.map((r) => r.rank)).toEqual([1, 2, 2]);
  });
});

describe('leaderboardView: the staff projection', () => {
  it('shows at most the top 10 rows with ranks, names and values only', () => {
    const v = view();
    expect(v.visible).toBe(true);
    expect(v.rows).toHaveLength(10);
    expect(v.rows[0]).toEqual({ rank: 1, name: 'P01', value: 14, isViewer: true });
    expect(v.rows[9]?.rank).toBe(10);
  });

  it('shows more than 10 rows only when people tie at 10th place', () => {
    const e = fourteen().map((x, i) => (i >= 9 && i <= 11 ? { ...x, value: 5 } : x));
    const v = view({ entries: e, viewerId: 'id-P01' });
    const tenth = v.rows.filter((r: { rank: number }) => r.rank === 10);
    expect(tenth.length).toBe(3);
    expect(v.rows).toHaveLength(12);
  });

  it('never shows rows with a value of zero', () => {
    const e = entries([
      ['A', 3],
      ['B', 0],
      ['C', 0],
    ]);
    const v = view({ entries: e, viewerId: 'id-A' });
    expect(v.rows.map((r: { name: string }) => r.name)).toEqual(['A']);
  });

  it('gives a viewer outside the top 10 a private position, "of N" and what is needed for the next place', () => {
    const v = view({ viewerId: 'id-P12' });
    expect(v.rows.some((r: { isViewer: boolean }) => r.isViewer)).toBe(false);
    expect(v.viewer).toEqual({ rank: 12, of: 14, value: 3, toNext: 1, hidden: false });
  });

  it('marks the viewer row inside the top 10 and still reports the position', () => {
    const v = view({ viewerId: 'id-P04' });
    expect(v.rows.filter((r: { isViewer: boolean }) => r.isViewer).map((r: { name: string }) => r.name)).toEqual([
      'P04',
    ]);
    expect(v.viewer).toMatchObject({ rank: 4, of: 14, value: 11, toNext: 1 });
  });

  it('has toNext of null at rank 1', () => {
    expect(view({ viewerId: 'id-P01' }).viewer?.toNext).toBeNull();
  });

  it('measures toNext to the next better rank, so a tied viewer needs to pass the tied group', () => {
    const e = entries([
      ['A', 10],
      ['B', 6],
      ['C', 6],
      ['D', 2],
    ]);
    const v = view({ entries: e, viewerId: 'id-C' });
    expect(v.viewer).toMatchObject({ rank: 2, of: 4, value: 6, toNext: 4 });
  });

  it('tells a viewer with nothing yet that they are not on the board, with no rank', () => {
    const e = entries([
      ['A', 3],
      ['B', 0],
    ]);
    const v = view({ entries: e, viewerId: 'id-B' });
    expect(v.viewer).toMatchObject({ rank: null, of: 2, value: 0, hidden: false });
  });

  it('counts people with zero in "of N"', () => {
    const e = entries([
      ['A', 3],
      ['B', 0],
      ['C', 0],
      ['D', 1],
    ]);
    expect(view({ entries: e, viewerId: 'id-D' }).viewer).toMatchObject({ rank: 2, of: 4 });
  });

  it('hides rows from staff when the live leaderboard is off but keeps their own position', () => {
    const v = view({ rowsVisible: false, viewerId: 'id-P03' });
    expect(v.visible).toBe(false);
    expect(v.rows).toEqual([]);
    expect(v.viewer).toMatchObject({ rank: 3, of: 14 });
  });
});

describe('leaderboardView: people who hide from leaderboards', () => {
  const hiddenId = 'id-P01';
  const hidden = new Set([hiddenId]);

  it('never shows a hidden person in rows, in "of N" or in ranks for anyone else', () => {
    const v = view({ viewerId: 'id-P05', hiddenIds: hidden });
    expect(v.rows.map((r: { name: string }) => r.name)).not.toContain('P01');
    expect(v.viewer).toMatchObject({ rank: 4, of: 13, hidden: false });
    expect(v.rows[0]).toMatchObject({ rank: 1, name: 'P02' });
  });

  it('shows the hidden viewer their own position as if included, flagged as hidden, with no row for them', () => {
    const v = view({ viewerId: hiddenId, hiddenIds: hidden });
    expect(v.rows.map((r: { name: string }) => r.name)).not.toContain('P01');
    expect(v.rows.some((r: { isViewer: boolean }) => r.isViewer)).toBe(false);
    expect(v.viewer).toEqual({ rank: 1, of: 14, value: 14, toNext: null, hidden: true });
  });

  it('shares a rank with a visible person when the hidden viewer ties them', () => {
    const e = entries([
      ['A', 5],
      ['B', 5],
      ['C', 1],
    ]);
    const v = view({ entries: e, viewerId: 'id-A', hiddenIds: new Set(['id-A']) });
    expect(v.viewer).toMatchObject({ rank: 1, of: 3, hidden: true });
    expect(v.rows.map((r: { name: string }) => r.name)).toEqual(['B', 'C']);
  });
});

describe('leaderboardView: nothing identifies another person', () => {
  const keysDeep = (value: unknown, found: string[] = []): string[] => {
    if (Array.isArray(value)) value.forEach((v) => keysDeep(v, found));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        found.push(k);
        keysDeep(v, found);
      }
    }
    return found;
  };

  it('has no id, personId or teamId key anywhere and none of the ids in its JSON', () => {
    const v = view({ viewerId: 'id-P12' });
    const keys = keysDeep(v);
    for (const banned of ['id', 'personId', 'teamId', 'userId']) expect(keys).not.toContain(banned);
    expect(JSON.stringify(v)).not.toContain('id-P');
  });
});

describe('adminLeaderboardView: the admin projection', () => {
  it('adds a personId to every row and leaves out hidden people', () => {
    const v = adminLeaderboardView({ entries: fourteen(), hiddenIds: new Set(['id-P02']) });
    expect(v.rows.every((r: { personId?: string }) => typeof r.personId === 'string')).toBe(true);
    expect(v.rows.map((r: { name: string }) => r.name)).not.toContain('P02');
    expect(v.rows[0]).toMatchObject({ rank: 1, name: 'P01', personId: 'id-P01', value: 14 });
    expect(v.rows[1]).toMatchObject({ rank: 2, name: 'P03' });
  });

  it('uses teamId for team boards', () => {
    const v = adminLeaderboardView({
      entries: entries([
        ['Baby room', 80],
        ['Toddlers', 60],
      ]),
      hiddenIds: new Set<string>(),
      idKey: 'teamId',
    });
    expect(v.rows[0]).toMatchObject({ teamId: 'id-Baby room', rank: 1 });
    expect(v.rows[0]).not.toHaveProperty('personId');
  });

  it('shares ties and orders them by name, as for staff', () => {
    const v = adminLeaderboardView({
      entries: entries([
        ['Zed', 4],
        ['Amy', 4],
        ['Bo', 9],
      ]),
      hiddenIds: new Set<string>(),
    });
    expect(v.rows.map((r: { name: string; rank: number }) => [r.name, r.rank])).toEqual([
      ['Bo', 1],
      ['Amy', 2],
      ['Zed', 2],
    ]);
  });
});

describe('displayName', () => {
  it('is the nickname when set', () => {
    expect(displayName(staff('Jade', 'Morris', { nickname: 'Jay' }))).toBe('Jay');
  });
  it('is first name plus last initial with a full stop otherwise', () => {
    expect(displayName(staff('Jade', 'Morris'))).toBe('Jade M.');
  });
  it('uses an upper-case initial', () => {
    expect(displayName(staff('Sam', 'okafor'))).toBe('Sam O.');
  });
});
