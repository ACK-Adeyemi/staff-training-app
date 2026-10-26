// F-1 (pure part): the C9 stats overview. Plan "Domain package" (progress/overview.ts); brief 5.2.
//
// API under test (view = ClientView plus lookups):
//   type OverviewView = ClientView & { jobRoles: JobRole[]; teams: Team[] }
//   type BreakdownRow = { id: string; name: string; compliant: number; total: number; percent: number }
//   overviewByRequirement(view), overviewByRole(view), overviewByTeam(view), overviewBySite(view): BreakdownRow[]
//       one row per requirement / job role / team / site in the given order (zero total gives percent 0);
//       total = applicable person-requirement pairs for active and on-leave people; compliant = current or expiringSoon;
//       a person with two roles or teams counts under each; sites use the primary site; percent = percentOf(compliant, total)
//   overdueAndExpiring(view): { overdue: AttentionRow[]; expiring: AttentionRow[] }
//       AttentionRow = { personId, requirementId, expiresAt: string, daysLeft: number }; overdue = status overdue, most overdue first;
//       expiring = status expiringSoon, soonest first; archived people left out
//   mostAndLeastCompleted({ modules, assignments }, count = 3): { most: ModuleCompletionRow[]; least: ModuleCompletionRow[] }
//       ModuleCompletionRow = { moduleId, title, assigned, completed, percent }; modules with no non-cancelled assignment are left out;
//       most is percent descending (ties: more assigned first, then title), least ascending (same ties)
//   complianceTrend(view, days: 30 | 90): { at: string; compliant: number; total: number; percent: number }[]
//       weekly points at now - 7k days for k = floor(days / 7) down to 0 (5 points for 30, 13 for 90), oldest first, each worked out
//       from Evidence completed on or before that point, counted over people who had started by then
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { Assignment, Module } from '../schemas/learning';
import type { Team } from '../schemas/tenancy';
import {
  complianceTrend,
  mostAndLeastCompleted,
  overdueAndExpiring,
  overviewByRequirement,
  overviewByRole,
  overviewBySite,
  overviewByTeam,
  type OverviewView,
} from './overview';
import {
  AMBER,
  CLIENT,
  NOW,
  assignment,
  evidenceExpiring,
  moduleFor,
  nextId,
  person,
  requirement,
  site,
  team,
} from './testFixtures';
import { clientView } from '../sites/testFixtures';

const cook = { id: nextId(), name: 'Cook' };
const nanny = { id: nextId(), name: 'Nanny' };
const siteA = site({ id: nextId(), name: 'Riverside' });
const siteB = site({ id: nextId(), name: 'Meadow' });
const siteEmpty = site({ id: nextId(), name: 'Empty' });
const teamA: Team = team(nextId(), 'Babies', siteA.id);
const teamB: Team = team(nextId(), 'Toddlers', siteB.id);
const fire = requirement('Fire safety', { renewEveryMonths: 12 });
const first = requirement('First aid', { appliesTo: { jobRoleIds: [cook.id] }, renewEveryMonths: 36 });

const p1 = person('Ann', 'Ames', { primarySiteId: siteA.id, jobRoleIds: [cook.id], teamIds: [teamA.id] });
const p2 = person('Bob', 'Bell', { primarySiteId: siteA.id, jobRoleIds: [nanny.id], teamIds: [teamA.id] });
const p3 = person('Cy', 'Cole', {
  primarySiteId: siteB.id,
  jobRoleIds: [cook.id, nanny.id],
  teamIds: [teamB.id, teamA.id],
});
const p4 = person('Di', 'Dunn', { primarySiteId: siteB.id, jobRoleIds: [nanny.id], teamIds: [teamB.id] });
const gone = person('Ex', 'Emp', {
  primarySiteId: siteA.id,
  jobRoleIds: [cook.id],
  teamIds: [teamA.id],
  status: 'archived',
});

