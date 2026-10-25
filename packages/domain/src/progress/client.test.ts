// BP-4 (pure part): the client dashboard views. Plan Assumptions 2 and 3.
//
// API under test (progress/client.ts). Every function takes one object:
//   View = { people: Person[]; sites: Site[]; requirements: Requirement[]; evidence: Evidence[];
//            submissions: EvidenceSubmission[]; now: Date; amberWindowDays: number }
//   needsAttention(view) => { person: Person; requirement: Requirement; status: 'overdue' | 'expiringSoon' | 'notStarted';
//                             daysLeft?: number; expiresAt?: string }[]
//     active and on-leave people only; overdue (most days overdue first), then expiringSoon (fewest days left first),
//     then notStarted (by person name, last name then first); awaitingCheck is not listed.
//   waitingForCheck(view) => { person: Person; requirement: Requirement }[]
//   complianceByRequirement(view) => { requirement: Requirement; applicable: number;
//        counts: Record<'current' | 'expiringSoon' | 'awaitingCheck' | 'overdue' | 'notStarted', number> }[]
//   orgCompliance(view) => { compliant: number; total: number }   (a person is compliant when no applicable requirement
//        is overdue, notStarted or awaitingCheck; current and expiringSoon both count)
//   recentlyCompleted(evidence, people, now, days = 14) => { person: Person; evidence: Evidence }[] newest first,
//        evidence completed within `days` days up to now, active and on-leave people only.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { complianceByRequirement, needsAttention, orgCompliance, recentlyCompleted, waitingForCheck } from './client';
import { AMBER, NOW, evidenceExpiring, person, requirement, site, submissionWaiting } from './testFixtures';

const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
const aid = requirement('Paediatric first aid', { renewEveryMonths: 36, appliesTo: { jobRoleIds: ['role-aid'] } });
const food = requirement('Food hygiene', { renewEveryMonths: 36, appliesTo: { jobRoleIds: ['role-food'] } });

const mark = person('Mark', 'Taylor', { jobRoleIds: ['role-aid'] });
const lucy = person('Lucy', 'Evans');
const hannah = person('Hannah', 'Patel');
const maureen = person('Maureen', 'Clarke', { jobRoleIds: ['role-food'] });
const amira = person('Amira', 'Hassan');
const ben = person('Ben', 'Carter');
const grace = person('Grace', 'Lee', { status: 'onLeave' });
const olivia = person('Olivia', 'Grant', { status: 'archived' });
const jade = person('Jade', 'Mills');

const view = (people = [mark, lucy, hannah, maureen, amira, ben, grace, olivia, jade]) => ({
  people,
  sites: [site()],
  requirements: [sg],
  evidence: [] as ReturnType<typeof evidenceExpiring>[],
  submissions: [] as ReturnType<typeof submissionWaiting>[],
  now: NOW,
  amberWindowDays: AMBER,
});

