// M1 chunk 12 (BP-7, F-9): demo-script Track A steps 1, 3 and the matrix part of 5 as one automated test.
// M3 chunk 21 adds steps 2, 5 (upload), 6, 8 and 9 at the end of this file.
// Desktop project only. Priya (client admin) uses the desktop page; Jade (staff) uses a second page sized 390 by 844.
// Both pages share one browser context, so they share IndexedDB and talk over BroadcastChannel like two tabs.
// Needs poppler-utils (pdftotext, pdfinfo) on the machine to read the matrix PDF.
// The clock is fixed at PINNED before the first load, so the store RNG and the quiz draw are reproducible.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { exifJpeg } from './helpers/files';
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

  // Read aloud on a lesson uses the stored rate and a local voice; Pause stops it.
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
  await page.getByRole('button', { name: 'Pause' }).click();
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

// M3 chunk 21 (BP-20, F-5): Track A steps 2, 5 (upload and approval), 6, 8 and 9. A presenter drives these through the
// Presenter panel (Shift+Alt+P, Jump to persona), so each test starts on the landing page and jumps between people.
const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

async function startTour(page: Page, context: BrowserContext) {
  await context.clock.setFixedTime(PINNED);
  await page.goto('./');
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

test('Track A step 2: Priya assigns the safeguarding refresher to the three expiring people and sees the rule sentence', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await startTour(page, context);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/calendar');
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  const cluster = page
    .getByRole('region', { name: 'Many expiring in the same week' })
    .getByRole('listitem')
    .filter({ hasText: '3 Safeguarding expiries' });
  await expect(cluster).toContainText('2 November 2026');
  await noSeriousAxe(page);

  await cluster.getByRole('button', { name: 'Assign refresher for a week' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign refresher for a week' });
  for (const name of ['Hannah Patel', 'Chris Wood', 'Lucy Evans']) await expect(dialog).toContainText(name);
  const before = (await readStore(page, 'assignments')).length;
  await dialog.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Assigned to 3 people.' })).toBeVisible();

  const people = await readStore(page, 'people');
  const modules = await readStore(page, 'modules');
  const sg = modules.find((m) => m['title'] === 'Safeguarding and whistleblowing');
  const assignments = (await readStore(page, 'assignments')) as {
    personId: string;
    status: string;
    target: { moduleId?: string };
  }[];
  expect(assignments.length).toBe(before + 3);
  for (const first of ['Hannah', 'Chris', 'Lucy']) {
    const p = people.find((x) => x['firstName'] === first);
    expect(
      assignments.some((a) => a.personId === p?.['id'] && a.status === 'open' && a.target.moduleId === sg?.['id']),
      `${first} has an open Safeguarding assignment`,
    ).toBe(true);
  }

  // Mention that a rule would do this automatically, and show its sentence (the rule is off in the seed).
  await page.goto('./#/client/rules');
  const row = page.getByRole('listitem').filter({ hasText: 'Safeguarding refresher 60 days before expiry' });
  await expect(row).toContainText(/60 days before .*Safeguarding.* expires, assign Safeguarding and whistleblowing/);
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await noSeriousAxe(page);
});

test('Track A step 5 (upload): Mark uploads a certificate photo, Priya approves it, Mark turns current and joins the first aiders list', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await startTour(page, context);
  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  await expect(page.getByRole('row', { name: /Paediatric first aid/ })).toContainText('Overdue');
  await page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Upload certificate' })).toBeVisible();
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'certificate.jpg',
    mimeType: 'image/jpeg',
    buffer: await exifJpeg(page),
  });
  await expect(page.getByRole('img', { name: 'Preview of your certificate' })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Course provider' })
    .selectOption('Approved paediatric first aid training provider');
  await page.getByLabel('Date you finished the course').fill('2026-10-12');
  await page.getByLabel('Expiry date on the certificate').fill('2029-10-12');
  await page.getByRole('button', { name: 'Send for checking' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent. Your manager will check it.' })).toBeVisible();
  await page.goto('./#/staff/progress');
  await expect(page.getByRole('row', { name: /Paediatric first aid/ })).toContainText('Waiting for a check');

  // Priya opens Evidence to check, compares the photo with the details and approves.
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/evidence');
  await expect(page.getByRole('heading', { level: 1, name: 'Evidence to check' })).toBeVisible();
  await page.getByRole('link', { name: 'Mark Taylor' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check a certificate' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('Mark Taylor');
  await noSeriousAxe(page);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved.' })).toBeVisible();

  await page.goto('./#/print/first-aiders');
  await expect(page.getByRole('heading', { level: 1, name: 'First aiders' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Mark Taylor');

  await jumpTo(page, /Mark/);
  await page.goto('./#/staff/progress');
  const row = page.getByRole('row', { name: /Paediatric first aid/ });
  await expect(row).toContainText('Current');
  await expect(row).not.toContainText('Overdue');
});

test('Track A step 6: Priya builds and publishes a module from pasted text, then reads the Fire evacuation results and feedback', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await startTour(page, context);
  await jumpTo(page, /Priya/);
  await page.goto('./#/client/modules');
  await page.getByRole('link', { name: 'New module' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fire drill for new starters');
  await page
    .getByRole('textbox', { name: 'Paste your lessons' })
    .fill(
      [
        '# Raise the alarm',
        'Shout fire and press the nearest call point.',
        '',
        '# Leave the building',
        'Lead the children to the assembly point.',
        '',
        '# Check everyone is out',
        'Count heads against the register.',
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Turn into lessons' }).click();
  await expect(page.getByTestId('builder-lesson')).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Add multiple choice question' }).click();
    const card = page.getByTestId('builder-question').nth(i);
    await card.getByRole('textbox', { name: 'Question' }).fill(`Fire question ${i + 1}?`);
    await card.getByRole('textbox', { name: 'Option 1' }).fill('Right answer');
    await card.getByRole('textbox', { name: 'Option 2' }).fill('Wrong answer');
    await card.getByRole('checkbox', { name: 'Option 1 is correct' }).check();
    await card.getByRole('textbox', { name: 'Explanation' }).fill('Because the right answer keeps everyone safe.');
  }
  const preview = page.getByRole('region', { name: 'Phone preview' });
  await expect(preview.getByRole('heading', { level: 2, name: 'Raise the alarm' })).toBeVisible();
  await preview.getByRole('button', { name: 'Next lesson' }).click();
  await expect(preview.getByRole('heading', { level: 2, name: 'Leave the building' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'This module is optional' }).check();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog', { name: 'Publish as version 1' }).getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
  const before = (await readStore(page, 'assignments')).length;
  await page.getByRole('button', { name: 'Assign to everyone' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assigned to \d+ people\./ })).toBeVisible();
  expect((await readStore(page, 'assignments')).length).toBeGreaterThanOrEqual(before + 10);

  // The existing Fire evacuation module: its results and what staff said.
  await page.goto('./#/client/modules');
  const fire = page.getByTestId('module-item').filter({ hasText: 'Fire evacuation at Little Acorns' });
  const id = String(
    (await readStore(page, 'modules')).find((m) => m['title'] === 'Fire evacuation at Little Acorns')?.['id'],
  );
  await expect(fire).toBeVisible();
  await page.goto(`./#/client/modules/${id}/stats`);
  await expect(page.getByRole('heading', { level: 1, name: /^Results for Fire evacuation/ })).toBeVisible();
  for (const name of ['Where people are', 'Lessons', 'Hardest questions', 'Feedback']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await noSeriousAxe(page);
  const lessons = page.getByRole('region', { name: 'Lessons' });
  await lessons.getByRole('button', { name: 'Show as a table' }).click();
  const rows = lessons.getByRole('table').getByRole('row');
  const reached = async (n: number) => Number((await rows.nth(n).getByRole('cell').last().textContent()) ?? '');
  expect(await reached(1)).toBeGreaterThan(await reached(2));

  const feedback = page.getByRole('region', { name: 'Feedback' });
  const unclear = feedback.locator('[data-testid="feedback-item"][data-lesson-id="lesson-2"][data-tags~="unclear"]');
  expect(await unclear.count()).toBeGreaterThanOrEqual(4);
  const targetId = await unclear
    .filter({ hasNotText: 'Anonymous' })
    .filter({ has: page.getByRole('button', { name: 'Reply', exact: true }) })
    .first()
    .getAttribute('data-feedback-id');
  const item = feedback.locator(`[data-feedback-id="${String(targetId)}"]`);
  await item.getByRole('button', { name: 'Reply' }).click();
  await item.getByRole('textbox', { name: 'Reply' }).fill('Thank you, we are adding pictures to lesson 2.');
  await item.getByRole('button', { name: 'Send reply' }).click();
  await expect(item.getByRole('status')).toContainText('Reply sent.');
  await item.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Actioned' });
  await expect(item.getByRole('combobox', { name: 'Status' }).locator('option:checked')).toHaveText('Actioned');
  await item.getByRole('link', { name: 'Edit this module' }).click();
  await expect(page).toHaveURL(new RegExp(`#/client/modules/${id}/edit\\?lesson=2$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
  const lesson2 = await page
    .getByTestId('builder-lesson')
    .nth(1)
    .getByRole('textbox', { name: 'Lesson title' })
    .inputValue();
  await expect(
    page.getByRole('region', { name: 'Phone preview' }).getByRole('heading', { level: 2, name: lesson2 }),
  ).toBeVisible();
});

test('Track A step 8: Fiona sees Oak Tree grouped by site, compares sites, drills into Meadow and opens the Sites board', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await startTour(page, context);
  await jumpTo(page, /Fiona/);
  await page.goto('./#/client/people');
  const groups = page.getByTestId('site-group');
  await expect(groups).toHaveCount(3);
  await noSeriousAxe(page);

  await page.goto('./#/client');
  const comparison = page.getByRole('region', { name: 'Site comparison' });
  await expect(comparison.getByTestId('site-card')).toHaveCount(3);
  await comparison.getByRole('button', { name: 'Open Meadow' }).click();
  await expect(page.getByRole('combobox', { name: 'Switch site' }).locator('option:checked')).toHaveText('Meadow');

  await page.goto('./#/client/leaderboards');
  const ranking = page.getByRole('region', { name: 'Full ranking' });
  await expect(ranking.getByRole('radio', { name: 'Participation' })).toBeChecked();
  await expect(ranking.getByTestId('ranking-row').first()).toContainText('Riverside');
  await expect(ranking.getByRole('combobox', { name: 'Scope' }).locator('option')).toHaveText([
    'All sites',
    'South East',
    'South West',
  ]);
  await noSeriousAxe(page);
});

test('Track A step 9: Daniel requests the AI Assistant, Priya approves it, Daniel uses Explain this in simpler words', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await startTour(page, context);
  const preview = './#/client/modules/01M0C0N7000000000000000201/preview/lesson-1';
  await jumpTo(page, /Daniel/);
  await page.goto(preview);
  const locked = page.getByTestId('explain-locked');
  await expect(locked).toContainText(/ask someone with billing access/i);
  await expect(page.getByRole('button', { name: /explain this in simpler words/i })).toHaveCount(0);
  await locked.getByRole('button', { name: /request/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/note/i).fill('Would help new starters');
  await dialog.getByRole('button', { name: /send request/i }).click();
  await expect(page.getByText('Your request has been sent.')).toBeVisible();

  await jumpTo(page, /Priya/);
  await page.goto('./#/client/billing/add-ons');
  const requests = page.getByRole('region', { name: 'Requests' });
  await expect(requests).toContainText('Daniel');
  await requests.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toContainText('On');

  await jumpTo(page, /Daniel/);
  await page.goto(preview);
  await page.getByRole('button', { name: /explain this in simpler words/i }).click();
  await expect(page.getByTestId('explain-result')).toContainText('Demo AI');
});