// Fire: p1 current, p2 expiring in 10 days, p3 overdue by 5 days, p4 never done, archived person overdue.
// First aid (cooks only): p1 current, p3 never done.
const evidence = [
  evidenceExpiring(p1, fire, 200, { requirementId: fire.id }),
  evidenceExpiring(p2, fire, 10, { requirementId: fire.id }),
  evidenceExpiring(p3, fire, -5, { requirementId: fire.id }),
  evidenceExpiring(gone, fire, -50, { requirementId: fire.id }),
  evidenceExpiring(p1, first, 500, { requirementId: first.id }),
];
const view: OverviewView = {
  ...clientView({
    people: [p1, p2, p3, p4, gone],
    sites: [siteA, siteB, siteEmpty],
    requirements: [fire, first],
    evidence,
  }),
  jobRoles: [cook, nanny].map((r) => ({ ...r, clientId: CLIENT })),
  teams: [teamA, teamB],
};

describe('breakdowns', () => {
  it('works out compliance per requirement, counting current and due soon as compliant', () => {
    expect(overviewByRequirement(view)).toEqual([
      { id: fire.id, name: 'Fire safety', compliant: 2, total: 4, percent: 50 },
      { id: first.id, name: 'First aid', compliant: 1, total: 2, percent: 50 },
    ]);
  });

  it('works out compliance per role, counting a person with two roles under each', () => {
    const rows = overviewByRole(view);
    // every pair of a person counts under each of their roles: cook = p1 (2 pairs) + p3 (2); nanny = p2 (1) + p3 (2) + p4 (1)
    expect(rows.find((r) => r.id === cook.id)).toMatchObject({ name: 'Cook', compliant: 2, total: 4, percent: 50 });
    expect(rows.find((r) => r.id === nanny.id)).toMatchObject({ name: 'Nanny', compliant: 1, total: 4, percent: 25 });
    expect(rows.map((r) => r.id)).toEqual([cook.id, nanny.id]);
  });

  it('works out compliance per team, counting people under each of their teams', () => {
    const rows = overviewByTeam(view);
    expect(rows.find((r) => r.id === teamB.id)).toMatchObject({ name: 'Toddlers', compliant: 0, total: 3, percent: 0 });
    expect(rows.find((r) => r.id === teamA.id)).toMatchObject({ name: 'Babies', compliant: 3, total: 5, percent: 60 });
  });

  it('works out compliance per site by primary site and shows an empty site as 0 of 0', () => {
    const rows = overviewBySite(view);
    expect(rows.find((r) => r.id === siteA.id)).toMatchObject({ compliant: 3, total: 3, percent: 100 });
    expect(rows.find((r) => r.id === siteB.id)).toMatchObject({ compliant: 0, total: 3, percent: 0 });
    expect(rows.find((r) => r.id === siteEmpty.id)).toEqual({
      id: siteEmpty.id,
      name: 'Empty',
      compliant: 0,
      total: 0,
      percent: 0,
    });
  });

  it('leaves archived people out of every breakdown', () => {
    const total = overviewBySite(view).reduce((n, r) => n + r.total, 0);
    expect(total).toBe(6);
  });
});

describe('overdueAndExpiring', () => {
  const r = overdueAndExpiring(view);

  it('lists overdue pairs and due-soon pairs separately with their dates', () => {
    expect(r.overdue.map((x) => [x.personId, x.requirementId])).toEqual([[p3.id, fire.id]]);
    expect(r.expiring.map((x) => [x.personId, x.requirementId])).toEqual([[p2.id, fire.id]]);
    expect(r.overdue[0]?.daysLeft).toBeLessThan(0);
    expect(r.expiring[0]?.daysLeft).toBe(10);
    expect(typeof r.expiring[0]?.expiresAt).toBe('string');
  });

  it('puts the most overdue and the soonest expiring first, and never lists never-started pairs', () => {
    const more = [
      ...evidence,
      evidenceExpiring(p4, fire, -30, { requirementId: fire.id }),
      evidenceExpiring(p1, fire, 3, { requirementId: fire.id, completedAt: addDays(NOW, -2).toISOString() }),
    ];
    const x = overdueAndExpiring({ ...view, evidence: more });
    expect(x.overdue.map((o) => o.personId)).toEqual([p4.id, p3.id]);
    expect(x.expiring.map((o) => o.personId)).toEqual([p1.id, p2.id]);
  });
});

