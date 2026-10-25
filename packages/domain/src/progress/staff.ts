// Staff summary: what one person has to do, is waiting on, and what comes next. Plan Assumptions 3 and 4.
import { personRequirementStatus, type RequirementStatusName } from '../requirements';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Assignment, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Site } from '../schemas/tenancy';

export type StaffRow = {
  requirement: Requirement;
  status: RequirementStatusName;
  lastDoneAt?: string;
  nextRenewalAt?: string;
  cadenceMonths?: number;
  moduleId?: string;
};

export type NextUp =
  | { kind: 'assignment'; assignment: Assignment }
  | { kind: 'requirement'; requirementId: string; moduleId: string }
  | { kind: 'allCaughtUp' };

export type ComingUpItem = {
  kind: 'assignmentDue' | 'requirementExpiry';
  at: string;
  assignmentId?: string;
  requirementId?: string;
};

export type StaffSummary = {
  rows: StaffRow[];
  toDo: number;
  waiting: number;
  complete: boolean;
  nextUp: NextUp;
  comingUp: ComingUpItem[];
};

export type StaffSummaryInput = {
  person: Person;
  site: Site;
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  assignments: Assignment[];
  modules: Module[];
  now: Date;
  amberWindowDays: number;
};

const COMING_UP_MAX = 3;

/** The first published module that satisfies the requirement. */
export function satisfyingModule(requirement: Requirement, modules: Module[]): Module | undefined {
  return modules.find(
    (m) =>
      m.status === 'published' &&
      (m.requirementIds.includes(requirement.id) || requirement.satisfiedByModuleIds.includes(m.id)),
  );
}

const time = (iso: string): number => new Date(iso).getTime();

export function staffSummary(input: StaffSummaryInput): StaffSummary {
  const { person, site, evidence, submissions, modules, now, amberWindowDays } = input;
  const mine = evidence.filter((e) => e.personId === person.id);
  const mySubs = submissions.filter((s) => s.personId === person.id);
  const open = input.assignments
    .filter((a) => a.personId === person.id && a.status === 'open')
    .sort((a, b) => time(a.dueAt) - time(b.dueAt));

  const rows: StaffRow[] = [];
  const detail = new Map<string, { status: RequirementStatusName; daysLeft?: number; expiresAt?: string }>();
  for (const requirement of input.requirements) {
    const s = personRequirementStatus(requirement, person, site, mine, mySubs, now, amberWindowDays);
    if (s.status === 'notAssigned') continue;
    detail.set(requirement.id, s);
    let last: Evidence | undefined;
    for (const e of mine) {
      if (e.requirementId === requirement.id && (!last || time(e.completedAt) > time(last.completedAt))) last = e;
    }
    const mod = satisfyingModule(requirement, modules);
    rows.push({
      requirement,
      status: s.status,
      ...(last ? { lastDoneAt: last.completedAt } : {}),
      ...(s.expiresAt ? { nextRenewalAt: s.expiresAt } : {}),
      ...(requirement.renewEveryMonths !== undefined ? { cadenceMonths: requirement.renewEveryMonths } : {}),
      ...(mod ? { moduleId: mod.id } : {}),
    });
  }

  const needs = rows.filter((r) => r.status === 'overdue' || r.status === 'notStarted' || r.status === 'expiringSoon');
  const covered = new Set(needs.map((r) => r.requirement.id));
  const countedAssignments = open.filter((a) => {
    if (!('moduleId' in a.target)) return true;
    const moduleId = a.target.moduleId;
    const mod = modules.find((m) => m.id === moduleId);
    const satisfies = input.requirements.some(
      (r) =>
        covered.has(r.id) &&
        ((mod?.requirementIds.includes(r.id) ?? false) || r.satisfiedByModuleIds.includes(moduleId)),
    );
    return !satisfies;
  });
  const toDo = needs.length + countedAssignments.length;
  const waiting = rows.filter((r) => r.status === 'awaitingCheck').length;

  const first = open[0];
  let nextUp: NextUp = { kind: 'allCaughtUp' };
  if (first) nextUp = { kind: 'assignment', assignment: first };
  else {
    const rank = (r: StaffRow): number => (r.status === 'overdue' ? 0 : r.status === 'expiringSoon' ? 1 : 2);
    const candidates = needs
      .filter((r) => r.moduleId !== undefined)
      .sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (detail.get(a.requirement.id)?.daysLeft ?? 0) - (detail.get(b.requirement.id)?.daysLeft ?? 0);
      });
    const pick = candidates[0];
    if (pick?.moduleId) nextUp = { kind: 'requirement', requirementId: pick.requirement.id, moduleId: pick.moduleId };
  }

  // The strip shows the next three future dates. Anything inside 90 days always comes first because the list is
  // sorted by date; later dates only fill the strip when fewer than three fall inside that window (decisions.md).
  const upcoming: ComingUpItem[] = [];
  for (const a of open) {
    if (time(a.dueAt) > now.getTime()) upcoming.push({ kind: 'assignmentDue', at: a.dueAt, assignmentId: a.id });
  }
  for (const r of rows) {
    const at = r.nextRenewalAt;
    if (at && time(at) > now.getTime())
      upcoming.push({ kind: 'requirementExpiry', at, requirementId: r.requirement.id });
  }
  upcoming.sort((a, b) => time(a.at) - time(b.at));

  return { rows, toDo, waiting, complete: toDo === 0, nextUp, comingUp: upcoming.slice(0, COMING_UP_MAX) };
}

/** How full the Home ring is, 0 to 100. Only 100 when nothing is left to do. */
export function staffRingPercent(summary: Pick<StaffSummary, 'rows' | 'toDo' | 'complete'>): number {
  if (summary.complete) return 100;
  const total = summary.rows.length + Math.max(0, summary.toDo - summary.rows.filter(needsAction).length);
  if (total <= 0) return 0;
  return Math.min(99, Math.max(0, Math.round((100 * (total - summary.toDo)) / total)));
}

function needsAction(r: StaffRow): boolean {
  return r.status === 'overdue' || r.status === 'notStarted' || r.status === 'expiringSoon';
}
