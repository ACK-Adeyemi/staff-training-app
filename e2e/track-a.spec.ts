// M1 chunk 12 (BP-7, F-9): demo-script Track A steps 1, 3 and the matrix part of 5 as one automated test.
// Desktop project only. Priya (client admin) uses the desktop page; Jade (staff) uses a second page sized 390 by 844.
// Both pages share one browser context, so they share IndexedDB and talk over BroadcastChannel like two tabs.
// The clock is fixed at PINNED before the first load, so the store RNG and the quiz draw are reproducible.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Link = { id: string; title: string; url?: string };
type Choice = { id: string; text: string; outcome: 'best' | 'ok' | 'poor'; next?: string };
type Question = {
  id: string;
  type: 'mcq' | 'trueFalse' | 'scenario';
  prompt: string;
  sourceRef?: string;
  options?: { text: string; correct: boolean }[];
  scenario?: { steps: { id: string; choices: Choice[] }[] };
  learnMore: Link[];
};
const bank = JSON.parse(
  readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8'),
) as { title: string; lessons: { id: string; title: string }[]; questions: Question[] };
const PINNED = new Date('2026-10-19T09:00:00.000Z');
const POLICY = 'Little Acorns Safeguarding policy';

// Mirrors the seed: Little Acorns' policy is linked to the first EYFS 3.4 question and the NSPCC whistleblowing one.
const overlayIds = new Set(
  [
    bank.questions.find((q) => q.sourceRef === 'EYFS 3.4'),
    bank.questions.find((q) => q.learnMore.some((l) => l.url?.includes('nspcc.org.uk'))),
  ].flatMap((q) => (q ? [q.id] : [])),
);

test.skip(({ isMobile }) => isMobile, 'desktop project only');

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

