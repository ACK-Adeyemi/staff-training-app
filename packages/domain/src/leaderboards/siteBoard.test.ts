// BP-18: the Sites board (brief 13.5; plan M3 assumption 39). Per-person and percentage measures only.
//
// API under test (leaderboards/siteBoard.ts), pure:
//   type SiteBoardInput = BoardInput (standingBoards) & { sites: Site[]; submissions: EvidenceSubmission[]; amberWindowDays: number }
//   siteLeaderboard(measure: 'compliance' | 'onTime' | 'participation' | 'knowledge', period: 'thisMonth' | 'thisQuarter',
//                   input: SiteBoardInput, options?: { excludeSmall?: boolean; excludedSiteIds?: string[] })
//        => { siteId; value; eligible; small; rank }[]   best first; ties share a rank (1, 1, 3); one entry per ACTIVE site
//     Eligible people: status active (not on leave, invited or archived), started at least 14 days before `now`,
//     counted at their PRIMARY site only. small = eligible < 3. Throws when people or sites come from more than one client.
//     compliance   = percent of eligible people's applicable requirement items that are current or expiring soon
//     onTime       = percent of eligible people's module assignments due in the period completed on or before the due date
//     participation= percent of eligible people with any learning event in the period
//     knowledge    = modules mastered in the period per eligible person, one decimal place
//   siteBoardView(entries, { viewerSiteId, audience: 'staff' | 'manager' | 'group', measure })
//        => { rows: { rank; siteId; value; isViewer }[]; own: row | null; toNext: { people: number } | null; detail?: entry }
//     staff / manager: the first 10 entries, plus the viewer's own row appended when it is outside them, and never any row
//     below the viewer outside the top 10. manager also gets `detail` (the viewer's full entry). group: every entry, no detail.
//     toNext: for 'participation', how many more participating people lift the viewer to the value of the site directly
//     above (null at rank 1). The UI turns it into "2 more people with learning this month would move Meadow up one place".
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { bank, boardInput, completedModule, correct, dueAssignment, lessonDone } from '../competitions/testFixtures';
import { siteBoardView, siteLeaderboard } from './siteBoard';
import { AMBER, NOW, evidenceExpiring, otherClientId, requirement, siteNamed, staffAt } from '../sites/testFixtures';
import type { Person, Site } from '../schemas/tenancy';

const OCT = '2026-10-10T10:00:00.000Z';
const people = (s: Site, n: number, over: Partial<Person> = {}, prefix = s.name): Person[] =>
  Array.from({ length: n }, (_, i) => staffAt(s, `${prefix}${i}`, 'Test', over));
const input = (sites: Site[], ps: Person[], over: Record<string, unknown> = {}) =>
  ({ ...boardInput({ people: ps, now: NOW }), sites, submissions: [], amberWindowDays: AMBER, ...over }) as never;
const entry = (list: ReturnType<typeof siteLeaderboard>, s: Site) => list.find((e) => e.siteId === s.id)!;

describe('participation', () => {
  it('ranks by percentage so 2 of 4 and 10 of 20 tie at rank 1 and a third site is rank 3', () => {
    const a = siteNamed('Alpha');
    const b = siteNamed('Beta');
    const c = siteNamed('Gamma');
    const pa = people(a, 4);
    const pb = people(b, 20);
    const pc = people(c, 4);
    const events = [...pa.slice(0, 2), ...pb.slice(0, 10), ...pc.slice(0, 1)].map((p) => lessonDone(p, OCT));
    const r = siteLeaderboard('participation', 'thisMonth', input([a, b, c], [...pa, ...pb, ...pc], { events }));
    expect(entry(r, a)).toMatchObject({ value: 50, rank: 1, eligible: 4 });
    expect(entry(r, b)).toMatchObject({ value: 50, rank: 1, eligible: 20 });
    expect(entry(r, c)).toMatchObject({ value: 25, rank: 3 });
  });

  it('counts only events inside the London month', () => {
    const a = siteNamed('Alpha');
    const pa = people(a, 4);
    const events = [lessonDone(pa[0]!, OCT), lessonDone(pa[1]!, '2026-09-20T10:00:00.000Z')];
    const r = siteLeaderboard('participation', 'thisMonth', input([a], pa, { events }));
    expect(r[0]!.value).toBe(25);
  });

  it('thisQuarter takes in the earlier months of the quarter', () => {
    const a = siteNamed('Alpha');
    const pa = people(a, 4);
    const events = [lessonDone(pa[0]!, '2026-10-01T10:00:00.000Z'), lessonDone(pa[1]!, '2026-11-20T10:00:00.000Z')];
    const r = siteLeaderboard(
      'participation',
      'thisQuarter',
      input([a], pa, { events, now: new Date('2026-12-01T10:00:00Z') }),
    );
    expect(r[0]!.value).toBe(50);
  });
});

