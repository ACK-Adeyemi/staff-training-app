// Shared quiz-answering helper for the e2e specs. Questions come from the module.json bank.
import type { Page } from '@playwright/test';

export type Choice = { id: string; text: string; outcome: 'best' | 'ok' | 'poor'; next?: string };
export type QuizQuestion = {
  type: 'mcq' | 'trueFalse' | 'scenario';
  prompt: string;
  options?: { text: string; correct: boolean }[];
  scenario?: { steps: { id: string; choices: Choice[] }[] };
};

/** Answers the question on screen, right or wrong. Scenarios go through every step with Continue. */
export async function answerQuestion(page: Page, q: QuizQuestion, right: boolean): Promise<void> {
  if (q.type === 'scenario') {
    let step = q.scenario?.steps[0];
    while (step) {
      const choice = step.choices.find((c) => (right ? c.outcome === 'best' : c.outcome === 'poor')) ?? step.choices[0];
      if (!choice) break;
      await page.getByRole('radio', { name: choice.text }).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();
      if (choice.next) {
        await page.getByRole('button', { name: 'Continue' }).click();
        const nextId = choice.next;
        step = q.scenario?.steps.find((s) => s.id === nextId);
      } else step = undefined;
    }
  } else {
    const opt = q.options?.find((o) => o.correct === right);
    if (!opt) throw new Error('no option');
    await page.getByRole('radio', { name: opt.text }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
  }
}

/**
 * From a module overview, reads through every lesson to the end so the quiz opens (Jade has none done in the seed).
 * Ends on the overview page with the "Start quiz" link showing.
 */
export async function finishLessons(page: Page): Promise<void> {
  const links = page.getByRole('region', { name: 'Lessons' }).getByRole('link');
  await links.first().waitFor();
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    await page.getByRole('region', { name: 'Lessons' }).getByRole('link').nth(i).click();
    for (;;) {
      const ack = page.getByRole('checkbox');
      if (await ack.count()) await ack.check();
      const finish = page.getByRole('button', { name: 'Finish lesson' });
      if (await finish.count()) {
        await finish.click();
        break;
      }
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await page.waitForURL(/#\/staff\/module\/[^/]+$/);
    await page.getByRole('region', { name: 'Lessons' }).waitFor();
  }
  await page.getByRole('link', { name: /Start quiz/ }).waitFor();
}
