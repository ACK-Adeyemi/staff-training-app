// F-10: at 390px with the root font size doubled, D1 and the staff shell do not scroll sideways and every tab label is reachable.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNoClipOrOverlap } from './helpers/layout';
import { answerQuestion, finishLessons, type QuizQuestion } from './helpers/quiz';
import { need, staffTabs } from './routes';

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
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await scale(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
  }
});

// M2 chunk 12 (BP-7): 200% text chosen through the real settings screen, then key screens checked for clipping and overlap.
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