describe('needsAttention', () => {
  it('lists a mixed team in the agreed order: overdue, expiring by date, then not started', () => {
    const items = needsAttention({
      ...view(),
      requirements: [sg, aid, food],
      evidence: [
        evidenceExpiring(mark, aid, -8),
        evidenceExpiring(mark, sg, 300),
        evidenceExpiring(lucy, sg, 15),
        evidenceExpiring(hannah, sg, 16),
        evidenceExpiring(maureen, food, 20),
        evidenceExpiring(maureen, sg, 300),
        evidenceExpiring(jade, sg, 180),
        evidenceExpiring(grace, sg, 300),
        evidenceExpiring(olivia, sg, -200),
      ],
      submissions: [submissionWaiting(ben, sg)],
    });
    expect(items.map((i) => [i.person.firstName, i.requirement.name, i.status])).toEqual([
      ['Mark', 'Paediatric first aid', 'overdue'],
      ['Lucy', 'Safeguarding', 'expiringSoon'],
      ['Hannah', 'Safeguarding', 'expiringSoon'],
      ['Maureen', 'Food hygiene', 'expiringSoon'],
      ['Amira', 'Safeguarding', 'notStarted'],
    ]);
  });

  it('lists overdue before expiring, most days overdue first', () => {
    const late = person('Late', 'Person');
    const later = person('Later', 'Person');
    const soon = person('Soon', 'Person');
    const items = needsAttention({
      ...view([soon, later, late]),
      requirements: [sg],
      evidence: [evidenceExpiring(soon, sg, 3), evidenceExpiring(later, sg, -2), evidenceExpiring(late, sg, -30)],
      submissions: [],
    });
    expect(items.map((i) => [i.person.firstName, i.status])).toEqual([
      ['Late', 'overdue'],
      ['Later', 'overdue'],
      ['Soon', 'expiringSoon'],
    ]);
  });

  it('puts not started last, by last name then first name', () => {
    const b = person('Anna', 'Zimmer');
    const a = person('Zoe', 'Adams');
    const c = person('Amy', 'Adams');
    const items = needsAttention({ ...view([b, a, c]), requirements: [sg], evidence: [], submissions: [] });
    expect(items.map((i) => i.person.firstName)).toEqual(['Amy', 'Zoe', 'Anna']);
    expect(items.every((i) => i.status === 'notStarted')).toBe(true);
  });

  it('never lists archived people, and includes people on leave', () => {
    const items = needsAttention({
      ...view([olivia, grace]),
      requirements: [sg],
      evidence: [evidenceExpiring(olivia, sg, -200), evidenceExpiring(grace, sg, 300)],
      submissions: [],
    });
    expect(items).toEqual([]);
    const leave = needsAttention({
      ...view([grace]),
      requirements: [sg],
      evidence: [evidenceExpiring(grace, sg, 10)],
      submissions: [],
    });
    expect(leave.map((i) => i.person.id)).toEqual([grace.id]);
  });

  it('does not list awaiting check, current, or not-applicable requirements', () => {
    const cook = requirement('Cooks only', { appliesTo: { jobRoleIds: ['someone-else'] } });
    const items = needsAttention({
      ...view([ben, jade]),
      requirements: [sg, cook],
      evidence: [evidenceExpiring(jade, sg, 180)],
      submissions: [submissionWaiting(ben, sg)],
    });
    expect(items).toEqual([]);
  });

  it('carries days left and expiry date for expiring items', () => {
    const [item] = needsAttention({
      ...view([maureen]),
      requirements: [food],
      evidence: [evidenceExpiring(maureen, food, 20)],
      submissions: [],
    });
    expect(item).toMatchObject({ status: 'expiringSoon', daysLeft: 20 });
    expect(item?.requirement.id).toBe(food.id);
  });
});

describe('new starters', () => {
  const sam = person('Sam', 'Okafor', { startDate: addDays(NOW, -10).toISOString() });
  it('are not listed as not started, or non-compliant, in their first 14 days', () => {
    expect(needsAttention({ ...view([sam]), evidence: [], submissions: [] })).toEqual([]);
    expect(orgCompliance({ ...view([sam]), evidence: [], submissions: [] })).toEqual({ compliant: 1, total: 1 });
  });
  it('are listed once the 14 days are over', () => {
    const later = person('Sam', 'Okafor', { startDate: addDays(NOW, -15).toISOString() });
    expect(needsAttention({ ...view([later]), evidence: [], submissions: [] })).toHaveLength(1);
  });
});

describe('waitingForCheck', () => {
  it('lists people with an awaiting submission and no other state (Ben)', () => {
    const w = waitingForCheck({ ...view([ben, jade]), requirements: [sg], submissions: [submissionWaiting(ben, sg)] });
    expect(w.map((x) => [x.person.firstName, x.requirement.id])).toEqual([['Ben', sg.id]]);
  });

  it('leaves out archived people', () => {
    const w = waitingForCheck({ ...view([olivia]), requirements: [sg], submissions: [submissionWaiting(olivia, sg)] });
    expect(w).toEqual([]);
  });
});

