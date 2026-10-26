// M2 chunk 13 (F-4, BP-6): Priya creates a category, moves Safer sleep into it and reorders it to the top;
// Jade's Learn then shows the category card first and finds Safer sleep by the new category name.
// Contract: testids, region names and control names as listed in apps/web/src/pages/client/organise.test.tsx
// and apps/web/src/pages/staff/learn.test.tsx. Both phone and desktop projects run this.
import { expect, test, type Page } from '@playwright/test';

const NEW_CATEGORY = 'Rest and rhythm';

async function signInAs(page: Page, name: RegExp) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}

test('Priya adds a category, moves Safer sleep into it and puts it first; Jade finds the module by the new category', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
  await page.goto('./#/client/organise');
  await expect(page.getByRole('heading', { level: 1, name: 'Organise modules' })).toBeVisible();

  await page.getByRole('button', { name: 'New category' }).click();
  const dialog = page.getByRole('dialog', { name: 'New category' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(NEW_CATEGORY);
  await dialog.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'Teal' }).check();
  await dialog.getByRole('button', { name: 'Save category' }).click();
  const rows = page.getByRole('region', { name: 'Categories' }).getByTestId('category-row');
  await expect(rows).toHaveCount(7);
  await expect(rows.last()).toContainText(NEW_CATEGORY);

  await page.getByRole('combobox', { name: 'Category for Safer sleep' }).selectOption(NEW_CATEGORY);
  await expect(rows.last()).toContainText('1 module');

  for (let i = 0; i < 6; i++) {
    await rows
      .filter({ hasText: NEW_CATEGORY })
      .getByRole('button', { name: /^Move up/ })
      .click();
    await expect(rows.nth(5 - i)).toContainText(NEW_CATEGORY);
  }
  await expect(rows.first()).toContainText(NEW_CATEGORY);

  // Jade sees it at once on Learn.
  await signInAs(page, /Jade/);
  await page.goto('./#/staff/learn');
  await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
  const cards = page.getByRole('region', { name: 'Categories' }).getByRole('button');
  await expect(cards.first()).toContainText(NEW_CATEGORY);

  await page.getByRole('searchbox', { name: 'Search' }).fill('rest and rhythm');
  await expect(page.getByTestId('learn-count')).toHaveText('1 module');
  await expect(page.getByRole('link', { name: 'Safer sleep' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Safer sleep' }).locator('mark').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Safeguarding and whistleblowing/ })).toHaveCount(0);

  // The category card filters the list and shows a removable chip.
  await page.getByRole('searchbox', { name: 'Search' }).fill('');
  await cards.first().click();
  await expect(page.getByTestId('learn-count')).toHaveText('1 module');
  await page
    .getByTestId('learn-active-filters')
    .getByRole('button', { name: `Remove filter: ${NEW_CATEGORY}` })
    .click();
  await expect(page.getByTestId('learn-count')).toHaveText('5 modules');
});

test('Maureen (Simple view) sees a plain Learn list with no path nodes', async ({ page }) => {
  await signInAs(page, /Maureen/);
  await page.goto('./#/staff/learn');
  await expect(page.getByTestId('learn-simple-list')).toBeVisible();
  await expect(page.getByTestId('path-node')).toHaveCount(0);
});
