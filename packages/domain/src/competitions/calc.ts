// Shared counting used by competition metrics and standing boards. Pure; takes plain data.
// Only questionAnswered, lessonCompleted, attemptFinished, moduleCompleted and Evidence feed these (never XP or timing).
import { addMonths } from '../dates';
import { activeWeeks } from '../engagement/weeks';
import type { Evidence } from '../schemas/evidence';
import type { Assignment, Attempt, LearningEvent, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Team } from '../schemas/tenancy';

/** Half-open window in epoch ms: start included, end excluded. */
export type Window = { start: number; end: number };
export const ALL_TIME: Window = { start: -Infinity, end: Infinity };

const ms = (iso: string): number => new Date(iso).getTime();
export const inWindow = (iso: string, w: Window): boolean => ms(iso) >= w.start && ms(iso) < w.end;

export type Scope = {
  window: Window;
  /** Ids of people who count. */
  people: ReadonlySet<string>;
  moduleIds?: readonly string[] | undefined;
  closedOnly: boolean;
  attempts: readonly Attempt[];
};

/** Events that count: in the window, by a counted person, in the chosen modules, not from an abandoned attempt. */
export function scopedEvents(events: readonly LearningEvent[], s: Scope): LearningEvent[] {
  const attempts = new Map(s.attempts.map((a) => [a.id, a]));
  const restrict = s.moduleIds !== undefined && s.moduleIds.length > 0 ? s.moduleIds : undefined;
  return events.filter((e) => {
    if (!s.people.has(e.personId) || !inWindow(e.at, s.window)) return false;
    if (restrict && (e.moduleId === undefined || !restrict.includes(e.moduleId))) return false;
    const attempt = e.attemptId === undefined ? undefined : attempts.get(e.attemptId);
    if (attempt?.abandoned === true) return false;
    if (s.closedOnly && e.type === 'questionAnswered' && attempt?.mode !== 'closed') return false;
    return true;
  });
}

export const questionKey = (moduleId: string, questionId: string): string => `${moduleId}|${questionId}`;

/** Per person, the unique questions answered correctly. `best` also needs a scenario question with the best outcome. */
export function correctQuestions(
  events: readonly LearningEvent[],
  modules: readonly Module[],
  scenarioBestOnly = false,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (const e of events) {
    if (e.type !== 'questionAnswered' || e.correct !== true || !e.moduleId || !e.questionId) continue;
    if (scenarioBestOnly) {
      const q = byId.get(e.moduleId)?.questions.find((x) => x.id === e.questionId);
      if (q?.type !== 'scenario' || e.scenarioOutcome !== 'best') continue;
    }
    const set = out.get(e.personId) ?? new Set<string>();
    set.add(questionKey(e.moduleId, e.questionId));
    out.set(e.personId, set);
  }
  return out;
}

/** Modules (from the given list) whose whole current bank is in the set of credited questions. */
export function masteredCount(credited: ReadonlySet<string> | undefined, modules: readonly Module[]): number {
  if (!credited) return 0;
  return modules.filter(
    (m) => m.questions.length > 0 && m.questions.every((q) => credited.has(questionKey(m.id, q.id))),
  ).length;
}

/** Distinct London weeks with a lesson completed or an attempt finished, per person. */
export function activeWeekCounts(events: readonly LearningEvent[]): Map<string, number> {
  const by = new Map<string, LearningEvent[]>();
  for (const e of events) by.set(e.personId, [...(by.get(e.personId) ?? []), e]);
  return new Map([...by].map(([id, es]) => [id, activeWeeks(es).length]));
}

/** Distinct modules completed per person. */
export function completedModuleCounts(
  events: readonly LearningEvent[],
  published: ReadonlySet<string>,
): Map<string, number> {
  const by = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== 'moduleCompleted' || !e.moduleId || !published.has(e.moduleId)) continue;
    by.set(e.personId, (by.get(e.personId) ?? new Set<string>()).add(e.moduleId));
  }
  return new Map([...by].map(([id, s]) => [id, s.size]));
}

/**
 * Evidence completed before the previous Evidence for the same requirement expired.
 * Needs a renewal period on the requirement. Approved external Evidence counts by its completed date.
 */
export function earlyRefreshers(evidence: readonly Evidence[], requirements: readonly Requirement[]): Evidence[] {
  const counted = evidence.filter((e) => e.kind === 'module' || e.approvedAt !== undefined);
  const renewal = new Map(requirements.map((r) => [r.id, r.renewEveryMonths]));
  return counted.filter((e) => {
    const months = renewal.get(e.requirementId);
    if (months === undefined) return false;
    const previous = counted
      .filter(
        (p) =>
          p.personId === e.personId && p.requirementId === e.requirementId && ms(p.completedAt) < ms(e.completedAt),
      )
      .reduce<Evidence | undefined>(
        (best, p) => (!best || ms(p.completedAt) > ms(best.completedAt) ? p : best),
        undefined,
      );
    if (!previous) return false;
    const expiry =
      previous.expiresAt !== undefined
        ? ms(previous.expiresAt)
        : addMonths(new Date(previous.completedAt), months).getTime();
    return expiry > ms(e.completedAt);
  });
}

export type UnitResult = { values: Map<string, number>; unranked: Set<string> };

/**
 * Per unit (team or site): per cent, rounded down, of the members' module assignments due in the window that were
 * completed at or before their due date. Units with nothing due are listed as unranked.
 */
export function dueCompletion(input: {
  units: readonly { id: string; members: (p: Person) => boolean }[];
  people: readonly Person[];
  assignments: readonly Assignment[];
  events: readonly LearningEvent[];
  window: Window;
}): UnitResult {
  const completions = new Map<string, number[]>();
  for (const e of input.events) {
    if (e.type !== 'moduleCompleted' || !e.moduleId) continue;
    const key = `${e.personId}|${e.moduleId}`;
    completions.set(key, [...(completions.get(key) ?? []), ms(e.at)]);
  }
  const values = new Map<string, number>();
  const unranked = new Set<string>();
  for (const unit of input.units) {
    const members = new Set(input.people.filter(unit.members).map((p) => p.id));
    const due = input.assignments.filter(
      (a) =>
        members.has(a.personId) &&
        'moduleId' in a.target &&
        a.status !== 'cancelled' &&
        inWindow(a.dueAt, input.window),
    );
    if (due.length === 0) {
      unranked.add(unit.id);
      continue;
    }
    const done = due.filter((a) => {
      const moduleId = 'moduleId' in a.target ? a.target.moduleId : '';
      return (completions.get(`${a.personId}|${moduleId}`) ?? []).some((t) => t <= ms(a.dueAt));
    }).length;
    values.set(unit.id, Math.floor((done * 100) / due.length));
  }
  return { values, unranked };
}

export const teamUnits = (teams: readonly Team[]) =>
  teams.map((t) => ({ id: t.id, members: (p: Person) => p.teamIds.includes(t.id) }));

export const siteUnits = (people: readonly Person[]) =>
  [...new Set(people.map((p) => p.primarySiteId))].map((id) => ({
    id,
    members: (p: Person) => p.primarySiteId === id,
  }));

/** A map with an entry of 0 for each person, overlaid with the counts. */
export const withZeros = (people: readonly Person[], counts: ReadonlyMap<string, number>): Map<string, number> =>
  new Map(people.map((p) => [p.id, counts.get(p.id) ?? 0]));
