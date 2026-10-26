// BP-17, F-1: multi-site roll-ups (plan M3 assumptions 36 and 37; brief 14).
//
// API under test (sites/rollup.ts), all pure:
//   type SiteView = ClientView & { assignments: Assignment[]; events: LearningEvent[] }   (ClientView from progress/client)
//   viewForSite(view: SiteView, siteId: string | 'all') => SiteView & { alsoWorksHere: Person[] }
//     'all' keeps everyone and has an empty alsoWorksHere. A site keeps only people whose PRIMARY site it is
//     (floating staff are counted once, at their primary site) and lists people who merely also work there in alsoWorksHere.
//   siteRollup(view: SiteView, siteId: string) => { siteId; staff; compliancePercent; overdue; expiring; completionRate }
//     staff = counted (active or on leave) people at the primary site; compliancePercent = percentOf(compliant, staff) as
//     orgCompliance defines compliant; overdue / expiring = number of overdue / expiring-soon requirement items;
//     completionRate = percent of module assignments due in the 90 days up to now (not cancelled) completed on or before
//     their due date (a moduleCompleted event at or before dueAt). Zero staff or nothing due gives 0, never NaN.
//   siteComparison(view: SiteView) => SiteRollup[] for active sites, lowest compliance first, then most overdue, then name.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { Assignment, LearningEvent } from '../schemas/learning';
import { siteComparison, siteRollup, viewForSite } from './rollup';
import {
  CLIENT,
  NOW,
  assignment,
  clientView,
  evidenceExpiring,
  nextId,
  requirement,
  siteNamed,
  staffAt,
} from './testFixtures';

const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
const riverside = siteNamed('Riverside');
const meadow = siteNamed('Meadow');
const empty = siteNamed('Empty Close');

const r1 = staffAt(riverside, 'Rita', 'One');
const r2 = staffAt(riverside, 'Rob', 'Two'); // overdue
const r3 = staffAt(riverside, 'Ruth', 'Three'); // expiring soon
const r4 = staffAt(riverside, 'Ray', 'Four');
const nadia = staffAt(riverside, 'Nadia', 'Bank', { additionalSiteIds: [meadow.id] });
const m1 = staffAt(meadow, 'Mia', 'One');
const m2 = staffAt(meadow, 'Max', 'Two'); // overdue

const evidence = [
  evidenceExpiring(r1, sg, 300),
  evidenceExpiring(r2, sg, -10),
  evidenceExpiring(r3, sg, 20),
  evidenceExpiring(r4, sg, 300),
  evidenceExpiring(nadia, sg, 300),
  evidenceExpiring(m1, sg, 300),
  evidenceExpiring(m2, sg, -3),
];

const moduleId = nextId();
const done = (p: { id: string }, at: Date): LearningEvent => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: riverside.id,
  personId: p.id,
  at: at.toISOString(),
  type: 'moduleCompleted',
  moduleId,
  moduleVersion: 1,
});

const view = (over: Record<string, unknown> = {}) => ({
  ...clientView({
    people: [r1, r2, r3, r4, nadia, m1, m2],
    sites: [riverside, meadow, empty],
    requirements: [sg],
    evidence,
  }),
  assignments: [] as Assignment[],
  events: [] as LearningEvent[],
  ...over,
});

describe('viewForSite', () => {
  it('keeps only people whose primary site it is and lists floating staff under Also works here', () => {
    const v = viewForSite(view(), meadow.id);
    expect(v.people.map((p) => p.id).sort()).toEqual([m1.id, m2.id].sort());
    expect(v.alsoWorksHere.map((p) => p.id)).toEqual([nadia.id]);
  });

  it('counts a floating person at their primary site and not under the other site', () => {
    const v = viewForSite(view(), riverside.id);
    expect(v.people.map((p) => p.id)).toContain(nadia.id);
    expect(v.alsoWorksHere).toEqual([]);
  });

  it('with "all" keeps everyone once and has no Also works here list', () => {
    const v = viewForSite(view(), 'all');
    expect(v.people).toHaveLength(7);
    expect(v.alsoWorksHere).toEqual([]);
  });

  it('filters evidence and assignments to the people kept', () => {
    const a = assignment(m1, moduleId, 5);
    const b = assignment(r1, moduleId, 5);
    const v = viewForSite(view({ assignments: [a, b] }), meadow.id);
    expect(v.assignments.map((x) => x.id)).toEqual([a.id]);
    expect(v.evidence.every((e) => [m1.id, m2.id].includes(e.personId))).toBe(true);
  });
});

