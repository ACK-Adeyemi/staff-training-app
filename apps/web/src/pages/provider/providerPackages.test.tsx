// M4 chunk 11c (BP-6, U layer): P7 "Packages and entitlements" at /provider/packages. Written before the implementation.
//
// UI CONTRACT
//   Data access: the page reads and writes the demo-wide option through the demo handle (DemoApi), not the DataStore:
//     demo.getPackagingOption(): Promise<'A' | 'B'>   demo.setPackagingOption(option): Promise<void>
//   which delegate to DemoAdmin.getPackagingOption / setPackagingOption. The test harness (src/test/harness.tsx makeDemo)
//   must supply both, delegating to handle.admin, because these tests read the result back from handle.admin.
//   Reading needs billing.read and changing needs billing.write (checked with can()/holdsAnywhere, never role names).
//   Packages come from `packages` in @sta/content, filtered by package.option.
//   Proposed language keys (en-GB):
//     provider.packages.heading "Packages and entitlements"
//     provider.packages.optionRegion "Packaging option"            (region heading)
//     provider.packages.optionLegend "Packaging option"            (radiogroup legend)
//     provider.packages.optionA "Option A: three tiers"            provider.packages.optionB "Option B: one plan"
//     provider.packages.demoNote "This switch applies to the whole demo. Every client is evaluated on the chosen option."
//     provider.packages.limit "{label}: {value}"   provider.packages.unlimited "Unlimited"
//     provider.packages.yes "Yes"   provider.packages.no "No"
//     provider.packages.limitLabels.<entitlement key> e.g. admins "Admins", ownModules "Own modules",
//       savedThemes "Saved themes", closedBookCompetitions "Closed-book competitions", multiSite "Multi-site"
//     provider.packages.recordsKeeperHeading "Records Keeper"
//     provider.packages.recordsKeeperBody "Available under both options."
//     provider.packages.noPermission "You don't have permission to see packages."
//   P7 /provider/packages:
//     - h1 "Packages and entitlements".
//     - region "Packaging option" holding radiogroup "Packaging option" with radios "Option A: three tiers" and
//       "Option B: one plan"; A is checked by default. Choosing B calls setPackagingOption('B') and shows B checked.
//     - text matching /whole demo/i inside the region (the demo-wide note).
//     - data-testid="package-card" per package of the active option (A: Essentials, Standard, Group; B: Core),
//       data-package-id = package id, text containing the name, and every entitlement as "Label: value" text
//       ("Unlimited" for 'unlimited', "Yes"/"No" for flags).
//     - data-testid="records-keeper-card" with text "Records Keeper", shown under both options.
//   Client effect: entitlements read the active option, so a client on Essentials gets closed-book competitions under B.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { packageIds, packages } from '@sta/content';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
type OptionAdmin = {
  setPackagingOption(o: 'A' | 'B'): Promise<void>;
  getPackagingOption(): Promise<'A' | 'B'>;
};
const optionAdmin = (h: StoreHandle) => h.admin as unknown as OptionAdmin;
/** The option is stored in the demo state, which must exist first (the app sets it on start). */
const setOption = async (c: Ctx, option: 'A' | 'B') => {
  if ((await c.handle.admin.getDemoState()) === undefined)
    await c.handle.admin.setDemoState({
      clockOffsetMs: 0,
      industry: 'nursery',
      persona: { side: 'provider', userId: actorFor('provider', c.keys).userId },
    });
  await optionAdmin(c.handle).setPackagingOption(option);
};

const openP7 = async (startOption: 'A' | 'B' = 'A') => {
  let ctx!: Ctx;
  await renderRoute('/provider/packages', 'provider', {
    prepare: async (c) => {
      ctx = c;
      if (startOption === 'B') await setOption(c, 'B');
    },
  });
  await screen.findByRole('heading', { level: 1, name: 'Packages and entitlements' });
  return ctx;
};

const radioA = () => screen.findByRole<HTMLInputElement>('radio', { name: 'Option A: three tiers' });
const radioB = () => screen.findByRole<HTMLInputElement>('radio', { name: 'Option B: one plan' });

const byName = (name: string) => packages.find((p) => p.name === name)!;

