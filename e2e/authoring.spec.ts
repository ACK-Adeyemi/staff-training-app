// M3 chunk 15a (BP-3, and the C6 parts of BP-1): the Module Library at #/client/modules, Preview as a learner, and
// assigning a group. Runs on the phone (390 by 844) and desktop projects.
// Contract: see apps/web/src/pages/client/moduleLibrary.test.tsx. Every module is an element with
// data-testid="module-item" and data-module-id, in both the cards and the table view. Preview adds buttons
// "Previous lesson" and "Next lesson", a tab "Quiz" with radios per option, and data-testid="preview-explanation"
// around the explanation shown after an answer (nothing is recorded).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const PROVIDER_MODULE = '01M0C0N7000000000000000201';
const NOTE = 'This copy is yours. It will not get our updates and you are responsible for keeping it accurate.';

const item = (page: Page, id: string) => page.locator(`[data-testid="module-item"][data-module-id="${id}"]`);
const ownItems = (page: Page) => page.getByTestId('module-item').filter({ hasText: 'Own' });

async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}

async function expectTouchTargets(...targets: Locator[]) {
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.5);
  }
}

test('the library lists provider and own modules and a provider module offers only Preview, Duplicate and Add our own links (BP-3)', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  await expect(page.getByRole('heading', { level: 1, name: 'Training' })).toBeVisible();
  const provider = item(page, PROVIDER_MODULE);
  await expect(provider).toContainText('Provider');
  await expect(provider.getByRole('link', { name: 'Preview as a learner' })).toBeVisible();
  await expect(provider.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await expect(provider.getByRole('link', { name: 'Add our own links' })).toBeVisible();
  for (const name of ['Edit', 'Archive', 'Delete', 'Export JSON']) {
    await expect(provider.getByRole('button', { name: new RegExp(`^${name}$`) })).toHaveCount(0);
    await expect(provider.getByRole('link', { name: new RegExp(`^${name}$`) })).toHaveCount(0);
  }
  const own = page.getByTestId('module-item').filter({ hasText: 'Fire evacuation' });
  await expect(own).toContainText('Own');
  await expect(own.getByRole('link', { name: 'Edit' })).toBeVisible();
  await expect(own.getByRole('button', { name: 'Export JSON' })).toBeVisible();
});

test('Duplicate on a provider module makes an own draft with the responsibility note, and Edit then opens the builder', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  const before = await ownItems(page).count();
  await item(page, PROVIDER_MODULE).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('status').filter({ hasText: NOTE })).toBeVisible();
  await expect(ownItems(page)).toHaveCount(before + 1);
  const draft = ownItems(page).filter({ hasText: 'Draft' }).filter({ hasNotText: 'Lone working' });
  await expect(draft).toHaveCount(1);
  await expect(draft.getByRole('button', { name: 'Archive' })).toBeVisible();
  await draft.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/#\/client\/modules\/[^/]+\/edit$/);
});

test('Add our own links goes to the builder route for a provider module', async ({ page }) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  await item(page, PROVIDER_MODULE).getByRole('link', { name: 'Add our own links' }).click();
  await expect(page).toHaveURL(new RegExp(`#/client/modules/${PROVIDER_MODULE}/edit`));
});

test('filters and the cards or table toggle work, controls are at least 44px, and axe finds nothing serious', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  await expect(page.getByTestId('module-item').first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Source' }).selectOption('Own');
  await expect(page.getByTestId('module-item').filter({ hasText: 'Provider' })).toHaveCount(0);
  await expect(page.getByTestId('module-item').first()).toContainText('Own');
  await page.getByRole('combobox', { name: 'Status' }).selectOption('Draft');
  await expect(page.getByTestId('module-item')).toHaveCount(1);
  await expect(page.getByTestId('module-item')).toContainText('Lone working');
  await page.getByRole('combobox', { name: 'Status' }).selectOption('All');
  await page.getByRole('combobox', { name: 'Source' }).selectOption('All');

  const count = await page.getByTestId('module-item').count();
  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByTestId('module-item')).toHaveCount(count);
  await page.getByRole('button', { name: 'Cards' }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByTestId('module-item')).toHaveCount(count);

  const first = item(page, PROVIDER_MODULE);
  await expectTouchTargets(
    page.getByRole('button', { name: 'Cards' }),
    page.getByRole('button', { name: 'Table' }),
    first.getByRole('button', { name: 'Duplicate' }),
    first.getByRole('link', { name: 'Preview as a learner' }),
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('Preview as a learner walks the lessons in a phone frame and answers a question without recording it', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  await item(page, PROVIDER_MODULE).getByRole('link', { name: 'Preview as a learner' }).click();
  await expect(page).toHaveURL(new RegExp(`#/client/modules/${PROVIDER_MODULE}/preview$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Preview as a learner' })).toBeVisible();
  const first = await page.getByRole('heading', { level: 2 }).first().textContent();
  await page.getByRole('button', { name: 'Next lesson' }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).not.toHaveText(first ?? '');
  await page.getByRole('button', { name: 'Previous lesson' }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(first ?? '');
  await expectTouchTargets(page.getByRole('button', { name: 'Next lesson' }));
  await page.getByRole('tab', { name: 'Quiz' }).click();
  await page.getByRole('radio').first().click();
  await expect(page.getByTestId('preview-explanation')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('Assign can choose a group and assigns each of its modules to the chosen people', async ({ page }) => {
  await pinClock(page);
  await page.goto('./#/client/assign');
  await page.getByRole('combobox', { name: 'Group' }).selectOption({ label: 'New starter induction' });
  await page.getByRole('checkbox', { name: /Lucy Evans/ }).check();
  await page.getByLabel('Due date').fill('2026-11-02');
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('status')).toContainText(/\d+ assigned/);
  await expect(page.getByRole('combobox', { name: 'Module' })).toHaveValue('');
});
