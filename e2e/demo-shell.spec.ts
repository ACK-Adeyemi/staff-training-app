// F-7 and the D1 part of BP-2. Runs on the phone (touch) and desktop projects.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const badge = (page: Page) => page.getByTestId('demo-badge');
const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });
const menu = (page: Page) => page.getByRole('dialog', { name: 'Demo menu' });
const dateText = async (page: Page) => (await panel(page).getByText(/^Demo date:/).innerText()).replace('Demo date:', '').trim();

/** Parses "Monday 19 October 2026", "19 October 2026" and similar into a UTC day number. */
function dayNumber(text: string): number {
  const m = /(\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(text);
  if (!m) throw new Error(`No date in "${text}"`);
  return Math.round(Date.parse(`${m[1]} ${m[2]} ${m[3]} UTC`) / 86_400_000);
}

async function longPress(page: Page, ms = 700) {
  await badge(page).dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
  await page.waitForTimeout(ms);
  await badge(page).dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
}

test.describe('D1 landing', () => {
  test('shows three surface entries, the industry choice and the honest note', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: 'Choose what to look at' })).toBeVisible();
    await expect(page.getByTestId('demo-honest-note')).toContainText(/simulated/i);
    await expect(page.getByRole('radio', { name: 'Nursery' })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Luxury retail/ })).toBeDisabled();
    await expect(page.getByText('Arrives in a later build')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Client tour' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Provider tour' })).toBeVisible();
    const explore = page.getByRole('region', { name: 'Explore freely' });
    for (const name of [/Staff app/, /Client admin/, /Provider admin/]) {
      await expect(explore.getByRole('link', { name })).toBeVisible();
    }
  });

  test('Client tour opens the client admin as Priya and Provider tour opens the provider admin', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Client tour' }).click();
    await expect(page).toHaveURL(/#\/client$/);
    await expect(page.getByRole('banner')).toContainText('Priya');
    await page.goto('./');
    await page.getByRole('link', { name: 'Provider tour' }).click();
    await expect(page).toHaveURL(/#\/provider$/);
  });

  test('has no serious or critical accessibility violations with the menu open', async ({ page }) => {
    await page.goto('./');
    await badge(page).click();
    await expect(menu(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

test.describe('Demo badge and menu', () => {
  for (const hash of ['', '#/staff', '#/client', '#/provider', '#/demo/outbox']) {
    test(`the badge is visible on ${hash || 'D1'} and is at least 44px`, async ({ page }) => {
      await page.goto(`./${hash}`);
      await expect(badge(page)).toBeVisible();
      const box = await badge(page).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    });
  }

  test('tapping the badge opens the Demo menu with a version and a build date, and Escape closes it', async ({ page }) => {
    await page.goto('./#/staff');
    await badge(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByText(/^Version \S+/)).toBeVisible();
    await expect(menu(page).getByText(/^Built on \d{4}-\d{2}-\d{2}$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(badge(page)).toBeFocused();
  });

  test('Change industry goes back to D1', async ({ page }) => {
    await page.goto('./#/staff');
    await badge(page).click();
    await menu(page).getByRole('button', { name: 'Change industry' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Choose what to look at' })).toBeVisible();
    await expect(menu(page)).toBeHidden();
  });

  test('Open presenter panel from the menu opens D2', async ({ page }) => {
    await page.goto('./#/staff');
    await badge(page).click();
    await menu(page).getByRole('button', { name: 'Open presenter panel' }).click();
    await expect(panel(page)).toBeVisible();
    await expect(menu(page)).toBeHidden();
  });
});

test.describe('Presenter panel (D2)', () => {
  test('Shift+Alt+P opens it and Escape closes it', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
  });

  test('a long-press on the badge opens it, not the menu', async ({ page }) => {
    await page.goto('./#/staff');
    await longPress(page);
    await expect(panel(page)).toBeVisible();
    await expect(menu(page)).toBeHidden();
  });

  test('Fast-forward 30 days moves the date by 30 days, survives a reload, and Back to today restores it', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    const today = dayNumber(await dateText(page));
    await panel(page).getByRole('button', { name: /^Fast-forward 30 days?$/ }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today + 30);

    await page.reload();
    await page.keyboard.press('Shift+Alt+KeyP');
    expect(dayNumber(await dateText(page))).toBe(today + 30);

    await panel(page).getByRole('button', { name: 'Back to today' }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today);
  });

  test('+1 and +7 days add up', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    const today = dayNumber(await dateText(page));
    await panel(page).getByRole('button', { name: /^Fast-forward 1 days?$/ }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today + 1);
    await panel(page).getByRole('button', { name: /^Fast-forward 7 days?$/ }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today + 8);
  });

  test('Reset demo asks first, and after confirming clears the clock offset', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    const today = dayNumber(await dateText(page));
    await panel(page).getByRole('button', { name: /^Fast-forward 7 days?$/ }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today + 7);

    await panel(page).getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.getByText('Reset everything on this device?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(dayNumber(await dateText(page))).toBe(today + 7);

    await panel(page).getByRole('button', { name: 'Reset demo' }).click();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    await expect(page.getByTestId('demo-badge')).toBeVisible();
    await page.keyboard.press('Shift+Alt+KeyP');
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today);
  });

  test('the later-build items are shown disabled', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    for (const name of ['Simulate failed payment', 'Toggle system status', 'Clear prospect branding']) {
      await expect(panel(page).getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(panel(page).getByText('Arrives in a later build')).toHaveCount(3);
  });

  test('Jump to Client admin and Open the outbox navigate and close the panel', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    await panel(page).getByRole('link', { name: 'Client admin' }).click();
    await expect(page).toHaveURL(/#\/client$/);
    await expect(panel(page)).toBeHidden();
    await page.keyboard.press('Shift+Alt+KeyP');
    await panel(page).getByRole('link', { name: 'Open the outbox' }).click();
    await expect(page).toHaveURL(/#\/demo\/outbox$/);
    await expect(panel(page)).toBeHidden();
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    await expect(panel(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

test.describe('D3 outbox', () => {
  test('shows the empty state', async ({ page }) => {
    await page.goto('./#/demo/outbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Outbox' })).toBeVisible();
    await expect(
      page.getByText('Nothing has been sent yet. In the demo, messages are shown here instead of being sent.'),
    ).toBeVisible();
  });
});

test.describe('?reset=1', () => {
  test('resets on load, clears the offset and removes the parameter from the URL', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    const today = dayNumber(await dateText(page));
    await panel(page).getByRole('button', { name: /^Fast-forward 30 days?$/ }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today + 30);

    await page.goto('./?reset=1#/staff');
    await expect(badge(page)).toBeVisible();
    expect(page.url()).not.toContain('reset=1');
    await page.keyboard.press('Shift+Alt+KeyP');
    expect(dayNumber(await dateText(page))).toBe(today);
  });

  test('other URL parameters are ignored', async ({ page }) => {
    await page.goto('./#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    const today = dayNumber(await dateText(page));
    await panel(page).getByRole('button', { name: /^Fast-forward 7 days?$/ }).click();
    await expect.poll(async () => dayNumber(await dateText(page))).toBe(today + 7);
    await page.goto('./?reset=0&clear=1#/staff');
    await page.keyboard.press('Shift+Alt+KeyP');
    expect(dayNumber(await dateText(page))).toBe(today + 7);
  });
});
