import { describe, expect, it } from 'vitest';
import type { Attempt, ClientLinkOverlay, LearningEvent } from '../schemas/learning';
import {
  answeredQuestionIds,
  completedLessonIds,
  missedQuestionIds,
  overlaysForPerson,
  retakesLeft,
  renewalMonths,
} from './learning';
import { CLIENT, NOW, SITE_2_ID, SITE_ID, moduleFor, nextId, person, requirement } from './testFixtures';

const p = person('Jade', 'Test');
const lesson = (id: string) => ({ id, title: id, minutes: 3, blocks: [] });
const mod = moduleFor({ id: nextId(), lessons: [lesson('l1'), lesson('l2')] });
const event = (over: Partial<LearningEvent>): LearningEvent => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE_ID,
  personId: p.id,
  at: NOW.toISOString(),
  type: 'lessonCompleted',
  ...over,
});
const attempt: Attempt = {
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE_ID,
  personId: p.id,
  moduleId: mod.id,
  moduleVersion: 1,
  mode: 'open',
  questionIds: ['a', 'b', 'c'],
  startedAt: NOW.toISOString(),
};

describe('completedLessonIds', () => {
  it('counts only this person, this module and lessons that exist', () => {
    const events = [
      event({ moduleId: mod.id, lessonId: 'l1' }),
      event({ moduleId: mod.id, lessonId: 'gone' }),
      event({ moduleId: nextId(), lessonId: 'l2' }),
      event({ moduleId: mod.id, lessonId: 'l2', personId: nextId() }),
      event({ moduleId: mod.id, lessonId: 'l2', type: 'lessonViewed' }),
    ];
    expect([...completedLessonIds(mod, events, p.id)]).toEqual(['l1']);
  });
});

describe('renewalMonths', () => {
  it('is the shortest period among the requirements the module satisfies', () => {
    const r1 = requirement('One', { renewEveryMonths: 24 });
    const r2 = requirement('Two', { renewEveryMonths: 12 });
    const r3 = requirement('Three', { renewEveryMonths: 6 });
    const m = moduleFor({ id: nextId(), requirementIds: [r1.id, r2.id] });
    expect(renewalMonths(m, [r1, r2, r3])).toBe(12);
    expect(renewalMonths(moduleFor({ id: nextId() }), [r1])).toBeUndefined();
  });
});

describe('missed and answered questions', () => {
  const answered = (questionId: string, correct: boolean) =>
    event({ type: 'questionAnswered', attemptId: attempt.id, questionId, correct });
  it('lists questions without a correct answer, in draw order', () => {
    const events = [answered('a', true), answered('b', false), answered('x', false)];
    expect(missedQuestionIds(attempt, events)).toEqual(['b', 'c']);
    expect([...answeredQuestionIds(attempt, events)].sort()).toEqual(['a', 'b', 'x']);
  });
});

describe('overlaysForPerson', () => {
  const overlay = (over: Partial<ClientLinkOverlay>): ClientLinkOverlay => ({
    id: nextId(),
    clientId: CLIENT,
    moduleId: mod.id,
    links: [],
    addedBy: nextId(),
    addedAt: NOW.toISOString(),
    ...over,
  });
  it('keeps client-wide and own-site overlays for the module only', () => {
    const wide = overlay({});
    const own = overlay({ siteId: SITE_ID });
    const other = overlay({ siteId: SITE_2_ID });
    const elsewhere = overlay({ clientId: nextId() });
    const otherModule = overlay({ moduleId: nextId() });
    const got = overlaysForPerson([wide, own, other, elsewhere, otherModule], p, mod.id);
    expect(got).toEqual([wide, own]);
  });
});

describe('retakesLeft', () => {
  it('is unlimited when maxRetakes is null, otherwise one more than the retakes', () => {
    const unlimited = moduleFor({ id: nextId() });
    expect(retakesLeft({ ...unlimited, quiz: { ...unlimited.quiz, maxRetakes: null } }, 50)).toBe(true);
    const two = { ...unlimited, quiz: { ...unlimited.quiz, maxRetakes: 2 } };
    expect(retakesLeft(two, 2)).toBe(true);
    expect(retakesLeft(two, 3)).toBe(false);
  });
});
