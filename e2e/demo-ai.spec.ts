// M5 chunk 10 (F-7; brief 20.7, brief 08; plan docs/plans/m5.md): the Demo AI flows end to end. Phone and desktop projects.
//   1. Jade (staff, a phone-sized view) runs Quiz me for practice once Priya has turned the AI Assistant on: her XP total
//      and her attempts are unchanged. (Daniel is a client-side supervisor with no staff view, so the staff learner is Jade.)
//   2. Priya drafts a module from a pasted policy, cannot publish until every AI-drafted item is marked as checked,
//      then publishes.
// Contract: apps/web/src/pages/staff/aiPractice.test.tsx and apps/web/src/pages/client/aiDraft.test.tsx (names and test ids).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';

const MODULE = '01M0C0N7000000000000000201';
const POLICY = [
  'Outings policy',
  '',
  '# Before we go',
  'A named adult counts the children. The first aid kit goes in the bag. Parents sign the form.',
  '',
  '# On the way',
  'Children hold hands in pairs. A leader walks at the front.',
].join('\n');

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });
async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}
async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}
async function turnOnAi(page: Page) {
  await jumpTo(page, /Priya/);
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
}
async function noSeriousAxe(page: Page) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
async function totalXp(page: Page): Promise<string> {
  await page.goto('./#/staff/progress');
  await page.getByRole('tab', { name: 'XP and level' }).click();
  return (await page.getByText(/\d+ XP in total/).innerText()).trim();
}

test('Jade runs Quiz me for practice and her XP total and attempts are unchanged', async ({ page }) => {
  await pinClock(page);
  await page.goto('./');
  await turnOnAi(page);
  await jumpTo(page, /Jade/);
  const xpBefore = await totalXp(page);
  const attemptsBefore = (await readStore(page, 'attempts')).length;
  const eventsBefore = (await readStore(page, 'learningEvents')).length;

  await page.goto(`./#/staff/module/${MODULE}`);
  await page
    .getByRole('link', { name: /quiz me for practice/i })
    .or(page.getByRole('button', { name: /quiz me for practice/i }))
    .first()
    .click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByText('Demo AI').first()).toBeVisible();
  await expect(page.getByText(/Practice only: no XP/)).toBeVisible();
  const groups = page.getByRole('group');
  const n = await groups.count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio').first().check();
  await expect(page.getByTestId('practice-summary')).toContainText(/You got \d+ of \d+ right/);
  await noSeriousAxe(page);

  expect(await totalXp(page)).toBe(xpBefore);
  expect((await readStore(page, 'attempts')).length).toBe(attemptsBefore);
  expect((await readStore(page, 'learningEvents')).length).toBe(eventsBefore);
  const used = (await readStore(page, 'addOnSubscriptions')).map((x) => Number(x['usageThisPeriod'] ?? 0));
  expect(Math.max(...used)).toBeGreaterThanOrEqual(1);
});

test('Priya drafts from a pasted policy, cannot publish until each item is checked, then publishes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pinClock(page);
  await page.goto('./');
  await turnOnAi(page);
  await page.goto('./#/client/modules/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
  await expect(page.getByTestId('ai-policy-warning')).toContainText('Do not paste personal data');

  await page.getByRole('textbox', { name: 'Paste your policy' }).fill(POLICY);
  await page.getByRole('button', { name: 'Make a draft' }).click();
  await expect(page.getByTestId('builder-lesson')).toHaveCount(2);
  await expect(page.getByTestId('builder-question')).toHaveCount(5);
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Outings policy');
  await expect(page.getByTestId('ai-label').first()).toContainText('AI-drafted: check before publishing');
  await expect(page.getByTestId('ai-label')).toHaveCount(7);
  await page.getByRole('checkbox', { name: 'This module is optional' }).check();
  await noSeriousAxe(page);

  // Nothing is stored until Save draft; then the module exists.
  expect((await readStore(page, 'modules')).some((m) => m['title'] === 'Outings policy')).toBe(false);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await expect(page).toHaveURL(/#\/client\/modules\/[^/]+\/edit$/);

  // Blocked while items are unchecked.
  await expect(page.getByTestId('checklist-item')).toHaveCount(6);
  await expect(page.getByTestId('ai-unchecked-message')).toContainText('7 still to check');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: "This can't be published yet. Fix the items listed first." }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Check each item; the message goes only when the last one is checked.
  const marks = page.getByRole('button', { name: 'Mark as checked' });
  for (let left = 6; left >= 0; left--) {
    await marks.first().click();
    await expect(marks).toHaveCount(left);
    if (left > 0)
      await expect(page.getByTestId('ai-unchecked-message')).toContainText(`${String(left)} still to check`);
  }
  await expect(page.getByTestId('ai-unchecked-message')).toHaveCount(0);
  await expect(page.getByTestId('ai-label').first()).toContainText('AI-drafted and checked');

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog', { name: 'Publish as version 1' }).getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();

  const stored = (await readStore(page, 'modules')).find((m) => m['title'] === 'Outings policy') as
    { status: string; lessons: Record<string, unknown>[]; questions: Record<string, unknown>[] } | undefined;
  expect(stored?.status).toBe('published');
  for (const item of [...(stored?.lessons ?? []), ...(stored?.questions ?? [])]) {
    expect(item['aiDrafted']).toBe(true);
    expect(typeof item['aiReviewedBy']).toBe('string');
  }
  expect(JSON.stringify(stored)).not.toMatch(/eyfs/i);
});

test('without the AI Assistant Priya sees the locked card in the builder and no paste box', async ({ page }) => {
  await pinClock(page);
  await page.goto('./#/client/modules/new');
  await expect(page.getByTestId('draft-locked')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Paste your policy' })).toHaveCount(0);
});
