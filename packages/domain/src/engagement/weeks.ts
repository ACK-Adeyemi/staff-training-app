// London weeks, active weeks and the weekly goal (brief 16.3; plan M2 assumption 7).
// Weeks start on Monday in London. Nothing here can be "lost" or "broken": totals never reset.
import { londonDateString, mondayOfWeek } from '../dates';
import type { LearningEvent } from '../schemas/learning';
import type { Person } from '../schemas/tenancy';
import { engagementConfig } from './config';

/** The London Monday (YYYY-MM-DD) of the week containing the instant. */
export const londonWeekKey = (iso: string | Date): string =>
  londonDateString(mondayOfWeek(typeof iso === 'string' ? new Date(iso) : iso));

/** Calendar arithmetic on a week key. */
export const addWeeks = (key: string, n: number): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 7 * n)).toISOString().slice(0, 10);
};

const isActivity = (e: LearningEvent): boolean => e.type === 'lessonCompleted' || e.type === 'attemptFinished';

/** Sorted, unique week keys with a completed lesson or finished attempt. */
export const activeWeeks = (events: readonly LearningEvent[]): string[] =>
  [...new Set(events.filter(isActivity).map((e) => londonWeekKey(e.at)))].sort();

export type WeeklyGoal = {
  thisWeek: { done: number; goal: number; met: boolean };
  totalActiveWeeks: number;
  currentRun: number;
  restWeeks: string[];
};

export function weeklyGoal(input: {
  events: readonly LearningEvent[];
  goal: number;
  now: Date;
  person: Pick<Person, 'id' | 'status' | 'pausedUntil'>;
  maxRestWeeks?: number;
}): WeeklyGoal {
  const { goal, now, person } = input;
  const mine = input.events.filter((e) => e.personId === person.id);
  const active = new Set(activeWeeks(mine));
  const thisKey = londonWeekKey(now);
  const done = mine.filter((e) => e.type === 'lessonCompleted' && londonWeekKey(e.at) === thisKey).length;

  const rest = new Set<string>();
  const paused = person.pausedUntil === undefined ? undefined : new Date(person.pausedUntil);
  const onLeaveNow = person.status === 'onLeave' || (paused !== undefined && paused.getTime() > now.getTime());
  if (onLeaveNow && !active.has(thisKey)) rest.add(thisKey);
  if (paused !== undefined && londonWeekKey(paused) < thisKey) {
    let w = londonWeekKey(paused);
    for (let i = 0; i < (input.maxRestWeeks ?? engagementConfig.maxRestWeeks) && !active.has(w); i++) {
      rest.add(w);
      w = addWeeks(w, -1);
    }
  }

  let currentRun = 0;
  let w = thisKey;
  if (!active.has(w)) w = addWeeks(w, -1); // this week is still going, so being empty yet is fine
  while (active.has(w) || rest.has(w)) {
    if (active.has(w)) currentRun++;
    w = addWeeks(w, -1);
  }
  // A leading rest week with no activity either side is not a run.
  return {
    thisWeek: { done, goal, met: done >= goal },
    totalActiveWeeks: active.size,
    currentRun,
    restWeeks: [...rest].sort(),
  };
}
