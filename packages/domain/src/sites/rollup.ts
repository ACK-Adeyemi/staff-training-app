// Multi-site roll-ups for the client admin (brief 14; plan M3 assumptions 36 and 37).
// A person is counted once, at their primary site. Floating staff appear under "Also works here" at other sites.
import { dueCompletion } from '../competitions/calc';
import { addDays } from '../dates';
import { needsAttention, orgCompliance, percentOf, type ClientView } from '../progress/client';
import type { Assignment, LearningEvent } from '../schemas/learning';
import type { Person } from '../schemas/tenancy';

export type SiteView = ClientView & { assignments: Assignment[]; events: LearningEvent[] };

export type SiteRollup = {
  siteId: string;
  staff: number;
  compliancePercent: number;
  overdue: number;
  expiring: number;
  completionRate: number;
};

const counted = (p: Person): boolean => p.status === 'active' || p.status === 'onLeave';

/** The view narrowed to one site's people (by primary site), or the whole organisation for 'all'. */
export function viewForSite(view: SiteView, siteId: string): SiteView & { alsoWorksHere: Person[] } {
  if (siteId === 'all') return { ...view, alsoWorksHere: [] };
  const people = view.people.filter((p) => p.primarySiteId === siteId);
  const ids = new Set(people.map((p) => p.id));
  return {
    ...view,
    people,
    evidence: view.evidence.filter((e) => ids.has(e.personId)),
    submissions: view.submissions.filter((s) => ids.has(s.personId)),
    assignments: view.assignments.filter((a) => ids.has(a.personId)),
    events: view.events.filter((e) => ids.has(e.personId)),
    alsoWorksHere: view.people.filter((p) => p.primarySiteId !== siteId && p.additionalSiteIds.includes(siteId)),
  };
}

const COMPLETION_DAYS = 90;

export function siteRollup(view: SiteView, siteId: string): SiteRollup {
  const v = viewForSite(view, siteId);
  const { compliant, total } = orgCompliance(v);
  const items = needsAttention(v);
  const due = dueCompletion({
    units: [{ id: siteId, members: () => true }],
    people: v.people.filter(counted),
    assignments: v.assignments,
    events: v.events,
    window: { start: addDays(view.now, -COMPLETION_DAYS).getTime(), end: view.now.getTime() + 1 },
  });
  return {
    siteId,
    staff: total,
    compliancePercent: percentOf(compliant, total),
    overdue: items.filter((i) => i.status === 'overdue').length,
    expiring: items.filter((i) => i.status === 'expiringSoon').length,
    completionRate: due.values.get(siteId) ?? 0,
  };
}

/** Active sites, the one needing most attention first: lowest compliance, most overdue, then name. */
export function siteComparison(view: SiteView): SiteRollup[] {
  const names = new Map(view.sites.map((s) => [s.id, s.name]));
  return view.sites
    .filter((s) => s.status === 'active')
    .map((s) => siteRollup(view, s.id))
    .sort(
      (a, b) =>
        a.compliancePercent - b.compliancePercent ||
        b.overdue - a.overdue ||
        (names.get(a.siteId) ?? '').localeCompare(names.get(b.siteId) ?? ''),
    );
}
