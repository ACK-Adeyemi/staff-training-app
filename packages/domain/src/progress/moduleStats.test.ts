// F-8 (pure part): module stats. Plan "Domain package" (progress/moduleStats.ts).
//
// API under test:
//   moduleStats({ module, assignments, attempts, events, evidence, now }) => {
//     headline: {
//       assigned: number;            // assignments for this module that are not cancelled
//       completed: number;           // of those, status done
//       notStarted: number;          // open assignments whose person has no attempt for the module
//       overdue: number;             // open assignments with dueAt before now
//       firstTimePassPercent: number | null; // of people with a finished attempt, the % whose first finished attempt passed (rounded down)
//       averageScore: number | null;  // mean of finished attempt scores, rounded down
//     };
//     questions: { questionId: string; answered: number; percentCorrect: number | null; learnMoreOpened: number }[];
//   }
//   questions: one row per question in the bank that was answered at least once or not, hardest (lowest percentCorrect,
//   rounded down) first, ties in bank order; unanswered questions (null percent) go last.
//   percentCorrect uses questionAnswered events' `correct`; learnMoreOpened counts events of that type per questionId.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { Attempt, LearningEvent } from '../schemas/learning';
import { moduleStats } from './moduleStats';
import { CLIENT, NOW, SITE_ID, assignment, moduleFor, nextId, person } from './testFixtures';

const q = (id: string) => ({ id });
const mod = moduleFor({ id: nextId(), questions: ['q1', 'q2', 'q3', 'q4'].map(q) as never });
const a = person('Ava', 'Pass');
const b = person('Bea', 'Retry');
const c = person('Cal', 'Late');

const attempt = (p: typeof a, daysAgo: number, score: number, passed: boolean): Attempt => ({
  id: nextId(), clientId: CLIENT, siteId: SITE_ID, personId: p.id, moduleId: mod.id, moduleVersion: 1, mode: 'open',
  questionIds: ['q1', 'q2', 'q3'], startedAt: addDays(NOW, -daysAgo).toISOString(),
  finishedAt: addDays(NOW, -daysAgo).toISOString(), score, passed,
});
const event = (p: typeof a, type: LearningEvent['type'], questionId: string, correct?: boolean): LearningEvent => ({
  id: nextId(), clientId: CLIENT, siteId: SITE_ID, personId: p.id, at: NOW.toISOString(), type, moduleId: mod.id,
  moduleVersion: 1, questionId, ...(correct === undefined ? {} : { correct }),
});

const assignments = [
  assignment(a, mod.id, 5, { status: 'done' }),
  assignment(b, mod.id, 5, { status: 'done' }),
  assignment(c, mod.id, -4),
  assignment(c, mod.id, 5, { status: 'cancelled' }),
  assignment(a, nextId(), 5),
];
const attempts = [attempt(a, 6, 90, true), attempt(b, 8, 60, false), attempt(b, 6, 90, true)];
const events = [
  event(a, 'questionAnswered', 'q1', true), event(b, 'questionAnswered', 'q1', true), event(b, 'questionAnswered', 'q1', true),
  event(a, 'questionAnswered', 'q2', true), event(b, 'questionAnswered', 'q2', false), event(b, 'questionAnswered', 'q2', false),
  event(a, 'questionAnswered', 'q3', false), event(b, 'questionAnswered', 'q3', true), event(b, 'questionAnswered', 'q3', false),
  event(c, 'learnMoreOpened', 'q2'), event(a, 'learnMoreOpened', 'q2'), event(b, 'learnMoreOpened', 'q3'),
];

describe('moduleStats', () => {
  const s = moduleStats({ module: mod, assignments, attempts, events, evidence: [], now: NOW });

  it('counts assigned, completed, not started and overdue, ignoring cancelled and other modules', () => {
    expect(s.headline).toMatchObject({ assigned: 3, completed: 2, notStarted: 1, overdue: 1 });
  });

  it('works out first-time pass rate over people who finished and the average score', () => {
    expect(s.headline.firstTimePassPercent).toBe(50);
    expect(s.headline.averageScore).toBe(80);
  });

  it('gives null rates when nobody has finished an attempt', () => {
    const empty = moduleStats({ module: mod, assignments, attempts: [], events: [], evidence: [], now: NOW });
    expect(empty.headline.firstTimePassPercent).toBeNull();
    expect(empty.headline.averageScore).toBeNull();
    expect(empty.questions.every((r) => r.answered === 0 && r.percentCorrect === null)).toBe(true);
  });

  it('lists hardest questions first, ties in bank order, unanswered last', () => {
    expect(s.questions.map((r) => r.questionId)).toEqual(['q2', 'q3', 'q1', 'q4']);
    expect(s.questions[0]).toMatchObject({ answered: 3, percentCorrect: 33 });
    expect(s.questions[1]).toMatchObject({ answered: 3, percentCorrect: 33 });
    expect(s.questions[2]).toMatchObject({ answered: 3, percentCorrect: 100 });
    expect(s.questions[3]).toMatchObject({ answered: 0, percentCorrect: null });
  });

  it('counts Learn more opens per question, separately from answers', () => {
    const open = Object.fromEntries(s.questions.map((r) => [r.questionId, r.learnMoreOpened]));
    expect(open).toEqual({ q1: 0, q2: 2, q3: 1, q4: 0 });
    expect(s.questions.find((r) => r.questionId === 'q2')?.answered).toBe(3);
  });

  it('ignores events from other modules', () => {
    const other: LearningEvent = { ...event(a, 'questionAnswered', 'q1', false), moduleId: nextId() };
    const r = moduleStats({ module: mod, assignments, attempts, events: [...events, other], evidence: [], now: NOW });
    expect(r.questions.find((x) => x.questionId === 'q1')?.answered).toBe(3);
  });
});
