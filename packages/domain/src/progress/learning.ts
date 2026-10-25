// Small views over a person's learning records, used by the lesson, quiz and results screens.
import type { Attempt, ClientLinkOverlay, LearningEvent, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person } from '../schemas/tenancy';

/** Lesson ids of the module that this person has completed (from any earlier time). Plan Assumption 5. */
export const completedLessonIds = (module: Module, events: readonly LearningEvent[], personId: string): Set<string> => {
  const done = new Set<string>();
  for (const e of events) {
    if (e.type === 'lessonCompleted' && e.personId === personId && e.moduleId === module.id && e.lessonId) {
      done.add(e.lessonId);
    }
  }
  return new Set(module.lessons.filter((l) => done.has(l.id)).map((l) => l.id));
};

/** How often the module has to be renewed: the shortest renewal period of the requirements it satisfies. */
export const renewalMonths = (module: Module, requirements: readonly Requirement[]): number | undefined => {
  const months = requirements
    .filter((r) => module.requirementIds.includes(r.id))
    .flatMap((r) => (r.renewEveryMonths === undefined ? [] : [r.renewEveryMonths]));
  return months.length === 0 ? undefined : Math.min(...months);
};

/** Question ids of an attempt that were not answered correctly, in the order they were drawn. */
export const missedQuestionIds = (attempt: Attempt, events: readonly LearningEvent[]): string[] => {
  const right = new Set<string>();
  for (const e of events) {
    if (e.type === 'questionAnswered' && e.attemptId === attempt.id && e.correct === true && e.questionId) {
      right.add(e.questionId);
    }
  }
  return attempt.questionIds.filter((id) => !right.has(id));
};

/** Question ids of an attempt that have an answer, so a returning person resumes at the first one without. */
export const answeredQuestionIds = (attempt: Attempt, events: readonly LearningEvent[]): Set<string> =>
  new Set(
    events
      .filter((e) => e.type === 'questionAnswered' && e.attemptId === attempt.id && e.questionId !== undefined)
      .map((e) => e.questionId as string),
  );

/** The organisation's extra links that this person may see for a module: their client, and their sites. */
export const overlaysForPerson = (
  overlays: readonly ClientLinkOverlay[],
  person: Person,
  moduleId: string,
): ClientLinkOverlay[] =>
  overlays.filter(
    (o) =>
      o.clientId === person.clientId &&
      o.moduleId === moduleId &&
      (o.siteId === undefined || o.siteId === person.primarySiteId || person.additionalSiteIds.includes(o.siteId)),
  );

/** True while the person may still start a new attempt: unlimited when `maxRetakes` is null. */
export const retakesLeft = (module: Module, finishedAttempts: number): boolean =>
  module.quiz.maxRetakes === null || finishedAttempts < module.quiz.maxRetakes + 1;
