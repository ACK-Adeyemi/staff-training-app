// M1 chunk 9 (BP-1, BP-2): Jade completes the Safeguarding refresher on a phone, including branching scenarios.
// The draw is random per session, so a helper reads the question on screen and answers from the module bank
// (module.json). The browser clock is pinned so the seed's "today" is 19 October 2026.
// Contract: see apps/web/src/pages/staff/learning.test.tsx. The quiz prompt is data-testid="question-prompt".
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Link = { id: string; title: string; url?: string; locator?: string };
type Choice = { id: string; text: string; outcome: 'best' | 'ok' | 'poor'; next?: string };
type Question = {
  id: string;
  type: 'mcq' | 'trueFalse' | 'scenario';
  prompt: string;
  explanation: string;
  sourceRef?: string;
  options?: { text: string; correct: boolean }[];
  scenario?: { steps: { id: string; choices: Choice[] }[] };
  learnMore: Link[];
};
type Lesson = { id: string; title: string };
const bank = JSON.parse(
  readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8'),
) as { title: string; version: number; lessons: Lesson[]; questions: Question[] };
const moduleId = '01M0C0N7000000000000000201';

test.use({ viewport: { width: 390, height: 844 } });

const expectedDomain = (url: string): string => {
  const labels = new URL(url).hostname.split('.');
  if (labels.slice(-2).join('.') === 'gov.uk') return 'gov.uk';
  const twoPart = ['org.uk', 'co.uk', 'ac.uk', 'nhs.uk'].includes(labels.slice(-2).join('.'));
  return labels.slice(twoPart ? -3 : -2).join('.');
};

async function axeClean(page: Page, label: string) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    bad.map((v) => `${label} ${v.id}: ${v.help}`),
    label,
  ).toEqual([]);
}

/** Reads one object store straight from IndexedDB (the app's own database), as the demo admin dump would. */
async function readStore(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (name) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const open = indexedDB.open('sta-demo');
        open.onerror = () => {
          reject(new Error('cannot open sta-demo'));
        };
        open.onsuccess = () => {
          const req = open.result.transaction(name, 'readonly').objectStore(name).getAll();
          req.onsuccess = () => {
            resolve(req.result as Record<string, unknown>[]);
          };
          req.onerror = () => {
            reject(new Error('read failed'));
          };
        };
      }),
    store,
  );
}

async function currentQuestion(page: Page): Promise<Question> {
  const prompt = ((await page.getByTestId('question-prompt').textContent()) ?? '').trim();
  const q = bank.questions.find((x) => x.prompt === prompt);
  if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
  return q;
}

