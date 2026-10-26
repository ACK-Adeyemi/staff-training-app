// The first aiders list and 12-week forecast (brief 28.3, 27.4; plan M3 assumption 23).
// The domain does not know the pack's requirement key: the caller passes the first aid Requirement.
import { addDays, addMonths, londonDateString, mondayOfWeek } from '../dates';
import { adminConfig } from '../config/admin';
import type { Evidence } from '../schemas/evidence';
import type { Requirement } from '../schemas/packs';
import type { Person, Site } from '../schemas/tenancy';

export type FirstAiderInput = {
  people: Person[];
  sites: Site[];
  requirement: Requirement;
  evidence: Evidence[];
  now: Date;
};

export type ForecastWeek = { weekStart: string; count: number; belowThreshold: boolean };

const latestFor = (evidence: Evidence[], personId: string, requirementId: string): Evidence | undefined => {
  let latest: Evidence | undefined;
  for (const e of evidence) {
    if (e.personId !== personId || e.requirementId !== requirementId) continue;
    if (!latest || new Date(e.completedAt).getTime() > new Date(latest.completedAt).getTime()) latest = e;
  }
  return latest;
};

/** Expiry in ms; Infinity when the evidence never expires. */
const expiryOf = (e: Evidence, r: Requirement): number => {
  if (e.expiresAt) return new Date(e.expiresAt).getTime();
  if (r.renewEveryMonths !== undefined) return addMonths(new Date(e.completedAt), r.renewEveryMonths).getTime();
  return Infinity;
};

const active = (p: Person): boolean => p.status === 'active';

/** Active people whose latest certificate has not expired, by last name then first name. */
export function currentFirstAiders(input: FirstAiderInput): { person: Person; evidence: Evidence }[] {
  const out: { person: Person; evidence: Evidence }[] = [];
  for (const person of input.people.filter(active)) {
    const evidence = latestFor(input.evidence, person.id, input.requirement.id);
    if (evidence && expiryOf(evidence, input.requirement) > input.now.getTime()) out.push({ person, evidence });
  }
  return out.sort(
    (a, b) =>
      a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName),
  );
}

/** Per London week (Monday 00:00), how many people are still current, overall and by primary site. */
export function firstAiderForecast(input: FirstAiderInput & { threshold: number; weeks?: number }): {
  all: ForecastWeek[];
  bySite: Record<string, ForecastWeek[]>;
} {
  const weeks = input.weeks ?? adminConfig.firstAiderForecastWeeks;
  const first = mondayOfWeek(input.now);
  const people = input.people.filter(active).map((person) => {
    const e = latestFor(input.evidence, person.id, input.requirement.id);
    return { siteId: person.primarySiteId, expiry: e ? expiryOf(e, input.requirement) : -Infinity };
  });
  const week = (start: Date, count: number): ForecastWeek => ({
    weekStart: londonDateString(start),
    count,
    belowThreshold: count < input.threshold,
  });
  const starts = Array.from({ length: weeks }, (_, i) => addDays(first, 7 * i));
  const countAt = (t: Date, siteId?: string): number =>
    people.filter((p) => (siteId === undefined || p.siteId === siteId) && p.expiry > t.getTime()).length;
  return {
    all: starts.map((s) => week(s, countAt(s))),
    bySite: Object.fromEntries(input.sites.map((site) => [site.id, starts.map((s) => week(s, countAt(s, site.id)))])),
  };
}
