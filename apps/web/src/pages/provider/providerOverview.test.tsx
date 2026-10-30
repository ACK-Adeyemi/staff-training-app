// M4 chunk 9 (BP-1, U layer): provider shell header, P1 Overview, P2 Clients, P3 Client detail with This device tab.
// Written before the implementation.
//
// UI CONTRACT (data: store.providerOverview.overview/clients, store.telemetry.listLocal; gate clients.read via can()):
//   Proposed language keys (en-GB):
//     provider.overview.title "Overview"  provider.overview.clientsTotal "Clients"  provider.overview.attention "Needs attention"
//     provider.clients.title "Clients"  provider.clients.stateFilter "Account state"  provider.clients.allStates "All states"
//     provider.client.tabs.* "Overview", "Errors and logs", "This device", ...  provider.thisDevice.empty
//     provider.shell.status "System status"  provider.shell.notifications "Notifications"
//   P1 /provider: h1 "Overview". data-testid="overview-total-clients" reads the client count; "overview-total-sites"
//     and "overview-total-people" read the site and people totals; region "Needs attention" has one
//     data-testid="attention-item" (data-client-id) per overview.attention entry. "Simulated data" badge shown.
//   P2 /provider/clients: h1 "Clients"; one data-testid="client-row" (data-client-id) per client; select "Account state"
//     (first option "All states") filters by account state value.
//   P3 /provider/clients/:id: h1 is the client display name; role=tablist with tabs Overview, Sites, Staff, Usage, API,
//     Errors and logs, Support tickets, Billing, Modules, Competitions, Audit and "This device". The This device tab
//     lists data-testid="local-telemetry-entry" per store.telemetry.listLocal entry showing name and message.
//   Shell header (banner): a status indicator (role=status, name "System status") and a notifications link/button.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, seededStore } from '../../test/harness';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const provider = (keys: SeedKeys): ActorContext => actorFor('provider', keys);

describe('provider shell header', () => {
  it('shows a status indicator, a notifications control and the Simulated data badge', async () => {
    await renderRoute('/provider', 'provider');
    const banner = await screen.findByRole('banner');
    expect(await within(banner).findByRole('status', { name: 'System status' })).toBeTruthy();
    expect(within(banner).getByRole('link', { name: /Notifications/ })).toBeTruthy();
    expect(within(banner).getByText('Simulated data')).toBeTruthy();
  });
});

describe('P1 Overview', () => {
  it('shows totals matching the seed and the attention list', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    const o = await ctx.handle.store.providerOverview.overview(provider(ctx.keys));
    expect(o.clientCount).toBe(13);
    await waitFor(() => {
      expect(screen.getByTestId('overview-total-clients').textContent).toContain('13');
    });
    expect(screen.getByTestId('overview-total-sites').textContent).toContain(String(o.siteCount));
    expect(screen.getByTestId('overview-total-people').textContent).toContain(String(o.peopleCount));
    expect(o.attention.length).toBeGreaterThan(0);
    const region = screen.getByRole('region', { name: 'Needs attention' });
    const items = within(region).getAllByTestId('attention-item');
    expect(items.map((i) => i.getAttribute('data-client-id'))).toEqual(o.attention.map((a) => a.clientId));
    expect(screen.getByText('Simulated data')).toBeTruthy();
  });
});

describe('P2 Clients', () => {
  it('lists all 13 clients', async () => {
    await renderRoute('/provider/clients', 'provider');
    expect(await screen.findByRole('heading', { level: 1, name: 'Clients' })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByTestId('client-row')).toHaveLength(13);
    });
  });

  it('filters by account state', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider/clients', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('client-row')).toHaveLength(13);
    });
    const all = await ctx.handle.store.providerOverview.clients(provider(ctx.keys));
    const state = all[0]?.accountState;
    if (!state) throw new Error('no clients');
    const expected = all.filter((r) => r.accountState === state);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Account state' }), state);
    await waitFor(() => {
      expect(screen.getAllByTestId('client-row')).toHaveLength(expected.length);
    });
    expect(
      screen
        .getAllByTestId('client-row')
        .map((r) => r.getAttribute('data-client-id'))
        .sort(),
    ).toEqual(expected.map((r) => r.clientId).sort());
  });
});

describe('P3 Client detail', () => {
  // The seed is deterministic, so ids from one seeded store are valid in the store renderRoute builds.
  const littleAcornsId = async (): Promise<string> => (await seededStore()).keys.clients['littleAcorns'];

  it('has the tabs including This device', async () => {
    await renderRoute(`/provider/clients/${await littleAcornsId()}`, 'provider');
    const tablist = await screen.findByRole('tablist');
    for (const name of [
      'Overview',
      'Sites',
      'Staff',
      'Usage',
      'API',
      'Errors and logs',
      'Support tickets',
      'Billing',
      'Modules',
      'Competitions',
      'Audit',
      'This device',
    ]) {
      expect(within(tablist).getByRole('tab', { name })).toBeTruthy();
    }
  });

  it('lists a locally recorded error on the This device tab', async () => {
    await renderRoute(`/provider/clients/${await littleAcornsId()}`, 'provider', {
      prepare: async ({ handle }) => {
        await handle.store.telemetry.recordLocalError({ name: 'RenderCrash', message: 'Chart failed to draw' });
      },
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'This device' }));
    const entry = await screen.findByTestId('local-telemetry-entry');
    expect(entry.textContent).toContain('RenderCrash');
    expect(entry.textContent).toContain('Chart failed to draw');
  });
});
