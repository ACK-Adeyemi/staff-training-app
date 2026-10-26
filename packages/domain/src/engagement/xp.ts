// XP derived from learning events (brief 16.1 and 18.3; plan M2 assumptions 1 to 4). Never stored.
// Nothing here reads timing: `at` is used only to order events and to find the London day and week.
import { addMonths } from '../dates';
import { londonDateString } from '../dates';
import type { Evidence } from '../schemas/evidence';
import type { XpEntry } from '../schemas/engagement';
import type { Attempt, LearningEvent, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import { engagementConfig } from './config';
import type { EngagementConfig } from './config';
import { londonWeekKey } from './weeks';

/** A ledger line. The stored XpEntry schema has an id, but derived lines are identified by event and kind. */
export type XpLedgerEntry = Omit<XpEntry, 'id'>;
export type XpKind = XpEntry['kind'];

export type XpInput = {
  events: readonly LearningEvent[];
  attempts: readonly Attempt[];
  modules: readonly Module[];
  evidence: readonly Evidence[];
  requirements: readonly Requirement[];
  weeklyGoalLessons: number;
  /** The person the ledger is for. Defaults to the person with most events. */
  personId?: string;
  config?: EngagementConfig;
};

const time = (iso: string): number => new Date(iso).getTime();

/** Events in order: instant, then id. */
export const orderEvents = <T extends { at: string; id: string }>(events: readonly T[]): T[] =>
  [...events].sort((a, b) => time(a.at) - time(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const mainPerson = (events: readonly LearningEvent[]): string | undefined => {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.personId, (counts.get(e.personId) ?? 0) + 1);
  let best: string | undefined;
  for (const [id, n] of counts) {
    if (best === undefined || n > (counts.get(best) as number) || (n === counts.get(best) && id < best)) best = id;
  }
  return best;
};

const answerKey = (e: LearningEvent): string => `${e.moduleId}|${e.questionId}`;

/** Questions of the module's current bank that have a credited correct answer, in answer order. */
export type CreditFact = { event: LearningEvent; firstCredit: boolean; mastery: boolean };

/** For each correct answer in order: was it the first credited one for its question, and did it complete the bank? */
export function creditFacts(sortedEvents: readonly LearningEvent[], modules: readonly Module[]): CreditFact[] {
  const credited = new Set<string>();
  const mastered = new Set<string>();
  const out: CreditFact[] = [];
  for (const e of sortedEvents) {
    if (e.type !== 'questionAnswered' || e.correct !== true || !e.moduleId || !e.questionId) continue;
    const key = answerKey(e);
    const firstCredit = !credited.has(key);
    credited.add(key);
    let mastery = false;
    const mod = modules.find((m) => m.id === e.moduleId);
    if (mod && mod.questions.length > 0 && !mastered.has(mod.id)) {
      if (mod.questions.every((q) => credited.has(`${mod.id}|${q.id}`))) {
        mastered.add(mod.id);
        mastery = true;
      }
    }
    out.push({ event: e, firstCredit, mastery });
  }
  return out;
}

/** True when this pass created Evidence for a requirement whose previous Evidence had not yet expired. */
export function isEarlyRefresher(
  passEvent: LearningEvent,
  modules: readonly Module[],
  evidence: readonly Evidence[],
  requirements: readonly Requirement[],
): boolean {
  const mod = modules.find((m) => m.id === passEvent.moduleId);
  if (!mod) return false;
  const at = time(passEvent.at);
  return mod.requirementIds.some((reqId) => {
    const mine = evidence.filter((ev) => ev.personId === passEvent.personId && ev.requirementId === reqId);
    if (!mine.some((ev) => time(ev.completedAt) === at && (ev.moduleId === undefined || ev.moduleId === mod.id))) {
      return false;
    }
    const earlier = mine.filter((ev) => time(ev.completedAt) < at);
    const previous = earlier.reduce<Evidence | undefined>(
      (best, ev) => (!best || time(ev.completedAt) > time(best.completedAt) ? ev : best),
      undefined,
    );
    if (!previous) return false;
    const months = requirements.find((r) => r.id === reqId)?.renewEveryMonths;
    const expiry =
      previous.expiresAt !== undefined
        ? time(previous.expiresAt)
        : months !== undefined
          ? addMonths(new Date(previous.completedAt), months).getTime()
          : undefined;
    return expiry !== undefined && expiry > at;
  });
}

export function xpLedger(input: XpInput): XpLedgerEntry[] {
  const cfg = input.config ?? engagementConfig;
  const personId = input.personId ?? mainPerson(input.events);
  if (personId === undefined) return [];
  const events = orderEvents(input.events.filter((e) => e.personId === personId));
  const facts = new Map(creditFacts(events, input.modules).map((f) => [f.event.id, f]));
  const bonus = Math.round(cfg.xp.correct * (cfg.xp.closedBookMultiplier - 1));

  const lessonsDone = new Set<string>();
  const passedVersions = new Map<string, Set<number>>();
  const goalWeeks = new Set<string>();
  const lessonsInWeek = new Map<string, number>();
  const usedToday = new Map<string, number>();
  const ledger: XpLedgerEntry[] = [];

  for (const e of events) {
    const raw: { kind: XpKind; amount: number }[] = [];
    if (e.type === 'lessonCompleted' && e.moduleId && e.lessonId) {
      const key = `${e.moduleId}|${e.lessonId}`;
      if (!lessonsDone.has(key)) {
        lessonsDone.add(key);
        raw.push({ kind: 'lesson', amount: cfg.xp.lesson });
      }
      const week = londonWeekKey(e.at);
      const n = (lessonsInWeek.get(week) ?? 0) + 1;
      lessonsInWeek.set(week, n);
      if (n >= input.weeklyGoalLessons && !goalWeeks.has(week)) {
        goalWeeks.add(week);
        raw.push({ kind: 'weeklyGoal', amount: cfg.xp.weeklyGoal });
      }
    } else if (e.type === 'questionAnswered') {
      const f = facts.get(e.id);
      if (f?.firstCredit) {
        raw.push({ kind: 'correct', amount: cfg.xp.correct });
        if (e.notesVisible === false) raw.push({ kind: 'closedBookBonus', amount: bonus });
      }
      if (f?.mastery) raw.push({ kind: 'mastery', amount: cfg.xp.mastery });
    } else if (e.type === 'moduleCompleted' && e.moduleId && e.moduleVersion !== undefined) {
      const seen = passedVersions.get(e.moduleId) ?? new Set<number>();
      if (!seen.has(e.moduleVersion)) {
        raw.push({ kind: 'passed', amount: seen.size === 0 ? cfg.xp.passed : cfg.xp.passedNewerVersion });
        seen.add(e.moduleVersion);
        passedVersions.set(e.moduleId, seen);
      }
      if (isEarlyRefresher(e, input.modules, input.evidence, input.requirements)) {
        raw.push({ kind: 'earlyRefresher', amount: cfg.xp.earlyRefresher });
      }
    }

    const day = londonDateString(new Date(e.at));
    for (const r of raw) {
      const used = usedToday.get(day) ?? 0;
      const room = Math.max(0, cfg.xp.dailyCap - used);
      const amount = Math.min(r.amount, room);
      usedToday.set(day, used + amount);
      ledger.push({
        kind: r.kind,
        amount,
        personId,
        sourceEventId: e.id,
        at: e.at,
        ...(amount < r.amount ? { capped: true } : {}),
      });
    }
  }
  return ledger;
}

export const xpTotal = (ledger: readonly Pick<XpLedgerEntry, 'amount'>[]): number =>
  ledger.reduce((n, e) => n + e.amount, 0);

/** XP earned in one attempt, by kind, for the results screen. Kinds that earned nothing are left out. */
export function xpForAttempt(
  ledger: readonly XpLedgerEntry[],
  attemptId: string,
  events: readonly LearningEvent[],
): Partial<Record<XpKind, number>> {
  const ids = new Set(events.filter((e) => e.attemptId === attemptId).map((e) => e.id));
  const out: Partial<Record<XpKind, number>> = {};
  for (const l of ledger) {
    if (l.amount > 0 && ids.has(l.sourceEventId)) out[l.kind] = (out[l.kind] ?? 0) + l.amount;
  }
  return out;
}
