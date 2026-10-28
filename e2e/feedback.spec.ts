// M3 chunk 16 (BP-4, BP-14, F-1, F-5; Track A step 6 second half): stats and feedback screens on the phone (390 by 844)
// and desktop projects. Written before the implementation.
// Contract: see apps/web/src/pages/client/moduleStatsFull.test.tsx (C8, feedback-item cards),
// statsOverview.test.tsx (C9), moduleFeedback.test.tsx (C29), staff/feedbackStaff.test.tsx (S5, S6, S7) and
// provider/providerFeedback.test.tsx (P5, P10). Seed: Fire evacuation has an Unclear cluster on lesson 2.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';
import { answerQuestion, finishLessons, type QuizQuestion } from './helpers/quiz';

const SG = '01M0C0N7000000000000000201';
const bank = JSON.parse(
  readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8'),
) as { questions: (QuizQuestion & { id: string })[] };

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}
async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}
async function noSeriousAxe(page: Page) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
async function fireId(page: Page): Promise<string> {
  await page.goto('./#/staff');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const m = (await readStore(page, 'modules')).find((x) => String(x['title']).startsWith('Fire evacuation'));
  return String(m?.['id']);
}
async function expectTouchTarget(...targets: ReturnType<Page['locator']>[]) {
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  }
}

test('Jade reports a question, then completes the end-of-module card in under 20 seconds', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone project only');
  test.setTimeout(180_000);
  await pinClock(page);
  await context.route(
    (url) => url.origin !== 'http://localhost:4173',
    (route) => route.fulfill({ contentType: 'text/html', body: '<title>Stub</title>stub' }),
  );
  await page.goto('./');
  await jumpTo(page, /Jade/);
  await page.goto(`./#/staff/module/${SG}`);
  await finishLessons(page);

  // S5: the thumbs sit on the last step of a lesson.
  await page.getByRole('region', { name: 'Lessons' }).getByRole('link').first().click();
  for (;;) {
    const ack = page.getByRole('checkbox');
    if (await ack.count()) await ack.check();
    if (await page.getByRole('button', { name: 'Finish lesson' }).count()) break;
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  const thumbs = page.getByRole('group', { name: 'Was this lesson helpful?' });
  await expectTouchTarget(
    thumbs.getByRole('button', { name: 'Yes, it was helpful' }),
    thumbs.getByRole('button', { name: 'No, it was not helpful' }),
  );
  await thumbs.getByRole('button', { name: 'No, it was not helpful' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thanks for letting us know.' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish lesson' }).click();
  await page.getByRole('link', { name: /Start quiz/ }).waitFor();

  // S6: Report a problem with this question, then carry on.
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page.getByRole('button', { name: /Start quiz/ }).click();
  const prompt = ((await page.getByTestId('question-prompt').textContent()) ?? '').trim();
  const first = bank.questions.find((x) => x.prompt === prompt);
  if (!first) throw new Error('prompt not in the bank');
  await page.getByRole('button', { name: 'Report a problem with this question' }).click();
  const sheet = page.getByRole('dialog', { name: 'Report a problem with this question' });
  await noSeriousAxe(page);
  await sheet.getByRole('textbox', { name: 'What is wrong?' }).fill('Check the wording of the options.');
  await sheet.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thank you. This will be looked at.' })).toBeVisible();
  const reports = (await readStore(page, 'moduleFeedback')).filter((f) => f['kind'] === 'questionReport');
  expect(reports.some((f) => f['questionId'] === first.id && f['text'] === 'Check the wording of the options.')).toBe(
    true,
  );

  for (let n = 1; n <= 10; n++) {
    const p = ((await page.getByTestId('question-prompt').textContent()) ?? '').trim();
    const q = bank.questions.find((x) => x.prompt === p);
    if (!q) throw new Error('prompt not in the bank');
    await answerQuestion(page, q, true);
    await page.getByRole('button', { name: n === 10 ? 'Finish quiz' : 'Next question' }).click();
  }

  // S7: rating, tag, comment, send. Timed from the card appearing to the thank you.
  const card = page.getByRole('region', { name: 'How was this training?' });
  await expect(card).toBeVisible();
  await noSeriousAxe(page);
  const started = Date.now();
  await card.getByRole('radio', { name: /5/ }).check({ force: true });
  await card.getByRole('button', { name: 'Really useful' }).click();
  await card.getByRole('textbox', { name: 'Anything to add? (optional)' }).fill('Clear and quick to do.');
  await expectTouchTarget(card.getByRole('button', { name: 'Send feedback' }));
  await card.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thank you for your feedback.' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(20_000);
  const stored = (await readStore(page, 'moduleFeedback')).find((f) => f['text'] === 'Clear and quick to do.');
  expect(stored).toMatchObject({ kind: 'moduleCard', rating: 5, anonymous: false, moduleId: SG });
  expect(stored?.['tags']).toEqual(['reallyUseful']);
});

