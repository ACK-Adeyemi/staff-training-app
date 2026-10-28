// The Sites board (brief 13.5; plan M3 assumption 39). Per-person and percentage measures only, so a big site has no edge.
// Eligible people: active, started at least newStarterDays ago, counted at their primary site only.
import { adminConfig } from '../config/admin';
import { correctQuestions, dueCompletion, masteredCount, scopedEvents } from '../competitions/calc';
import { addDays } from '../dates';
import { percentOf } from '../progress/client';
import { personRequirementRows } from '../progress/client';
import type { EvidenceSubmission } from '../schemas/evidence';
import type { Person, Site } from '../schemas/tenancy';
import { boardWindow, type BoardInput } from '../standingBoards';

export type SiteMeasure = 'compliance' | 'onTime' | 'participation' | 'knowledge';
export type SiteBoardPeriod = 'thisMonth' | 'thisQuarter';
export type SiteBoardInput = BoardInput & { sites: Site[]; submissions: EvidenceSubmission[]; amberWindowDays: number };
export type SiteBoardEntry = { siteId: string; value: number; eligible: number; small: boolean; rank: number };
export type SiteBoardOptions = {
  excludeSmall?: boolean;
  excludedSiteIds?: string[];
  /** A site with fewer eligible people than this is small. Defaults to the platform minimum. */
  smallSiteMin?: number;
};

export function siteLeaderboard(
  measure: SiteMeasure,
  period: SiteBoardPeriod,
  input: SiteBoardInput,
  options: SiteBoardOptions = {},
): SiteBoardEntry[] {
  const clients = new Set([...input.people.map((p) => p.clientId), ...input.sites.map((s) => s.clientId)]);
  if (clients.size > 1) throw new Error('Site boards never mix clients');

  const window = boardWindow(period, input.now);
  const cutoff = addDays(input.now, -adminConfig.newStarterDays).getTime();
  const eligible = input.people.filter((p) => p.status === 'active' && new Date(p.startDate).getTime() <= cutoff);
  const excluded = new Set(options.excludedSiteIds ?? []);

  const rows = input.sites
    .filter((s) => s.status === 'active' && !excluded.has(s.id))
    .map((site) => {
      const people = eligible.filter((p) => p.primarySiteId === site.id);
      return { siteId: site.id, name: site.name, people, value: measureValue(measure, site, people, window, input) };
    })
    .map((r) => ({ ...r, small: r.people.length < (options.smallSiteMin ?? adminConfig.smallSiteMinimum) }))
    .filter((r) => !(options.excludeSmall === true && r.small))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'en-GB'));

  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.value !== (rows[i - 1] as { value: number }).value) rank = i + 1;
    return { siteId: r.siteId, value: r.value, eligible: r.people.length, small: r.small, rank };
  });
}

function measureValue(
  measure: SiteMeasure,
  site: Site,
  people: Person[],
  window: { start: number; end: number },
  input: SiteBoardInput,
): number {
  if (people.length === 0) return 0;
  const ids = new Set(people.map((p) => p.id));
  const events = () => scopedEvents(input.events, { window, people: ids, closedOnly: false, attempts: input.attempts });
  switch (measure) {
    case 'participation':
      return percentOf(new Set(events().map((e) => e.personId)).size, people.length);
    case 'knowledge': {
      const credited = correctQuestions(events(), input.modules);
      let mastered = 0;
      for (const p of people) mastered += masteredCount(credited.get(p.id), input.modules);
      return Math.round((mastered / people.length) * 10) / 10;
    }
    case 'onTime':
      return (
        dueCompletion({
          units: [{ id: site.id, members: () => true }],
          people,
          assignments: input.assignments,
          events: input.events,
          window,
        }).values.get(site.id) ?? 0
      );
    case 'compliance': {
      const view = {
        people,
        sites: input.sites,
        requirements: [...input.requirements],
        evidence: input.evidence.filter((e) => ids.has(e.personId)),
        submissions: input.submissions.filter((s) => ids.has(s.personId)),
        now: input.now,
        amberWindowDays: input.amberWindowDays,
      };
      const items = people.flatMap((p) => personRequirementRows(view, p));
      const good = items.filter((i) => i.status === 'current' || i.status === 'expiringSoon').length;
      return percentOf(good, items.length);
    }
  }
}

export type SiteBoardRow = { rank: number; siteId: string; value: number; isViewer: boolean };
export type SiteBoardAudience = 'staff' | 'manager' | 'group';
export type SiteBoardView = {
  rows: SiteBoardRow[];
  own: SiteBoardRow | null;
  toNext: { people: number } | null;
  detail?: SiteBoardEntry;
};

const TOP = 10;

/** Staff and managers see the top 10 plus their own row, never a bottom list. Group admins see everything. */
export function siteBoardView(
  entries: SiteBoardEntry[],
  opts: { viewerSiteId: string; audience: SiteBoardAudience; measure: SiteMeasure },
): SiteBoardView {
  const row = (e: SiteBoardEntry): SiteBoardRow => ({
    rank: e.rank,
    siteId: e.siteId,
    value: e.value,
    isViewer: e.siteId === opts.viewerSiteId,
  });
  const mine = entries.find((e) => e.siteId === opts.viewerSiteId);
  const own = mine ? row(mine) : null;
  const rows = (opts.audience === 'group' ? entries : entries.slice(0, TOP)).map(row);
  if (own && !rows.some((r) => r.siteId === own.siteId)) rows.push(own);

  let toNext: { people: number } | null = null;
  if (mine && opts.measure === 'participation') {
    const above = entries.filter((e) => e.value > mine.value).at(-1); // the site directly above
    if (above) {
      const have = Math.round((mine.value * mine.eligible) / 100);
      const need = Math.ceil((above.value * mine.eligible) / 100 - 1e-9);
      toNext = { people: Math.max(1, need - have) };
    }
  }
  return {
    rows,
    own,
    toNext,
    ...(opts.audience === 'manager' && mine ? { detail: mine } : {}),
  };
}
