// F-10: at 390px with the root font size doubled, D1 and the staff shell do not scroll sideways and every tab label is reachable.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readStore } from './helpers/idb';
import { expectNoClipOrOverlap } from './helpers/layout';
import { answerQuestion, finishLessons, type QuizQuestion } from './helpers/quiz';
import { m4Routes, need, staffTabs } from './routes';

test.use({ viewport: { width: 390, height: 844 } });

async function scale(page: import('@playwright/test').Page) {
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
}

test('D1 has no horizontal scroll at 200% text', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await scale(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the staff shell has no horizontal scroll at 200% text and every tab label is visible', async ({ page }) => {
  await page.goto('./#/staff');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await scale(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const tab of staffTabs) {
    const link = nav.getByRole('link', { name: tab.label, exact: true });
    await expect(link).toBeVisible();
    const box = need(await link.boundingBox());
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});

test('client and provider shells have no horizontal scroll at 200% text', async ({ page }) => {
  for (const hash of ['#/client', '#/provider']) {
    // A hash-only goto keeps the old page mounted, so its heading could satisfy the wait: load afresh each time.
    await page.goto('about:blank');
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await scale(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
  }
});

// M4 chunk 18b: every provider screen P1 to P25 (without ids) has no sideways scroll at 200% text on a phone.
test('provider screens P1 to P25 have no horizontal scroll at 200% text', async ({ page }) => {
  test.setTimeout(180_000);
  for (const r of m4Routes) {
    await page.goto('about:blank');
    await page.goto(`./${r.hash}`);
    await expect(page.getByRole('heading', { level: 1 }).first(), r.hash).toBeVisible();
    await scale(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), r.hash).toBeLessThanOrEqual(390);
  }
});

// M2 chunk 12 (BP-7): 200% text chosen through the real settings screen, then key screens checked for clipping and overlap.
const lessonId = (
  JSON.parse(readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8')) as {
    lessons: { id: string }[];
  }
).lessons[0]?.id;
const bank = JSON.parse(
  readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8'),
) as { title: string; questions: (QuizQuestion & { prompt: string })[] };
const sizes = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

async function signInAsJade(page: import('@playwright/test').Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}

async function chooseLargestText(page: import('@playwright/test').Page, hash: string) {
  await page.goto(`./${hash}`);
  await page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: '200%' }).check();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
}

test('Jade at 200% text: Home, a lesson, a quiz question with feedback and the settings screen do not clip or overlap', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAsJade(page);
  await chooseLargestText(page, '#/staff/me/display');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectNoClipOrOverlap(page);
    await page.goto('./#/staff');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoClipOrOverlap(page);
  }
  // S5: a Safeguarding lesson.
  await page.goto('./#/staff/learn');
  await page
    .getByRole('link', { name: new RegExp(bank.title) })
    .first()
    .click();
  await page.getByRole('link', { name: /^Start|^Resume/ }).click();
  await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectNoClipOrOverlap(page);
  }
  // S6: a question with feedback open.
  await page.goBack();
  await finishLessons(page);
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page.getByRole('button', { name: /Start quiz/ }).click();
  const prompt = ((await page.getByTestId('question-prompt').textContent()) ?? '').trim();
  const q = bank.questions.find((x) => x.prompt === prompt);
  if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
  await answerQuestion(page, q, false);
  await expect(page.getByRole('region', { name: 'Feedback' })).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectNoClipOrOverlap(page);
  }
});

test('Priya at 200% text set on the client display screen: the dashboard does not clip or overlap', async ({
  page,
}) => {
  await chooseLargestText(page, '#/client/display');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectNoClipOrOverlap(page);
    await page.goto('./#/client');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoClipOrOverlap(page);
    await page.goBack();
  }
});

test('the 200% text setting is still applied after a reload', async ({ page }) => {
  await chooseLargestText(page, '#/client/display');
  await page.reload();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
});

