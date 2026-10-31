// Module statistics for the client admin. Plan "Domain package"; brief 5.2 (C8).
import { addDays, mondayOfWeek } from '../dates';
import { percentOf } from './client';
import type { Evidence } from '../schemas/evidence';
import type { Assignment, Attempt, LearningEvent, Module, ModuleVersion } from '../schemas/learning';
import type { Person } from '../schemas/tenancy';

export type ModuleStats = {
  headline: {
    assigned: number;
    completed: number;
    completionRate: number;
    notStarted: number;
    overdue: number;
    firstTimePassPercent: number | null;
    averageScore: number | null;
    /** Distinct people with an attempt. */
    started: number;
    /** Finished attempts that passed, whole percent rounded down; null when none finished. */
    passRate: number | null;
    /** Mean minutes from start to finish over finished attempts; null when none finished. */
    averageMinutes: number | null;
  };
  questions: { questionId: string; answered: number; percentCorrect: number | null; learnMoreOpened: number }[];
};

export type ModuleStatsInput = {
  module: Module;
  assignments: Assignment[];
  attempts: Attempt[];
  events: LearningEvent[];
  evidence: Evidence[];
  now: Date;
  /** Only this module version counts, and its questions and lessons are shown. */
  version?: number;
  /** Snapshots of earlier versions, used to find the questions and lessons of `version`. */
  versions?: ModuleVersion[];
  /** Language versions of this module. Their attempts, events and assignments count for this module (plan M5, F-5). */
  translations?: Module[];
};

/** The module as it was at the chosen version: the snapshot, or the module itself when current or unknown. */
const shapeOf = ({ module, version, versions }: ModuleStatsInput): Module => {
  if (version === undefined || version === module.version) return module;
  return versions?.find((v) => v.moduleId === module.id && v.version === version)?.module ?? module;
};

/** Assignments, attempts and events narrowed to this module and, when asked, one version. */
const scoped = (input: ModuleStatsInput) => {
  const { module, version } = input;
  const own = (id: string): boolean => id === module.id;
  const mine = new Set([module.id, ...(input.translations ?? []).map((m) => m.id)]);
  // A version filter applies to the module itself; a translation has its own version numbers.
  const inVersion = (id: string, v: number | undefined): boolean => !own(id) || version === undefined || v === version;
  return {
    shape: shapeOf(input),
    assignments: input.assignments.filter(
      (a) => 'moduleId' in a.target && mine.has(a.target.moduleId) && a.status !== 'cancelled',
    ),
    attempts: input.attempts.filter((a) => mine.has(a.moduleId) && inVersion(a.moduleId, a.moduleVersion)),
    events: input.events.filter((e) => mine.has(e.moduleId ?? '') && inVersion(e.moduleId ?? '', e.moduleVersion)),
  };
};

const isFinished = (a: Attempt): boolean => a.finishedAt !== undefined && a.score !== undefined;
const time = (iso: string | undefined): number => new Date(iso ?? 0).getTime();
const minutesOf = (a: Attempt): number => Math.round((time(a.finishedAt) - time(a.startedAt)) / 60_000);
const byFinished = (a: Attempt, b: Attempt): number => time(a.finishedAt) - time(b.finishedAt);

export function moduleStats(input: ModuleStatsInput): ModuleStats {
  const { now } = input;
  const { shape, assignments: mine, attempts: myAttempts, events: myEvents } = scoped(input);
  const started = new Set(myAttempts.map((a) => a.personId));
  const open = mine.filter((a) => a.status === 'open');

  const completed = mine.filter((a) => a.status === 'done').length;
  const finished = myAttempts.filter(isFinished).sort(byFinished);
  const firstByPerson = new Map<string, Attempt>();
  for (const a of finished) if (!firstByPerson.has(a.personId)) firstByPerson.set(a.personId, a);
  const firstPassed = [...firstByPerson.values()].filter((a) => a.passed === true).length;
  const scoreSum = finished.reduce((n, a) => n + (a.score ?? 0), 0);
  const passedCount = finished.filter((a) => a.passed === true).length;
  const minutesSum = finished.reduce((n, a) => n + (time(a.finishedAt) - time(a.startedAt)) / 60_000, 0);

  const rows = shape.questions.map((q, index) => {
    const answers = myEvents.filter((e) => e.type === 'questionAnswered' && e.questionId === q.id);
    const right = answers.filter((e) => e.correct === true).length;
    return {
      index,
      questionId: q.id,
      answered: answers.length,
      percentCorrect: answers.length > 0 ? Math.floor((right * 100) / answers.length) : null,
      learnMoreOpened: myEvents.filter((e) => e.type === 'learnMoreOpened' && e.questionId === q.id).length,
    };
  });
  rows.sort((a, b) => {
    if (a.percentCorrect === null || b.percentCorrect === null) {
      return (a.percentCorrect === null ? 1 : 0) - (b.percentCorrect === null ? 1 : 0) || a.index - b.index;
    }
    return a.percentCorrect - b.percentCorrect || a.index - b.index;
  });

  return {
    headline: {
      assigned: mine.length,
      completed,
      completionRate: percentOf(completed, mine.length),
      notStarted: open.filter((a) => !started.has(a.personId)).length,
      overdue: open.filter((a) => new Date(a.dueAt).getTime() < now.getTime()).length,
      firstTimePassPercent: firstByPerson.size > 0 ? Math.floor((firstPassed * 100) / firstByPerson.size) : null,
      averageScore: finished.length > 0 ? Math.floor(scoreSum / finished.length) : null,
      started: started.size,
      passRate: finished.length > 0 ? Math.floor((passedCount * 100) / finished.length) : null,
      averageMinutes: finished.length > 0 ? Math.round(minutesSum / finished.length) : null,
    },
    questions: rows.map((r) => ({
      questionId: r.questionId,
      answered: r.answered,
      percentCorrect: r.percentCorrect,
      learnMoreOpened: r.learnMoreOpened,
    })),
  };
}

