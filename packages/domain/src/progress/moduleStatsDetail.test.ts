// BP-4 and F-1 (pure part): the extra C8 numbers. Plan "Domain package" (progress/moduleStats.ts); brief 5.2.
//
// API under test (all take ModuleStatsInput = { module, assignments, attempts, events, evidence, now } plus the extras shown):
//   moduleStats(...).headline gains
//     started: number               // distinct people with an attempt for the module
//     passRate: number | null       // finished attempts that passed, as a whole % rounded down; null when none finished
//     averageMinutes: number | null // mean of (finishedAt - startedAt) over finished attempts, rounded to whole minutes
//   ModuleStatsInput gains optional `version?: number` and `versions?: ModuleVersion[]`: with a version only attempts, events and
//   Evidence taken on that moduleVersion count, and questions/lessons come from that version (the snapshot, or `module` itself when
//   module.version === version). Without `version` every version counts and the current module's questions are listed.
//   statusBar(input): { completed, inProgress, notStarted, overdue }   // over non-cancelled assignments, sums to assigned.
//       done -> completed; open and past due -> overdue; open and the person has an attempt or a lessonViewed event -> inProgress; else notStarted
//   lessonFunnel(input): { lessonId: string; title: string; reached: number }[]   // lesson order; people with lessonViewed or lessonCompleted
//   scoreDistribution(input): { buckets: { from: number; to: number; count: number }[]; retakes: number }
//       10 buckets 0-9, 10-19 ... 90-100; each person counted once by their latest finished attempt; abandoned attempts ignored;
//       retakes = finished attempts beyond each person's first
//   completionsByWeek(input, weeks): { weekStart: string; completed: number }[]  // weeks ending with this London week, oldest first,
//       weekStart = mondayOfWeek(...).toISOString(); counts moduleCompleted events for the module
//   peopleRows({ ...input, people }): { person: Person; status: 'completed' | 'inProgress' | 'notStarted' | 'overdue';
//       score: number | null; completedAt: string | null; minutes: number | null }[]   // people with a non-cancelled assignment or an attempt, by last then first name
//       score = latest finished attempt's score; completedAt and minutes come from the latest passed attempt
import { describe, expect, it } from 'vitest';
import { addDays, mondayOfWeek } from '../dates';
import type { Attempt, LearningEvent, ModuleVersion } from '../schemas/learning';
import { lessonFunnel, moduleStats, peopleRows, scoreDistribution, statusBar, completionsByWeek } from './moduleStats';
import { CLIENT, NOW, SITE_ID, assignment, moduleFor, nextId, person } from './testFixtures';

const lesson = (id: string, title: string) => ({ id, title, minutes: 2, blocks: [] });
const mod = moduleFor({
  id: nextId(),
  version: 2,
  lessons: [lesson('l1', 'Spot the signs'), lesson('l2', 'Raise the alarm'), lesson('l3', 'Assemble')] as never,
  questions: [{ id: 'q1' }, { id: 'q3' }] as never,
});
const v1 = moduleFor({
  id: mod.id,
  version: 1,
  lessons: [lesson('l1', 'Old first'), lesson('l2', 'Old second')] as never,
  questions: [{ id: 'q1' }, { id: 'q2' }] as never,
});
const snapshot: ModuleVersion = {
  key: `${mod.id}:1`,
  moduleId: mod.id,
  version: 1,
  module: v1,
  publishedAt: '2026-01-01T09:00:00.000Z',
};

const [ava, ben, cat, dev, eli] = [
  person('Ava', 'Adams'),
  person('Ben', 'Brown'),
  person('Cat', 'Clark'),
  person('Dev', 'Dale'),
  person('Eli', 'East'),
];

