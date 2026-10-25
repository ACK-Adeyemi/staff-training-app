// Answer checking and scoring. Brief section 8 (quiz engine); plan Assumption 6.
import type { Module, Question } from '../schemas/learning';

export type Outcome = 'best' | 'ok' | 'poor';
export type Answer = { optionId: string } | { choiceIds: string[] };
type Choice = NonNullable<Question['scenario']>['steps'][number]['choices'][number];

export class InvalidAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnswerError';
  }
}

/** Validates a scenario path and returns the chosen choices in order. */
export const walkScenario = (question: Question, choiceIds: readonly string[]): Choice[] => {
  const steps = question.scenario?.steps;
  if (!steps || steps.length === 0) throw new InvalidAnswerError('Not a scenario question');
  const path: Choice[] = [];
  let step: (typeof steps)[number] | undefined = steps[0];
  for (const id of choiceIds) {
    if (!step) throw new InvalidAnswerError('The path continues past the end');
    const choice: Choice | undefined = step.choices.find((c) => c.id === id);
    if (!choice) throw new InvalidAnswerError(`Choice ${id} is not in the current step`);
    path.push(choice);
    step = choice.next === undefined ? undefined : steps.find((s) => s.id === choice.next);
    if (choice.next !== undefined && !step) throw new InvalidAnswerError('The path leads to an unknown step');
  }
  if (path.length === 0 || step) throw new InvalidAnswerError('The path stops before the end');
  return path;
};

const RANK: Record<Outcome, number> = { best: 0, ok: 1, poor: 2 };

export const checkAnswer = (question: Question, answer: Answer): { correct: boolean; outcome?: Outcome } => {
  if (question.type === 'scenario') {
    if (!('choiceIds' in answer)) throw new InvalidAnswerError('A scenario needs choiceIds');
    const path = walkScenario(question, answer.choiceIds);
    const outcome = path.reduce<Outcome>((worst, c) => (RANK[c.outcome] > RANK[worst] ? c.outcome : worst), 'best');
    return { correct: outcome === 'best', outcome };
  }
  if (!('optionId' in answer)) throw new InvalidAnswerError('This question needs an optionId');
  const option = question.options?.find((o) => o.id === answer.optionId);
  if (!option) throw new InvalidAnswerError(`Option ${answer.optionId} is not in the question`);
  return { correct: option.correct };
};

export const scoreAttempt = (
  questionIds: readonly string[],
  answers: Readonly<Record<string, Answer>>,
  module: Module,
  passMark: number,
): { score: number; passed: boolean; missedQuestionIds: string[] } => {
  const missedQuestionIds: string[] = [];
  for (const id of questionIds) {
    const question = module.questions.find((q) => q.id === id);
    if (!question) throw new InvalidAnswerError(`Question ${id} is not in the module`);
    const answer = answers[id];
    if (answer === undefined || !checkAnswer(question, answer).correct) missedQuestionIds.push(id);
  }
  const total = questionIds.length;
  const score = total === 0 ? 0 : Math.floor(((total - missedQuestionIds.length) * 100) / total);
  return { score, passed: score >= passMark, missedQuestionIds };
};
