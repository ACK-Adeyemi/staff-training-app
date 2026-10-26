// M1 chunk 12 (BP-7, F-9): demo-script Track A steps 1, 3 and the matrix part of 5 as one automated test.
// Desktop project only. Priya (client admin) uses the desktop page; Jade (staff) uses a second page sized 390 by 844.
// Both pages share one browser context, so they share IndexedDB and talk over BroadcastChannel like two tabs.
// Needs poppler-utils (pdftotext, pdfinfo) on the machine to read the matrix PDF.
// The clock is fixed at PINNED before the first load, so the store RNG and the quiz draw are reproducible.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { answerQuestion } from './helpers/quiz';
import { readStore } from './helpers/idb';
import { installSpeechRecorder, readSpeechLog } from './helpers/speech';

const prizes = JSON.parse(readFileSync('packages/content/src/packs/nursery/prizes.json', 'utf8')) as string[];
const NOTE = 'Always report a concern the same day';

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
const PINNED = new Date('2026-10-19T09:00:01.000Z');
const POLICY = 'Little Acorns Safeguarding policy';

// Mirrors the seed: Little Acorns' policy is linked to the first EYFS 3.4 question and the NSPCC whistleblowing one.
const overlayIds = new Set(
  [
    bank.questions.find((q) => q.sourceRef === 'EYFS 3.4'),
    bank.questions.find((q) => q.learnMore.some((l) => l.url?.includes('nspcc.org.uk'))),
  ].flatMap((q) => (q ? [q.id] : [])),
);

