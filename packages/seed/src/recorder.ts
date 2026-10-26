// A small recorder of learning events and attempts, used by the M3 seed (Fire evacuation, Oak Tree and Willow Lane
// history). It draws only from the stream it is given and uses the same domain functions as the data layer.
import {
  addDays,
  checkAnswer,
  drawQuestions,
  scoreAttempt,
  ulid,
  type Answer,
  type Attempt,
  type Clock,
  type LearningEvent,
  type Module,
  type Person,
  type Rng,
} from '@sta/domain';
import { answerFor } from './history';

const MINUTE = 60_000;

export type Recorder = ReturnType<typeof makeRecorder>;

export function makeRecorder(input: { today: Date; clock: Clock; rng: Rng }) {
  const { today, clock, rng } = input;
  const events: LearningEvent[] = [];
  const attempts: Attempt[] = [];
  const newId = (): string => ulid(clock, rng);
  const ago = (days: number, minutes = 0): Date => new Date(addDays(today, -days).getTime() + minutes * MINUTE);

  const ev = (p: Person, at: Date, type: LearningEvent['type'], extra: Partial<LearningEvent> = {}): void => {
    events.push({
      id: newId(),
      clientId: p.clientId,
      siteId: p.primarySiteId,
      personId: p.id,
      at: at.toISOString(),
      type,
      ...extra,
    });
  };

  const login = (p: Person, days: number, minute = 0): void => {
    ev(p, ago(days, minute), 'login');
  };

  /** Views the first `count` lessons. `leaveLastOpen` leaves the last viewed but not finished. */
  const lessons = (
    p: Person,
    mod: Module,
    start: Date,
    opts: { count?: number; leaveLastOpen?: boolean } = {},
  ): Date => {
    const list = mod.lessons.slice(0, opts.count ?? mod.lessons.length);
    let t = start.getTime();
    list.forEach((lesson, i) => {
      const base = { moduleId: mod.id, moduleVersion: mod.version, lessonId: lesson.id };
      ev(p, new Date(t), 'lessonViewed', base);
      t += Math.max(2, Math.round(lesson.minutes)) * MINUTE;
      if (!(opts.leaveLastOpen && i === list.length - 1)) ev(p, new Date(t), 'lessonCompleted', base);
    });
    return new Date(t + MINUTE);
  };

  const attempt = (
    p: Person,
    mod: Module,
    start: Date,
    wrongIds: string[] = [],
  ): { passed: boolean; finishedAt: Date } => {
    const id = newId();
    const draw = drawQuestions(mod, rng.fork(id));
    const questionIds = draw.questionIds;
    const finish = new Date(start.getTime() + (questionIds.length + 1) * MINUTE);
    const wrong = new Set(wrongIds);
    const answers: Record<string, Answer> = {};
    const base = { moduleId: mod.id, moduleVersion: mod.version, attemptId: id };
    ev(p, start, 'attemptStarted', { ...base, attemptMode: 'open' });
    questionIds.forEach((qid, i) => {
      const q = mod.questions.find((x) => x.id === qid);
      if (!q) throw new Error(`Seed: ${qid} is not in ${mod.title}`);
      const answer = answerFor(q, !wrong.has(qid));
      answers[qid] = answer;
      const result = checkAnswer(q, answer);
      ev(p, new Date(start.getTime() + (i + 1) * MINUTE), 'questionAnswered', {
        ...base,
        questionId: qid,
        correct: result.correct,
        notesVisible: false,
        attemptMode: 'open',
        ...(result.outcome ? { scenarioOutcome: result.outcome } : {}),
        ...('optionId' in answer ? { optionId: answer.optionId } : { choiceIds: answer.choiceIds }),
      });
    });
    const { score, passed } = scoreAttempt(questionIds, answers, mod, mod.quiz.passMark);
    attempts.push({
      id,
      clientId: p.clientId,
      siteId: p.primarySiteId,
      personId: p.id,
      moduleId: mod.id,
      moduleVersion: mod.version,
      mode: 'open',
      questionIds,
      ...(Object.keys(draw.optionOrder).length > 0 ? { optionOrder: draw.optionOrder } : {}),
      startedAt: start.toISOString(),
      finishedAt: finish.toISOString(),
      score,
      passed,
    });
    ev(p, finish, 'attemptFinished', { ...base, attemptMode: 'open' });
    if (passed) ev(p, finish, 'moduleCompleted', { moduleId: mod.id, moduleVersion: mod.version, attemptId: id });
    return { passed, finishedAt: finish };
  };

  return { events, attempts, ev, login, lessons, attempt, ago, newId };
}