describe('P7 Packages and entitlements', () => {
  it('has a Packaging option region with both radios, Option A checked by default, and the demo-wide note', async () => {
    await openP7();
    const region = await screen.findByRole('region', { name: 'Packaging option' });
    expect(within(region).getByRole('radiogroup', { name: 'Packaging option' })).toBeTruthy();
    expect((await radioA()).checked).toBe(true);
    expect((await radioB()).checked).toBe(false);
    expect(within(region).getByText(/whole demo/i)).toBeTruthy();
  });

  it('choosing Option B persists through setPackagingOption and is checked after a reload', async () => {
    const ctx = await openP7();
    await userEvent.click(await radioB());
    await waitFor(async () => {
      expect(await optionAdmin(ctx.handle).getPackagingOption()).toBe('B');
    });
    expect((await radioB()).checked).toBe(true);
    // Reload: a fresh render whose store already holds B.
    cleanup();
    await openP7('B');
    expect((await radioB()).checked).toBe(true);
    expect((await radioA()).checked).toBe(false);
  });

  it('lists the three Option A packages with every limit and flag as text', async () => {
    await openP7();
    const cards = await screen.findAllByTestId('package-card');
    expect(cards.map((c) => c.getAttribute('data-package-id'))).toEqual([
      packageIds.essentials,
      packageIds.standard,
      packageIds.group,
    ]);
    const essentials = cards[0]!;
    expect(essentials.textContent).toContain('Essentials');
    expect(essentials.textContent).toContain('Admins: 1');
    expect(essentials.textContent).toContain('Own modules: 3');
    expect(essentials.textContent).toContain('Closed-book competitions: No');
    expect(essentials.textContent).toContain('Multi-site: No');
    const standard = cards[1]!;
    expect(standard.textContent).toContain('Admins: 3');
    expect(standard.textContent).toContain('Own modules: Unlimited');
    expect(standard.textContent).toContain('Closed-book competitions: Yes');
    expect(cards[2]!.textContent).toContain('Admins: Unlimited');
    expect(cards[2]!.textContent).toContain('Multi-site: Yes');
    expect(byName('Standard').entitlements.admins).toBe(3);
  });

  it('shows only the Core package when Option B is active, with its limits', async () => {
    await openP7('B');
    await waitFor(async () => {
      expect((await radioB()).checked).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('package-card')).toHaveLength(1);
    });
    const [core] = screen.getAllByTestId('package-card');
    expect(core!.getAttribute('data-package-id')).toBe(packageIds.core);
    expect(core!.textContent).toContain('Core');
    expect(core!.textContent).toContain('Saved themes: 3');
    expect(core!.textContent).toContain('Own modules: Unlimited');
    expect(core!.textContent).toContain('Multi-site: No');
  });

  it('shows the Records Keeper card under both options', async () => {
    await openP7();
    const underA = await screen.findByTestId('records-keeper-card');
    expect(underA.textContent).toContain('Records Keeper');
    await userEvent.click(await radioB());
    await waitFor(() => {
      expect(screen.getAllByTestId('package-card')).toHaveLength(1);
    });
    expect(screen.getByTestId('records-keeper-card').textContent).toContain('Records Keeper');
  });

  it('does not let a read-only provider user change the option', async () => {
    await renderRoute('/provider/packages', 'provider', {
      actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Packages and entitlements' });
    await screen.findByText(/don't have permission|Packaging option/i);
    const radios = screen.queryAllByRole<HTMLInputElement>('radio', { name: /Option B/ });
    radios.forEach((r) => {
      expect(r.disabled).toBe(true);
    });
  });
});

describe('P7 switch changes a locked card in the client app (BP-6)', () => {
  // Little Acorns is moved to Essentials, which lacks closed-book competitions under Option A.
  const onEssentials = (option: 'A' | 'B') => async (c: Ctx) => {
    const d = (await c.handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
    const subs = d.subscriptions!.filter((s) => s['clientId'] === c.keys.clients.littleAcorns);
    await c.handle.admin.bulkPut(
      'subscriptions',
      subs.map((s) => ({ ...s, packageId: packageIds.essentials })),
    );
    if (option === 'B') await setOption(c, 'B');
  };
  const openBuilder = async (option: 'A' | 'B') => {
    await renderRoute('/client/competitions/new', 'client', { prepare: onEssentials(option) });
    await userEvent.click(await screen.findByRole('radio', { name: 'Closed-Book Challenge' }));
    return screen.getByRole<HTMLButtonElement>('switch', { name: 'Closed-book only' });
  };

  it('locks the Closed-book switch with an explanation under Option A', async () => {
    const sw = await openBuilder('A');
    await waitFor(() => {
      expect(sw.disabled).toBe(true);
    });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Closed-book competitions are not included in your package.')).toBeTruthy();
  });

  it('unlocks the same Closed-book switch under Option B, where an Essentials client is evaluated on Core', async () => {
    const sw = await openBuilder('B');
    await waitFor(() => {
      expect(screen.queryByText('Closed-book competitions are not included in your package.')).toBeNull();
    });
    // Closed-Book Challenge forces the switch on, but only when the package allows it.
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });
});
