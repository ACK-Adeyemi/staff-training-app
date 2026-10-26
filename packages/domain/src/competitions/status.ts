// Derived competition status, eligibility and when the closed-book choice applies (plan M2 assumptions 12, 14, 19).
import type { Competition } from '../schemas/engagement';
import type { Person } from '../schemas/tenancy';

export type CompetitionStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled';

/** Stored status is draft, scheduled or cancelled; live and ended come from the dates, so Fast-forward moves them on. */
export function competitionStatus(c: Pick<Competition, 'status' | 'startAt' | 'endAt'>, now: Date): CompetitionStatus {
  if (c.status === 'draft' || c.status === 'cancelled') return c.status;
  const t = now.getTime();
  if (t < new Date(c.startAt).getTime()) return 'scheduled';
  if (t < new Date(c.endAt).getTime()) return 'live';
  return 'ended';
}

const matches = (list: readonly string[] | undefined, mine: readonly string[]): boolean =>
  list === undefined || list.length === 0 || mine.some((id) => list.includes(id));

/** Active people only, narrowed by each list that is set, minus named exclusions. */
export function isEligible(c: Pick<Competition, 'eligibility'>, person: Person): boolean {
  if (person.status !== 'active') return false;
  const e = c.eligibility;
  if (e.excludePersonIds.includes(person.id)) return false;
  return (
    matches(e.jobRoleIds, person.jobRoleIds) &&
    matches(e.teamIds, person.teamIds) &&
    matches(e.siteIds, [person.primarySiteId, ...person.additionalSiteIds])
  );
}

/** True when a live, closed-book-only competition the person is eligible for covers the module. */
export function closedBookChoiceApplies(
  competitions: readonly Competition[],
  person: Person,
  moduleId: string,
  now: Date,
): boolean {
  return competitions.some(
    (c) =>
      c.type === 'builtIn' &&
      c.closedBookOnly === true &&
      competitionStatus(c, now) === 'live' &&
      isEligible(c, person) &&
      (c.moduleIds === undefined || c.moduleIds.length === 0 || c.moduleIds.includes(moduleId)),
  );
}
