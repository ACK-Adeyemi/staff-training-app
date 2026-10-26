// Requirement status: pure rules for what a person's evidence says about one requirement.
// Brief 27.6 and plan Assumption 20.
import { addDays, addMonths, daysBetween } from './dates';
import { requirementApplies } from './packs';
import type { Evidence, EvidenceSubmission } from './schemas/evidence';
import type { Requirement } from './schemas/packs';
import type { Person, Site } from './schemas/tenancy';

export type RequirementStatusName =
  'current' | 'expiringSoon' | 'awaitingCheck' | 'overdue' | 'notStarted' | 'notAssigned';

export type RequirementStatus = {
  status: RequirementStatusName;
  expiresAt?: string;
  daysLeft?: number;
  evidenceWaiting?: boolean;
};

/** Evidence and submissions are expected to be for one person; they are filtered to the requirement here. */
export function requirementStatus(
  requirement: Requirement,
  evidence: Evidence[],
  submissions: EvidenceSubmission[],
  now: Date,
  amberWindowDays: number,
): RequirementStatus {
  const waiting = submissions.some((s) => s.requirementId === requirement.id && s.status === 'awaitingCheck');
  let latest: Evidence | undefined;
  for (const e of evidence) {
    if (e.requirementId !== requirement.id) continue;
    if (!latest || new Date(e.completedAt).getTime() > new Date(latest.completedAt).getTime()) latest = e;
  }
  if (!latest) return { status: waiting ? 'awaitingCheck' : 'notStarted' };

  let expiry: Date | undefined;
  if (latest.expiresAt) expiry = new Date(latest.expiresAt);
  else if (requirement.renewEveryMonths !== undefined) {
    expiry = addMonths(new Date(latest.completedAt), requirement.renewEveryMonths);
  }
  if (!expiry) return { status: 'current' };

  const expiresAt = expiry.toISOString();
  const daysLeft = daysBetween(now, expiry);
  if (expiry.getTime() <= now.getTime()) {
    return { status: 'overdue', expiresAt, daysLeft, ...(waiting ? { evidenceWaiting: true } : {}) };
  }
  if (expiry.getTime() <= addDays(now, amberWindowDays).getTime()) {
    return { status: waiting ? 'awaitingCheck' : 'expiringSoon', expiresAt, daysLeft };
  }
  return { status: 'current', expiresAt, daysLeft };
}

export function personRequirementStatus(
  requirement: Requirement,
  person: Person,
  site: Site,
  evidence: Evidence[],
  submissions: EvidenceSubmission[],
  now: Date,
  amberWindowDays: number,
): RequirementStatus {
  if (!requirementApplies(requirement, person, site)) return { status: 'notAssigned' };
  return requirementStatus(requirement, evidence, submissions, now, amberWindowDays);
}
