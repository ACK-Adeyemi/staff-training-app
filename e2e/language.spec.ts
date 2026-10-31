// M5 chunk 6 (F-4): Kasia (saved language Polish) sees Polish on Home, a module, Me and Help, on a phone and a desktop.
// No English interface strings from a short list, axe clean, no sideways scroll at 200% text. Written before the translations.
// Runs in both projects (phone 390px and desktop 1440px).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** English interface strings that must not appear as visible text in the Polish interface (exact element text). */
const ENGLISH_CHROME = [
  'Home',
  'Learn',
  'Progress',
  'Compete',
  'Me',
  'Help',
  'More',
  'Next up',
  'Coming up',
  'Start training',
  'Display and accessibility',
  'Raise a ticket',
  'My tickets',
  'Send feedback',
  'Search help',
  'Language',
  'Notifications',
  'My notes',
  'Loading',
  'Back',
  'Next',
  'Skip to content',
  'Start quiz',
  'Resume',
  'Lessons',
];

async function signInAsKasia(page: Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Kasia/ }).check();
  await page.getByLabel(/PIN/).fill('1234');
  await page.getByRole('button', { name: /Sign in|Zaloguj/ }).click();
  await expect(page).toHaveURL(/#\/staff$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
}

/** Visible element texts outside lang="en-GB" content (FAQs, module text and so on stay English on purpose). */
async function interfaceTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.body.querySelectorAll(
      'h1,h2,h3,button,a,label,legend,summary,th,[role="tab"],[aria-label]',
    )) {
      if (el.closest('[lang="en-GB"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const text = el.textContent.trim();
      if (text) out.push(text);
      const label = el.getAttribute('aria-label');
      if (label) out.push(label.trim());
    }
    return out;
  });
}

async function expectPolish(page: Page, where: string) {
  const texts = await interfaceTexts(page);
  expect(
    texts.filter((x) => ENGLISH_CHROME.includes(x)),
    `${where}: English interface text`,
  ).toEqual([]);
  // Navigation has Polish labels.
  const nav = page.getByRole('navigation', { name: 'Główne menu' });
  await expect(nav.getByRole('link', { name: 'Nauka', exact: true }).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
}

async function expectAxeClean(page: Page, where: string) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    bad.map((v) => `${v.id}: ${v.help}`),
    where,
  ).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${where} at 200% text`).toBeLessThanOrEqual(innerWidth);
}

async function openFirstModule(page: Page) {
  await page.goto('./#/staff/learn');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const link = page.locator('a[href*="#/staff/module/"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#\/staff\/module\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const screens: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'Home',
    open: async (page) => {
      await page.goto('./#/staff');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  { name: 'a module', open: openFirstModule },
  {
    name: 'Me',
    open: async (page) => {
      await page.goto('./#/staff/me');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'Help',
    open: async (page) => {
      await page.goto('./#/staff/help');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
];

for (const s of screens) {
  test(`Kasia sees ${s.name} in Polish with no English interface text, axe clean`, async ({ page }) => {
    await signInAsKasia(page);
    await s.open(page);
    await expectPolish(page, s.name);
    if (s.name === 'Help') await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pomoc');
    if (s.name === 'Me') await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mój profil');
    await expectAxeClean(page, s.name);
  });

  test(`${s.name} has no sideways scroll at 200% text in Polish`, async ({ page }) => {
    await signInAsKasia(page);
    await s.open(page);
    await expectNoSidewaysScroll(page, s.name);
  });
}

test('Kasia keeps Polish after a reload', async ({ page }) => {
  await signInAsKasia(page);
  await page.goto('./#/staff/help');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pomoc');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
});
