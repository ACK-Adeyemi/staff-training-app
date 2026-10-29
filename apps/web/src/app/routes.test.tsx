// Chunk 11 (BP-2, F-5): the router and the three shells. Plan: Screens table "Navigation targets".
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderRoute, t, type Side } from '../test/harness';

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

type Page = { path: string; label: string };

const staffTabs: Page[] = [
  { path: '/staff', label: t('nav.staff.home') },
  { path: '/staff/learn', label: t('nav.staff.learn') },
  { path: '/staff/progress', label: t('nav.staff.progress') },
  { path: '/staff/compete', label: t('nav.staff.compete') },
  { path: '/staff/me', label: t('nav.staff.me') },
];
const staffExtra: Page[] = [
  { path: '/staff/notifications', label: t('shell.notifications') },
  { path: '/staff/help', label: t('shell.help') },
];
const clientBar: Page[] = [
  { path: '/client', label: t('nav.client.dashboard') },
  { path: '/client/people', label: t('nav.client.people') },
  { path: '/client/modules', label: t('nav.client.training') },
  { path: '/client/competitions', label: t('nav.client.engage') },
];
const clientMore: Page[] = [
  { path: '/client/reports', label: t('nav.client.reports') },
  { path: '/client/settings', label: t('nav.client.settings') },
  { path: '/client/help', label: t('nav.client.help') },
];
const providerBar: Page[] = [
  { path: '/provider', label: t('nav.provider.overview') },
  { path: '/provider/clients', label: t('nav.provider.clients') },
  { path: '/provider/content', label: t('nav.provider.content') },
  { path: '/provider/packages', label: t('nav.provider.commercial') },
];
const providerMore: Page[] = [
  { path: '/provider/tickets', label: t('nav.provider.support') },
  { path: '/provider/comms', label: t('nav.provider.comms') },
  { path: '/provider/team', label: t('nav.provider.teamSecurity') },
  { path: '/provider/security', label: t('nav.provider.security') },
  { path: '/provider/audit', label: t('nav.provider.audit') },
  { path: '/provider/global', label: t('nav.provider.global') },
  { path: '/provider/ai', label: t('nav.provider.ai') },
];

describe('every shell route renders its title as the page heading', () => {
  const all: [Side, Page][] = [
    ...[...staffTabs, ...staffExtra].map((p): [Side, Page] => ['staff', p]),
    ...[...clientBar, ...clientMore].map((p): [Side, Page] => ['client', p]),
    ...[...providerBar, ...providerMore].map((p): [Side, Page] => [
      'provider',
      // P7, P11, P14, P18, P19 and P20 have their own screen titles; the nav items are the section names.
      p.path === '/provider/packages'
        ? { ...p, label: t('provider.packages.heading') }
        : p.path === '/provider/tickets'
          ? { ...p, label: t('provider.tickets.heading') }
          : p.path === '/provider/comms'
            ? { ...p, label: t('provider.comms.heading') }
            : p.path === '/provider/team'
              ? { ...p, label: t('provider.team.heading') }
              : p.path === '/provider/security'
                ? { ...p, label: t('provider.security.heading') }
                : p.path === '/provider/audit'
                  ? { ...p, label: t('provider.audit.heading') }
                  : p.path === '/provider/ai'
                    ? { ...p, label: t('provider.ai.heading') }
                    : p,
    ]),
  ];
  it.each(all)('%s %j', async (side, page) => {
    await renderRoute(page.path, side);
    expect(await screen.findByRole('heading', { level: 1, name: page.label })).toBeTruthy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});

describe('shell header', () => {
  it.each([
    ['staff', '/staff', 'Jade Mills'],
    ['client', '/client', 'Priya Shah'],
    ['provider', '/provider', 'Owner'],
  ] as const)('%s shell shows the persona name loaded through the data layer', async (side, path, name) => {
    await renderRoute(path, side);
    const banner = await screen.findByRole('banner');
    expect(await within(banner).findByText(name)).toBeTruthy();
  });

  it('shows the Demo badge as a button on every shell', async () => {
    for (const [side, path] of [
      ['staff', '/staff'],
      ['client', '/client'],
      ['provider', '/provider'],
    ] as const) {
      const { unmount } = await renderRoute(path, side);
      expect(await screen.findByRole('button', { name: new RegExp(t('demo.badge')) })).toBeTruthy();
      unmount();
    }
  });

  it('shows the Simulated data badge for the provider only', async () => {
    const provider = await renderRoute('/provider', 'provider');
    expect(await screen.findByText(t('demo.simulatedData'))).toBeTruthy();
    provider.unmount();
    await renderRoute('/client', 'client');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(t('demo.simulatedData'))).toBeNull();
  });
});

describe('staff shell navigation', () => {
  it('has the five tabs, and the active one has aria-current=page', async () => {
    await renderRoute('/staff/learn', 'staff');
    const nav = await screen.findByRole('navigation', { name: t('shell.mainNavigation') });
    for (const tab of staffTabs) {
      const link = within(nav).getByRole('link', { name: tab.label });
      expect(link.getAttribute('href')).toBe(`#${tab.path}`);
      expect(link.getAttribute('aria-current')).toBe(tab.path === '/staff/learn' ? 'page' : null);
    }
  });

  it('has no More button', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: t('shell.more') })).toBeNull();
  });

  it('has header links to notifications and help', async () => {
    await renderRoute('/staff', 'staff');
    const banner = await screen.findByRole('banner');
    expect(
      within(banner)
        .getByRole('link', { name: t('shell.notifications') })
        .getAttribute('href'),
    ).toBe('#/staff/notifications');
    expect(
      within(banner)
        .getByRole('link', { name: t('shell.help') })
        .getAttribute('href'),
    ).toBe('#/staff/help');
  });

  it('clicking a tab navigates', async () => {
    const { router } = await renderRoute('/staff', 'staff');
    const nav = await screen.findByRole('navigation', { name: t('shell.mainNavigation') });
    await userEvent.click(within(nav).getByRole('link', { name: t('nav.staff.progress') }));
    expect(await screen.findByRole('heading', { level: 1, name: t('nav.staff.progress') })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/staff/progress');
  });
});