test('anonymous items show no name in the module feedback list, and Priya replies to a named item that Jade then sees', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/module-feedback');
  await expect(page.getByRole('heading', { level: 1, name: 'Module feedback' })).toBeVisible();
  await expect(page.getByTestId('feedback-item').first()).toBeVisible();
  await noSeriousAxe(page);

  const feedback = await readStore(page, 'moduleFeedback');
  const anon = feedback.filter((f) => f['anonymous'] === true);
  expect(anon.length).toBeGreaterThanOrEqual(5);
  for (const f of anon) {
    expect(f).not.toHaveProperty('personId');
    const item = page.locator(`[data-feedback-id="${String(f['id'])}"]`);
    await expect(item).toContainText('Anonymous');
    await expect(item.getByRole('button', { name: 'Reply' })).toHaveCount(0);
  }
  const people = await readStore(page, 'people');
  const anonText = await page
    .locator('[data-testid="feedback-item"]')
    .filter({ hasText: 'Anonymous' })
    .allTextContents();
  for (const p of people)
    expect(anonText.join(' ')).not.toContain(`${String(p['firstName'])} ${String(p['lastName'])}`);

  // Reply to Jade's own item (named), then Jade finds the notification.
  const jade = people.find((p) => p['firstName'] === 'Jade' && p['lastName'] === 'Mills');
  const jadesItem = feedback.find((f) => f['personId'] === jade?.['id'] && !f['reply']);
  if (!jadesItem) throw new Error('Jade has no unanswered feedback');
  const item = page.locator(`[data-feedback-id="${String(jadesItem['id'])}"]`);
  await item.getByRole('button', { name: 'Reply' }).click();
  await expectTouchTarget(item.getByRole('button', { name: 'Send reply' }));
  await item.getByRole('textbox', { name: 'Reply' }).fill('Thanks Jade, we have taken this on board.');
  await item.getByRole('button', { name: 'Send reply' }).click();
  await expect(item.getByRole('status')).toContainText('Reply sent.');

  await jumpTo(page, /Jade/);
  await page.goto('./#/staff/notifications');
  await expect(page.getByText(/Your manager replied to your feedback on /)).toBeVisible();
});

