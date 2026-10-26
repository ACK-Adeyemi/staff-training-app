// Client dashboard views over a whole organisation. Plan Assumptions 2 and 3.
import { addDays } from '../dates';
import { personRequirementStatus, type RequirementStatusName } from '../requirements';
import type { Assignment } from '../schemas/learning';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Requirement } from '../schemas/packs';
import type { Person, Site } from '../schemas/tenancy';

export type ClientView = {
  people: Person[];
  sites: Site[];
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  now: Date;
  amberWindowDays: number;
};

export type AttentionItem = {
  person: Person;
  requirement: Requirement;
  status: 'overdue' | 'expiringSoon' | 'notStarted';
  daysLeft?: number;
  expiresAt?: string;
};

type Cell = {
  person: Person;
  requirement: Requirement;
  status: RequirementStatusName;
  daysLeft?: number;
  expiresAt?: string;
};

const counted = (p: Person): boolean => p.status === 'active' || p.status === 'onLeave';
const byName = (a: Person, b: Person): number =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

/** A new starter is in induction for this many days; not starting a requirement yet is not a problem. */
export const NEW_STARTER_DAYS = 14;

const isNewStarter = (p: Person, now: Date): boolean => {
  const started = new Date(p.startDate).getTime();
  return started <= now.getTime() && started >= addDays(now, -NEW_STARTER_DAYS).getTime();
};

/** Every applicable (person, requirement) status for active and on-leave people. */
function cells(view: ClientView): Cell[] {
  const sites = new Map(view.sites.map((s) => [s.id, s]));
  const out: Cell[] = [];
  for (const person of view.people.filter(counted)) {
    const site = sites.get(person.primarySiteId);
    if (!site) continue;
    const ev = view.evidence.filter((e) => e.personId === person.id);
    const subs = view.submissions.filter((s) => s.personId === person.id);
    for (const requirement of view.requirements) {
      const s = personRequirementStatus(requirement, person, site, ev, subs, view.now, view.amberWindowDays);
      if (s.status === 'notAssigned') continue;
      out.push({
        person,
        requirement,
        status: s.status,
        ...(s.daysLeft !== undefined ? { daysLeft: s.daysLeft } : {}),
        ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}),
      });
    }
  }
  return out;
}

export function needsAttention(view: ClientView): AttentionItem[] {
  const rank = { overdue: 0, expiringSoon: 1, notStarted: 2 } as const;
  const items: AttentionItem[] = [];
  for (const c of cells(view)) {
    if (c.status !== 'overdue' && c.status !== 'expiringSoon' && c.status !== 'notStarted') continue;
    if (c.status === 'notStarted' && isNewStarter(c.person, view.now)) continue;
    items.push({
      person: c.person,
      requirement: c.requirement,
      status: c.status,
      ...(c.daysLeft !== undefined ? { daysLeft: c.daysLeft } : {}),
      ...(c.expiresAt ? { expiresAt: c.expiresAt } : {}),
    });
  }
  return items.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.status === 'notStarted' ? 0 : (a.daysLeft ?? 0) - (b.daysLeft ?? 0)) ||
      byName(a.person, b.person) ||
      a.requirement.name.localeCompare(b.requirement.name),
  );
}

export function waitingForCheck(view: ClientView): { person: Person; requirement: Requirement }[] {
  return cells(view)
    .filter((c) => c.status === 'awaitingCheck')
    .sort((a, b) => byName(a.person, b.person))
    .map(({ person, requirement }) => ({ person, requirement }));
}

export type ComplianceCounts = Record<'current' | 'expiringSoon' | 'awaitingCheck' | 'overdue' | 'notStarted', number>;

export function complianceByRequirement(
  view: ClientView,
): { requirement: Requirement; applicable: number; counts: ComplianceCounts }[] {
  const all = cells(view);
  return view.requirements.map((requirement) => {
    const counts: ComplianceCounts = { current: 0, expiringSoon: 0, awaitingCheck: 0, overdue: 0, notStarted: 0 };
    let applicable = 0;
    for (const c of all) {
      if (c.requirement.id !== requirement.id || c.status === 'notAssigned') continue;
      applicable++;
      counts[c.status]++;
    }
    return { requirement, applicable, counts };
  });
}

/** Compliant means nothing overdue, not started or waiting for a check. Current and due soon both count. */
export function orgCompliance(view: ClientView): { compliant: number; total: number } {
  const people = view.people.filter(counted);
  const bad = new Set<string>();
  for (const c of cells(view)) {
    if (c.status === 'notStarted' && isNewStarter(c.person, view.now)) continue;
    if (c.status === 'overdue' || c.status === 'notStarted' || c.status === 'awaitingCheck') bad.add(c.person.id);
  }
  return { compliant: people.filter((p) => !bad.has(p.id)).length, total: people.length };
}

export function recentlyCompleted(
  evidence: Evidence[],
  people: Person[],
  now: Date,
  days = 14,
): { person: Person; evidence: Evidence }[] {
  const from = addDays(now, -days).getTime();
  const byId = new Map(people.filter(counted).map((p) => [p.id, p]));
  const out: { person: Person; evidence: Evidence }[] = [];
  for (const e of evidence) {
    const t = new Date(e.completedAt).getTime();
    const person = byId.get(e.personId);
    if (person && t >= from && t <= now.getTime()) out.push({ person, evidence: e });
  }
  return out.sort((a, b) => new Date(b.evidence.completedAt).getTime() - new Date(a.evidence.completedAt).getTime());
}

export type PersonRequirementRow = {
  requirement: Requirement;
  status: Exclude<RequirementStatusName, 'notAssigned'>;
  daysLeft?: number;
  expiresAt?: string;
};

/** Worst first. Used for the one status word shown against a person in the people list. */
const WORST_FIRST = ['overdue', 'notStarted', 'awaitingCheck', 'expiringSoon', 'current'] as const;
export type PersonOverallStatus = (typeof WORST_FIRST)[number];

/** Each applicable requirement for one person, in the order the requirements were given. */
export function personRequirementRows(view: ClientView, person: Person): PersonRequirementRow[] {
  const site = view.sites.find((s) => s.id === person.primarySiteId);
  if (!site) return [];
  const ev = view.evidence.filter((e) => e.personId === person.id);
  const subs = view.submissions.filter((s) => s.personId === person.id);
  const rows: PersonRequirementRow[] = [];
  for (const requirement of view.requirements) {
    const s = personRequirementStatus(requirement, person, site, ev, subs, view.now, view.amberWindowDays);
    if (s.status === 'notAssigned') continue;
    rows.push({
      requirement,
      status: s.status,
      ...(s.daysLeft !== undefined ? { daysLeft: s.daysLeft } : {}),
      ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}),
    });
  }
  return rows;
}

/** The worst status among a person's requirements. A new starter's not-started items are ignored; nothing left is current. */
export function overallStatus(view: ClientView, person: Person): PersonOverallStatus {
  const starter = isNewStarter(person, view.now);
  const present = new Set(
    personRequirementRows(view, person)
      .filter((r) => !(starter && r.status === 'notStarted'))
      .map((r) => r.status),
  );
  return WORST_FIRST.find((s) => present.has(s)) ?? 'current';
}

/** A whole-number percentage, rounded; 0 when there is nothing to count. */
export function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part * 100) / total);
}

/** Open assignments for people who are in the list and not archived, soonest due first. */
export function openAssignmentsForActivePeople(assignments: Assignment[], people: Person[]): Assignment[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return assignments
    .filter((a) => a.status === 'open' && byId.has(a.personId) && byId.get(a.personId)?.status !== 'archived')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
