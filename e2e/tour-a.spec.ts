// M5 chunk 12 (BP-1, F-3): the Track A client tour (build pack 8.1 steps 1 to 9, 8.4) on the phone and desktop projects.
// Step 10 (Battle Room) joins in M7. Each step is its own test (a fresh context each): start the tour from D1, press
// Next to the step, press Show me, check where it lands and the highlighted target, then do one cheap key action.
// The full actions are in track-a.spec.ts. One walk test goes through every step and ends on Try this next.
import { expect, test, type Page } from '@playwright/test';
import {
  advanceTo,
  anyOverlay,
  demoMenu,
  expectOverlayUsable,
  openDemoMenu,
  overlay,
  showMe,
  startTour,
} from './helpers/tour';

const M = 9;
const PINNED = new Date('2026-10-19T09:00:01.000Z');

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(PINNED);
});

const banner = (page: Page) => page.getByRole('banner');
const h1 = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });

type Step = {
  n: number;
  title: string;
  hash: RegExp;
  who: string;
  /** Checks the screen Show me opened. */
  lands: (page: Page) => Promise<void>;
  /** The key cheap action for the step. */
  act?: (page: Page) => Promise<void>;
};

const steps: Step[] = [
  {
    n: 1,
    title: 'dashboard as Priya, with the dashboard highlighted',
    hash: /#\/client$/,
    who: 'Priya',
    lands: async (page) => {
      await expect(h1(page, 'Dashboard')).toBeVisible();
      await expect(page.locator('[data-tour="client-dashboard"][data-tour-active="true"]')).toBeVisible();
      await expect(page.getByTestId('tour-marker')).toBeVisible();
    },
    act: async (page) => {
      await expect(page.getByRole('region', { name: 'Compliance' })).toContainText('11 of 14');
      await expect(page.getByRole('region', { name: 'Needs attention' }).getByRole('listitem')).toHaveCount(6);
    },
  },
  {
    n: 2,
    title: 'calendar: assign the refresher to the three expiring people',
    hash: /#\/client\/calendar$/,
    who: 'Priya',
    lands: async (page) => {
      await expect(h1(page, 'Calendar')).toBeVisible();
    },
    act: async (page) => {
      const cluster = page
        .getByRole('region', { name: 'Many expiring in the same week' })
        .getByRole('listitem')
        .filter({ hasText: '3 Safeguarding expiries' });
      await cluster.getByRole('button', { name: 'Assign refresher for a week' }).click();
      await page
        .getByRole('dialog', { name: 'Assign refresher for a week' })
        .getByRole('button', { name: 'Assign' })
        .click();
      await expect(page.getByRole('status').filter({ hasText: 'Assigned to 3 people.' })).toBeVisible();
    },
  },
  {
    n: 3,
    title: 'staff phone as Jade: Next up and Coming up',
    hash: /#\/staff$/,
    who: 'Jade',
    lands: async (page) => {
      await expect(banner(page)).toContainText('Jade');
    },
    act: async (page) => {
      await expect(page.getByRole('region', { name: 'Next up' })).toContainText('Safeguarding');
      await expect(page.getByRole('region', { name: 'Coming up' }).getByRole('listitem')).toHaveCount(3);
    },
  },
  {
    n: 4,
    title: 'staff phone as Maureen: Simple view and large text',
    hash: /#\/staff$/,
    who: 'Maureen',
    lands: async (page) => {
      await expect(banner(page)).toContainText('Maureen');
    },
    act: async (page) => {
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
    },
  },
  {
    n: 5,
    title: 'evidence to check as Priya',
    hash: /#\/client\/evidence$/,
    who: 'Priya',
    lands: async (page) => {
      await expect(h1(page, 'Evidence to check')).toBeVisible();
      await expect(banner(page)).toContainText('Priya');
    },
  },
  {
    n: 6,
    title: 'module builder: paste text and turn it into lessons',
    hash: /#\/client\/modules\/new$/,
    who: 'Priya',
    lands: async (page) => {
      await expect(h1(page, 'Module builder')).toBeVisible();
    },
    act: async (page) => {
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Tour fire drill');
      await page
        .getByRole('textbox', { name: 'Paste your lessons' })
        .fill('# Raise the alarm\nShout fire.\n\n# Leave the building\nGo to the assembly point.');
      await page.getByRole('button', { name: 'Turn into lessons' }).click();
      await expect(page.getByTestId('builder-lesson')).toHaveCount(2);
    },
  },
  {
    n: 7,
    title: 'competitions: the New competition form opens',
    hash: /#\/client\/competitions$/,
    who: 'Priya',
    lands: async (page) => {
      await expect(h1(page, /Competitions/)).toBeVisible();
    },
    act: async (page) => {
      await page.getByRole('link', { name: 'New competition' }).click();
      await page.getByRole('radio', { name: 'Mastery Month' }).check();
      await page.getByRole('button', { name: 'Suggest a prize' }).click();
      await expect(page.getByRole('textbox', { name: 'Prize' })).not.toHaveValue('');
    },
  },
  {
    n: 8,
    title: 'multi-site as Fiona: people grouped by site',
    hash: /#\/client\/people$/,
    who: 'Fiona',
    lands: async (page) => {
      await expect(h1(page, 'People')).toBeVisible();
      await expect(banner(page)).toContainText('Fiona');
    },
    act: async (page) => {
      await expect(page.getByTestId('site-group')).toHaveCount(3);
    },
  },
  {
    n: 9,
    title: 'Demo AI as Daniel: the locked assistant on a lesson preview',
    hash: /#\/client\/modules\/01M0C0N7000000000000000201\/preview\/lesson-1$/,
    who: 'Daniel',
    lands: async (page) => {
      await expect(banner(page)).toContainText('Daniel');
    },
    act: async (page) => {
      await expect(page.getByTestId('explain-locked')).toContainText(/ask someone with billing access/i);
    },
  },
];