/** Answers the question on screen. Scenarios go through every step with Continue. */
async function answer(page: Page, q: Question, right: boolean) {
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

test('Jade completes the Safeguarding refresher, sees links for a wrong answer, and becomes compliant', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone project only');
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  // Any request that leaves the app (the Learn more targets) gets a stub page, so no real network is used.
  await context.route(
    (url) => url.origin !== 'http://localhost:4173',
    (route) => route.fulfill({ contentType: 'text/html', body: '<title>Stub</title>stub' }),
  );

  await page.goto(`./#/staff`);
  await expect(page.getByText('1 to do')).toBeVisible();

  // S4 module overview
  await page.goto(`./#/staff/module/${moduleId}`);
  await expect(page.getByRole('heading', { level: 1, name: bank.title })).toBeVisible();
  await expect(page.getByText('Draft content')).toBeVisible();
  for (const l of bank.lessons) await expect(page.getByRole('link', { name: new RegExp(l.title) })).toBeVisible();
  await axeClean(page, 'S4 overview');

  // S5 lessons
  for (let i = 0; i < bank.lessons.length; i++) {
    await page.getByRole('link', { name: i === 0 ? /^Start/ : /^Resume/ }).click();
    await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();
    if (i === 0) await axeClean(page, 'S5 lesson');
    for (;;) {
      const ack = page.getByRole('checkbox');
      if (await ack.count()) await ack.check();
      const finish = page.getByRole('button', { name: 'Finish lesson' });
      if (await finish.count()) {
        await finish.click();
        break;
      }
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: bank.title })).toBeVisible();
  }

  // S6 quiz
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await expect(page.getByText('Draft content')).toBeVisible();
  await axeClean(page, 'S6 intro');
  await page.getByRole('button', { name: /Start quiz/ }).click();
  let wrong: Question | undefined;
  let sawScenario = false;
  for (let n = 1; n <= 10; n++) {
    await expect(page.getByText(`Question ${n} of 10`)).toBeVisible();
    const q = await currentQuestion(page);
    if (n === 1) await axeClean(page, 'S6 question');
    const makeWrong = !wrong && q.type !== 'scenario';
    if (q.type === 'scenario') sawScenario = true;
    if (makeWrong) wrong = q;
    await answer(page, q, !makeWrong);
    const fb = page.getByRole('region', { name: 'Feedback' });
    await expect(fb.getByText(makeWrong ? 'Not quite' : 'Correct', { exact: true })).toBeVisible();
    await expect(fb.getByText(q.explanation)).toBeVisible();
    if (makeWrong) {
      await axeClean(page, 'S6 wrong-answer feedback');
      const official = q.learnMore.filter((l) => l.url);
      for (const l of official) {
        const a = fb.locator(`a[href="${l.url}"]`);
        await expect(a).toHaveCount(1);
        await expect(a).toHaveAttribute('target', '_blank');
        await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(a).toContainText(`Learn more: ${l.title}`);
        await expect(a).toContainText(expectedDomain(l.url ?? ''));
        await expect(a.locator('svg')).not.toHaveCount(0);
        await expect(a).toHaveAccessibleName(/\(opens in a new tab\)$/);
      }
      expect(
        await readStore(page, 'learningEvents').then((e) => e.filter((x) => x['type'] === 'learnMoreOpened')),
      ).toHaveLength(0);
      const first = official[0];
      if (!first?.url) throw new Error('wrong question has no link');
      const [popup] = await Promise.all([context.waitForEvent('page'), fb.locator(`a[href="${first.url}"]`).click()]);
      await popup.close();
      await expect
        .poll(
          async () => (await readStore(page, 'learningEvents')).filter((x) => x['type'] === 'learnMoreOpened').length,
        )
        .toBe(1);
      const opened = (await readStore(page, 'learningEvents')).filter((x) => x['type'] === 'learnMoreOpened');
      expect(opened[0]).toMatchObject({ linkId: first.id, questionId: q.id });
    }
    await page.getByRole('button', { name: n === 10 ? 'Finish quiz' : 'Next question' }).click();
  }
  // The mix setting draws scenarios, so the run exercised branching.
  expect(sawScenario).toBe(true);
  expect(wrong).toBeDefined();

  // S7 results
  await expect(page).toHaveURL(new RegExp(`#/staff/module/${moduleId}/done$`));
  await expect(page.getByText(/You passed/)).toBeVisible();
  const review = page.getByRole('region', { name: 'Review what you missed' });
  await expect(review.getByText(wrong?.prompt ?? '')).toBeVisible();
  await expect(review.getByText(wrong?.explanation ?? '')).toBeVisible();
  await expect(review.locator('a[target="_blank"]').first()).toBeVisible();
  await axeClean(page, 'S7 results');

  // Evidence exists, with the module version and site
  const evidence = (await readStore(page, 'evidence')).filter(
    (e) => e['moduleId'] === moduleId && String(e['completedAt']).startsWith('2026-10-19'),
  );
  expect(evidence.length).toBeGreaterThanOrEqual(1);
  expect(evidence[0]).toMatchObject({ kind: 'module', moduleVersion: bank.version });
  const site = (await readStore(page, 'sites')).find((s) => s['id'] === evidence[0]?.['siteIdAtTime']);
  expect(site).toBeDefined();

  // Certificate
  await page.getByRole('link', { name: /View certificate/ }).click();
  await expect(page.getByText('Certificate of completion')).toBeVisible();
  await expect(page.getByText(new RegExp(`Version ${bank.version}`))).toBeVisible();
  await expect(page.getByText(new RegExp(String(site?.['name'])))).toBeVisible();
  await axeClean(page, 'certificate');

  // Progress and Home
  await page.goto('./#/staff/progress');
  const row = page
    .getByRole('row', { name: /Safeguarding/ })
    .or(page.getByRole('listitem').filter({ hasText: /Safeguarding/ }));
  await expect(row.first()).toContainText('Current');
  await page.goto('./#/staff');
  await expect(page.getByText(/You.re compliant/)).toBeVisible();
});

test('the organisation policy opens on its own page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone project only');
  await page.goto('./#/staff');
  await expect(page.getByText('1 to do')).toBeVisible();
  const id = (await readStore(page, 'attachments'))[0]?.['id'];
  await page.goto(`./#/doc/${String(id)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Little Acorns Safeguarding policy' })).toBeVisible();
  await axeClean(page, 'org document');
});
