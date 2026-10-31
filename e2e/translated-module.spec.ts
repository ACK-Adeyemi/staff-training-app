/* eslint-disable @typescript-eslint/no-non-null-assertion -- test file; asserted defined just above */
// M5 chunk 7 (F-5): Kasia (interface and module in Polish) completes the Polish Safer sleep module, and Priya sees it.
// Plan docs/plans/m5.md F-5. Written before the implementation.
// Note: Safer sleep has no requirement in the nursery pack, so "current for the requirement" is shown through what Priya can
// see for the original module: the Safer sleep results page lists Kasia as completed today (she passed the English version 33
// days earlier in the seed, so a completion date of today can only come from the Polish attempt counting for the original).
// Runs on the phone and desktop projects. Polish labels are read from pl-PL.json so the test does not copy strings.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';

const root = join(process.cwd(), 'packages', 'content', 'src');
const polish = JSON.parse(readFileSync(join(root, 'lang', 'pl-PL.json'), 'utf8')) as Record<string, unknown>;
const pl = (path: string): string => {
  let cur: unknown = polish;
  for (const part of path.split('.')) cur = (cur as Record<string, unknown> | undefined)?.[part];
  if (typeof cur !== 'string') throw new Error(`pl-PL.json lacks ${path}`);
  return cur;
};
type Choice = { id: string; text: string; outcome: string; next?: string };
type Q = {
  prompt: string;
  options?: { text: string; correct: boolean }[];
  scenario?: { steps: { id: string; choices: Choice[] }[] };
};
const plModule = (): { questions: Q[] } =>
  JSON.parse(readFileSync(join(root, 'packs', 'nursery', 'modules', 'safer-sleep-pl', 'module.json'), 'utf8')) as {
    questions: Q[];
  };

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });
async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}

test('Kasia completes Safer sleep in Polish and Priya sees her completion on the original module', async ({ page }) => {
  test.setTimeout(150_000);
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  await page.goto('./');
  await jumpTo(page, /Kasia/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

  const modules = await readStore(page, 'modules');
  const en = modules.find((m) => m['title'] === 'Safer sleep');
  const plMod = modules.find(
    (m) => (m['translatedFrom'] as { moduleId?: string } | undefined)?.moduleId === en?.['id'],
  );
  expect(en, 'English Safer sleep').toBeDefined();
  expect(plMod, 'Polish Safer sleep').toBeDefined();
  expect(plMod!['language']).toBe('pl-PL');
  const enId = String(en!['id']);
  const plId = String(plMod!['id']);

  // Learn opens the Polish version by default for Kasia.
  await page.goto('./#/staff/learn');
  const link = page.locator(`a[href$="/staff/module/${plId}"]`).first();
  await expect(link).toBeVisible();
  await expect(page.locator(`a[href$="/staff/module/${enId}"]`)).toHaveCount(0);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`#/staff/module/${plId}$`));

  // The label, the official-text note and the link to the English version.
  await expect(page.getByText(pl('translation.machineTranslated'), { exact: true })).toBeVisible();
  await expect(page.getByText(pl('translation.englishIsOfficial'), { exact: true })).toBeVisible();
  await expect(page.locator(`a[href$="/staff/module/${enId}"]`).first()).toBeVisible();

  // Both lessons, then the quiz.
  const lessons = page.getByTestId('lesson-path').getByRole('link');
  const lessonCount = await lessons.count();
  expect(lessonCount).toBe(2);
  for (let i = 0; i < lessonCount; i++) {
    await page.goto(`./#/staff/module/${plId}`);
    await page.getByTestId('lesson-path').getByRole('link').nth(i).click();
    await expect(page.getByText(pl('translation.machineTranslated'), { exact: true })).toBeVisible();
    for (;;) {
      const ack = page.getByRole('checkbox');
      if (await ack.count()) await ack.check();
      const finish = page.getByRole('button', { name: pl('staff.lesson.finish') });
      if (await finish.count()) {
        await finish.click();
        break;
      }
      await page.getByRole('button', { name: pl('staff.lesson.next'), exact: true }).click();
    }
    await page.waitForURL(new RegExp(`#/staff/module/${plId}$`));
  }

  await page.goto(`./#/staff/module/${plId}/quiz`);
  await expect(page.getByText(pl('translation.machineTranslated'), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: pl('staff.quiz.start') }).click();
  const bank = plModule().questions;
  for (;;) {
    const prompt = (await page.getByTestId('question-prompt').innerText()).trim();
    const q = bank.find((x) => x.prompt === prompt);
    expect(q, `prompt "${prompt}" is from the Polish bank`).toBeDefined();
    if (q!.scenario) {
      let step = q!.scenario.steps[0];
      while (step) {
        const choice = step.choices.find((c) => c.outcome === 'best') ?? step.choices[0]!;
        await page.getByRole('radio', { name: choice.text }).check();
        await page.getByRole('button', { name: pl('staff.quiz.submit') }).click();
        if (choice.next) {
          await page.getByRole('button', { name: pl('staff.quiz.continue') }).click();
          const nextId = choice.next;
          step = q!.scenario.steps.find((x) => x.id === nextId);
        } else step = undefined;
      }
    } else {
      await page.getByRole('radio', { name: q!.options!.find((o) => o.correct)!.text }).check();
      await page.getByRole('button', { name: pl('staff.quiz.submit') }).click();
    }
    const finish = page.getByRole('button', { name: pl('staff.quiz.finish') });
    const next = page.getByRole('button', { name: pl('staff.quiz.nextQuestion') });
    await expect(finish.or(next)).toBeVisible();
    if (await finish.count()) {
      await finish.click();
      break;
    }
    await next.click();
  }
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/.+/);

  // Evidence is stored in Polish.
  const evidenceLanguages = (await readStore(page, 'evidence'))
    .filter((e) => e['moduleId'] === plId)
    .map((e) => e['language']);
  // Safer sleep has no requirement, so no Evidence row is expected; the attempt and assignment are what counts.
  expect(evidenceLanguages.every((l) => l === 'pl-PL')).toBe(true);
  const attempts = (await readStore(page, 'attempts')).filter((a) => a['moduleId'] === plId);
  expect(attempts.some((a) => a['passed'] === true)).toBe(true);

  // Priya: the original module's results list Kasia as completed today.
  await jumpTo(page, /Priya/);
  await page.goto(`./#/client/modules/${enId}/stats`);
  const people = page.getByRole('region', { name: 'People' });
  const row = people.getByRole('row').filter({ hasText: 'Kasia Nowak' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('19 October 2026');
  await expect(row).toContainText('100%');
});