describe('orgCompliance', () => {
  it('counts current and expiring soon as compliant, and Grace on leave, but not Olivia', () => {
    const people = [mark, lucy, hannah, maureen, amira, ben, grace, olivia, jade];
    const r = orgCompliance({
      ...view(people),
      requirements: [sg],
      evidence: [
        evidenceExpiring(mark, sg, 300),
        evidenceExpiring(lucy, sg, 15),
        evidenceExpiring(hannah, sg, 16),
        evidenceExpiring(maureen, sg, 300),
        evidenceExpiring(grace, sg, 300),
        evidenceExpiring(jade, sg, 300),
        evidenceExpiring(olivia, sg, -300),
      ],
      submissions: [submissionWaiting(ben, sg)],
    });
    // Amira (not started) and Ben (awaiting check) are not compliant; Olivia is archived and not counted.
    expect(r).toEqual({ compliant: 6, total: 8 });
  });

  it('counts a person overdue on any requirement as not compliant', () => {
    const r = orgCompliance({
      ...view([mark]),
      requirements: [sg, aid],
      evidence: [evidenceExpiring(mark, sg, 300), evidenceExpiring(mark, aid, -1)],
      submissions: [],
    });
    expect(r).toEqual({ compliant: 0, total: 1 });
  });

  it('counts a person with no applicable requirements as compliant', () => {
    const none = requirement('Nobody', { appliesTo: { jobRoleIds: ['x'] } });
    expect(orgCompliance({ ...view([jade]), requirements: [none], evidence: [], submissions: [] })).toEqual({
      compliant: 1,
      total: 1,
    });
  });
});

describe('complianceByRequirement', () => {
  it('counts people per status for each requirement and skips people it does not apply to', () => {
    const rows = complianceByRequirement({
      ...view([mark, lucy, amira, ben, olivia]),
      requirements: [sg],
      evidence: [evidenceExpiring(mark, sg, -3), evidenceExpiring(lucy, sg, 15), evidenceExpiring(olivia, sg, 300)],
      submissions: [submissionWaiting(ben, sg)],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requirement.id).toBe(sg.id);
    expect(rows[0]?.applicable).toBe(4);
    expect(rows[0]?.counts).toEqual({ current: 0, expiringSoon: 1, awaitingCheck: 1, overdue: 1, notStarted: 1 });
  });
});

describe('recentlyCompleted', () => {
  const at = (days: number) => addDays(NOW, days).toISOString();
  const ev = (p: typeof jade, days: number) => evidenceExpiring(p, sg, 700, { completedAt: at(days) });

  it('includes evidence completed within 14 days only, newest first', () => {
    const e1 = ev(jade, -2);
    const e2 = ev(lucy, -14);
    const e3 = ev(hannah, -15);
    const e4 = ev(mark, -5);
    const out = recentlyCompleted([e1, e2, e3, e4], [jade, lucy, hannah, mark], NOW);
    expect(out.map((o) => o.evidence.id)).toEqual([e1.id, e4.id, e2.id]);
    expect(out[0]?.person.id).toBe(jade.id);
  });

  it('honours a custom number of days and ignores future-dated evidence', () => {
    const e1 = ev(jade, -2);
    const e2 = ev(lucy, -5);
    const future = ev(mark, 3);
    expect(recentlyCompleted([e1, e2, future], [jade, lucy, mark], NOW, 3).map((o) => o.evidence.id)).toEqual([e1.id]);
  });

  it('leaves out archived people and evidence for unknown people', () => {
    const out = recentlyCompleted([ev(olivia, -1), ev(person('Zed', 'Young'), -1)], [olivia, jade], NOW);
    expect(out).toEqual([]);
  });
});
