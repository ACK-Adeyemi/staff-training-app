// Badges, derived from history with the instant each was earned (brief 16.3; plan M2 assumption 6).
// No badge depends on speed. Battle Room badges arrive in M7.
import { requirementStatus } from '../requirements';
import { requirementApplies } from '../packs';
import type { Competition } from '../schemas/engagement';
import type { Evidence } from '../schemas/evidence';
import type { Attempt, LearningEvent, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Site } from '../schemas/tenancy';
import { engagementConfig } from './config';
import type { EngagementConfig } from './config';
import { creditFacts, isEarlyRefresher, orderEvents } from './xp';
import { londonWeekKey } from './weeks';

export type BadgeKind =
  | 'firstModule'
  | 'safeguardingReady'
  | 'mastery'
  | 'earlyBird'
  | 'scenarioSavvy'
  | 'learningHabit'
  | 'allCompliant'
  | 'competitionWinner';

export type BadgeDefinition = { id: string; kind: BadgeKind; moduleId?: string };

export type BadgeInput = {
  definitions: readonly BadgeDefinition[];
  events: readonly LearningEvent[];
  attempts: readonly Attempt[];
  modules: readonly Module[];
  evidence: readonly Evidence[];
  requirements: readonly Requirement[];
  competitions: readonly Pick<Competition, 'id' | 'winners'>[];
  person: Person;
  site: Site;
  config?: EngagementConfig;
};

export type EarnedBadgeRow = { badgeId: string; at: string };
export type BadgeProgress = {
  badgeId: string;
  earned: boolean;
  at?: string;
  current: number;
  target: number;
};

const time = (iso: string): number => new Date(iso).getTime();
const earliest = (xs: readonly string[]): string | undefined =>
  xs.length === 0 ? undefined : xs.reduce((a, b) => (time(b) < time(a) ? b : a));

/** How far each badge is and when it was earned (if it was). Mastery has one row per module. */
function evaluate(input: BadgeInput, now?: Date): BadgeProgress[] {
  const cfg = input.config ?? engagementConfig;
  const { person } = input;
  const events = orderEvents(input.events.filter((e) => e.personId === person.id));
  const evidence = input.evidence.filter((e) => e.personId === person.id);
  const passes = events.filter((e) => e.type === 'moduleCompleted');
  const out: BadgeProgress[] = [];

  const row = (badgeId: string, at: string | undefined, current: number, target: number): void => {
    out.push(
      at !== undefined
        ? { badgeId, earned: true, at, current: target, target }
        : { badgeId, earned: false, current: Math.min(current, target), target },
    );
  };

  for (const def of input.definitions) {
    switch (def.kind) {
      case 'firstModule':
        row(def.id, passes[0]?.at, passes.length, 1);
        break;
      case 'safeguardingReady':
        row(def.id, def.moduleId ? passes.find((e) => e.moduleId === def.moduleId)?.at : undefined, 0, 1);
        break;
      case 'mastery': {
        const facts = creditFacts(events, input.modules);
        for (const m of input.modules) {
          const at = facts.find((f) => f.mastery && f.event.moduleId === m.id)?.event.at;
          const credited = new Set(
            facts.filter((f) => f.event.moduleId === m.id).map((f) => f.event.questionId as string),
          );
          const have = m.questions.filter((q) => credited.has(q.id)).length;
          row(`${def.id}:${m.id}`, at, have, Math.max(1, m.questions.length));
        }
        break;
      }
      case 'earlyBird': {
        const hit = passes.find((e) => isEarlyRefresher(e, input.modules, evidence, input.requirements));
        row(def.id, hit?.at, 0, 1);
        break;
      }
      case 'scenarioSavvy': {
        const seen = new Set<string>();
        let at: string | undefined;
        for (const e of events) {
          if (e.type !== 'questionAnswered' || e.scenarioOutcome !== 'best' || e.correct === false) continue;
          seen.add(`${e.moduleId}|${e.questionId}`);
          if (seen.size === cfg.scenarioSavvyCount) {
            at = e.at;
            break;
          }
        }
        row(def.id, at, seen.size, cfg.scenarioSavvyCount);
        break;
      }
      case 'learningHabit': {
        const weeks = new Set<string>();
        let at: string | undefined;
        for (const e of events) {
          if (e.type !== 'lessonCompleted' && e.type !== 'attemptFinished') continue;
          weeks.add(londonWeekKey(e.at));
          if (weeks.size === cfg.learningHabitWeeks) {
            at = e.at;
            break;
          }
        }
        row(def.id, at, weeks.size, cfg.learningHabitWeeks);
        break;
      }
      case 'allCompliant': {
        const applicable = input.requirements.filter((r) => requirementApplies(r, person, input.site));
        const ok = (when: Date): number =>
          applicable.filter((r) => {
            const s = requirementStatus(
              r,
              evidence.filter((ev) => time(ev.completedAt) <= when.getTime()),
              [],
              when,
              cfg.amberWindowDays,
            ).status;
            return s === 'current' || s === 'expiringSoon';
          }).length;
        let at: string | undefined;
        if (applicable.length > 0) {
          const instants = [...new Set(evidence.map((ev) => ev.completedAt))].sort((a, b) => time(a) - time(b));
          at = instants.find((i) => ok(new Date(i)) === applicable.length);
        }
        row(def.id, at, now ? ok(now) : 0, Math.max(1, applicable.length));
        break;
      }
      case 'competitionWinner': {
        const at = earliest(
          input.competitions.flatMap((c) =>
            (c.winners ?? []).filter((w) => w.personId === person.id).map((w) => w.recordedAt),
          ),
        );
        row(def.id, at, 0, 1);
        break;
      }
    }
  }
  return out;
}

export function earnedBadges(input: BadgeInput): EarnedBadgeRow[] {
  return evaluate(input)
    .flatMap((b) => (b.earned && b.at !== undefined ? [{ badgeId: b.badgeId, at: b.at }] : []))
    .sort((a, b) => time(a.at) - time(b.at) || (a.badgeId < b.badgeId ? -1 : 1));
}

/** Earned badges with their instant, and the rest as next goals with current and target. */
export function badgeProgress(input: BadgeInput & { now: Date }): BadgeProgress[] {
  return evaluate(input, input.now);
}
