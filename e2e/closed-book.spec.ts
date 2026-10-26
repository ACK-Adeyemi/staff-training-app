// M2 chunk 14 (BP-4, BP-5, F-7): notes in a lesson, closed-book Safer sleep quiz, results links, then an open-book attempt.
// Contract: control names, testids and dialog names as listed in apps/web/src/pages/staff/notes.test.tsx and
// apps/web/src/pages/staff/quizModes.test.tsx. The C13 standings check of the plan belongs to the competitions
// chunk (C13 does not exist yet); here the counted closed-book answers are read straight from IndexedDB.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';
import { answerQuestion, finishLessons, type QuizQuestion } from './helpers/quiz';

type Bank = {
  title: string;
  questions: (QuizQuestion & { id: string; explanation: string; learnMore: { url?: string }[] })[];
};
const load = (dir: string) =>
  JSON.parse(readFileSync(`packages/content/src/packs/nursery/modules/${dir}/module.json`, 'utf8')) as Bank;
const sleep = load('safer-sleep');
const eating = load('safer-eating');

test.use({ viewport: { width: 390, height: 844 } });

async function question(page: Page, bank: Bank) {
  const prompt = ((await page.getByTestId('question-prompt').textContent()) ?? '').trim();
  const q = bank.questions.find((x) => x.prompt === prompt);
  if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
  return q;
}
async function signInAsJade(page: Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}
const closedAnswers = async (page: Page) =>
  (await readStore(page, 'learningEvents')).filter(
    (e) => e['type'] === 'questionAnswered' && e['attemptMode'] === 'closed',
  );

