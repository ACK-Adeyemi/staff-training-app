// Module statistics for the client admin. Plan "Domain package".
import { percentOf } from './client';
import type { Evidence } from '../schemas/evidence';
import type { Assignment, Attempt, LearningEvent, Module } from '../schemas/learning';

export type ModuleStats = {
  headline: {
    assigned: number;
    completed: number;
    completionRate: number;
    notStarted: number;
    overdue: number;
    firstTimePassPercent: number | null;
    averageScore: number | null;
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
};

export function moduleStats({ module, assignments, attempts, events, now }: ModuleStatsInput): ModuleStats {
  const mine = assignments.filter(
    (a) => 'moduleId' in a.target && a.target.moduleId === module.id && a.status !== 'cancelled',
  );
  const myAttempts = attempts.filter((a) => a.moduleId === module.id);
  const started = new Set(myAttempts.map((a) => a.personId));
  const open = mine.filter((a) => a.status === 'open');

  const completed = mine.filter((a) => a.status === 'done').length;
  const finished = myAttempts
    .filter((a) => a.finishedAt !== undefined && a.score !== undefined)
    .sort((a, b) => new Date(a.finishedAt ?? 0).getTime() - new Date(b.finishedAt ?? 0).getTime());
  const firstByPerson = new Map<string, Attempt>();
  for (const a of finished) if (!firstByPerson.has(a.personId)) firstByPerson.set(a.personId, a);
  const firstPassed = [...firstByPerson.values()].filter((a) => a.passed === true).length;
  const scoreSum = finished.reduce((n, a) => n + (a.score ?? 0), 0);

  const myEvents = events.filter((e) => e.moduleId === module.id);
  const rows = module.questions.map((q, index) => {
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
    },
    questions: rows.map((r) => ({
      questionId: r.questionId,
      answered: r.answered,
      percentCorrect: r.percentCorrect,
      learnMoreOpened: r.learnMoreOpened,
    })),
  };
}
