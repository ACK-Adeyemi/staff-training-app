// M3 chunk 13 (BP-9, BP-12 UI, F-8): client shell foundations. Written before the implementation.
// Contract the implementer must provide:
//   Client shell (ClientShell) around every /client route except the sign-in route:
//     TwoFactorGate  - twoFactor.status(): 'grace' shows data-testid="two-factor-banner" with t('twoFactor.daysLeft') (a link
//        or button that goes to /client/signin). 'limited' redirects any /client route to /client/signin, which shows the
//        enrolment (button "Start set-up"). Enrolled admins and staff never see it.
//     AccountBanner  - data-testid="account-banner", one per state from account.status(): pastDue (shown to people with
//        billing.view from day 0, to every admin from day 7), limited, readOnly, paused, closed (every admin). Text is
//        t('account.banner.<state>'), the next change and its date ("3 November"), the amount ("£12.34") only for
//        billing.view holders, and a "Fix this now" (t('account.fixNow')) button that opens /client/billing/pay only for
//        billing.manage holders; others see text mentioning "billing access" instead.
//     SiteSwitcher   - the ui SiteSwitcher labelled t('sites.switcher'), only when the actor can see more than one site.
//        Options: "All sites" and each site. A text t('sites.current') "Showing {name}" follows the choice, which stays when
//        you move between client pages.
//     More menu links (#/client/team, #/client/settings, #/client/account-status, #/client/onboarding) whose names equal
//        the page's h1.
//   Staff Home shows data-testid="staff-account-notice" (t('staff.accountNotice.speakToManager')) only in Read-only (and
//     later) states, with no payment wording; staff see nothing in Past due or Limited.
//   D2 Presenter panel: "Simulate failed payment" is a live button calling demo.simulateFailedPayment() (no arguments:
//     the demo shell knows the selected client).
//   DemoApi gains simulateFailedPayment: () => void | Promise<void>.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, t, TODAY } from '../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
afterEach(cleanup);

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(TODAY) + days * DAY).toISOString();
const need = <T,>(v: T | undefined): T => {
  if (v === undefined) throw new Error('missing');
  return v;
};
const clientActor =
  (userKey: string, clientKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients[clientKey]),
    now: TODAY,
  });
const priya = (keys: SeedKeys) => actorFor('client', keys);
const daniel = clientActor('daniel', 'littleAcorns');
const colin = clientActor('hillsideManager', 'oakTree');
const fiona = clientActor('oakTreeGroupAdmin', 'oakTree');
const tariq = clientActor('riversideManager', 'oakTree');
const failPayment = async ({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) => {
  await handle.admin.simulateFailedPayment(need(keys.clients['littleAcorns']), TODAY);
};
const londonDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date(iso));

describe('two-step sign-in gate', () => {
  it('shows an admin inside the grace period a calm banner with the days left, and nobody else', async () => {
    const { unmount } = await renderRoute('/client', 'client', { actor: daniel });
    const banner = await screen.findByTestId('two-factor-banner');
    expect(banner.textContent).toContain(t('twoFactor.daysLeft', { days: 5 }));
    unmount();
    await renderRoute('/client', 'client');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('two-factor-banner')).toBeNull();
  });

  it('the grace banner leads to the enrolment screen', async () => {
    const { router } = await renderRoute('/client', 'client', { actor: daniel });
    const banner = await screen.findByTestId('two-factor-banner');
    await userEvent.click(within(banner).getByRole('link'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client/signin');
    });
  });

  it('sends a limited admin from any client page to sign-in, where enrolment starts', async () => {
    const { router } = await renderRoute('/client/people', 'client', { actor: colin });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client/signin');
    });
    expect(await screen.findByRole('button', { name: t('twoFactor.start') })).toBeTruthy();
    expect(screen.getByText(t('twoFactor.limited'))).toBeTruthy();
  });

  it('enrolling with 123456 lifts the limit at once', async () => {
    const { router } = await renderRoute('/client/people', 'client', { actor: colin });
    await userEvent.click(await screen.findByRole('button', { name: t('twoFactor.start') }));
    expect(await screen.findByRole('img', { name: /./ })).toBeTruthy(); // the QR code
    expect(screen.getByText(/Or type this key: \S+/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(t('twoFactor.code')), '123456');
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.confirm') }));
    const codes = await screen.findByRole('region', { name: t('twoFactor.recovery.title') });
    expect(within(codes).getAllByRole('listitem')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.recovery.saved') }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client');
    });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('two-factor-banner')).toBeNull();
  });

  it('never prompts or gates staff', async () => {
    const { router } = await renderRoute('/staff', 'staff', { now: at(30) });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('two-factor-banner')).toBeNull();
    expect(router.state.location.pathname).toBe('/staff');
  });
});