// M3 chunk 17 (F-5): C27 and S17 at 200% text on the 390 px phone.
test('C27 Evidence to check does not clip or overlap at 200% text', async ({ page }) => {
  await page.goto('./#/client/evidence');
  await expect(page.getByRole('heading', { level: 1, name: 'Evidence to check' })).toBeVisible();
  await scale(page);
  await expectNoClipOrOverlap(page);
  await page.getByRole('link', { name: 'Ben Carter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check a certificate' })).toBeVisible();
  await expectNoClipOrOverlap(page);
});

test('S17 Upload certificate does not clip or overlap at 200% text, before and after choosing a file', async ({
  page,
}) => {
  await page.goto('./#/staff/progress');
  await page.getByRole('link', { name: 'Upload certificate: Paediatric first aid' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Upload certificate' })).toBeVisible();
  await scale(page);
  await expectNoClipOrOverlap(page);
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'certificate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% Fictional.\n%%EOF\n'),
  });
  await expect(page.getByRole('button', { name: 'Send for checking' })).toBeVisible();
  await expectNoClipOrOverlap(page);
});

// M3 chunk 18b (F-5): S18 and C28 at 200% text on the 390 px phone, list and month views.
test('S18 and C28 Calendar do not clip or overlap at 200% text', async ({ page }) => {
  for (const [hash, month] of [
    ['#/staff/calendar', false],
    ['#/staff/calendar', true],
    ['#/client/calendar', false],
    ['#/client/calendar', true],
  ] as const) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
    await scale(page);
    if (month) {
      await page.getByRole('radio', { name: 'Month' }).check();
      await expect(page.getByRole('grid')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expectNoClipOrOverlap(page);
  }
});

// F2: GitHub's runners have wider system fonts than the dev container. Force a wide one so the calendar is checked
// against it here too (falls back to the default font where DejaVu Sans is not installed).
test('S18 and C28 Calendar month view fits at 200% text with a wide font', async ({ page }) => {
  for (const hash of ['#/staff/calendar', '#/client/calendar']) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
    await scale(page);
    await page.addStyleTag({ content: '*, *::before, *::after { font-family: "DejaVu Sans" !important }' });
    await page.getByRole('radio', { name: 'Month' }).check();
    await expect(page.getByRole('grid')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expectNoClipOrOverlap(page);
  }
});

// M3 chunk 21 (F-5): C7, C8 and C19 at 200% text on the 390 px phone.
test('C7 Module builder does not clip or overlap at 200% text, with lessons and a question added', async ({ page }) => {
  await page.goto('./#/client/modules/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
  await scale(page);
  await expectNoClipOrOverlap(page);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fire drill for new starters');
  await page
    .getByRole('textbox', { name: 'Paste your lessons' })
    .fill('# Raise the alarm\nShout fire.\n\n# Leave\nWalk out.');
  await page.getByRole('button', { name: 'Turn into lessons' }).click();
  await page.getByRole('button', { name: 'Add multiple choice question' }).click();
  await expect(page.getByTestId('builder-question')).toHaveCount(1);
  await expectNoClipOrOverlap(page);
});

test('C8 Module stats does not clip or overlap at 200% text', async ({ page }) => {
  await page.goto('./#/client');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const fire = (await readStore(page, 'modules')).find((m) => m['title'] === 'Fire evacuation at Little Acorns');
  await page.goto(`./#/client/modules/${String(fire?.['id'])}/stats`);
  await expect(page.getByRole('heading', { level: 1, name: /^Results for Fire evacuation/ })).toBeVisible();
  await scale(page);
  await expectNoClipOrOverlap(page);
});

test('C19 Plan and billing and C20 Add-ons do not clip or overlap at 200% text', async ({ page }) => {
  for (const [hash, heading] of [
    ['#/client/billing', 'Plan and billing'],
    ['#/client/billing/add-ons', 'Add-ons'],
  ] as const) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await scale(page);
    await expectNoClipOrOverlap(page);
  }
});

// M5 chunk 13 (F-8): the new M5 screens at 200% text on the 390 px phone, with nothing clipped, overlapped or scrolling sideways.
import { overlay, startTour } from './helpers/tour';
import { installSpeechRecorder } from './helpers/speech';

const SAFEGUARDING = '01M0C0N7000000000000000201';
const wide = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function signInAs(page: import('@playwright/test').Page, who: RegExp) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: who }).check();
  await page.getByLabel(/PIN/).fill('1234');
  await page.getByRole('button', { name: /Sign in|Zaloguj/ }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}

