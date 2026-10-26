// History timeline, weekly activity and score trend (brief 16.5; plan M2 Design > Domain package).
import { londonDateString } from '../dates';
import type { Attempt, LearningEvent } from '../schemas/learning';
import { addWeeks, londonWeekKey } from './weeks';

export type EarnedBadge = { badgeId: string; at: string };

export type TimelineItem =
  | { kind: 'lesson'; at: string; moduleId?: string; lessonId?: string }
  | { kind: 'attempt'; at: string; moduleId: string; attemptId: string; score?: number; passed?: boolean }
  | { kind: 'badge'; at: string; badgeId: string; moduleId?: string };

export type TimelineFilter = { year?: number; moduleId?: string };

const londonYear = (iso: string): number => Number(londonDateString(new Date(iso)).slice(0, 4));

/** A badge id like `mastery:<moduleId>` is about that module. */
const badgeModule = (badgeId: string): string | undefined => badgeId.split(':')[1];

export function historyTimeline(
  events: readonly LearningEvent[],
  attempts: readonly Attempt[],
  badges: readonly EarnedBadge[],
  filter: TimelineFilter,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const e of events) {
    if (e.type !== 'lessonCompleted') continue;
    items.push({
      kind: 'lesson',
      at: e.at,
      ...(e.moduleId ? { moduleId: e.moduleId } : {}),
      ...(e.lessonId ? { lessonId: e.lessonId } : {}),
    });
  }
  for (const a of attempts) {
    if (a.abandoned || a.finishedAt === undefined) continue;
    items.push({
      kind: 'attempt',
      at: a.finishedAt,
      moduleId: a.moduleId,
      attemptId: a.id,
      ...(a.score !== undefined ? { score: a.score } : {}),
      ...(a.passed !== undefined ? { passed: a.passed } : {}),
    });
  }
  for (const b of badges) {
    const moduleId = badgeModule(b.badgeId);
    items.push({ kind: 'badge', at: b.at, badgeId: b.badgeId, ...(moduleId ? { moduleId } : {}) });
  }
  return items
    .filter((i) => filter.year === undefined || londonYear(i.at) === filter.year)
    .filter(
      (i) =>
        filter.moduleId === undefined ||
        (i.kind !== 'badge' && i.moduleId === filter.moduleId) ||
        (i.kind === 'badge' && i.moduleId === filter.moduleId),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export type WeekActivity = { weekStart: string; lessons: number; attempts: number };

/** `weeks` London weeks, oldest first, ending with the week containing `now`. Empty weeks are zeros. */
export function weeklyActivity(events: readonly LearningEvent[], now: Date, weeks = 12): WeekActivity[] {
  const last = londonWeekKey(now);
  const out: WeekActivity[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addWeeks(last, i - (weeks - 1)),
    lessons: 0,
    attempts: 0,
  }));
  const byWeek = new Map(out.map((w) => [w.weekStart, w]));
  for (const e of events) {
    const w = byWeek.get(londonWeekKey(e.at));
    if (!w) continue;
    if (e.type === 'lessonCompleted') w.lessons++;
    else if (e.type === 'attemptFinished') w.attempts++;
  }
  return out;
}

export type ScorePoint = { attemptId: string; moduleId: string; at: string; score: number };

export function scoreTrend(attempts: readonly Attempt[]): ScorePoint[] {
  return attempts
    .flatMap((a) =>
      a.abandoned || a.finishedAt === undefined || a.score === undefined
        ? []
        : [{ attemptId: a.id, moduleId: a.moduleId, at: a.finishedAt, score: a.score }],
    )
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