const attempt = (p: typeof ava, over: Partial<Attempt> & { daysAgo?: number; minutes?: number } = {}): Attempt => {
  const { daysAgo = 3, minutes = 10, ...rest } = over;
  const start = addDays(NOW, -daysAgo);
  return {
    id: nextId(),
    clientId: CLIENT,
    siteId: SITE_ID,
    personId: p.id,
    moduleId: mod.id,
    moduleVersion: 2,
    mode: 'open',
    questionIds: ['q1'],
    startedAt: start.toISOString(),
    finishedAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
    score: 85,
    passed: true,
    ...rest,
  };
};
const ev = (p: typeof ava, type: LearningEvent['type'], over: Partial<LearningEvent> = {}): LearningEvent => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE_ID,
  personId: p.id,
  at: NOW.toISOString(),
  type,
  moduleId: mod.id,
  moduleVersion: 2,
  ...over,
});
const base = { module: mod, assignments: [], attempts: [], events: [], evidence: [], now: NOW };

describe('headline additions', () => {
  const attempts = [
    attempt(ava, { score: 90, passed: true, minutes: 10 }),
    attempt(ben, { score: 50, passed: false, minutes: 20, daysAgo: 8 }),
    attempt(ben, { score: 100, passed: true, minutes: 15 }),
    attempt(cat, { finishedAt: undefined, score: undefined, passed: undefined }),
  ];
  const h = moduleStats({ ...base, attempts }).headline;

  it('counts people who started, including unfinished attempts', () => {
    expect(h.started).toBe(3);
  });

  it('works out the pass rate over finished attempts, rounded down', () => {
    expect(h.passRate).toBe(66);
  });

  it('works out average minutes to complete over finished attempts', () => {
    expect(h.averageMinutes).toBe(15);
  });

  it('gives null for pass rate and minutes with nothing finished, and 0 started', () => {
    const none = moduleStats(base).headline;
    expect(none).toMatchObject({ started: 0, passRate: null, averageMinutes: null });
  });
});

describe('statusBar', () => {
  const assignments = [
    assignment(ava, mod.id, 5, { status: 'done' }),
    assignment(ben, mod.id, 5), // attempt, so in progress
    assignment(cat, mod.id, 5), // lessonViewed only, so in progress
    assignment(dev, mod.id, 5), // nothing
    assignment(eli, mod.id, -2), // past due, started
    assignment(eli, mod.id, 5, { status: 'cancelled' }),
  ];
  const input = {
    ...base,
    assignments,
    attempts: [attempt(ben), attempt(eli)],
    events: [ev(cat, 'lessonViewed', { lessonId: 'l1' })],
  };

  it('splits non-cancelled assignments by status, with overdue taking precedence', () => {
    expect(statusBar(input)).toEqual({ completed: 1, inProgress: 2, notStarted: 1, overdue: 1 });
  });

  it('sums to the assigned count', () => {
    const s = statusBar(input);
    expect(s.completed + s.inProgress + s.notStarted + s.overdue).toBe(moduleStats(input).headline.assigned);
  });

  it('is all zeros with nothing assigned', () => {
    expect(statusBar(base)).toEqual({ completed: 0, inProgress: 0, notStarted: 0, overdue: 0 });
  });
});