describe('who is eligible', () => {
  const s = siteNamed('Alpha');

  it('leaves out people on leave, invited and archived people', () => {
    const ps = [
      ...people(s, 3),
      ...people(s, 1, { status: 'onLeave' }, 'Leave'),
      ...people(s, 1, { status: 'invited' }, 'Inv'),
      ...people(s, 1, { status: 'archived' }, 'Arc'),
    ];
    expect(siteLeaderboard('participation', 'thisMonth', input([s], ps))[0]!.eligible).toBe(3);
  });

  it('leaves out a starter of 13 days and includes one of 14 days', () => {
    const base = people(s, 1);
    const start = (days: number) => staffAt(s, 'New', 'Starter', { startDate: addDays(NOW, -days).toISOString() });
    expect(siteLeaderboard('participation', 'thisMonth', input([s], [...base, start(13)]))[0]!.eligible).toBe(1);
    expect(siteLeaderboard('participation', 'thisMonth', input([s], [...base, start(14)]))[0]!.eligible).toBe(2);
  });

  it('counts a floating person at their primary site only', () => {
    const t = siteNamed('Beta');
    const floater = staffAt(s, 'Flo', 'Float', { additionalSiteIds: [t.id] });
    const r = siteLeaderboard('participation', 'thisMonth', input([s, t], [floater, ...people(t, 1)]));
    expect(entry(r, s).eligible).toBe(1);
    expect(entry(r, t).eligible).toBe(1);
  });

  it('keeps a site with nobody eligible in the list with a zero value, marked small', () => {
    const r = siteLeaderboard('participation', 'thisMonth', input([s], []));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ value: 0, eligible: 0, small: true });
  });

  it('leaves out archived sites', () => {
    const closed = siteNamed('Closed', { status: 'archived' });
    const r = siteLeaderboard('participation', 'thisMonth', input([s, closed], people(s, 3)));
    expect(r.map((e) => e.siteId)).toEqual([s.id]);
  });
});

describe('small sites and exclusions', () => {
  const big = siteNamed('Big');
  const tiny = siteNamed('Tiny');
  const ps = [...people(big, 3), ...people(tiny, 2)];

  it('marks a site with 2 eligible people small and one with 3 not small', () => {
    const r = siteLeaderboard('participation', 'thisMonth', input([big, tiny], ps));
    expect(entry(r, tiny).small).toBe(true);
    expect(entry(r, big).small).toBe(false);
  });

  it('keeps small sites listed by default and removes them when excluded', () => {
    expect(siteLeaderboard('participation', 'thisMonth', input([big, tiny], ps))).toHaveLength(2);
    const r = siteLeaderboard('participation', 'thisMonth', input([big, tiny], ps), { excludeSmall: true });
    expect(r.map((e) => e.siteId)).toEqual([big.id]);
  });

  it('removes sites the admin excluded by id', () => {
    const r = siteLeaderboard('participation', 'thisMonth', input([big, tiny], ps), { excludedSiteIds: [big.id] });
    expect(r.map((e) => e.siteId)).toEqual([tiny.id]);
  });

  it('ranks without the excluded sites, so the next site moves up', () => {
    const mid = siteNamed('Mid');
    const pb = people(big, 3);
    const pm = people(mid, 4);
    const events = [...pb, ...pm.slice(0, 2)].map((p) => lessonDone(p, OCT));
    const all = input([big, tiny, mid], [...pb, ...people(tiny, 2), ...pm], { events });
    expect(siteLeaderboard('participation', 'thisMonth', all).find((e) => e.siteId === mid.id)!.rank).toBe(2);
    const r = siteLeaderboard('participation', 'thisMonth', all, { excludedSiteIds: [big.id] });
    expect(r.find((e) => e.siteId === mid.id)!.rank).toBe(1);
  });
});

describe('compliance', () => {
  it('is the share of eligible requirement items current or expiring soon', () => {
    const s = siteNamed('Alpha');
    const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
    const ps = people(s, 5);
    const leave = staffAt(s, 'On', 'Leave', { status: 'onLeave' });
    const evidence = [
      evidenceExpiring(ps[0]!, sg, 300), // current
      evidenceExpiring(ps[1]!, sg, 300), // current
      evidenceExpiring(ps[2]!, sg, 20), // expiring soon, still counts
      evidenceExpiring(ps[3]!, sg, -5), // overdue
      // ps[4] never started
      evidenceExpiring(leave, sg, -5), // on leave: ignored
    ];
    const r = siteLeaderboard('compliance', 'thisMonth', input([s], [...ps, leave], { requirements: [sg], evidence }));
    expect(r[0]!.value).toBe(60);
  });
});

