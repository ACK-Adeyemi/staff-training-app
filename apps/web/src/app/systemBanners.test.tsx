// M4 chunk 14d (BP-12, brief 26.2 and 26.5): maintenance, incident and announcement banners in the three shells.
// Written before the implementation.
//
// UI CONTRACT (every shell: staff, client, provider)
//   data-testid="system-status"       the status indicator in the shell header. Text includes the level word
//                                     "Normal" | "Degraded" | "Maintenance" | "Incident" (from store.incidents.current),
//                                     plus the incident title when one is open.
//   data-testid="system-banner"       one per active system notice (maintenance flag for this app, or an open
//                                     incident). role="status". Text includes the word "Maintenance" for the flag.
//                                     Not dismissible forever and never replaces page content: <main> is still rendered.
//   data-testid="announcement-banner" one per live banner announcement (store.providerComms.banners). Shows the title.
//                                     Has a button named "Dismiss" (class min-h-11 or min-h-[44px]) that hides it until
//                                     the page is reloaded; learning pages are unaffected.
//   Banners are in client and staff shells only for announcements; the provider shell shows system-status and
//   system-banner only. Staff banners never use billing or payment wording.
// Seed: live banner = "New module: Fire evacuation template" (audience staff + client). The other has expired.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../test/harness';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const LIVE = 'New module: Fire evacuation template';
const providerCtx = (keys: SeedKeys) => actorFor('provider', keys);
const setMaintenance = (app: 'staff' | 'client' | 'provider') => async (c: Ctx) => {
  await c.handle.store.maintenance.set(providerCtx(c.keys), { app, on: true });
};
const postIncident = async (c: Ctx) => {
  await c.handle.store.incidents.post(providerCtx(c.keys), {
    level: 'incident',
    title: 'Sign-in is failing for some people',
    message: 'We are looking into it.',
  });
};
const SHELLS = [
  ['staff', '/staff'],
  ['client', '/client'],
  ['provider', '/provider'],
] as const;

describe('announcement banners', () => {
  it('shows the live banner announcement to a client admin', async () => {
    await renderRoute('/client', 'client');
    const banner = await screen.findByTestId('announcement-banner');
    expect(banner.textContent).toContain(LIVE);
  });

  it('shows the live banner announcement to a learner because its audience includes staff', async () => {
    await renderRoute('/staff', 'staff');
    const banner = await screen.findByTestId('announcement-banner');
    expect(banner.textContent).toContain(LIVE);
  });

  it('does not show the expired announcement', async () => {
    await renderRoute('/client', 'client');
    await screen.findByTestId('announcement-banner');
    expect(screen.queryByText(/Planned maintenance on Sunday morning/)).toBeNull();
  });

  it('has a Dismiss button with a 44px touch target that hides the banner without hiding the page', async () => {
    await renderRoute('/staff', 'staff');
    const banner = await screen.findByTestId('announcement-banner');
    const dismiss = within(banner).getByRole('button', { name: /dismiss/i });
    expect(dismiss.className).toMatch(/min-h-11|min-h-\[44px\]/);
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByTestId('announcement-banner')).toBeNull());
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('main').textContent?.length).toBeGreaterThan(0);
  });

  it('keeps the banner dismissed when the learner moves to the Learn page', async () => {
    const { router } = await renderRoute('/staff', 'staff');
    const banner = await screen.findByTestId('announcement-banner');
    fireEvent.click(within(banner).getByRole('button', { name: /dismiss/i }));
    await router.navigate('/staff/learn');
    await waitFor(() => expect(router.state.location.pathname).toBe('/staff/learn'));
    expect(await screen.findByRole('main')).toBeTruthy();
    expect(screen.queryByTestId('announcement-banner')).toBeNull();
  });

  it('never shows an announcement in the staff shell when its audience excludes staff', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async (c) => {
        await c.handle.store.providerComms.createAnnouncement(providerCtx(c.keys), {
          title: 'Client admins only notice',
          body: 'Only for admins.',
          audience: { sides: ['client'] },
          channels: ['banner'],
          publishAt: TODAY,
        });
      },
    });
    await screen.findByTestId('announcement-banner');
    expect(screen.queryByText(/Client admins only notice/)).toBeNull();
  });

  it('shows a client-only announcement in the client shell', async () => {
    await renderRoute('/client', 'client', {
      prepare: async (c) => {
        await c.handle.store.providerComms.createAnnouncement(providerCtx(c.keys), {
          title: 'Client admins only notice',
          body: 'Only for admins.',
          audience: { sides: ['client'] },
          channels: ['banner'],
          publishAt: TODAY,
        });
      },
    });
    expect(await screen.findByText(/Client admins only notice/)).toBeTruthy();
  });

  it('never uses billing or payment wording in a learner banner area, even when the account is past due', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async (c) => {
        await c.handle.admin.simulateFailedPayment(c.keys.clients['littleAcorns'] as string, TODAY);
        await setMaintenance('staff')(c);
      },
    });
    await screen.findByTestId('announcement-banner');
    const areas = [...screen.queryAllByTestId('announcement-banner'), ...screen.queryAllByTestId('system-banner')];
    expect(areas.length).toBeGreaterThan(1);
    for (const a of areas) expect(a.textContent).not.toMatch(/billing|payment|invoice|subscription|pay\b|card/i);
  });
});

describe('maintenance banners', () => {
  it.each(SHELLS)('shows a Maintenance status banner in the %s shell only when its flag is on', async (app, path) => {
    await renderRoute(path, app, { prepare: setMaintenance(app) });
    const banner = await screen.findByTestId('system-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Maintenance');
  });

  it.each(SHELLS)('does not show the %s maintenance banner when only another app is in maintenance', async (app, path) => {
    const other = app === 'staff' ? 'client' : 'staff';
    await renderRoute(path, app, { prepare: setMaintenance(other) });
    await screen.findByTestId('system-status');
    expect(screen.queryByTestId('system-banner')).toBeNull();
  });

  it.each(SHELLS)('keeps the %s page content visible and has no way to dismiss it forever', async (app, path) => {
    await renderRoute(path, app, { prepare: setMaintenance(app) });
    const banner = await screen.findByTestId('system-banner');
    expect(screen.getByRole('main').textContent?.length).toBeGreaterThan(0);
    expect(within(banner).queryByRole('button', { name: /dismiss|hide|close/i })).toBeNull();
    expect(banner.closest('main')).toBeNull();
  });
});

describe('status indicator', () => {
  it.each(SHELLS)('says Normal in the %s shell when nothing is open', async (app, path) => {
    await renderRoute(path, app);
    const status = await screen.findByTestId('system-status');
    expect(status.textContent).toContain('Normal');
  });

  it.each(SHELLS)('shows the open incident title and level in the %s shell', async (app, path) => {
    await renderRoute(path, app, { prepare: postIncident });
    const status = await screen.findByTestId('system-status');
    await waitFor(() => expect(status.textContent).toContain('Incident'));
    expect(status.textContent).toContain('Sign-in is failing for some people');
    expect(status.textContent).not.toContain('Normal');
  });

  it.each(SHELLS)('keeps the %s page content visible during an incident', async (app, path) => {
    await renderRoute(path, app, { prepare: postIncident });
    await screen.findByTestId('system-status');
    expect(screen.getByRole('main').textContent?.length).toBeGreaterThan(0);
  });
});