describe('lessonFunnel', () => {
  const events = [
    ev(ava, 'lessonViewed', { lessonId: 'l1' }),
    ev(ava, 'lessonViewed', { lessonId: 'l1' }), // repeat views count once
    ev(ben, 'lessonViewed', { lessonId: 'l1' }),
    ev(cat, 'lessonViewed', { lessonId: 'l1' }),
    ev(ava, 'lessonCompleted', { lessonId: 'l1' }),
    ev(ben, 'lessonCompleted', { lessonId: 'l1' }),
    ev(ava, 'lessonViewed', { lessonId: 'l2' }),
    ev(ben, 'lessonCompleted', { lessonId: 'l2' }),
    ev(ava, 'lessonViewed', { lessonId: 'l3' }),
    { ...ev(dev, 'lessonViewed', { lessonId: 'l1' }), moduleId: nextId() },
  ];

  it('counts people reaching each lesson, in lesson order, so the drop-off shows', () => {
    expect(lessonFunnel({ ...base, events })).toEqual([
      { lessonId: 'l1', title: 'Spot the signs', reached: 3 },
      { lessonId: 'l2', title: 'Raise the alarm', reached: 2 },
      { lessonId: 'l3', title: 'Assemble', reached: 1 },
    ]);
  });

  it('shows zero for lessons nobody reached', () => {
    expect(lessonFunnel(base).map((r) => r.reached)).toEqual([0, 0, 0]);
  });

  it('uses the lessons of the chosen version and only that version events', () => {
    const old = [
      ev(ava, 'lessonViewed', { lessonId: 'l1', moduleVersion: 1 }),
      ev(ben, 'lessonViewed', { lessonId: 'l2', moduleVersion: 1 }),
    ];
    const r = lessonFunnel({ ...base, events: [...events, ...old], version: 1, versions: [snapshot] });
    expect(r).toEqual([
      { lessonId: 'l1', title: 'Old first', reached: 1 },
      { lessonId: 'l2', title: 'Old second', reached: 1 },
    ]);
  });
});

describe('scoreDistribution', () => {
  const attempts = [
    attempt(ava, { score: 0, passed: false, daysAgo: 9 }),
    attempt(ava, { score: 9, passed: false, daysAgo: 5 }), // latest for Ava: bucket 0-9
    attempt(ben, { score: 10, passed: false, daysAgo: 6 }),
    attempt(cat, { score: 79, passed: false }),
    attempt(dev, { score: 80, passed: true }),
    attempt(eli, { score: 100, passed: true }),
    attempt(eli, { score: 30, passed: false, daysAgo: 20 }),
    attempt(dev, { finishedAt: undefined, score: undefined, passed: undefined, abandoned: true, daysAgo: 1 }),
  ];
  const d = scoreDistribution({ ...base, attempts });

  it('has ten buckets covering 0 to 100 with 100 in the last', () => {
    expect(d.buckets).toHaveLength(10);
    expect(d.buckets[0]).toMatchObject({ from: 0, to: 9 });
    expect(d.buckets[9]).toMatchObject({ from: 90, to: 100 });
  });

  it('counts each person once by their latest finished attempt, at the bucket edges', () => {
    expect(d.buckets.map((b) => b.count)).toEqual([1, 1, 0, 0, 0, 0, 0, 1, 1, 1]);
  });

  it('counts retakes as finished attempts beyond each person first, ignoring unfinished ones', () => {
    expect(d.retakes).toBe(2);
  });

  it('is empty with no attempts', () => {
    const e = scoreDistribution(base);
    expect(e.buckets.every((b) => b.count === 0)).toBe(true);
    expect(e.retakes).toBe(0);
  });
});

describe('completionsByWeek', () => {
  const thisMonday = mondayOfWeek(NOW);
  const done = (p: typeof ava, daysAgo: number): LearningEvent =>
    ev(p, 'moduleCompleted', { at: addDays(NOW, -daysAgo).toISOString() });
  const events = [
    done(ava, 0),
    done(ben, 0),
    done(ben, 1),
    done(cat, 8),
    done(dev, 9),
    done(dev, 21),
    { ...done(eli, 0), moduleId: nextId() },
  ];
  const r = completionsByWeek({ ...base, events }, 4);

  it('returns the requested number of London weeks ending with this one, oldest first', () => {
    expect(r).toHaveLength(4);
    expect(r[3]?.weekStart).toBe(thisMonday.toISOString());
    expect(r[0]?.weekStart).toBe(addDays(thisMonday, -21).toISOString());
  });

  it('counts completions of this module in each week', () => {
    expect(r.map((w) => w.completed)).toEqual([1, 2, 1, 2]);
  });

  it('leaves out completions older than the range', () => {
    expect(completionsByWeek({ ...base, events: [done(ava, 60)] }, 4).every((w) => w.completed === 0)).toBe(true);
  });
});

