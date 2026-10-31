// M5 chunk 13 (BP-3, F-8; brief 06, 19.3; build pack 11.1): axe on states, not just routes. Light and dark, phone and
// desktop projects (the project sets the viewport). Serious and critical violations fail. Covers: the tour overlay open
// on a staff, client and provider screen, in dark, with high contrast and with reduced motion; Kasia in Polish; the
// translated lesson; C7 with AI-drafted items; the Add note sheet, filters sheet, competition details sheet, Request
// add-on dialog and presenter panel; and error and empty states.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';
import { anyOverlay, overlay, startTour } from './helpers/tour';

const PINNED = new Date('2026-10-19T09:00:01.000Z');
const MODULE = '01M0C0N7000000000000000201';

async function expectAxeClean(page: Page, where: string) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    bad.map((v) => `${v.id}: ${v.help} (${bad.length ? v.nodes[0]?.target.join(' ') : ''})`),
    where,
  ).toEqual([]);
}

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });
async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}
async function signInAs(page: Page, who: RegExp) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: who }).check();
  await page.getByLabel(/PIN/).fill('1234');
  await page.getByRole('button', { name: /Sign in|Zaloguj/ }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}
/** Moves within the app without reloading, so the stored tour keeps showing its box. */
async function inApp(page: Page, hash: string) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`states in ${colorScheme} colour scheme`, () => {
    test.use({ colorScheme });
    test.beforeEach(async ({ context }) => {
      await context.clock.setFixedTime(PINNED);
    });

    test('the tour overlay is axe clean over a client, a staff and a provider screen', async ({ page }) => {
      test.setTimeout(120_000);
      await startTour(page, 'Client tour', 9);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAxeClean(page, 'overlay over the client dashboard');
      await inApp(page, '#/staff');
      await expect(anyOverlay(page)).toBeVisible();
      await expectAxeClean(page, 'overlay over a staff screen');
      await page.goto('about:blank');
      await startTour(page, 'Provider tour', 7);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(anyOverlay(page)).toBeVisible();
      await expectAxeClean(page, 'overlay over a provider screen');
    });

    test('the tour overlay is axe clean with high contrast on', async ({ page }) => {
      await startTour(page, 'Client tour', 9);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-contrast', 'high');
      });
      await expect(overlay(page, 1, 9)).toBeVisible();
      await expectAxeClean(page, 'overlay with high contrast');
    });

    test('with reduced motion the tour overlay and its marker have no transition or animation, and are axe clean', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startTour(page, 'Client tour', 9);
      await overlay(page, 1, 9).getByRole('button', { name: 'Show me' }).click();
      await expect(page.getByTestId('tour-marker')).toBeVisible();
      const motion = await page.evaluate(() => {
        const out: string[] = [];
        const targets = [
          ...document.querySelectorAll(
            'aside[aria-label^="Tour"], aside[aria-label^="Tour"] *, [data-testid="tour-marker"]',
          ),
        ];
        for (const el of targets) {
          const s = getComputedStyle(el);
          const dur = (v: string) => v.split(',').some((x) => parseFloat(x) > 0);
          if (dur(s.transitionDuration) || dur(s.animationDuration) || s.scrollBehavior === 'smooth')
            out.push(`${el.tagName} ${el.textContent.slice(0, 20)}`);
        }
        return out;
      });
      expect(motion, 'elements that still move').toEqual([]);
      await expectAxeClean(page, 'overlay with reduced motion');
    });

    test('with reduced motion the app moves nothing: no smooth scroll, no running animations', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const hash of ['#/staff', '#/client', '#/provider']) {
        await page.goto('about:blank');
        await page.goto(`./${hash}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        const running = await page.evaluate(() => ({
          smooth: getComputedStyle(document.documentElement).scrollBehavior === 'smooth',
          animations: document.getAnimations().filter((a) => a.playState === 'running').length,
        }));
        expect(running, hash).toEqual({ smooth: false, animations: 0 });
      }
    });

    test('Kasia in Polish: Home, a lesson and the quiz are axe clean', async ({ page }) => {
      test.setTimeout(90_000);
      await signInAs(page, /Kasia/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAxeClean(page, 'Polish Home');
      await page.goto(`./#/staff/module/${MODULE}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const lessons = (await readStore(page, 'modules')).find((m) => m['id'] === MODULE)?.['lessons'] as
        { id: string }[] | undefined;
      await page.goto(`./#/staff/module/${MODULE}/lesson/${String(lessons?.[0]?.id)}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAxeClean(page, 'Polish lesson');
      await page.goto(`./#/staff/module/${MODULE}/quiz`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAxeClean(page, 'Polish quiz');
    });

    test('the translated Polish Safer sleep lesson is axe clean', async ({ page }) => {
      await signInAs(page, /Kasia/);
      const modules = await readStore(page, 'modules');
      const en = modules.find((m) => m['title'] === 'Safer sleep');
      const pl = modules.find(
        (m) => (m['translatedFrom'] as { moduleId?: string } | undefined)?.moduleId === en?.['id'],
      );
      const lessonId = String((pl?.['lessons'] as { id: string }[])[0]?.id);
      await page.goto(`./#/staff/module/${String(pl?.['id'])}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAxeClean(page, 'translated module overview');
      await page.goto(`./#/staff/module/${String(pl?.['id'])}/lesson/${lessonId}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAxeClean(page, 'translated lesson');
    });

    test('C7 with AI-drafted items is axe clean', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('./');
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
      await page.goto('./#/client/modules/new');
      await page
        .getByRole('textbox', { name: 'Paste your policy' })
        .fill(
          'Outings policy\n\n# Before we go\nA named adult counts the children.\n\n# On the way\nChildren hold hands.',
        );
      await page.getByRole('button', { name: 'Make a draft' }).click();
      await expect(page.getByTestId('ai-label').first()).toBeVisible();
      await expectAxeClean(page, 'C7 with AI-drafted items');
    });

    test('the Add note sheet, the filters sheet and the competition details sheet are axe clean', async ({ page }) => {
      test.setTimeout(90_000);
      await signInAs(page, /Jade/);
      await page.goto(`./#/staff/module/${MODULE}`);
      await page.getByRole('link', { name: /^Start|^Resume/ }).click();
      await page.getByRole('button', { name: 'Add note' }).click();
      await expect(page.getByRole('dialog', { name: 'Add note' })).toBeVisible();
      await expectAxeClean(page, 'Add note sheet');

      await page.goto('./#/staff/learn');
      await page.getByRole('button', { name: 'Filters' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectAxeClean(page, 'filters sheet');

      await page.goto('./#/staff/compete');
      await page.getByRole('button', { name: 'Details: Mastery Month' }).click();
      await expect(page.getByRole('dialog', { name: 'Mastery Month' })).toBeVisible();
      await expectAxeClean(page, 'competition details sheet');
    });

    test('the Request add-on dialog and the presenter panel are axe clean', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('./');
      await jumpTo(page, /Daniel/);
      await page.goto(`./#/client/modules/${MODULE}/preview/lesson-1`);
      await page
        .getByTestId('explain-locked')
        .getByRole('button', { name: /request/i })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectAxeClean(page, 'Request add-on dialog');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+Alt+KeyP');
      await expect(panel(page)).toBeVisible();
      await expectAxeClean(page, 'presenter panel');
    });

    test('error and empty states are axe clean: wrong PIN, no such module, Not found, empty notes', async ({
      page,
    }) => {
      await page.goto('./#/staff/signin');
      await page.getByRole('radio', { name: /Jade/ }).check();
      await page.getByLabel(/PIN/).fill('0000');
      await page.getByRole('button', { name: /Sign in/ }).click();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expectAxeClean(page, 'wrong PIN');

      await page.goto('about:blank');
      await page.goto('./#/staff/module/does-not-exist');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAxeClean(page, 'unknown module');

      await page.goto('about:blank');
      await page.goto('./#/no/such/page');
      await expect(page.getByRole('heading', { level: 1, name: 'We could not find that page' })).toBeVisible();
      await expectAxeClean(page, 'Not found');

      await page.goto('about:blank');
      await page.goto('./?reset=1#/staff/learn');
      await page.getByRole('searchbox', { name: 'Search' }).fill('zzzzqqqq no such thing');
      await expect(page.getByTestId('learn-count')).toContainText(/^0|No /);
      await expectAxeClean(page, 'empty search result');
    });
  });
}