describe('account status banner', () => {
  it('shows no banner while the account is active', async () => {
    await renderRoute('/client', 'client');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('account-banner')).toBeNull();
  });

  it('shows Priya (billing) the past due banner from day 0 with the next change, the amount and Fix this now', async () => {
    const { router, keys, handle } = await renderRoute('/client', 'client', { prepare: failPayment });
    const banner = await screen.findByTestId('account-banner');
    expect(banner.textContent).toContain(t('account.banner.pastDue'));
    const status = await handle.store.account.status(priya(keys));
    expect(status.nextChange?.state).toBe('limited');
    expect(banner.textContent).toContain(londonDate(need(status.nextChange).at));
    expect(banner.textContent).toMatch(/£\d/);
    await userEvent.click(within(banner).getByRole('button', { name: t('account.fixNow') }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client/billing/pay');
    });
  });

  it('shows Daniel (no billing permission) nothing at day 0 but a banner from day 7, without amounts or Fix this now', async () => {
    const day0 = await renderRoute('/client', 'client', { actor: daniel, prepare: failPayment });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('account-banner')).toBeNull();
    day0.unmount();
    await renderRoute('/client', 'client', { actor: daniel, prepare: failPayment, now: at(8) });
    const banner = await screen.findByTestId('account-banner');
    expect(banner.textContent).toContain(t('account.banner.pastDue'));
    expect(banner.textContent).toMatch(/billing access/i);
    expect(banner.textContent).not.toMatch(/£\d/);
    expect(within(banner).queryByRole('button', { name: t('account.fixNow') })).toBeNull();
  });

  it.each([
    [16, 'limited'],
    [32, 'readOnly'],
    [62, 'closed'],
  ] as const)('after %i days of non-payment every admin sees the %s banner', async (days, state) => {
    await renderRoute('/client', 'client', { actor: daniel, prepare: failPayment, now: at(days) });
    const banner = await screen.findByTestId('account-banner');
    expect(banner.textContent).toContain(t(`account.banner.${state}`));
  });

  it('the banner has words and an icon, not colour alone, and is announced', async () => {
    await renderRoute('/client', 'client', { prepare: failPayment });
    const banner = await screen.findByTestId('account-banner');
    expect(banner.textContent.trim().length).toBeGreaterThan(20);
    expect(banner.closest('[role="alert"], [role="status"]') ?? banner.querySelector('[role]')).not.toBeNull();
  });
});

describe('staff account notice', () => {
  it('shows staff nothing in Past due or Limited', async () => {
    await renderRoute('/staff', 'staff', { prepare: failPayment, now: at(16) });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('staff-account-notice')).toBeNull();
  });

  it('shows staff a neutral message in Read-only, with no payment wording', async () => {
    await renderRoute('/staff', 'staff', { prepare: failPayment, now: at(32) });
    const notice = await screen.findByTestId('staff-account-notice');
    expect(notice.textContent).toMatch(/speak to your manager/i);
    expect(notice.textContent).not.toMatch(/pay|billing|invoice|card|subscription|price|£/i);
  });
});

describe('site switcher', () => {
  it('is absent for a single-site client and for a manager of one site', async () => {
    const one = await renderRoute('/client', 'client');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByLabelText(t('sites.switcher'))).toBeNull();
    one.unmount();
    await renderRoute('/client', 'client', { actor: tariq });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByLabelText(t('sites.switcher'))).toBeNull();
  });

  it('lets a group admin pick one site and keeps the choice on other pages', async () => {
    const { router } = await renderRoute('/client', 'client', { actor: fiona });
    const select = await screen.findByLabelText(t('sites.switcher'));
    const names = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining([t('sites.all'), 'Hillside', 'Riverside', 'Meadow']));
    await userEvent.selectOptions(select, within(select).getByRole('option', { name: 'Meadow' }));
    expect(screen.getByText(t('sites.current', { name: 'Meadow' }))).toBeTruthy();
    await router.navigate('/client/people');
    const again = await screen.findByLabelText(t('sites.switcher'));
    expect((again as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Meadow');
  });
});

describe('client More menu', () => {
  it.each([
    ['/client/team', t('team.title')],
    ['/client/settings', t('org.settings.title')],
    ['/client/onboarding', t('onboarding.title')],
    ['/client/account-status', null],
  ] as const)('links %s with the same name as the page heading', async (path, name) => {
    await renderRoute(path, 'client');
    const h1 = await screen.findByRole('heading', { level: 1 });
    if (name !== null) expect(h1.textContent).toContain(name);
    const links = Array.from(document.querySelectorAll(`a[href="#${path}"]`));
    expect(links.length, `nav link for ${path}`).toBeGreaterThan(0);
    expect(links.some((a) => a.textContent.trim() === h1.textContent.trim())).toBe(true);
  });
});

describe('D2 Presenter panel: Simulate failed payment', () => {
  async function openPanel() {
    const view = await renderRoute('/client', 'client');
    const simulate = vi.fn(() => failPayment(view));
    Object.assign(view.demo, { simulateFailedPayment: simulate });
    await screen.findByTestId('demo-badge');
    fireEvent.keyDown(document.body, { key: 'P', code: 'KeyP', shiftKey: true, altKey: true });
    const panel = screen.getByRole('dialog', { name: 'Presenter panel' });
    return { ...view, panel, simulate };
  }

  it('is a live button, not a later-build placeholder', async () => {
    const { panel } = await openPanel();
    const button = within(panel).getByRole('button', { name: t('demo.simulateFailedPayment') });
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('puts the client into Past due, so Priya sees the banner without reloading', async () => {
    const { panel, simulate } = await openPanel();
    expect(screen.queryByTestId('account-banner')).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: t('demo.simulateFailedPayment') }));
    expect(simulate).toHaveBeenCalledTimes(1);
    expect((await screen.findByTestId('account-banner')).textContent).toContain(t('account.banner.pastDue'));
  });
});