describe('peopleRows', () => {
  const assignments = [
    assignment(ava, mod.id, 5, { status: 'done' }),
    assignment(ben, mod.id, 5),
    assignment(cat, mod.id, -1),
    assignment(dev, mod.id, 5),
    assignment(eli, mod.id, 5, { status: 'cancelled' }),
  ];
  const attempts = [
    attempt(ava, { score: 60, passed: false, daysAgo: 9, minutes: 30 }),
    attempt(ava, { score: 92, passed: true, daysAgo: 4, minutes: 12 }),
    attempt(ben, { score: 55, passed: false }),
  ];
  const rows = peopleRows({ ...base, assignments, attempts, people: [eli, dev, cat, ben, ava] });

  it('lists people with an assignment or attempt, by surname, leaving out cancelled-only people', () => {
    expect(rows.map((r) => r.person.lastName)).toEqual(['Adams', 'Brown', 'Clark', 'Dale']);
  });

  it('gives status, score, completion date and minutes', () => {
    const [a, b, c, d] = rows;
    expect(a).toMatchObject({
      status: 'completed',
      score: 92,
      completedAt: new Date(addDays(NOW, -4).getTime() + 12 * 60_000).toISOString(),
      minutes: 12,
    });
    expect(b).toMatchObject({ status: 'inProgress', score: 55, completedAt: null, minutes: null });
    expect(c).toMatchObject({ status: 'overdue', score: null, completedAt: null });
    expect(d).toMatchObject({ status: 'notStarted', score: null, completedAt: null, minutes: null });
  });
});

describe('version-aware questions', () => {
  const answer = (p: typeof ava, q: string, version: number, correct: boolean): LearningEvent =>
    ev(p, 'questionAnswered', { questionId: q, moduleVersion: version, correct, notesVisible: false });
  const events = [
    answer(ava, 'q1', 1, true),
    answer(ben, 'q1', 1, false),
    answer(ava, 'q2', 1, false),
    answer(cat, 'q1', 2, true),
    answer(cat, 'q3', 2, false),
  ];

  it('without a version lists the current module questions and counts every version', () => {
    const r = moduleStats({ ...base, events, versions: [snapshot] }).questions;
    expect(r.map((q) => q.questionId)).toEqual(['q3', 'q1']);
    expect(r.find((q) => q.questionId === 'q1')?.answered).toBe(3);
  });

  it('with an old version lists that version questions, including ones since dropped', () => {
    const r = moduleStats({ ...base, events, version: 1, versions: [snapshot] }).questions;
    expect(r.map((q) => q.questionId)).toEqual(['q2', 'q1']);
    expect(r.find((q) => q.questionId === 'q1')).toMatchObject({ answered: 2, percentCorrect: 50 });
    expect(r.find((q) => q.questionId === 'q2')).toMatchObject({ answered: 1, percentCorrect: 0 });
  });

  it('with the current version uses the module itself and only that version events', () => {
    const r = moduleStats({ ...base, events, version: 2, versions: [snapshot] }).questions;
    expect(r.map((q) => q.questionId)).toEqual(['q3', 'q1']);
    expect(r.find((q) => q.questionId === 'q1')?.answered).toBe(1);
  });

  it('limits headline attempts to the chosen version', () => {
    const attempts = [
      attempt(ava, { moduleVersion: 1, score: 40, passed: false }),
      attempt(ben, { moduleVersion: 2, score: 90 }),
    ];
    expect(moduleStats({ ...base, attempts, version: 1, versions: [snapshot] }).headline.averageScore).toBe(40);
    expect(moduleStats({ ...base, attempts, version: 2 }).headline.averageScore).toBe(90);
    expect(moduleStats({ ...base, attempts }).headline.averageScore).toBe(65);
  });
});
