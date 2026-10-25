// M1 chunk 8 (F-4, F-6): sign in as Jade on a phone and see the Home ring. Runs in the phone project only.
// Contract: S1 at #/staff/signin has a radio per person, a "PIN" field and a "Sign in" button.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('signing in as Jade with PIN 1234 shows Home with the ring at "1 to do"', async ({ page }) => {
  await page.goto('./#/staff/signin');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
  await expect(page.getByText('1 to do')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Next up' })).toContainText('Safeguarding');
  await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('listitem')).toHaveCount(3);
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('a wrong PIN shows the demo hint and stays on sign in', async ({ page }) => {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('0000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That PIN is not right. In the demo the PIN is 1234.')).toBeVisible();
  await expect(page).toHaveURL(/#\/staff\/signin$/);
});