test('Track A: Priya sees the dashboard, Jade completes her refresher on a phone, Priya prints the matrix', async ({
  page: priya,
  context,
}) => {
  test.setTimeout(240_000);
  await context.clock.setFixedTime(PINNED);
  // Learn more targets are stubbed; any request that leaves the app is recorded and must be only those.
  const outside: string[] = [];
  await context.route(
    (url) => url.origin !== 'http://localhost:4173' && url.protocol.startsWith('http'),
    (route) => {
      outside.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: '<title>Stub</title>stub' });
    },
  );
  const all: string[] = [];
  context.on('request', (r) => all.push(r.url()));

  // Step 1: Priya's dashboard.
  await priya.goto('./#/client');
  const needs = priya.getByRole('region', { name: 'Needs attention' });
  await expect(needs.getByRole('listitem')).toHaveCount(6);
  await expect(priya.getByRole('region', { name: 'Compliance' })).toContainText('11 of 14');
  await expect(priya.getByRole('region', { name: 'Assigned training' })).toContainText('Jade Mills');

  // Step 3: Jade on a phone.
  const jade = await context.newPage();
  await jade.setViewportSize({ width: 390, height: 844 });
  await jade.goto('./#/staff/signin');
  await jade.getByRole('radio', { name: /Jade/ }).check();
  await jade.getByLabel('PIN').fill('1234');
  await jade.getByRole('button', { name: 'Sign in' }).click();
  await expect(jade).toHaveURL(/#\/staff$/);
  await expect(jade.getByText('1 to do')).toBeVisible();
  await expect(jade.getByRole('region', { name: 'Next up' })).toContainText('Safeguarding');
  await expect(jade.getByRole('region', { name: 'Coming up' }).getByRole('listitem')).toHaveCount(3);

  // Learn search finds the module.
  await jade.goto('./#/staff/learn');
  await jade.getByRole('searchbox', { name: 'Search' }).fill('safeguarding');
  await jade
    .getByRole('link', { name: new RegExp(bank.title) })
    .first()
    .click();
  await expect(jade.getByRole('heading', { level: 1, name: bank.title })).toBeVisible();

  // Every lesson (the first one is the "one lesson opened" step).
  for (let i = 0; i < bank.lessons.length; i++) {
    await jade.getByRole('link', { name: i === 0 ? /^Start/ : /^Resume/ }).click();
    await expect(jade.getByText(/^Step 1 of \d+$/)).toBeVisible();
    for (;;) {
      const ack = jade.getByRole('checkbox');
      if (await ack.count()) await ack.check();
      const finish = jade.getByRole('button', { name: 'Finish lesson' });
      if (await finish.count()) {
        await finish.click();
        break;
      }
      await jade.getByRole('button', { name: 'Next' }).click();
    }
    await expect(jade.getByRole('heading', { level: 1, name: bank.title })).toBeVisible();
  }

  // Quiz: the overlay question is answered wrongly.
  await jade.getByRole('link', { name: /Start quiz/ }).click();
  await jade.getByRole('button', { name: /Start quiz/ }).click();
  let overlayQuestion: Question | undefined;
  for (let n = 1; n <= 10; n++) {
    await expect(jade.getByText(`Question ${n} of 10`)).toBeVisible();
    const prompt = ((await jade.getByTestId('question-prompt').textContent()) ?? '').trim();
    const q = bank.questions.find((x) => x.prompt === prompt);
    if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
    const makeWrong = !overlayQuestion && overlayIds.has(q.id) && q.type !== 'scenario';
    if (makeWrong) overlayQuestion = q;
    await answer(jade, q, !makeWrong);
    const fb = jade.getByRole('region', { name: 'Feedback' });
    await expect(fb).toBeVisible();
    if (makeWrong) {
      await expect(fb.getByText('Not quite', { exact: true })).toBeVisible();
      const official = q.learnMore.find((l) => l.url);
      if (!official) throw new Error('overlay question has no official link');
      await expect(fb.getByRole('link', { name: new RegExp(`Learn more: ${official.title}`) })).toBeVisible();
      await expect(fb.getByText('From your organisation')).toBeVisible();
      await expect(fb.getByRole('link', { name: new RegExp(POLICY) })).toBeVisible();
      // Opening an official link goes to the stub, in a new tab.
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        fb.locator(`a[href="${official.url}"]`).first().click(),
      ]);
      await popup.close();
    }
    await jade.getByRole('button', { name: n === 10 ? 'Finish quiz' : 'Next question' }).click();
  }
  expect(
    overlayQuestion,
    'Precondition failed: the pinned instant did not draw a question that has a Little Acorns link overlay. ' +
      'Content or the quiz draw logic changed; choose another pinned instant (PINNED) so the draw includes one.',
  ).toBeDefined();
  await expect(jade.getByText(/You passed/)).toBeVisible();
  await jade.goto('./#/staff');
  await expect(jade.getByText(/You.re compliant/)).toBeVisible();

  // Priya's dashboard moved on without a reload.
  await expect(priya.getByRole('region', { name: 'Assigned training' })).not.toContainText('Jade Mills', {
    timeout: 5_000,
  });

  // Step 5 (matrix part): Priya opens the matrix and prints it.
  await priya.goto('./#/client/reports');
  await priya.getByRole('link', { name: /training matrix/i }).click();
  const table = priya.getByRole('table', { name: /training matrix/i });
  await expect(table).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Jade Mills' })).toBeVisible();
  await priya.emulateMedia({ media: 'print' });
  const pdf = await priya.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/track-a-matrix.pdf', pdf);
  const text = execFileSync('pdftotext', ['test-results/track-a-matrix.pdf', '-'], { encoding: 'utf8' });
  expect(text).toContain('Jade');
  expect(text).toContain('Inspector-ready training matrix');

  // F-9: the only requests that left the app were the opened Learn more link.
  const nonLocal = all.filter(
    (u) => !u.startsWith('http://localhost:4173') && !u.startsWith('data:') && !u.startsWith('blob:'),
  );
  expect(nonLocal).toEqual(outside);
  expect(outside.length).toBeGreaterThan(0);
  for (const u of outside) expect(u.startsWith('https://')).toBe(true);
});