describe('mostAndLeastCompleted', () => {
  const m = (title: string): Module => moduleFor({ id: nextId(), title });
  const [a, b, c, d, e] = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map(m) as [
    Module,
    Module,
    Module,
    Module,
    Module,
  ];
  const unassigned = m('Unused');
  const rows = (mod: Module, done: number, open: number): Assignment[] => [
    ...Array.from({ length: done }, () => assignment(p1, mod.id, 5, { status: 'done' })),
    ...Array.from({ length: open }, () => assignment(p1, mod.id, 5)),
  ];
  const assignments = [
    ...rows(a, 4, 0), // 100%, 4
    ...rows(b, 1, 0), // 100%, 1
    ...rows(c, 2, 2), // 50%
    ...rows(d, 1, 3), // 25%
    ...rows(e, 0, 2), // 0%
    assignment(p1, unassigned.id, 5, { status: 'cancelled' }),
  ];
  const r = mostAndLeastCompleted({ modules: [a, b, c, d, e, unassigned], assignments });

  it('lists the most completed first with ties going to more assigned, three by default', () => {
    expect(r.most.map((x) => x.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(r.most[0]).toEqual({ moduleId: a.id, title: 'Alpha', assigned: 4, completed: 4, percent: 100 });
  });

  it('lists the least completed first and leaves out modules nobody was assigned', () => {
    expect(r.least.map((x) => x.title)).toEqual(['Echo', 'Delta', 'Charlie']);
    expect([...r.most, ...r.least].some((x) => x.moduleId === unassigned.id)).toBe(false);
  });

  it('honours the count', () => {
    expect(mostAndLeastCompleted({ modules: [a, b, c, d, e], assignments }, 1).least.map((x) => x.title)).toEqual([
      'Echo',
    ]);
  });
});

describe('complianceTrend', () => {
  const person1 = person('Ann', 'Ames', { primarySiteId: siteA.id, startDate: '2025-01-06T09:00:00.000Z' });
  const req = requirement('Fire safety', { renewEveryMonths: 12 });
  const trendView = clientView({
    people: [person1],
    sites: [siteA],
    requirements: [req],
    now: NOW,
    amberWindowDays: AMBER,
    evidence: [
      evidenceExpiring(person1, req, 300, { requirementId: req.id, completedAt: addDays(NOW, -20).toISOString() }),
    ],
  });

  it('gives five weekly points for 30 days, oldest first, ending now', () => {
    const t = complianceTrend(trendView, 30);
    expect(t).toHaveLength(5);
    expect(t[4]?.at).toBe(NOW.toISOString());
    expect(t[0]?.at).toBe(addDays(NOW, -28).toISOString());
  });

  it('gives thirteen weekly points for 90 days', () => {
    expect(complianceTrend(trendView, 90)).toHaveLength(13);
  });

  it('works each point out from Evidence that existed by then', () => {
    expect(complianceTrend(trendView, 30).map((p) => p.percent)).toEqual([0, 0, 100, 100, 100]);
    expect(complianceTrend(trendView, 30)[2]).toMatchObject({ compliant: 1, total: 1 });
  });

  it('shows a fall when Evidence runs out inside the window', () => {
    const lapsing = clientView({
      ...trendView,
      evidence: [
        evidenceExpiring(person1, req, -10, { requirementId: req.id, completedAt: addDays(NOW, -300).toISOString() }),
      ],
    });
    const t = complianceTrend(lapsing, 30).map((p) => p.percent);
    expect(t[0]).toBe(100);
    expect(t[4]).toBe(0);
  });

  it('counts only people who had started by each point', () => {
    const late = person('Late', 'Joiner', { primarySiteId: siteA.id, startDate: addDays(NOW, -10).toISOString() });
    const t = complianceTrend({ ...trendView, people: [person1, late] }, 30);
    expect(t[0]?.total).toBe(1);
    expect(t[4]?.total).toBe(2);
  });
});