test.skip(({ isMobile }) => isMobile, 'desktop project only');

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
    if (i === 0) {
      // BP-5: Add note shows the module and lesson names, saves, and the course panel lists it.
      await jade.getByRole('button', { name: 'Add note' }).click();
      const sheet = jade.getByRole('dialog', { name: 'Add note' });
      await expect(sheet).toContainText(bank.title);
      await expect(sheet).toContainText(bank.lessons[0]?.title ?? '');
      await sheet.getByRole('textbox', { name: 'Note' }).fill(NOTE);
      await sheet.getByRole('button', { name: 'Save note' }).click();
      await expect(sheet).toBeHidden();
      await jade.getByRole('button', { name: 'Notes', exact: true }).click();
      await expect(jade.getByRole('dialog', { name: `Notes for ${bank.title}` })).toContainText(NOTE);
      await jade.keyboard.press('Escape');
    }
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
  let scenarioSeen = false;
  // Notes are open by default and say so: the bonus XP label (BP-4).
  await expect(jade.getByRole('button', { name: 'Notes hidden: bonus XP' })).toBeVisible();
  for (let n = 1; n <= 10; n++) {
    await expect(jade.getByText(`Question ${n} of 10`)).toBeVisible();
    const prompt = ((await jade.getByTestId('question-prompt').textContent()) ?? '').trim();
    const q = bank.questions.find((x) => x.prompt === prompt);
    if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
    const makeWrong = !overlayQuestion && overlayIds.has(q.id) && q.type !== 'scenario';
    if (makeWrong) overlayQuestion = q;
    if (q.type === 'scenario') scenarioSeen = true;
    await answerQuestion(jade, q, !makeWrong);
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
  expect(
    scenarioSeen,
    'Precondition failed: the pinned instant did not draw a branching scenario question; choose another PINNED instant.',
  ).toBe(true);
  await expect(jade.getByText(/You passed/)).toBeVisible();
  // BP-1/F-3: celebration, XP breakdown with the closed-book bonus, the badge and the private position.
  await expect(jade.getByTestId('celebration')).toBeVisible();
  await expect(jade.getByTestId('xp-row').filter({ hasText: 'Closed-book bonus' })).toHaveCount(1);
  await expect(jade.getByTestId('xp-total')).toContainText(/\+\d+ XP/);
  await expect(jade.getByRole('heading', { name: 'New badge' })).toBeVisible();
  await expect(jade.getByText('Safeguarding ready')).toBeVisible();
  await expect(jade.getByTestId('position-line')).toContainText(/You.re 2nd of 13/);
  await jade.goto('./#/staff');
  await expect(jade.getByText(/You.re compliant/)).toBeVisible();

  // My notes from Home: the note sits under the course, and the course chip opens that lesson.
  await jade.getByRole('link', { name: 'My notes' }).click();
  await expect(jade.getByRole('heading', { level: 1, name: 'My notes' })).toBeVisible();
  const card = jade.getByTestId('note-card').filter({ hasText: NOTE });
  await expect(card).toHaveCount(1);
  await card.getByRole('link', { name: bank.title }).click();
  await expect(jade).toHaveURL(new RegExp(`#/staff/module/[^/]+/lesson/${bank.lessons[0]?.id ?? 'x'}$`));
  await expect(jade.getByRole('heading', { level: 1, name: bank.lessons[0]?.title ?? '' })).toBeVisible();

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

test('Track A step 4: Maureen gets Simple view, large text and read-aloud on a lesson', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.clock.setFixedTime(PINNED);
  await installSpeechRecorder(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Maureen/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);

  // Simple view: Learn is a plain list with no path nodes; text is 150 per cent of the 16px default.
  await page.goto('./#/staff/learn');
  await expect(page.getByTestId('learn-simple-list')).toBeVisible();
  await expect(page.getByTestId('path-node')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');

  // Read aloud on a lesson uses the stored rate and a local voice; Stop reading stops it.
  const maureen = (await readStore(page, 'people')).find((p) => p['firstName'] === 'Maureen');
  const prefs = (maureen?.['prefs'] ?? {}) as { readAloudRate?: number };
  const rate = prefs.readAloudRate ?? 1;
  await page
    .getByRole('link', { name: new RegExp(bank.title) })
    .first()
    .click();
  await page.getByRole('region', { name: 'Lessons' }).getByRole('link').first().click();
  await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Read this aloud' }).click();
  await expect.poll(async () => (await readSpeechLog(page)).spoken.length).toBeGreaterThan(0);
  const log = await readSpeechLog(page);
  const first = log.spoken[0];
  expect(first?.rate).toBe(rate);
  expect(first?.localService).toBe(true);
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
  expect(norm(await page.getByRole('main').innerText())).toContain(norm(first?.text ?? '').slice(0, 40));
  const cancels = log.cancels;
  await page.getByRole('button', { name: 'Stop reading' }).click();
  await expect.poll(async () => (await readSpeechLog(page)).cancels).toBeGreaterThan(cancels);
  await expect(page.getByRole('button', { name: 'Read this aloud' })).toBeVisible();
});

test('Track A step 7: Priya publishes Mastery Month with Suggest a prize; Jade sees the banner and the details sheet', async ({
  page: priya,
  context,
}) => {
  test.setTimeout(120_000);
  await context.clock.setFixedTime(PINNED);
  await priya.goto('./#/client/competitions');
  await priya.getByRole('link', { name: 'New competition' }).click();
  await priya.getByRole('radio', { name: 'Mastery Month' }).check();
  await expect(priya.getByTestId('template-why')).not.toBeEmpty();
  await priya.getByRole('textbox', { name: 'Name' }).fill('Winter Mastery');
  await priya.getByRole('textbox', { name: 'Description' }).fill('Master the most modules before the end of November.');
  const prize = priya.getByRole('textbox', { name: 'Prize' });
  let prev = '';
  for (let i = 0; i < 5; i++) {
    await priya.getByRole('button', { name: 'Suggest a prize' }).click();
    const v = await prize.inputValue();
    expect(prizes).toContain(v);
    expect(v).not.toBe(prev);
    prev = v;
  }
  const edited = `${prev} (amount changed to £30)`;
  await prize.fill(edited);
  await expect(prize).toHaveValue(edited);
  await priya.getByLabel('Start date').fill('2026-10-19');
  await priya.getByLabel('End date').fill('2026-11-18');
  const live = priya.getByRole('switch', { name: 'Show live leaderboard' });
  if ((await live.getAttribute('aria-checked')) !== 'true') await live.click();
  await expect(live).toHaveAttribute('aria-checked', 'true');
  await priya.getByRole('button', { name: 'Publish' }).click();
  await expect(priya).toHaveURL(/#\/client\/competitions$/);
  await expect(
    priya.getByRole('region', { name: 'Live' }).getByTestId('competition-row').filter({ hasText: 'Winter Mastery' }),
  ).toContainText('Live');

  const jade = await context.newPage();
  await jade.setViewportSize({ width: 390, height: 844 });
  await jade.goto('./#/staff/signin');
  await jade.getByRole('radio', { name: /Jade/ }).check();
  await jade.getByLabel('PIN').fill('1234');
  await jade.getByRole('button', { name: 'Sign in' }).click();
  await expect(jade).toHaveURL(/#\/staff$/);
  const banner = jade
    .getByRole('region', { name: 'Competitions' })
    .getByTestId('competition-banner')
    .filter({ hasText: 'Winter Mastery' });
  await expect(banner).toContainText(edited);
  await expect(banner).toContainText(/(30|31) days left/);
  const nextBox = await jade.getByRole('region', { name: 'Next up' }).boundingBox();
  const bannerBox = await banner.boundingBox();
  expect(bannerBox?.y ?? 0).toBeGreaterThan(nextBox?.y ?? Infinity);

  await banner
    .getByRole('button', { name: /Winter Mastery/ })
    .first()
    .click();
  const sheet = jade.getByRole('dialog', { name: 'Winter Mastery' });
  await expect(sheet).toContainText('Master the most modules before the end of November.');
  await expect(sheet).toContainText(edited);
  await expect(sheet).toContainText('Nov');
  await expect(sheet.getByRole('heading', { name: 'How to win' })).toBeVisible();
  await expect(sheet.getByRole('region', { name: 'Leaderboard' })).toBeVisible();
  await expect(sheet).not.toContainText('You are not eligible for this competition');
});
