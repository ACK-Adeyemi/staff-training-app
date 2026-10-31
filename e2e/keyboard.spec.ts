// M5 chunk 13 (BP-4; brief 06, 19.3; build pack 11.1): six keyboard-only flows. Only page.keyboard moves focus and
// activates controls in the flow itself (setup such as signing in may use the mouse). At each stop the focused control
// must show a focus ring; closing a dialog returns focus to its opener; nothing traps focus; each shell has a skip link.
// Desktop project for every flow; the staff lesson flow also runs on the phone project.
import { expect, test, type Page } from '@playwright/test';
import {
  expectFocusWithin,
  expectNotBehind,
  focusIsInside,
  expectNoTrap,
  focusIsVisible,
  tabThrough,
  tabTo,
  useSkipLink,
} from './helpers/keyboard';
import { installSpeechRecorder, readSpeechLog } from './helpers/speech';
import { anyOverlay, demoMenu, overlay } from './helpers/tour';

const PINNED = new Date('2026-10-19T09:00:01.000Z');
const MODULE = '01M0C0N7000000000000000201';

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(PINNED);
});

const desktopOnly = () => {
  test.skip(({ isMobile }) => isMobile, 'desktop project only');
};
const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

async function signInAsJade(page: Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
}

/** Starts the lesson of the Safeguarding module from its overview, with the keyboard. */
async function keyboardIntoFirstLesson(page: Page) {
  await page.goto(`./#/staff/module/${MODULE}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await tabTo(page, page.getByRole('link', { name: /^Start|^Resume/ }));
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();
}

test.describe('Flow 1: landing, Demo menu and presenter panel', () => {
  desktopOnly();

  test('Demo menu opens with Enter, keeps focus inside, closes with Escape and focus returns to the Demo badge', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const badge = page.getByTestId('demo-badge');
    await tabTo(page, badge);
    await page.keyboard.press('Enter');
    await expect(demoMenu(page)).toBeVisible();
    await expectFocusWithin(demoMenu(page));
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      await expectNotBehind(demoMenu(page));
      if (await focusIsInside(demoMenu(page)))
        expect(await focusIsVisible(page), `ring at Tab ${String(i + 1)}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(demoMenu(page)).toBeHidden();
    await expect(badge, 'focus returns to the opener').toBeFocused();
  });

  test('the presenter shortcut opens the panel, Reset demo works by keyboard, and Escape returns focus', async ({
    page,
  }) => {
    await page.goto('./#/staff');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const badge = page.getByTestId('demo-badge');
    await tabTo(page, badge);
    await page.keyboard.press('Shift+Alt+KeyP');
    await expect(panel(page)).toBeVisible();
    await expectFocusWithin(panel(page));
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      await expectNotBehind(panel(page));
    }
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(badge, 'focus returns to the opener').toBeFocused();

    // Reset demo, confirmed with the keyboard only.
    await page.keyboard.press('Shift+Alt+KeyP');
    await tabTo(page, panel(page).getByRole('button', { name: 'Reset demo' }), { max: 40 });
    await page.keyboard.press('Enter');
    const confirm = panel(page).getByRole('group', { name: 'Reset everything on this device?' });
    await expect(confirm).toBeVisible();
    // The confirmation follows the button in the focus order, so the next Tab reaches it.
    await tabTo(page, confirm.getByRole('button', { name: /^Yes/ }), { max: 3 });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
});

