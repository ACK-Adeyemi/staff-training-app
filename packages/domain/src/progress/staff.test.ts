// F-4, F-5 (pure part): the staff summary. Plan Assumptions 3 and 4, brief 5 and 27.6.
//
// API under test (progress/staff.ts):
//   staffSummary({ person, site, requirements, evidence, submissions, assignments, modules, now, amberWindowDays }) => {
//     rows: { requirement: Requirement; status: RequirementStatusName; lastDoneAt?: string; nextRenewalAt?: string;
//             cadenceMonths?: number; moduleId?: string }[]       (applicable requirements only, input order)
//     toDo: number; waiting: number; complete: boolean;
//     nextUp: { kind: 'assignment'; assignment: Assignment } | { kind: 'requirement'; requirementId: string; moduleId: string }
//           | { kind: 'allCaughtUp' };
//     comingUp: { kind: 'assignmentDue' | 'requirementExpiry'; at: string; assignmentId?: string; requirementId?: string }[]
//   }
// moduleId on a row is the first published module that satisfies the requirement (requirementIds or satisfiedByModuleIds).
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { staffSummary } from './staff';
import {
  AMBER, NOW, assignment, evidenceExpiring, moduleFor, nextId, person, requirement, site, submissionWaiting,
} from './testFixtures';

const base = { site: site(), now: NOW, amberWindowDays: AMBER };

