// BP-2: every navigation item reaches its route, on phone (bottom bars and More) and on desktop (sidebar).
// D1's tour buttons are covered with the D1 screen in chunk 12 (demo-shell.spec.ts).
import { expect, test, type Page } from '@playwright/test';
import { clientBar, clientMore, providerBar, providerMore, staffExtra, staffTabs, need, type NavEntry } from './routes';

const isPhone = (name: string) => name === 'phone';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

async function expectAt(page: Page, entry: NavEntry) {
  await expect(page).toHaveURL(new RegExp(`${entry.hash.replace(/[/]/g, '\\/')}$`));
  await expect(page.getByRole('heading', { level: 1, name: entry.label })).toBeVisible();
}

test('the empty hash opens the demo landing page, not a shell', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
});

test('staff: each tab navigates and sets aria-current', async ({ page }) => {
  await page.goto('./#/staff');
  for (const tab of staffTabs) {
    await nav(page).getByRole('link', { name: tab.label, exact: true }).click();
    await expectAt(page, tab);
    await expect(nav(page).getByRole('link', { name: tab.label, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test('staff: the header bell and Help reach their routes', async ({ page }) => {
  await page.goto('./#/staff');
  for (const entry of staffExtra) {
    // Not exact: from chunk 8 the bell's name carries the unread count, for example "Notifications, 1 unread".
    await page.getByRole('banner').getByRole('link', { name: entry.label }).click();
    await expectAt(page, entry);
  }
});

for (const [side, bar, more, home] of [
  ['client', clientBar, clientMore, '#/client'],
  ['provider', providerBar, providerMore, '#/provider'],
] as const) {
  test(`${side}: every item reaches its route`, async ({ page }, info) => {
    await page.goto(`./${home}`);
    if (isPhone(info.project.name)) {
      for (const item of bar) {
        await nav(page).getByRole('link', { name: item.label, exact: true }).click();
        await expectAt(page, item);
      }
      await expect(nav(page).getByRole('link')).toHaveCount(bar.length);
      for (const item of more) {
        await page.getByRole('button', { name: 'More' }).click();
        const sheet = page.getByRole('dialog', { name: 'More' });
        for (const other of more)
          await expect(sheet.getByRole('link', { name: other.label, exact: true })).toBeVisible();
        await sheet.getByRole('link', { name: item.label, exact: true }).click();
        await expectAt(page, item);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    } else {
      await expect(page.getByRole('button', { name: 'More' })).toHaveCount(0);
      for (const item of [...bar, ...more]) {
        await expect(nav(page).getByRole('link', { name: item.label, exact: true })).toBeVisible();
      }
      for (const item of [...bar, ...more]) {
        await nav(page).getByRole('link', { name: item.label, exact: true }).click();
        await expectAt(page, item);
        await expect(nav(page).getByRole('link', { name: item.label, exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
    }
  });
}

test('the shell shows the acting persona by name and the Demo badge', async ({ page }) => {
  for (const [hash, name] of [
    ['#/staff', 'Jade Mills'],
    ['#/client', 'Priya Shah'],
    ['#/provider', 'Owner'],
  ] as const) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('banner').getByText(name)).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: /Demo/ })).toBeVisible();
  }
});

test('the provider shell shows the Simulated data badge', async ({ page }) => {
  await page.goto('./#/provider');
  await expect(page.getByRole('banner').getByText('Simulated data')).toBeVisible();
});

test('navigation targets are 44px or larger', async ({ page }) => {
  await page.goto('./#/staff');
  for (const tab of staffTabs) {
    const box = need(await nav(page).getByRole('link', { name: tab.label, exact: true }).boundingBox());
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});