test.describe('Track A tour', () => {
  for (const s of steps) {
    test(`step ${s.n}: Show me opens the ${s.title}`, async ({ page }) => {
      test.setTimeout(120_000);
      await startTour(page, 'Client tour', M);
      await advanceTo(page, s.n, M);
      const box = overlay(page, s.n, M);
      await expect(box.getByText(`Step ${s.n} of ${M}`, { exact: true })).toBeVisible();
      await expectOverlayUsable(page, s.n, M);
      await showMe(page, s.n, M);
      await expect(page).toHaveURL(s.hash);
      // Show me only moves the app; the tour has not advanced.
      await expect(overlay(page, s.n, M)).toBeVisible();
      await s.lands(page);
      await expect(overlay(page, s.n, M)).toBeVisible();
      if (s.act) await s.act(page);
    });
  }

  test('walking every step with Show me and Next ends on the Try this next list', async ({ page }) => {
    test.setTimeout(240_000);
    await startTour(page, 'Client tour', M);
    for (const s of steps) {
      await expect(overlay(page, s.n, M).getByText(`Step ${s.n} of ${M}`, { exact: true })).toBeVisible();
      await showMe(page, s.n, M);
      await expect(page).toHaveURL(s.hash);
      await s.lands(page);
      await overlay(page, s.n, M)
        .getByRole('button', { name: s.n === M ? 'Finish' : 'Next', exact: true })
        .click();
    }
    const done = page.getByRole('complementary', { name: 'Tour, finished' });
    await expect(done).toBeVisible();
    await expect(done.getByRole('heading', { name: 'That is the tour' })).toBeVisible();
    await expect(done.getByRole('list', { name: 'Try this next' }).getByRole('listitem')).toHaveCount(4);
    await expect(done.getByRole('button', { name: 'Show me' })).toHaveCount(0);
    await done.getByRole('button', { name: 'Close tour' }).click();
    await expect(anyOverlay(page)).toHaveCount(0);
  });

  test('Back returns to the previous step and is disabled on step 1', async ({ page }) => {
    await startTour(page, 'Client tour', M);
    await expect(overlay(page, 1, M).getByRole('button', { name: 'Back' })).toBeDisabled();
    await advanceTo(page, 3, M);
    await overlay(page, 3, M).getByRole('button', { name: 'Back' }).click();
    await expect(overlay(page, 2, M)).toBeVisible();
  });

  test('Cancel on the reset confirm starts nothing', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Client tour' }).click();
    await page
      .getByRole('dialog', { name: 'Start the tour from the beginning?' })
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(page).not.toHaveURL(/#\/client/);
    await page.goto('./#/client');
    await expect(anyOverlay(page)).toHaveCount(0);
  });

  test('Skip tour leaves the app where it is, and Resume tour in the Demo menu continues at the stored step', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await startTour(page, 'Client tour', M);
    await advanceTo(page, 3, M);
    await showMe(page, 3, M);
    await expect(page).toHaveURL(/#\/staff$/);
    await expect(banner(page)).toContainText('Jade');
    await overlay(page, 3, M).getByRole('button', { name: 'Skip tour' }).click();
    await expect(anyOverlay(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/staff$/);
    await expect(banner(page)).toContainText('Jade');

    // Still skipped after a reload.
    await page.reload();
    await expect(banner(page)).toContainText('Jade');
    await expect(anyOverlay(page)).toHaveCount(0);

    await openDemoMenu(page);
    await expect(demoMenu(page).getByRole('button', { name: 'Restart tour' })).toBeVisible();
    await demoMenu(page).getByRole('button', { name: 'Resume tour' }).click();
    await expect(overlay(page, 3, M)).toBeVisible();
    await expect(page).toHaveURL(/#\/staff$/);
  });

  test('progress is kept across a reload, and the box can be collapsed and opened again', async ({ page }) => {
    test.setTimeout(120_000);
    await startTour(page, 'Client tour', M);
    await advanceTo(page, 4, M);
    await page.reload();
    await expect(overlay(page, 4, M)).toBeVisible();
    await overlay(page, 4, M).getByRole('button', { name: 'Collapse tour' }).click();
    await expect(anyOverlay(page)).toHaveCount(0);
    const pill = page.getByRole('button', { name: 'Open tour, step 4 of 9' });
    await expect(pill).toBeVisible();
    const b = await pill.boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    await pill.click();
    await expect(overlay(page, 4, M)).toBeVisible();
  });

  test('Restart asks first, then resets the demo and goes back to step 1', async ({ page }) => {
    test.setTimeout(120_000);
    await startTour(page, 'Client tour', M);
    await advanceTo(page, 2, M);
    await showMe(page, 2, M);
    await overlay(page, 2, M).getByRole('button', { name: 'Restart' }).click();
    const dialog = page.getByRole('dialog', { name: 'Start the tour from the beginning?' });
    await expect(dialog).toContainText('This resets the demo');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(overlay(page, 1, M)).toBeVisible();
    await expect(page).toHaveURL(/#\/client$/);
  });
});