describe('staffSummary', () => {
  const safeguarding = requirement('Safeguarding', { renewEveryMonths: 24 });
  const food = requirement('Food hygiene', { renewEveryMonths: 36 });
  const aid = requirement('Paediatric first aid', { renewEveryMonths: 36 });
  const later = requirement('Fire safety', { renewEveryMonths: 12 });
  const safeguardingModule = moduleFor({ id: nextId(), requirementIds: [safeguarding.id] });
  const foodModule = moduleFor({ id: nextId(), requirementIds: [food.id] });

  it('counts an open assignment as one thing to do when its requirement is already current (Jade)', () => {
    const jade = person('Jade', 'Mills');
    const a = assignment(jade, safeguardingModule.id, 14);
    const s = staffSummary({
      ...base, person: jade, requirements: [safeguarding], modules: [safeguardingModule], submissions: [],
      evidence: [evidenceExpiring(jade, safeguarding, 180)], assignments: [a],
    });
    expect(s.toDo).toBe(1);
    expect(s.waiting).toBe(0);
    expect(s.complete).toBe(false);
    expect(s.nextUp).toEqual({ kind: 'assignment', assignment: a });
  });

  it('is complete once passing evidence exists and the assignment is done', () => {
    const jade = person('Jade', 'Mills');
    const a = assignment(jade, safeguardingModule.id, 14, { status: 'done' });
    const s = staffSummary({
      ...base, person: jade, requirements: [safeguarding], modules: [safeguardingModule], submissions: [],
      evidence: [evidenceExpiring(jade, safeguarding, 730)], assignments: [a],
    });
    expect(s.toDo).toBe(0);
    expect(s.complete).toBe(true);
    expect(s.nextUp).toEqual({ kind: 'allCaughtUp' });
  });

  it('does not double count an assignment whose module satisfies a requirement already counted', () => {
    const maureen = person('Maureen', 'Clarke');
    const s = staffSummary({
      ...base, person: maureen, requirements: [food], modules: [foodModule], submissions: [],
      evidence: [evidenceExpiring(maureen, food, 20)], assignments: [assignment(maureen, foodModule.id, 10)],
    });
    expect(s.toDo).toBe(1);
  });

  it('counts expiring soon (Maureen food hygiene in 20 days) as to do', () => {
    const maureen = person('Maureen', 'Clarke');
    const s = staffSummary({
      ...base, person: maureen, requirements: [food], modules: [foodModule], submissions: [],
      evidence: [evidenceExpiring(maureen, food, 20)], assignments: [],
    });
    expect(s.toDo).toBe(1);
    expect(s.complete).toBe(false);
    expect(s.rows[0]).toMatchObject({ status: 'expiringSoon', cadenceMonths: 36, moduleId: foodModule.id });
  });

  it('counts overdue and not started as to do', () => {
    const p = person('Mark', 'Taylor');
    const s = staffSummary({
      ...base, person: p, requirements: [aid, later], modules: [], submissions: [],
      evidence: [evidenceExpiring(p, aid, -8)], assignments: [],
    });
    expect(s.toDo).toBe(2);
    expect(s.rows.map((r) => r.status)).toEqual(['overdue', 'notStarted']);
  });

  it('shows awaiting check as waiting, not as to do (Ben)', () => {
    const ben = person('Ben', 'Carter');
    const s = staffSummary({
      ...base, person: ben, requirements: [safeguarding], modules: [], evidence: [],
      submissions: [submissionWaiting(ben, safeguarding)], assignments: [],
    });
    expect(s.waiting).toBe(1);
    expect(s.toDo).toBe(0);
    expect(s.complete).toBe(true);
  });

  it('leaves out requirements that do not apply to the person', () => {
    const p = person('Ellie', 'Brown');
    const cooksOnly = requirement('Cooks only', { appliesTo: { jobRoleIds: [nextId()] } });
    const s = staffSummary({
      ...base, person: p, requirements: [cooksOnly, safeguarding], modules: [], evidence: [], submissions: [], assignments: [],
    });
    expect(s.rows.map((r) => r.requirement.id)).toEqual([safeguarding.id]);
  });

  it('reports last done, next renewal and cadence for a current requirement', () => {
    const p = person('Priya', 'Shah');
    const e = evidenceExpiring(p, safeguarding, 200);
    const s = staffSummary({
      ...base, person: p, requirements: [safeguarding], modules: [], evidence: [e], submissions: [], assignments: [],
    });
    expect(s.rows[0]).toMatchObject({
      status: 'current', lastDoneAt: e.completedAt, nextRenewalAt: e.expiresAt, cadenceMonths: 24,
    });
  });

  it('only offers published modules as the satisfying module', () => {
    const p = person('Priya', 'Shah');
    const draft = moduleFor({ id: nextId(), status: 'draft', requirementIds: [food.id] });
    const s = staffSummary({
      ...base, person: p, requirements: [food], modules: [draft], evidence: [], submissions: [], assignments: [],
    });
    expect(s.rows[0]?.moduleId).toBeUndefined();
  });

  it('Next up is the open assignment with the earliest due date', () => {
    const p = person('Jade', 'Mills');
    const late = assignment(p, foodModule.id, 20);
    const soon = assignment(p, safeguardingModule.id, 5);
    const s = staffSummary({
      ...base, person: p, requirements: [], modules: [foodModule, safeguardingModule], evidence: [], submissions: [],
      assignments: [late, soon, assignment(p, foodModule.id, 1, { status: 'cancelled' })],
    });
    expect(s.nextUp).toEqual({ kind: 'assignment', assignment: soon });
  });

  it('Next up falls back to the most urgent requirement with a published module: overdue, then expiring, then not started', () => {
    const p = person('Mark', 'Taylor');
    const aidModule = moduleFor({ id: nextId(), requirementIds: [aid.id] });
    const s = staffSummary({
      ...base, person: p, requirements: [later, food, aid], modules: [aidModule, foodModule, moduleFor({ id: nextId(), requirementIds: [later.id] })],
      evidence: [evidenceExpiring(p, aid, -8), evidenceExpiring(p, food, 20)], submissions: [], assignments: [],
    });
    expect(s.nextUp).toEqual({ kind: 'requirement', requirementId: aid.id, moduleId: aidModule.id });
  });

  it('Next up skips requirements that no published module satisfies, then says all caught up', () => {
    const p = person('Mark', 'Taylor');
    const s = staffSummary({
      ...base, person: p, requirements: [aid], modules: [], evidence: [evidenceExpiring(p, aid, -8)],
      submissions: [], assignments: [],
    });
    expect(s.nextUp).toEqual({ kind: 'allCaughtUp' });
  });

  it('Coming up lists the next three future dates inside 90 days, in date order', () => {
    const jade = person('Jade', 'Mills');
    const r1 = requirement('R1', { renewEveryMonths: 12 });
    const r2 = requirement('R2', { renewEveryMonths: 12 });
    const r3 = requirement('R3', { renewEveryMonths: 12 });
    const far = requirement('Far', { renewEveryMonths: 12 });
    const a = assignment(jade, safeguardingModule.id, 14);
    const s = staffSummary({
      ...base, person: jade, requirements: [far, r3, r2, r1, safeguarding], modules: [safeguardingModule],
      evidence: [
        evidenceExpiring(jade, r1, 40), evidenceExpiring(jade, r2, 70), evidenceExpiring(jade, r3, 85),
        evidenceExpiring(jade, far, 120), evidenceExpiring(jade, safeguarding, 180),
      ],
      submissions: [], assignments: [a],
    });
    expect(s.comingUp.map((c) => c.at)).toEqual([
      addDays(NOW, 14).toISOString(), addDays(NOW, 40).toISOString(), addDays(NOW, 70).toISOString(),
    ]);
    expect(s.comingUp[0]?.kind).toBe('assignmentDue');
    expect(s.comingUp[1]?.kind).toBe('requirementExpiry');
  });
});
