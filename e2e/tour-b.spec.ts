// M5 chunk 12 (BP-1, F-3): the Track B provider tour (build pack 8.2 steps 1 to 7, 8.4) on the phone and desktop
// projects. Step 5 is shown without client scoping (known issue, plan assumption 9). Same shape as tour-a.spec.ts:
// each step is its own test, plus one walk to the Try this next list. Full actions are in track-b.spec.ts.
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

const M = 7;
const PINNED = new Date('2026-10-19T09:00:01.000Z');

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(PINNED);
});

const h1 = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });

type Step = {
  n: number;
  title: string;
  hash: RegExp;
  lands: (page: Page) => Promise<void>;
  act?: (page: Page) => Promise<void>;
};

const steps: Step[] = [
  {
    n: 1,
    title: 'overview with the overview highlighted',
    hash: /#\/provider$/,
    lands: async (page) => {
      await expect(h1(page, 'Overview')).toBeVisible();
      await expect(page.locator('[data-tour="provider-overview"][data-tour-active="true"]')).toBeVisible();
      await expect(page.getByTestId('tour-marker')).toBeVisible();
    },
    act: async (page) => {
      await expect(page.getByText('Simulated data', { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Clients by account state' })).toContainText('Payment overdue: 1');
    },
  },
  {
    n: 2,
    title: 'Little Acorns detail',
    // Any client id: the seed's ids change with the day it was built, so the heading check below is what proves
    // the step opens Little Acorns.
    hash: /#\/provider\/clients\/[0-9A-Z]+$/,
    lands: async (page) => {
      await expect(h1(page, /Little Acorns/)).toBeVisible();
    },
    act: async (page) => {
      await page.getByRole('tab', { name: 'Usage' }).click();
      await expect(page.getByRole('tabpanel')).toContainText(/\d+ uses, \d+ active people/);
      await page.getByRole('tab', { name: 'Audit' }).click();
      await expect(page.getByRole('tab', { name: 'Audit' })).toHaveAttribute('aria-selected', 'true');
    },
  },
  {
    n: 3,
    title: 'ticket inbox: reply to a Willow Lane ticket with a saved reply',
    hash: /#\/provider\/tickets$/,
    lands: async (page) => {
      await expect(h1(page, 'Ticket inbox')).toBeVisible();
    },
    act: async (page) => {
      await page.getByLabel('Client').selectOption({ label: 'Willow Lane Nursery' });
      await page
        .getByTestId('ticket-row')
        .filter({ hasText: 'Cannot download a training certificate' })
        .getByRole('link', { name: 'Cannot download a training certificate' })
        .click();
      const conversation = page.getByRole('region', { name: 'Conversation' });
      await expect(conversation.getByTestId('ticket-message')).toHaveCount(1);
      await page.getByLabel('Insert saved reply').selectOption({ label: 'Thanks, we are looking' });
      await page.getByRole('button', { name: 'Send reply' }).click();
      await expect(conversation.getByTestId('ticket-message')).toHaveCount(2);
    },
  },
  {
    n: 4,
    title: 'dunning: Willow Lane is Past due with an amount',
    hash: /#\/provider\/dunning$/,
    lands: async (page) => {
      await expect(h1(page, 'Dunning')).toBeVisible();
    },
    act: async (page) => {
      await expect(page.getByTestId('dunning-row').filter({ hasText: 'Willow Lane Nursery' })).toContainText(
        /Outstanding: £\d/,
      );
    },
  },
  {
    n: 5,
    title: 'team and roles, with the Account manager role',
    hash: /#\/provider\/team$/,
    lands: async (page) => {
      await expect(h1(page, 'Team and roles')).toBeVisible();
    },
    act: async (page) => {
      await expect(page.getByTestId('role-row').filter({ hasText: 'Account manager' })).toContainText('Custom role');
    },
  },
  {
    n: 6,
    title: 'price changes, with New change available',
    hash: /#\/provider\/pricing$/,
    lands: async (page) => {
      await expect(h1(page, 'Price changes')).toBeVisible();
    },
    act: async (page) => {
      await page.getByRole('button', { name: 'New change' }).click();
      await expect(page.getByRole('radio', { name: 'Several clients' })).toBeVisible();
    },
  },
  {
    n: 7,
    title: 'security and data commitments with the Demo only note',
    hash: /#\/provider\/security$/,
    lands: async (page) => {
      await expect(h1(page, 'Security')).toBeVisible();
    },
    act: async (page) => {
      await expect(page.getByText('Demo only')).toBeVisible();
      await expect(page.locator('main')).toContainText(/simulates/i);
    },
  },
];

test.describe('Track B tour', () => {
  for (const s of steps) {
    test(`step ${s.n}: Show me opens the ${s.title}`, async ({ page }) => {
      test.setTimeout(120_000);
      await startTour(page, 'Provider tour', M);
      await advanceTo(page, s.n, M);
      await expect(overlay(page, s.n, M).getByText(`Step ${s.n} of ${M}`, { exact: true })).toBeVisible();
      await expectOverlayUsable(page, s.n, M);
      await showMe(page, s.n, M);
      await expect(page).toHaveURL(s.hash);
      await expect(overlay(page, s.n, M)).toBeVisible();
      await s.lands(page);
      await expect(overlay(page, s.n, M)).toBeVisible();
      if (s.act) await s.act(page);
    });
  }

  test('walking every step with Show me and Next ends on the Try this next list', async ({ page }) => {
    test.setTimeout(240_000);
    await startTour(page, 'Provider tour', M);
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
    await expect(done.getByRole('list', { name: 'Try this next' }).getByRole('listitem')).toHaveCount(3);
    await done.getByRole('button', { name: 'Close tour' }).click();
    await expect(anyOverlay(page)).toHaveCount(0);
  });

  test('Skip tour leaves the app where it is, and Resume tour in the Demo menu continues at the stored step', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await startTour(page, 'Provider tour', M);
    await advanceTo(page, 4, M);
    await showMe(page, 4, M);
    await expect(page).toHaveURL(/#\/provider\/dunning$/);
    await overlay(page, 4, M).getByRole('button', { name: 'Skip tour' }).click();
    await expect(anyOverlay(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/provider\/dunning$/);
    await expect(h1(page, 'Dunning')).toBeVisible();

    await openDemoMenu(page);
    await demoMenu(page).getByRole('button', { name: 'Resume tour' }).click();
    await expect(overlay(page, 4, M)).toBeVisible();
    await expect(page).toHaveURL(/#\/provider\/dunning$/);
  });

  test('progress is kept across a reload and Restart goes back to step 1 after the confirm', async ({ page }) => {
    test.setTimeout(120_000);
    await startTour(page, 'Provider tour', M);
    await advanceTo(page, 3, M);
    await page.reload();
    await expect(overlay(page, 3, M)).toBeVisible();
    await overlay(page, 3, M).getByRole('button', { name: 'Restart' }).click();
    const dialog = page.getByRole('dialog', { name: 'Start the tour from the beginning?' });
    await expect(dialog).toContainText('This resets the demo');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(overlay(page, 1, M)).toBeVisible();
    await expect(page).toHaveURL(/#\/provider$/);
  });
});