test.describe('Flow 2: staff lesson, note and quiz', () => {
  test('Jade reads a lesson, adds a note, finishes the lesson and answers a quiz question using only the keyboard', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsJade(page);
    await page.goto('./#/staff');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await keyboardIntoFirstLesson(page);
    // Add note: opens a sheet, Escape closes it and focus goes back to the button.
    const addNote = page.getByRole('button', { name: 'Add note' });
    await tabTo(page, addNote);
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Add note' });
    await expect(sheet).toBeVisible();
    await expectFocusWithin(sheet);
    await tabTo(page, sheet.getByRole('textbox', { name: 'Note' }), { max: 6 });
    await page.keyboard.type('Check the visitor book');
    await tabTo(page, sheet.getByRole('button', { name: 'Save note' }), { max: 6 });
    await page.keyboard.press('Enter');
    await expect(sheet).toBeHidden();
    await expect(addNote, 'focus returns to Add note').toBeFocused();

    // Walk the steps with Tab and Space or Enter.
    for (let guard = 0; guard < 30; guard++) {
      const ack = page.getByRole('checkbox');
      if (await ack.count()) {
        await tabTo(page, ack);
        await page.keyboard.press('Space');
        await expect(ack).toBeChecked();
      }
      const finish = page.getByRole('button', { name: 'Finish lesson' });
      if (await finish.count()) {
        await tabTo(page, finish);
        await page.keyboard.press('Enter');
        break;
      }
      await tabTo(page, page.getByRole('button', { name: 'Next', exact: true }));
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('region', { name: 'Lessons' })).toBeVisible();
    await expectNoTrap(page, 20);

    // Finish the other lessons by clicking (setup), then take the quiz by keyboard.
    const { finishLessons } = await import('./helpers/quiz');
    await finishLessons(page);
    await tabTo(page, page.getByRole('link', { name: /Start quiz/ }));
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: /Start quiz/ }));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('question-prompt')).toBeVisible();
    // Choose an answer with Space on the first radio, then submit with Enter.
    await tabTo(page, page.getByRole('radio').first());
    await page.keyboard.press('Space');
    await tabTo(page, page.getByRole('button', { name: 'Submit answer' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Feedback' })).toBeVisible();
    // Focus is on or inside the feedback, or the next control, never lost to the page body.
    const lost = await page.evaluate(() => document.activeElement === document.body);
    expect(lost, 'focus is not dropped to the page body after Submit answer').toBe(false);
  });
});

test.describe('Flow 3: read-aloud bar', () => {
  test('the read-aloud controls on a lesson work with Tab and Enter and show focus', async ({ page }) => {
    await installSpeechRecorder(page);
    await signInAsJade(page);
    await keyboardIntoFirstLesson(page);
    const play = page.getByRole('button', { name: 'Read this aloud' }).first();
    await tabTo(page, play);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readSpeechLog(page)).spoken.length).toBeGreaterThan(0);
    const spokenBefore = (await readSpeechLog(page)).spoken.length;
    const next = page.getByRole('button', { name: 'Next paragraph' });
    if (await next.count()) {
      await tabTo(page, next);
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await readSpeechLog(page)).spoken.length).toBeGreaterThan(spokenBefore);
    }
    // Reading can be stopped again from the keyboard (Stop reading or Pause).
    const stop = page.getByRole('button', { name: /^Stop reading$|^Pause$/ }).first();
    await tabTo(page, stop, { back: true });
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await readSpeechLog(page)).cancels + (await readSpeechLog(page)).pauses)
      .toBeGreaterThan(0);
    const lost = await page.evaluate(() => document.activeElement === document.body);
    expect(lost, 'focus stays on a control after stopping').toBe(false);
  });
});

