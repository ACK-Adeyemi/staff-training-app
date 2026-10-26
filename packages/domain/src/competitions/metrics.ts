// The eight competition template metrics (brief 13.4; plan M2 assumption 13).
// Only events with `at` in [startAt, endAt) count, for eligible people. XP, speed and timing are never inputs.
import type { Evidence } from '../schemas/evidence';
import type { Competition, CompetitionTemplateId } from '../schemas/engagement';
import type { Assignment, Attempt, LearningEvent, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Team } from '../schemas/tenancy';
import {
  type Window,
  activeWeekCounts,
  correctQuestions,
  dueCompletion,
  earlyRefreshers,
  inWindow,
  masteredCount,
  scopedEvents,
  siteUnits,
  teamUnits,
  withZeros,
} from './calc';
import { isEligible } from './status';

export type MetricInput = {
  competition: Competition;
  people: readonly Person[];
  teams: readonly Team[];
  events: readonly LearningEvent[];
  attempts: readonly Attempt[];
  assignments: readonly Assignment[];
  evidence: readonly Evidence[];
  requirements: readonly Requirement[];
  modules: readonly Module[];
};

export type MetricResult = {
  unit: 'person' | 'team' | 'site';
  /** Eligible people (or ranked units) and their value, zero included for people. */
  values: Map<string, number>;
  /** Units with nothing due, listed but not ranked. */
  unranked?: Set<string>;
  /** Who qualifies, for the draw templates. */
  qualifies?: Set<string>;
};

export function competitionMetric(template: CompetitionTemplateId, input: MetricInput): MetricResult {
  const c = input.competition;
  const window: Window = { start: new Date(c.startAt).getTime(), end: new Date(c.endAt).getTime() };
  const eligible = input.people.filter((p) => isEligible(c, p));
  const ids = new Set(eligible.map((p) => p.id));
  const closedOnly = template === 'closedBookChallenge' || c.closedBookOnly === true;
  const scope = { window, people: ids, moduleIds: c.moduleIds, closedOnly, attempts: input.attempts };
  const events = scopedEvents(input.events, scope);
  const inScope = (m: Module) => c.moduleIds === undefined || c.moduleIds.length === 0 || c.moduleIds.includes(m.id);
  const person = (counts: ReadonlyMap<string, number>): MetricResult => ({
    unit: 'person',
    values: withZeros(eligible, counts),
  });
  const sizes = (m: Map<string, Set<string>>) => new Map([...m].map(([id, s]) => [id, s.size]));

  switch (template) {
    case 'knowledgeBuilder':
    case 'closedBookChallenge':
      return person(sizes(correctQuestions(events, input.modules)));
    case 'scenarioSavvy':
      return person(sizes(correctQuestions(events, input.modules, true)));
    case 'masteryMonth': {
      const credited = correctQuestions(events, input.modules);
      const modules = input.modules.filter(inScope);
      return person(new Map([...credited].map(([id, s]) => [id, masteredCount(s, modules)])));
    }
    case 'learningStreak':
      return person(activeWeekCounts(events));
    case 'teamShowdown': {
      const unit = c.teamUnit === 'site' ? 'site' : 'team';
      const r = dueCompletion({
        units: unit === 'site' ? siteUnits(eligible) : teamUnits(input.teams),
        people: eligible,
        assignments: input.assignments,
        events: input.events,
        window,
      });
      return { unit, values: r.values, unranked: r.unranked };
    }
    case 'beatTheExpiry': {
      const early = earlyRefreshers(input.evidence, input.requirements).filter(
        (e) => ids.has(e.personId) && inWindow(e.completedAt, window),
      );
      const counts = new Map<string, number>();
      for (const e of early) counts.set(e.personId, (counts.get(e.personId) ?? 0) + 1);
      return { ...person(counts), qualifies: new Set(counts.keys()) };
    }
    case 'completeAndWin': {
      const wanted = c.moduleIds ?? [];
      const done = new Map<string, Set<string>>();
      for (const e of events) {
        if (e.type === 'moduleCompleted' && e.moduleId) {
          done.set(e.personId, (done.get(e.personId) ?? new Set<string>()).add(e.moduleId));
        }
      }
      const qualifies = new Set(
        eligible.filter((p) => wanted.length > 0 && wanted.every((m) => done.get(p.id)?.has(m))).map((p) => p.id),
      );
      return { ...person(new Map([...qualifies].map((id) => [id, 1]))), qualifies };
    }
  }
}
