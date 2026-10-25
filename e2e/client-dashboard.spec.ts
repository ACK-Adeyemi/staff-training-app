// M1 chunk 10 (BP-4, BP-5): client dashboard and assigning, desktop viewport only.
// Contract: see apps/web/src/pages/client/client.test.tsx. Switching persona uses S1 (#/staff/signin, PIN 1234).
// The live-update test keeps two pages in one browser context; they share IndexedDB and talk over
// BroadcastChannel('sta-data'), so page A (client dashboard) must update without navigating.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Choice = { id: string; text: string; outcome: 'best' | 'ok' | 'poor'; next?: string };
type Question = {
  type: 'mcq' | 'trueFalse' | 'scenario';
  prompt: string;
  options?: { text: string; correct: boolean }[];
  scenario?: { steps: { id: string; choices: Choice[] }[] };
};
const bank = JSON.parse(
  readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8'),
) as { title: string; lessons: { id: string; title: string }[]; questions: Question[] };
const moduleId = '01M0C0N7000000000000000201';

test.skip(({ isMobile }) => isMobile, 'desktop project only');

async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}

async function signInAs(page: Page, name: RegExp) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}

test('Priya sees the dashboard in order, assigns Safeguarding to three people, and Lucy is notified', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pinClock(page);
  await page.goto('./#/client');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const needs = page.getByRole('region', { name: 'Needs attention' });
  const items = needs.getByRole('listitem');
  await expect(items).toHaveCount(6);
  const names = ['Mark Taylor', 'Lucy Evans', 'Hannah Patel', 'Chris Wood', 'Maureen Clarke', 'Amira Hassan'];
  for (const [i, n] of names.entries()) await expect(items.nth(i)).toContainText(n);
  await expect(page.getByRole('region', { name: 'Compliance' })).toContainText('11 of 14');
  await expect(page.getByRole('region', { name: 'Waiting for a check' })).toContainText('Ben Carter');
  await expect(page.getByRole('region', { name: 'Assigned training' })).toContainText('Jade Mills');

  await page.goto('./#/client/assign');
  await page.getByRole('combobox', { name: 'Module' }).selectOption({ label: bank.title });
  for (const n of ['Lucy Evans', 'Hannah Patel', 'Chris Wood']) await page.getByRole('checkbox', { name: n }).check();
  await page.getByLabel('Due date').fill('2026-11-02');
  await expect(page.getByText('3 people will be assigned')).toBeVisible();
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('status')).toContainText('3 assigned');

  // Same browser, new persona: Lucy has one notification for the assignment.
  await signInAs(page, /Lucy/);
  await expect(page.getByRole('link', { name: 'Notifications, 1 unread' })).toBeVisible();
  await page.goto('./#/staff/notifications');
  await expect(page.getByText(/Safeguarding and whistleblowing/)).toBeVisible();
});

test('C1 updates in one tab when Jade passes the refresher in another tab, without a reload', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await pinClock(page);
  await page.goto('./#/client');
  const assigned = page.getByRole('region', { name: 'Assigned training' });
  await expect(assigned).toContainText('Jade Mills');
  await page.evaluate(() => {
    (window as unknown as { __marker: string }).__marker = 'same-page';
  });

  const b = await context.newPage();
  await pinClock(b);
  await signInAs(b, /Jade/);
  await b.goto(`./#/staff/module/${moduleId}`);
  await expect(b.getByRole('heading', { level: 1, name: bank.title })).toBeVisible();
  for (let i = 0; i < bank.lessons.length; i++) {
    await b.getByRole('link', { name: i === 0 ? /^Start/ : /^Resume/ }).click();
    await expect(b.getByText(/^Step 1 of \d+$/)).toBeVisible();
    for (;;) {
      const ack = b.getByRole('checkbox');
      if (await ack.count()) await ack.check();
      const finish = b.getByRole('button', { name: 'Finish lesson' });
      if (await finish.count()) {
        await finish.click();
        break;
      }
      await b.getByRole('button', { name: 'Next' }).click();
    }
    await expect(b.getByRole('heading', { level: 1, name: bank.title })).toBeVisible();
  }
  await b.getByRole('link', { name: 'Start quiz' }).click();
  await b.getByRole('button', { name: 'Start quiz' }).click();
  for (let n = 1; ; n++) {
    await expect(b.getByText(`Question ${n} of 10`)).toBeVisible();
    const prompt = ((await b.getByTestId('question-prompt').textContent()) ?? '').trim();
    const q = bank.questions.find((x) => x.prompt === prompt);
    if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
    if (q.type === 'scenario') {
      let step = q.scenario?.steps[0];
      while (step) {
        const choice = step.choices.find((c) => c.outcome === 'best') ?? step.choices[0];
        if (!choice) break;
        await b.getByRole('radio', { name: choice.text }).check();
        await b.getByRole('button', { name: 'Submit answer' }).click();
        if (choice.next) {
          await b.getByRole('button', { name: 'Continue' }).click();
          const nextId = choice.next;
          step = q.scenario?.steps.find((s) => s.id === nextId);
        } else step = undefined;
      }
    } else {
      const opt = q.options?.find((o) => o.correct);
      if (!opt) throw new Error('no option');
      await b.getByRole('radio', { name: opt.text }).check();
      await b.getByRole('button', { name: 'Submit answer' }).click();
    }
    await expect(b.getByRole('region', { name: 'Feedback' })).toBeVisible();
    if (n === 10) {
      await b.getByRole('button', { name: 'Finish quiz' }).click();
      break;
    }
    await b.getByRole('button', { name: 'Next question' }).click();
  }
  await expect(b.getByText('You passed')).toBeVisible();

  const recent = page.getByRole('region', { name: 'Recently completed' });
  // Jade's September update (seed) is listed already; the new row is her Safeguarding refresher.
  const row = recent.getByRole('listitem').filter({ hasText: 'Jade Mills' }).filter({ hasText: 'Safeguarding' });
  await expect(row).toContainText('Current', { timeout: 5_000 });
  await expect(assigned).not.toContainText('Jade Mills');
  expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('same-page');
});