test('Jade takes notes, answers Safer sleep closed-book with notes locked, sees links only on the results, then an open-book attempt adds no closed answers', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await context.route(
    (url) => url.origin !== 'http://localhost:4173',
    (route) => route.fulfill({ contentType: 'text/html', body: '<title>Stub</title>stub' }),
  );
  await page.goto('./#/staff');
  await signInAsJade(page);

  // Presenter panel: Closed-Book Challenge is seeded 5 days ahead; fast-forward 7 days so it is live.
  await page.keyboard.press('Shift+Alt+KeyP');
  await page
    .getByRole('dialog', { name: 'Presenter panel' })
    .getByRole('button', { name: /^Fast-forward 7 days?$/ })
    .click();
  await page.keyboard.press('Escape');

  // Open Safer sleep from Learn, write a note in the first lesson, then finish the lessons.
  await page.goto('./#/staff/learn');
  await page.getByRole('link', { name: 'Safer sleep' }).click();
  // The seed has Jade past Safer sleep already, so open its first lesson from the list rather than a Start link.
  await page.getByRole('region', { name: 'Lessons' }).getByRole('link').first().click();
  await page.getByRole('button', { name: 'Add note' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add note' });
  await expect(sheet).toContainText('Safer sleep');
  await sheet.getByRole('textbox', { name: 'Note' }).fill('Back to sleep, nothing in the cot');
  await sheet.getByRole('button', { name: 'Save note' }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Notes' }).click();
  const panel = page.getByRole('dialog', { name: 'Notes for Safer sleep' });
  await expect(panel).toContainText('Back to sleep, nothing in the cot');
  await page.keyboard.press('Escape');

  await page.goto('./#/staff/notes');
  const card = page.getByTestId('note-card').filter({ hasText: 'Back to sleep, nothing in the cot' });
  await expect(card.getByRole('link', { name: 'Safer sleep' })).toBeVisible();

  await page.goto('./#/staff/learn');
  await page.getByRole('link', { name: 'Safer sleep' }).click();
  await finishLessons(page);

  // The seed already holds some closed-book history; only this attempt's answers are counted below.
  const seeded = new Set((await closedAnswers(page)).map((e) => e['id']));
  const mine = async () => (await closedAnswers(page)).filter((e) => !seeded.has(e['id']));

  // Closed-book quiz.
  await page.getByRole('link', { name: /Start quiz/ }).click();
  const choice = page.getByRole('radiogroup', { name: 'How do you want to take this quiz?' });
  await choice.getByRole('radio', { name: /^Closed-book/ }).check();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.getByTestId('notes-locked')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Notes (hidden|shown)/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Leave this attempt' })).toBeVisible();

  const total = Number(/of (\d+)/.exec((await page.getByText(/^Question 1 of/).textContent()) ?? '')?.[1]);
  let missed: Bank['questions'][number] | undefined;
  for (let n = 1; n <= total; n++) {
    await expect(page.getByText(`Question ${n} of ${total}`)).toBeVisible();
    const q = await question(page, sleep);
    const wrong = !missed && q.type !== 'scenario';
    if (wrong) missed = q;
    await answerQuestion(page, q, !wrong);
    const fb = page.getByRole('region', { name: 'Feedback' });
    await expect(fb.getByText(q.explanation)).toBeVisible();
    await expect(fb.getByRole('link')).toHaveCount(0);
    await expect(page.getByTestId('notes-locked')).toBeVisible();
    await page.getByRole('button', { name: n === total ? 'Finish quiz' : 'Next question' }).click();
  }
  if (!missed) throw new Error('no wrong answer was given');

  // Results show the missed question's links.
  await expect(page.getByRole('heading', { name: 'Review what you missed' })).toBeVisible();
  const withLinks = missed.learnMore.filter((l) => l.url);
  for (const l of withLinks) await expect(page.locator(`a[href="${l.url}"]`).first()).toBeVisible();

  // Counted: every closed answer is stored with notes hidden.
  const afterClosed = await mine();
  expect(afterClosed).toHaveLength(total);
  expect(afterClosed.every((e) => e['notesVisible'] === false)).toBe(true);
  const attempts = (await readStore(page, 'attempts')).filter(
    (a) => a['mode'] === 'closed' && a['id'] === afterClosed[0]?.['attemptId'],
  );
  expect(attempts.some((a) => a['finishedAt'])).toBe(true);

  // Open-book attempt on another module: the notes control is available and the closed count does not move.
  await page.goto('./#/staff/learn');
  await page.getByRole('link', { name: 'Safer eating, allergies and choking' }).click();
  await finishLessons(page);
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page
    .getByRole('radiogroup', { name: 'How do you want to take this quiz?' })
    .getByRole('radio', { name: /^Open-book/ })
    .check();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.getByRole('button', { name: 'Notes hidden: bonus XP' })).toBeVisible();
  await answerQuestion(page, await question(page, eating), true);
  await expect(page.getByRole('region', { name: 'Feedback' })).toBeVisible();
  expect(await mine()).toHaveLength(total);
});

test('Leave this attempt ends a closed attempt without a score and unlocks the notes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./#/staff');
  await signInAsJade(page);
  await page.keyboard.press('Shift+Alt+KeyP');
  await page
    .getByRole('dialog', { name: 'Presenter panel' })
    .getByRole('button', { name: /^Fast-forward 7 days?$/ })
    .click();
  await page.keyboard.press('Escape');
  await page.goto('./#/staff/learn');
  await page.getByRole('link', { name: 'Safer sleep' }).click();
  await finishLessons(page);
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page
    .getByRole('radiogroup', { name: 'How do you want to take this quiz?' })
    .getByRole('radio', { name: /^Closed-book/ })
    .check();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('button', { name: 'Leave this attempt' }).click();
  await page.getByRole('dialog', { name: 'Leave this attempt?' }).getByRole('button', { name: 'Yes, leave' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Safer sleep' })).toBeVisible();
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByRole('dialog', { name: 'Notes for Safer sleep' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const abandoned = (await readStore(page, 'attempts')).filter((a) => a['abandoned'] === true);
  expect(abandoned).toHaveLength(1);
});