/** People with an attempt or a lessonViewed event, so "in progress" is not only about attempts. */
const startedIds = (attempts: Attempt[], events: LearningEvent[]): Set<string> =>
  new Set([
    ...attempts.map((a) => a.personId),
    ...events.filter((e) => e.type === 'lessonViewed').map((e) => e.personId),
  ]);

export type StatusBar = { completed: number; inProgress: number; notStarted: number; overdue: number };

/** Non-cancelled assignments split by state; overdue takes precedence over in progress. Sums to assigned. */
export function statusBar(input: ModuleStatsInput): StatusBar {
  const { assignments, attempts, events } = scoped(input);
  const began = startedIds(attempts, events);
  const bar: StatusBar = { completed: 0, inProgress: 0, notStarted: 0, overdue: 0 };
  for (const a of assignments) {
    if (a.status === 'done') bar.completed++;
    else if (time(a.dueAt) < input.now.getTime()) bar.overdue++;
    else if (began.has(a.personId)) bar.inProgress++;
    else bar.notStarted++;
  }
  return bar;
}

/** People reaching each lesson (viewed or completed it), in lesson order. */
export function lessonFunnel(input: ModuleStatsInput): { lessonId: string; title: string; reached: number }[] {
  const { shape, events } = scoped(input);
  return shape.lessons.map((l) => ({
    lessonId: l.id,
    title: l.title,
    reached: new Set(
      events
        .filter((e) => (e.type === 'lessonViewed' || e.type === 'lessonCompleted') && e.lessonId === l.id)
        .map((e) => e.personId),
    ).size,
  }));
}

/** Ten score buckets (the last includes 100); each person once by their latest finished attempt. */
export function scoreDistribution(input: ModuleStatsInput): {
  buckets: { from: number; to: number; count: number }[];
  retakes: number;
} {
  const finished = scoped(input)
    .attempts.filter((a) => isFinished(a) && a.abandoned !== true)
    .sort(byFinished);
  const buckets = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 }));
  const latest = new Map<string, Attempt>();
  for (const a of finished) latest.set(a.personId, a);
  for (const a of latest.values()) {
    const bucket = buckets[Math.min(9, Math.floor((a.score ?? 0) / 10))];
    if (bucket) bucket.count++;
  }
  return { buckets, retakes: finished.length - latest.size };
}

/** Completions per London week, `weeks` weeks ending with this one, oldest first. */
export function completionsByWeek(input: ModuleStatsInput, weeks: number): { weekStart: string; completed: number }[] {
  const thisMonday = mondayOfWeek(input.now);
  const completions = scoped(input).events.filter((e) => e.type === 'moduleCompleted');
  const counts = new Map<number, number>();
  for (const e of completions) {
    const key = mondayOfWeek(new Date(e.at)).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: weeks }, (_, i) => {
    const back = weeks - 1 - i;
    // Step to the middle of the week so a clock change cannot land on the wrong Monday.
    const start = back === 0 ? thisMonday : mondayOfWeek(addDays(thisMonday, -7 * back + 3));
    return { weekStart: start.toISOString(), completed: counts.get(start.getTime()) ?? 0 };
  });
}

export type PersonRow = {
  person: Person;
  status: 'completed' | 'inProgress' | 'notStarted' | 'overdue';
  score: number | null;
  completedAt: string | null;
  minutes: number | null;
};

/** One row per person with a non-cancelled assignment or an attempt, by surname then first name. */
export function peopleRows(input: ModuleStatsInput & { people: Person[] }): PersonRow[] {
  const { assignments, attempts, events } = scoped(input);
  const began = startedIds(attempts, events);
  const rows: PersonRow[] = [];
  for (const person of input.people) {
    const theirs = assignments.filter((a) => a.personId === person.id);
    const mineAttempts = attempts.filter((a) => a.personId === person.id);
    if (theirs.length === 0 && mineAttempts.length === 0) continue;
    const finished = mineAttempts.filter(isFinished).sort(byFinished);
    const latest = finished[finished.length - 1];
    const passed = finished.filter((a) => a.passed === true);
    const lastPass = passed[passed.length - 1];
    const status: PersonRow['status'] =
      theirs.some((a) => a.status === 'done') || passed.length > 0
        ? 'completed'
        : theirs.some((a) => a.status === 'open' && time(a.dueAt) < input.now.getTime())
          ? 'overdue'
          : began.has(person.id)
            ? 'inProgress'
            : 'notStarted';
    rows.push({
      person,
      status,
      score: latest?.score ?? null,
      completedAt: lastPass?.finishedAt ?? null,
      minutes: lastPass ? minutesOf(lastPass) : null,
    });
  }
  return rows.sort(
    (a, b) =>
      a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName),
  );
}