test('Fire evacuation stats show the funnel, hardest questions and the Unclear cluster; Priya replies, marks Actioned and edits at lesson 2', async ({
  page,
}) => {
  await pinClock(page);
  const id = await fireId(page);
  await page.goto(`./#/client/modules/${id}/stats`);
  await expect(page.getByRole('heading', { level: 1, name: /^Results for Fire evacuation/ })).toBeVisible();
  for (const name of [
    'Headline numbers',
    'Where people are',
    'Lessons',
    'Hardest questions',
    'Quiz scores',
    'Completions by week',
    'People',
    'Feedback',
  ]) {
    // Exact, because Playwright matches names as substrings and "People" is inside "Where people are".
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await noSeriousAxe(page);

  // Every chart has a table alternative.
  for (const name of ['Where people are', 'Lessons', 'Quiz scores', 'Completions by week']) {
    const region = page.getByRole('region', { name });
    await expect(region.getByRole('img')).toBeVisible();
    await region.getByRole('button', { name: 'Show as a table' }).click();
    await expect(region.getByRole('table')).toBeVisible();
  }
  const funnel = page.getByRole('region', { name: 'Lessons' }).getByRole('table').getByRole('row');
  const reached = async (n: number) => Number((await funnel.nth(n).getByRole('cell').last().textContent()) ?? '');
  expect(await reached(1)).toBeGreaterThan(await reached(2));

  // Staff feedback: the Unclear tag on lesson 2.
  const feedback = page.getByRole('region', { name: 'Feedback' });
  const unclear = feedback.locator('[data-testid="feedback-item"][data-lesson-id="lesson-2"][data-tags~="unclear"]');
  expect(await unclear.count()).toBeGreaterThanOrEqual(4);
  // Newest first, so the first named item is Lucy's, which already has a reply. Pick the first one that can be replied
  // to and then follow it by id, because after the reply it no longer matches that filter.
  const replyable = unclear
    .filter({ hasNotText: 'Anonymous' })
    .filter({ has: page.getByRole('button', { name: 'Reply', exact: true }) })
    .first();
  const targetId = await replyable.getAttribute('data-feedback-id');
  const named = feedback.locator(`[data-feedback-id="${String(targetId)}"]`);
  await named.getByRole('button', { name: 'Reply' }).click();
  await named.getByRole('textbox', { name: 'Reply' }).fill('Thank you, we are adding pictures to lesson 2.');
  await named.getByRole('button', { name: 'Send reply' }).click();
  await expect(named.getByRole('status')).toContainText('Reply sent.');
  await named.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Actioned' });
  await expect
    .poll(async () => (await readStore(page, 'moduleFeedback')).filter((f) => f['status'] === 'actioned').length)
    .toBeGreaterThanOrEqual(2);
  await named.getByRole('link', { name: 'Edit this module' }).click();
  await expect(page).toHaveURL(new RegExp(`#/client/modules/${id}/edit\\?lesson=2$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Phone preview' });
  const lesson2 = await page
    .getByTestId('builder-lesson')
    .nth(1)
    .getByRole('textbox', { name: 'Lesson title' })
    .inputValue();
  await expect(preview.getByRole('heading', { level: 2, name: lesson2 })).toBeVisible();
});

test('C8 for Safeguarding shows hardest questions with sources and passes axe', async ({ page }) => {
  await pinClock(page);
  await page.goto(`./#/client/modules/${SG}/stats`);
  const hardest = page.getByRole('region', { name: 'Hardest questions' });
  await expect(hardest.getByRole('table')).toBeVisible();
  await expect(hardest.getByRole('columnheader', { name: 'Learn more opened' })).toBeVisible();
  await expect(hardest.getByRole('columnheader', { name: 'Source' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print summary' })).toBeVisible();
  await noSeriousAxe(page);
});

test('C9 stats overview shows every breakdown as a chart with a table, and the 90 day trend', async ({ page }) => {
  await pinClock(page);
  await page.goto('./#/client/stats');
  await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
  for (const name of ['By requirement', 'By job role', 'By room', 'Compliance over time']) {
    const region = page.getByRole('region', { name });
    await expect(region.getByRole('img')).toBeVisible();
    await region.getByRole('button', { name: 'Show as a table' }).click();
    await expect(region.getByRole('table')).toBeVisible();
  }
  const trend = page.getByRole('region', { name: 'Compliance over time' });
  await expect(trend.getByRole('table').getByRole('row')).toHaveCount(6);
  await trend.getByRole('radio', { name: '90 days' }).check({ force: true });
  await expect(trend.getByRole('table').getByRole('row')).toHaveCount(14);
  await expect(page.getByRole('region', { name: 'Most completed' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Least completed' })).toBeVisible();
  await noSeriousAxe(page);
});

test('the provider sees provider-module feedback without names, only counts for own modules, and app feedback only in its own screen', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/staff');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const people = await readStore(page, 'people');
  const appFeedback = await readStore(page, 'appFeedback');
  expect(appFeedback.length).toBeGreaterThanOrEqual(10);

  await page.goto('./#/provider/content');
  await expect(page.getByRole('heading', { level: 1, name: 'Content' })).toBeVisible();
  const region = page.getByRole('region', { name: 'Module feedback' });
  await expect(region.getByTestId('provider-feedback-item').first()).toBeVisible();
  await noSeriousAxe(page);
  const text = (await region.textContent()) ?? '';
  for (const p of people) expect(text).not.toContain(`${String(p['firstName'])} ${String(p['lastName'])}`);
  await expect(
    page.getByRole('region', { name: "Our clients' own modules" }).getByTestId('own-module-counts').first(),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText(String(appFeedback[0]?.['text']));
  await expect(page.locator('body')).not.toContainText('Lesson 2 needs pictures.');

  await page.getByRole('link', { name: 'App feedback' }).click();
  await expect(page).toHaveURL(/#\/provider\/feedback$/);
  await expect(page.getByRole('heading', { level: 1, name: 'App feedback' })).toBeVisible();
  await expect(page.getByTestId('app-feedback-item')).toHaveCount(appFeedback.length);
  await expect(page.getByTestId('app-feedback-item').first()).toContainText(/Screen: /);
  await noSeriousAxe(page);

  await page.goto('./#/client/module-feedback');
  await expect(page.getByTestId('feedback-item').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(String(appFeedback[0]?.['text']));
});
