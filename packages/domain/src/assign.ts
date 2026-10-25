// Planning an assignment action and working out due dates. Plan Assumption 14.
import { fromLondonWall, startOfLondonDay } from './dates';
import type { Assignment } from './schemas/learning';
import type { Person } from './schemas/tenancy';

export type AssignmentPlan = {
  toCreate: string[];
  skipped: { personId: string; reason: 'alreadyAssigned' }[];
  invalid: { personId: string; reason: 'archived' | 'unknown' }[];
};

export type PlanAssignmentInput = {
  moduleId: string;
  personIds: string[];
  people: Person[];
  existing: Assignment[];
  dueAt: string;
  now: Date;
};

export function planAssignment({ moduleId, personIds, people, existing }: PlanAssignmentInput): AssignmentPlan {
  const known = new Map(people.map((p) => [p.id, p]));
  const hasOpen = new Set(
    existing
      .filter((a) => a.status === 'open' && 'moduleId' in a.target && a.target.moduleId === moduleId)
      .map((a) => a.personId),
  );
  const plan: AssignmentPlan = { toCreate: [], skipped: [], invalid: [] };
  for (const id of new Set(personIds)) {
    const person = known.get(id);
    if (!person) plan.invalid.push({ personId: id, reason: 'unknown' });
    else if (person.status === 'archived') plan.invalid.push({ personId: id, reason: 'archived' });
    else if (hasOpen.has(id)) plan.skipped.push({ personId: id, reason: 'alreadyAssigned' });
    else plan.toCreate.push(id);
  }
  return plan;
}

/** 23:59 London time on the given calendar day, as an ISO UTC string. Throws on anything but a real YYYY-MM-DD. */
export function dueAtFromLondonDate(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error('Expected a date as YYYY-MM-DD');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error('That date does not exist');
  }
  return fromLondonWall({ y, m: mo, d, h: 23, mi: 59, s: 0, ms: 0 }).toISOString();
}

/** True when the due date falls on an earlier London day than today. The end of today is still fine. */
export function isDueInPast(dueAt: string, now: Date): boolean {
  return new Date(dueAt).getTime() < startOfLondonDay(now).getTime();
}