describe('siteRollup', () => {
  it('counts staff once at the primary site, with percentage, overdue and expiring', () => {
    const r = siteRollup(view(), riverside.id);
    expect(r.siteId).toBe(riverside.id);
    expect(r.staff).toBe(5);
    expect(r.overdue).toBe(1);
    expect(r.expiring).toBe(1);
    expect(r.compliancePercent).toBe(80); // everyone but Rob
  });

  it('does not count the floating person at the other site', () => {
    expect(siteRollup(view(), meadow.id).staff).toBe(2);
  });

  it('staff across all sites add up to the number of people', () => {
    const v = view();
    const total = [riverside, meadow, empty].reduce((n, s) => n + siteRollup(v, s.id).staff, 0);
    expect(total).toBe(v.people.length);
  });

  it('gives zeros, not NaN, for a site with no staff', () => {
    expect(siteRollup(view(), empty.id)).toMatchObject({
      staff: 0,
      compliancePercent: 0,
      overdue: 0,
      expiring: 0,
      completionRate: 0,
    });
  });

  it('completion rate is the share of assignments due in the last 90 days completed by their due date', () => {
    const onTime = assignment(r1, moduleId, -10);
    const late = assignment(r2, moduleId, -10);
    const future = assignment(r3, moduleId, 5); // not due yet
    const old = assignment(r4, moduleId, -120); // outside 90 days
    const cancelled = assignment(r4, moduleId, -10, { status: 'cancelled' });
    const events = [done(r1, addDays(NOW, -12)), done(r2, addDays(NOW, -2))];
    const r = siteRollup(view({ assignments: [onTime, late, future, old, cancelled], events }), riverside.id);
    expect(r.completionRate).toBe(50);
  });

  it('counts a completion exactly at the due time as on time', () => {
    const a = assignment(r1, moduleId, -10);
    const r = siteRollup(view({ assignments: [a], events: [done(r1, new Date(a.dueAt))] }), riverside.id);
    expect(r.completionRate).toBe(100);
  });
});

describe('siteComparison', () => {
  it('puts the site needing most attention first: lowest compliance, then most overdue', () => {
    const d = siteNamed('Delta');
    const e = siteNamed('Echo');
    const d1 = staffAt(d, 'Dee', 'One');
    const d2 = staffAt(d, 'Dan', 'Two'); // overdue
    const e1 = staffAt(e, 'Eve', 'One');
    const e2 = staffAt(e, 'Ed', 'Two'); // never started: also not compliant, but not overdue
    const v = view({
      people: [...view().people, d1, d2, e1, e2],
      sites: [riverside, meadow, d, e],
      evidence: [
        ...evidence,
        evidenceExpiring(d1, sg, 300),
        evidenceExpiring(d2, sg, -5),
        evidenceExpiring(e1, sg, 300),
      ],
    });
    const order = siteComparison(v).map((r) => r.siteId);
    // Meadow, Delta and Echo are all 50%; Meadow and Delta each have one overdue, Echo none. Name breaks the last tie.
    expect(order).toEqual([d.id, meadow.id, e.id, riverside.id]);
  });

  it('leaves out archived sites', () => {
    const old = siteNamed('Closed Lane', { status: 'archived' });
    const rows = siteComparison(view({ sites: [riverside, meadow, old] }));
    expect(rows.map((r) => r.siteId)).not.toContain(old.id);
  });

  it('lists a site with no staff without failing', () => {
    const row = siteComparison(view()).find((r) => r.siteId === empty.id);
    expect(row?.staff).toBe(0);
  });
});
