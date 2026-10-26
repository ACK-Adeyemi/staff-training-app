// F-5 (pure parts): choosing winners (plan M2 assumption 15) and how staff see them (assumption 8, 15).
import { describe, expect, it } from 'vitest';
import { drawWinners, selectWinners, winnerNames } from './winners';
import { competition, staff } from './testFixtures';
import { createRng } from '../rng';

const standing = (rows: [string, number, number][]) => rows.map(([id, rank, value]) => ({ id, name: id, rank, value }));
const ids = (xs: { personId?: string; teamId?: string }[]) => xs.map((x) => x.personId ?? x.teamId);

describe('selectWinners: top', () => {
  const c = competition({ winnerSelection: 'top', winnerCount: 2 });

  it('takes ranks 1 to winnerCount', () => {
    const s = standing([
      ['a', 1, 9],
      ['b', 2, 7],
      ['c', 3, 5],
    ]);
    expect(ids(selectWinners(c, s, [], createRng(1)))).toEqual(['a', 'b']);
  });

  it('includes everyone tied at the last winning place', () => {
    const s = standing([
      ['a', 1, 9],
      ['b', 2, 7],
      ['c', 2, 7],
      ['d', 4, 5],
    ]);
    expect(ids(selectWinners(c, s, [], createRng(1)))).toEqual(['a', 'b', 'c']);
  });

  it('never names someone with nothing on the board', () => {
    const s = standing([
      ['a', 1, 3],
      ['b', 2, 0],
      ['c', 2, 0],
    ]);
    expect(ids(selectWinners(c, s, [], createRng(1)))).toEqual(['a']);
  });

  it('gives no winners from an empty board', () => {
    expect(selectWinners(c, [], [], createRng(1))).toEqual([]);
  });
});

describe('selectWinners: team target', () => {
  it('picks every team at or above the target per cent, and defaults the target to 90', () => {
    const s = standing([
      ['t1', 1, 100],
      ['t2', 2, 90],
      ['t3', 3, 89],
    ]);
    const withTarget = competition({ templateId: 'teamShowdown', winnerSelection: 'teamTarget', teamTarget: 95 });
    expect(selectWinners(withTarget, s, [], createRng(1))).toEqual([{ teamId: 't1' }]);
    const defaulted = competition({ templateId: 'teamShowdown', winnerSelection: 'teamTarget' });
    expect(ids(selectWinners(defaulted, s, [], createRng(1)))).toEqual(['t1', 't2']);
  });

  it('gives teamId (not personId) on team templates', () => {
    const c = competition({ templateId: 'teamShowdown', winnerSelection: 'top', winnerCount: 1 });
    expect(selectWinners(c, standing([['t1', 1, 80]]), [], createRng(1))).toEqual([{ teamId: 't1' }]);
  });
});

describe('drawWinners and the draw selection', () => {
  const qualifiers = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'];

  it('draws the requested number of distinct qualifiers', () => {
    const w = drawWinners(qualifiers, 3, createRng(5));
    expect(w).toHaveLength(3);
    expect(new Set(w).size).toBe(3);
    for (const x of w) expect(qualifiers).toContain(x);
  });

  it('is reproducible for a fixed seed and independent of input order', () => {
    const a = drawWinners(qualifiers, 3, createRng(5));
    expect(drawWinners(qualifiers, 3, createRng(5))).toEqual(a);
    expect(drawWinners([...qualifiers].reverse(), 3, createRng(5))).toEqual(a);
    expect(drawWinners([...qualifiers.slice(5), ...qualifiers.slice(0, 5)], 3, createRng(5))).toEqual(a);
  });

  it('can give different draws for different seeds', () => {
    const results = new Set(Array.from({ length: 12 }, (_, s) => drawWinners(qualifiers, 3, createRng(s)).join()));
    expect(results.size).toBeGreaterThan(1);
  });

  it('returns everyone when there are fewer qualifiers than winners, and nobody for none', () => {
    expect(drawWinners(['a', 'b'], 5, createRng(1)).sort()).toEqual(['a', 'b']);
    expect(drawWinners([], 3, createRng(1))).toEqual([]);
  });

  it('selectWinners draw is reproducible, ignores order, and includes hidden people among the qualifiers', () => {
    const c = competition({ templateId: 'completeAndWin', winnerSelection: 'draw', winnerCount: 2, moduleIds: ['m'] });
    const first = selectWinners(c, [], qualifiers, createRng(9));
    expect(first).toHaveLength(2);
    expect(selectWinners(c, [], [...qualifiers].reverse(), createRng(9))).toEqual(first);
    // the caller passes hidden people in the qualifiers; they are drawable like anyone else
    const onlyHidden = selectWinners(c, [], ['hidden-1'], createRng(9));
    expect(ids(onlyHidden)).toEqual(['hidden-1']);
  });

  it('uses the competition id so two competitions on one stream draw independently but repeatably', () => {
    const c1 = competition({ winnerSelection: 'draw', winnerCount: 3 });
    const c2 = competition({ winnerSelection: 'draw', winnerCount: 3 });
    const a1 = ids(selectWinners(c1, [], qualifiers, createRng(3)));
    expect(ids(selectWinners(c1, [], qualifiers, createRng(3)))).toEqual(a1);
    const spread = new Set(
      Array.from({ length: 10 }, (_, s) => ids(selectWinners(c2, [], qualifiers, createRng(s))).join()),
    );
    expect(spread.size).toBeGreaterThan(1);
  });
});

describe('winnerNames: how winners are announced', () => {
  const jade = staff('Jade', 'Morris');
  const hidden = staff('Hiddy', 'Secret', { prefs: { ...staff('x', 'y').prefs, hideFromLeaderboards: true } });
  const winners = [{ personId: jade.id }, { personId: hidden.id }];

  it('shows staff display names but never a hidden winner', () => {
    const out = winnerNames({ winners, people: [jade, hidden], teams: [], audience: 'staff' });
    expect(out).toEqual([{ name: 'Jade M.', hidden: false }, { hidden: true }]);
    expect(JSON.stringify(out)).not.toContain('Hiddy');
    expect(JSON.stringify(out)).not.toContain(hidden.id);
  });

  it('shows admins every name, since they hand over prizes offline', () => {
    const out = winnerNames({ winners, people: [jade, hidden], teams: [], audience: 'admin' });
    expect(out.map((w: { name?: string }) => w.name)).toEqual(['Jade M.', 'Hiddy S.']);
  });

  it('names winning teams from the team list', () => {
    const out = winnerNames({
      winners: [{ teamId: 't1' }],
      people: [],
      teams: [{ id: 't1', name: 'Baby room' }],
      audience: 'staff',
    });
    expect(out).toEqual([{ name: 'Baby room', hidden: false }]);
  });
});