test('the expanded tour overlay on C1 and on S2 fits at 200% text and keeps 44px buttons reachable', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startTour(page, 'Client tour', 9);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await scale(page);
  await expect(overlay(page, 1, 9)).toBeVisible();
  expect(await wide(page), 'no sideways scroll on C1').toBe(true);
  await expectNoClipOrOverlap(page);
  for (const name of ['Show me', 'Next', 'Skip tour', 'Collapse tour']) {
    const b = overlay(page, 1, 9).getByRole('button', { name, exact: false }).first();
    await b.scrollIntoViewIfNeeded();
    const box = need(await b.boundingBox());
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
    expect(box.height, name).toBeGreaterThanOrEqual(43.5);
  }
  await page.evaluate(() => {
    window.location.hash = '#/staff';
  });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(overlay(page, 1, 9)).toBeVisible();
  expect(await wide(page), 'no sideways scroll on S2').toBe(true);
  await expectNoClipOrOverlap(page);
});

test('S11 Me with the language picker fits at 200% text', async ({ page }) => {
  await signInAs(page, /Jade/);
  await page.goto('./#/staff/me');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await scale(page);
  await page.getByRole('radio', { name: 'Polski' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  expect(await wide(page)).toBe(true);
  await expectNoClipOrOverlap(page);
});

test('the practice quiz fits at 200% text', async ({ page }) => {
  await page.goto(`./#/staff/module/${SAFEGUARDING}/practice`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await scale(page);
  expect(await wide(page)).toBe(true);
  await expectNoClipOrOverlap(page);
});

test('C7 with AI-drafted items fits at 200% text', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  await page.goto('./');
  await page.keyboard.press('Shift+Alt+KeyP');
  const panel = page.getByRole('dialog', { name: 'Presenter panel' });
  await panel.getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name: /Priya/ }).click();
  await expect(panel).toBeHidden();
  await page.goto('./#/client/billing/add-ons');
  const region = page.getByRole('region', { name: 'AI Assistant' });
  if (!(await region.innerText()).includes('On')) {
    await region.getByRole('button', { name: 'Turn on' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /confirm/i })
      .click();
  }
  await expect(region).toContainText('On');
  await page.goto('./#/client/modules/new');
  await page
    .getByRole('textbox', { name: 'Paste your policy' })
    .fill('Outings policy\n\n# Before we go\nA named adult counts the children.\n\n# On the way\nChildren hold hands.');
  await page.getByRole('button', { name: 'Make a draft' }).click();
  await expect(page.getByTestId('ai-label').first()).toBeVisible();
  await scale(page);
  expect(await wide(page)).toBe(true);
  await expectNoClipOrOverlap(page);
});

test('S5 with the read-aloud bar fits at 200% text', async ({ page }) => {
  await installSpeechRecorder(page);
  await signInAs(page, /Jade/);
  await page.goto(`./#/staff/module/${SAFEGUARDING}`);
  await page.getByRole('link', { name: /^Start|^Resume/ }).click();
  await expect(page.getByRole('button', { name: 'Read this aloud' }).first()).toBeVisible();
  await scale(page);
  expect(await wide(page)).toBe(true);
  await expectNoClipOrOverlap(page);
  await page.getByRole('button', { name: 'Read this aloud' }).first().click();
  await expectNoClipOrOverlap(page);
});

test('Polish S2 Home and S5 lesson fit at 200% text', async ({ page }) => {
  await signInAs(page, /Kasia/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await scale(page);
  expect(await wide(page), 'Home').toBe(true);
  await expectNoClipOrOverlap(page);
  await page.goto(`./#/staff/module/${SAFEGUARDING}/lesson/${String(lessonId)}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await scale(page);
  expect(await wide(page), 'lesson').toBe(true);
  await expectNoClipOrOverlap(page);
});
