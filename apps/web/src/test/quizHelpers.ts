// Test helpers for the learning flow tests (chunk 9). They know the content bank, so a test can answer the question
// on screen without depending on the random draw. Not part of the app.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { moduleIds, nurseryModules } from '@sta/content';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Module } from '@sta/domain';

export const sgModule: Module = (() => {
  const m = nurseryModules.find((x) => x.id === moduleIds.safeguardingAndWhistleblowing);
  if (!m) throw new Error('Safeguarding module missing from content');
  return m;
})();
export type Question = Module['questions'][number];

export async function completeAllLessons(handle: StoreHandle, actor: ActorContext): Promise<void> {
  for (const l of sgModule.lessons) {
    await handle.store.learning.recordLesson(actor, { moduleId: sgModule.id, lessonId: l.id, kind: 'completed' });
  }
}

/** Walks a scenario choosing, at each step, the first choice matching `want` (or the first choice when none matches). */
export function scenarioPath(q: Question, want: 'best' | 'poor'): string[] {
  const steps = q.scenario?.steps ?? [];
  const path: string[] = [];
  let step = steps[0];
  while (step) {
    const choice = step.choices.find((c) => c.outcome === want) ?? step.choices[0];
    if (!choice) break;
    path.push(choice.id);
    step = choice.next ? steps.find((s) => s.id === choice.next) : undefined;
  }
  return path;
}

/** Answers every drawn question of an attempt through the data layer and finishes it. */
export async function finishViaStore(
  handle: StoreHandle,
  actor: ActorContext,
  wrongCount: number | 'all',
): Promise<{ attemptId: string; missed: string[] }> {
  const attempt = await handle.store.learning.startAttempt(actor, sgModule.id);
  const missed: string[] = [];
  for (const [i, qid] of attempt.questionIds.entries()) {
    const q = sgModule.questions.find((x) => x.id === qid);
    if (!q) throw new Error(`question ${qid} not in bank`);
    const wrong = wrongCount === 'all' || i < wrongCount;
    if (wrong) missed.push(qid);
    if (q.type === 'scenario') {
      await handle.store.learning.answer(actor, {
        attemptId: attempt.id,
        questionId: qid,
        choiceIds: scenarioPath(q, wrong ? 'poor' : 'best'),
      });
    } else {
      const opt = q.options?.find((o) => o.correct !== wrong);
      if (!opt) throw new Error('no option');
      await handle.store.learning.answer(actor, { attemptId: attempt.id, questionId: qid, optionId: opt.id });
    }
  }
  await handle.store.learning.finishAttempt(actor, attempt.id);
  return { attemptId: attempt.id, missed };
}

/** The question on screen, found by its prompt (the screen exposes it as data-testid="question-prompt"). */
export function currentQuestion(): Question {
  const prompt = screen.getByTestId('question-prompt').textContent.trim();
  const q = sgModule.questions.find((x) => x.prompt === prompt);
  if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
  return q;
}

const radioByText = (text: string) => screen.getByRole('radio', { name: (n) => n.includes(text) });

/** Answers the question on screen (all its scenario steps) and submits. Returns the question. */
export async function answerCurrent(user: ReturnType<typeof userEvent.setup>, right: boolean): Promise<Question> {
  const q = currentQuestion();
  if (q.type === 'scenario') {
    const steps = q.scenario?.steps ?? [];
    let step = steps[0];
    while (step) {
      const choice = step.choices.find((c) => (right ? c.outcome === 'best' : c.outcome === 'poor')) ?? step.choices[0];
      if (!choice) break;
      await user.click(radioByText(choice.text));
      await user.click(screen.getByRole('button', { name: 'Submit answer' }));
      if (choice.next) {
        await user.click(await screen.findByRole('button', { name: 'Continue' }));
        step = steps.find((s) => s.id === choice.next);
      } else step = undefined;
    }
  } else {
    const opt = q.options?.find((o) => o.correct === right);
    if (!opt) throw new Error('no option');
    await user.click(radioByText(opt.text));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  }
  return q;
}

export function feedbackRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Feedback' });
}
export { within };