describe('onTime', () => {
  it('is the share of assignments due in the period completed by their due date, ignoring other periods', () => {
    const s = siteNamed('Alpha');
    const ps = people(s, 4);
    const m = bank(['q1']);
    const assignments = [
      dueAssignment(ps[0]!, m, '2026-10-10T10:00:00.000Z'),
      dueAssignment(ps[1]!, m, '2026-10-10T10:00:00.000Z'),
      dueAssignment(ps[2]!, m, '2026-10-10T10:00:00.000Z'),
      dueAssignment(ps[3]!, m, '2026-10-10T10:00:00.000Z'),
      dueAssignment(ps[3]!, m, '2026-09-20T10:00:00.000Z'), // last month: not in the window
    ];
    const events = [
      completedModule(ps[0]!, m, '2026-10-08T10:00:00.000Z'),
      completedModule(ps[1]!, m, '2026-10-09T10:00:00.000Z'),
      completedModule(ps[2]!, m, '2026-10-12T10:00:00.000Z'), // late
    ];
    const r = siteLeaderboard('onTime', 'thisMonth', input([s], ps, { assignments, events, modules: [m] }));
    expect(r[0]!.value).toBe(50);
  });
});

describe('knowledge', () => {
  it('is modules mastered in the period per eligible person, to one decimal place', () => {
    const a = siteNamed('Alpha');
    const c = siteNamed('Gamma');
    const pa = people(a, 4);
    const pc = people(c, 3);
    const m = bank(['q1', 'q2']);
    const master = (p: Person) => [correct(p, m, 'q1', OCT), correct(p, m, 'q2', OCT)];
    const events = [...master(pa[0]!), ...master(pa[1]!), ...master(pc[0]!), correct(pc[1]!, m, 'q1', OCT)];
    const r = siteLeaderboard('knowledge', 'thisMonth', input([a, c], [...pa, ...pc], { events, modules: [m] }));
    expect(entry(r, a).value).toBe(0.5);
    expect(entry(r, c).value).toBe(0.3);
  });
});

describe('never across clients', () => {
  it('throws when a person belongs to another client', () => {
    const s = siteNamed('Alpha');
    const stranger = staffAt(s, 'Sam', 'Stranger', { clientId: otherClientId() });
    expect(() => siteLeaderboard('participation', 'thisMonth', input([s], [...people(s, 3), stranger]))).toThrow();
  });

  it('throws when a site belongs to another client', () => {
    const s = siteNamed('Alpha');
    const t = siteNamed('Beta', { clientId: otherClientId() });
    expect(() => siteLeaderboard('participation', 'thisMonth', input([s, t], people(s, 3)))).toThrow();
  });
});

describe('siteBoardView', () => {
  const names = Array.from({ length: 12 }, (_, i) => `site-${i + 1}`);
  const entries = names.map((siteId, i) => ({
    siteId,
    value: 100 - i * 5, // 100, 95, ... 45: no ties
    eligible: 20,
    small: false,
    rank: i + 1,
  }));
  const view = (viewerSiteId: string, audience: 'staff' | 'manager' | 'group') =>
    siteBoardView(entries, { viewerSiteId, audience, measure: 'participation' });

  it('shows staff the top 10 and nothing else when the viewer is inside them', () => {
    const v = view('site-4', 'staff');
    expect(v.rows.map((r) => r.siteId)).toEqual(names.slice(0, 10));
    expect(v.rows.filter((r) => r.isViewer).map((r) => r.siteId)).toEqual(['site-4']);
  });

  it('appends the own row when the viewer is outside the top 10, with no row below it', () => {
    const v = view('site-11', 'staff');
    expect(v.rows.map((r) => r.siteId)).toEqual([...names.slice(0, 10), 'site-11']);
    expect(v.rows.map((r) => r.siteId)).not.toContain('site-12');
    expect(v.own?.rank).toBe(11);
  });

  it('never shows a bottom list: the last-placed viewer sees top 10 plus themselves only', () => {
    const v = view('site-12', 'staff');
    expect(v.rows).toHaveLength(11);
    expect(v.rows[10]!.siteId).toBe('site-12');
  });

  it('gives managers the same rows plus their own detail, and staff no detail', () => {
    expect(view('site-11', 'manager').rows).toEqual(view('site-11', 'staff').rows);
    expect(view('site-11', 'manager').detail).toEqual(entries[10]);
    expect(view('site-11', 'staff').detail).toBeUndefined();
  });

  it('gives group admins the complete ranking', () => {
    const v = view('site-3', 'group');
    expect(v.rows).toHaveLength(12);
    expect(v.rows.map((r) => r.rank)).toEqual(entries.map((e) => e.rank));
  });

  it('works out how many more participating people move the viewer up one place', () => {
    const e = [
      { siteId: 'a', value: 50, eligible: 10, small: false, rank: 1 },
      { siteId: 'b', value: 30, eligible: 10, small: false, rank: 2 },
      { siteId: 'c', value: 10, eligible: 10, small: false, rank: 3 },
    ];
    expect(siteBoardView(e, { viewerSiteId: 'b', audience: 'staff', measure: 'participation' }).toNext).toEqual({
      people: 2,
    });
    expect(siteBoardView(e, { viewerSiteId: 'c', audience: 'staff', measure: 'participation' }).toNext).toEqual({
      people: 2,
    });
  });

  it('has no next step for the leader', () => {
    expect(view('site-1', 'staff').toNext).toBeNull();
  });
});