describe.each([
  ['client', '/client', clientBar, clientMore, t('nav.client.dashboard')],
  ['provider', '/provider', providerBar, providerMore, t('nav.provider.overview')],
] as const)('%s shell navigation', (side, start, bar, more, startLabel) => {
  it('links to every item with the right route and marks the current one', async () => {
    await renderRoute(start, side);
    await screen.findByRole('heading', { level: 1, name: startLabel });
    for (const item of [...bar, ...more]) {
      const links = screen.getAllByRole('link', { name: item.label });
      expect(links.some((l) => l.getAttribute('href') === `#${item.path}`)).toBe(true);
    }
    const current = screen
      .getAllByRole('link', { name: startLabel })
      .filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.length).toBeGreaterThan(0);
  });

  it('More opens a sheet holding the remaining items, and one reaches its route', async () => {
    const { router } = await renderRoute(start, side);
    await screen.findByRole('heading', { level: 1, name: startLabel });
    await userEvent.click(screen.getByRole('button', { name: t('shell.more') }));
    const sheet = await screen.findByRole('dialog', { name: t('shell.more') });
    for (const item of more) expect(within(sheet).getByRole('link', { name: item.label })).toBeTruthy();
    const target = more[0] ?? { path: '', label: '' };
    await userEvent.click(within(sheet).getByRole('link', { name: target.label }));
    // P11 has its own screen title; the nav item is the section name "Support".
    const heading = target.path === '/provider/tickets' ? t('provider.tickets.heading') : target.label;
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
    expect(router.state.location.pathname).toBe(target.path);
  });
});

describe('Not found', () => {
  it.each(['/nonsense', '/staff/does-not-exist', '/client/x/y'])(
    '%s shows the message and a link to the start',
    async (path) => {
      await renderRoute(path, 'staff');
      expect(await screen.findByRole('heading', { level: 1, name: t('shell.notFoundTitle') })).toBeTruthy();
      expect(screen.getByText(t('shell.notFoundBody'))).toBeTruthy();
      const back = screen
        .getAllByRole('link')
        .find((l) => l.getAttribute('href') === '#/' || l.getAttribute('href') === '/');
      expect(back).toBeTruthy();
    },
  );
});
