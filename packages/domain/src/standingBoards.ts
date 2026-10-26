// The six standing boards (brief 13.5; plan M2 assumptions 8, 10). XP is never an input.
// Active people only. Hiding people who opted out is the caller's job (see leaderboardView).
import { BOARD_IDS, standingBoardSettingsSchema, type BoardId, type StandingBoardSettings } from './schemas/engagement';
import type { LeaderboardScope } from './schemas/engagement';
import type { Site } from './schemas/tenancy';
import { peopleInScope } from './leaderboards/scopes';
import { fromLondonWall, londonDateString } from './dates';
import {
  ALL_TIME,
  type Window,
  activeWeekCounts,
  completedModuleCounts,
  correctQuestions,
  dueCompletion,
  earlyRefreshers,
  inWindow,
  masteredCount,
  scopedEvents,
  teamUnits,
  withZeros,
} from './competitions/calc';
import type { MetricInput, MetricResult } from './competitions/metrics';

export type BoardPeriod = 'allTime' | 'thisMonth' | 'thisQuarter';
export type BoardInput = Omit<MetricInput, 'competition'> & {
  now: Date;
  /** Narrows the people on every board to the viewer's site, region, country or all sites (brief 13.5). */
  scope?: { scope: LeaderboardScope; viewerSiteId: string; sites: Site[] };
};

const monthStart = (y: number, m: number): number => {
  const year = y + Math.floor((m - 1) / 12);
  const month = ((((m - 1) % 12) + 12) % 12) + 1;
  return fromLondonWall({ y: year, m: month, d: 1, h: 0, mi: 0, s: 0, ms: 0 }).getTime();
};

/** The period's window in London calendar time: month or quarter containing `now`. */
export function boardWindow(period: BoardPeriod, now: Date): Window {
  if (period === 'allTime') return ALL_TIME;
  const [y, m] = londonDateString(now).split('-').map(Number) as [number, number];
  const first = period === 'thisMonth' ? m : Math.floor((m - 1) / 3) * 3 + 1;
  const length = period === 'thisMonth' ? 1 : 3;
  return { start: monthStart(y, first), end: monthStart(y, first + length) };
}

export function standingBoard(board: BoardId, period: BoardPeriod, input: BoardInput): MetricResult {
  const window = boardWindow(period, input.now);
  const pool = input.scope
    ? peopleInScope(input.scope.scope, input.scope.viewerSiteId, input.scope.sites, input.people)
    : input.people;
  const active = pool.filter((p) => p.status === 'active');
  const ids = new Set(active.map((p) => p.id));
  const events = scopedEvents(input.events, { window, people: ids, closedOnly: false, attempts: input.attempts });
  const person = (counts: ReadonlyMap<string, number>): MetricResult => ({
    unit: 'person',
    values: withZeros(active, counts),
  });

  switch (board) {
    case 'correctQuestions':
      return person(new Map([...correctQuestions(events, input.modules)].map(([id, s]) => [id, s.size])));
    case 'modulesCompleted': {
      const published = new Set(input.modules.filter((m) => m.status === 'published').map((m) => m.id));
      return person(completedModuleCounts(events, published));
    }
    case 'modulesMastered':
      return person(
        new Map([...correctQuestions(events, input.modules)].map(([id, s]) => [id, masteredCount(s, input.modules)])),
      );
    case 'activeWeeks':
      return person(activeWeekCounts(events));
    case 'refresherChampions': {
      const counts = new Map<string, number>();
      for (const e of earlyRefreshers(input.evidence, input.requirements)) {
        if (ids.has(e.personId) && inWindow(e.completedAt, window))
          counts.set(e.personId, (counts.get(e.personId) ?? 0) + 1);
      }
      return person(counts);
    }
    case 'teamBoard': {
      const r = dueCompletion({
        units: teamUnits(input.teams),
        people: active,
        assignments: input.assignments,
        events: input.events,
        window,
      });
      return { unit: 'team', values: r.values, unranked: r.unranked };
    }
  }
}

/** What a client has before anyone saves settings: every board on, staff see their own site. */
export function defaultBoardSettings(clientId: string): StandingBoardSettings {
  return standingBoardSettingsSchema.parse({
    clientId,
    boards: Object.fromEntries(BOARD_IDS.map((id) => [id, { enabled: true, staffScopes: ['site'] }])),
  });
}