test.describe('Flow 4: tour overlay', () => {
  desktopOnly();

  test('the tour starts from the keyboard; the shortcut moves focus to it; Next, Back and Close keep focus on a control', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('./');
    const start = page.getByRole('button', { name: 'Client tour' });
    await tabTo(page, start);
    await page.keyboard.press('Enter');
    const ask = page.getByRole('dialog', { name: 'Start the tour from the beginning?' });
    await expectFocusWithin(ask);
    await tabTo(page, ask.getByRole('button', { name: 'Confirm' }), { max: 6 });
    await page.keyboard.press('Enter');
    await expect(overlay(page, 1, 9)).toBeVisible();

    // The documented shortcut moves focus into the tour box (a landmark).
    await page.keyboard.press('Shift+Alt+KeyT');
    await expect(overlay(page, 1, 9)).toBeFocused();

    // Tab reaches Next; Enter moves to step 2 and focus is still on a control inside the box.
    await tabTo(page, overlay(page, 1, 9).getByRole('button', { name: 'Next', exact: true }), { max: 8 });
    await page.keyboard.press('Enter');
    await expect(overlay(page, 2, 9)).toBeVisible();
    await expectFocusWithin(overlay(page, 2, 9));

    // Back is enabled on step 2 and works from the keyboard.
    await tabTo(page, overlay(page, 2, 9).getByRole('button', { name: 'Back' }), { max: 8, back: true });
    await page.keyboard.press('Space');
    await expect(overlay(page, 1, 9)).toBeVisible();

    // Collapse puts the Open pill under focus (focus is not lost); the pill reopens the box.
    await page.keyboard.press('Shift+Alt+KeyT');
    await tabTo(page, overlay(page, 1, 9).getByRole('button', { name: 'Collapse tour' }), { max: 12 });
    await page.keyboard.press('Enter');
    await expect(anyOverlay(page)).toHaveCount(0);
    const pill = page.getByRole('button', { name: 'Open tour, step 1 of 9' });
    await expect(pill, 'focus moves to the pill when the box collapses').toBeFocused();
    await page.keyboard.press('Enter');
    await expect(overlay(page, 1, 9)).toBeVisible();
    await expectFocusWithin(overlay(page, 1, 9));

    // No trap: Tab leaves the box and reaches the page.
    await expectNoTrap(page, 30);

    // Skip tour ends it and focus does not fall back to the body.
    await page.keyboard.press('Shift+Alt+KeyT');
    await tabTo(page, overlay(page, 1, 9).getByRole('button', { name: 'Skip tour' }), { max: 14 });
    await page.keyboard.press('Enter');
    // Skip closes the overlay and leaves the app where it is (plan M5 chunk 10), so no "finished" box appears.
    await expect(anyOverlay(page)).toHaveCount(0);
    const lost = await page.evaluate(() => document.activeElement === document.body);
    expect(lost, 'focus is not dropped to the page body after Skip tour').toBe(false);
  });
});

test.describe('Flow 5: client admin matrix and assign dialog', () => {
  desktopOnly();

  test('Priya reaches the training matrix and opens and closes the Assign refresher dialog by keyboard, focus returning to its button', async ({
    page,
  }) => {
    await page.goto('./#/client/reports/matrix');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole('table', { name: /training matrix/i })).toBeVisible();
    await tabThrough(page, 12);
    await expectNoTrap(page, 40);

    await page.goto('./#/client/calendar');
    await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
    const cluster = page
      .getByRole('region', { name: 'Many expiring in the same week' })
      .getByRole('listitem')
      .filter({ hasText: '3 Safeguarding expiries' });
    const trigger = cluster.getByRole('button', { name: 'Assign refresher for a week' });
    await tabTo(page, trigger, { max: 80 });
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Assign refresher for a week' });
    await expect(dialog).toBeVisible();
    await expectFocusWithin(dialog);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await expectNotBehind(dialog);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger, 'focus returns to the opener').toBeFocused();
  });
});

test.describe('Flow 6: provider page dialog', () => {
  desktopOnly();

  test('a provider user opens and closes the Extend grace dialog by keyboard and the provider shell has a skip link', async ({
    page,
  }) => {
    await page.goto('./?reset=1#/provider/dunning');
    await expect(page.getByRole('heading', { level: 1, name: 'Dunning' })).toBeVisible();
    const trigger = page.getByRole('button', { name: /Extend grace/ }).first();
    await expect(trigger).toBeVisible();
    await tabTo(page, trigger, { max: 80 });
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectFocusWithin(dialog);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await expectNotBehind(dialog);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger, 'focus returns to the opener').toBeFocused();
  });
});

// Skip links: one test per shell, so a missing link on one does not hide the others.
test.describe('Skip link on every shell', () => {
  desktopOnly();
  for (const [name, hash] of [
    ['landing page', ''],
    ['staff shell', '#/staff'],
    ['client shell', '#/client'],
    ['provider shell', '#/provider'],
  ] as const) {
    test(`the ${name} has a skip link that is the first stop and moves focus to the main content`, async ({ page }) => {
      await page.goto(`./${hash}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await useSkipLink(page);
    });
  }
});
