// M4 chunk 4b contract tests: the Option A / Option B packaging switch (BP-6). Runs against every adapter.
// Written before the implementation; `DemoAdmin.setPackagingOption` and `getPackagingOption` are described by the
// local type below (the contract the implementer adds).
//
// Conventions the tests assume:
//   - The option lives in DemoState.packagingOption and reads as 'A' when absent.
//   - Under 'B', a client on an Option A package is evaluated on Core (kept add-ons); under 'A' nothing changes.
//   - Reset demo (the seed `reset`) returns the option to 'A'.
//   - Beth (client b) is on Essentials; Little Acorns (client a, Priya) is on Standard.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, type DemoState } from '@sta/domain';
import { reset } from '@sta/seed';
import type { ActorContext, DemoAdmin, StoreHandle, StoreOptions } from '../types';
import { buildWorld, TODAY } from './world';

type OptionAdmin = DemoAdmin & {
  setPackagingOption(option: 'A' | 'B'): Promise<void>;
  getPackagingOption(): Promise<'A' | 'B'>;
};
type Ents = { ownModules: number | 'unlimited'; savedThemes: number | 'unlimited'; closedBookCompetitions: boolean };
type EntStore = { competitions: { entitlements(ctx: ActorContext): Promise<Ents> } };

export function runPackagingOptionContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx = await buildWorld(handle.admin);
    const admin = handle.admin as OptionAdmin;
    const state: DemoState = {
      clockOffsetMs: 0,
      industry: 'nursery',
      persona: { side: 'provider', userId: fx.ids.users.provOwner },
    };
    await admin.setDemoState(state);
    const store = handle.store as unknown as EntStore;
    const beth: ActorContext = { userId: fx.ids.users.beth, side: 'client', clientId: fx.ids.clients.b, now: TODAY };
    const priya: ActorContext = { userId: fx.ids.users.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY };
    return { admin, store, beth, priya, state };
  }

  describe(`M4 packaging option: ${name}`, () => {
    it('defaults to Option A', async () => {
      const s = await setup();
      expect(await s.admin.getPackagingOption()).toBe('A');
    });

    it('leaves seeded clients on their own packages by default', async () => {
      const s = await setup();
      const beth = await s.store.competitions.entitlements(s.beth);
      expect(beth.closedBookCompetitions).toBe(false);
      expect(beth.savedThemes).toBe(1);
      expect(beth.ownModules).toBe(3);
      const priya = await s.store.competitions.entitlements(s.priya);
      expect(priya.closedBookCompetitions).toBe(true);
      expect(priya.savedThemes).toBe(5);
      expect(priya.ownModules).toBe('unlimited');
    });

    it('evaluates an Essentials client on Core after switching to Option B', async () => {
      const s = await setup();
      await s.admin.setPackagingOption('B');
      expect(await s.admin.getPackagingOption()).toBe('B');
      const beth = await s.store.competitions.entitlements(s.beth);
      expect(beth.closedBookCompetitions).toBe(true);
      expect(beth.savedThemes).toBe(3);
      expect(beth.ownModules).toBe('unlimited');
      // A Standard client moves to Core too: fewer saved themes than Standard's 5.
      expect((await s.store.competitions.entitlements(s.priya)).savedThemes).toBe(3);
    });

    it('goes back to the seeded packages when switched back to Option A', async () => {
      const s = await setup();
      await s.admin.setPackagingOption('B');
      await s.admin.setPackagingOption('A');
      const beth = await s.store.competitions.entitlements(s.beth);
      expect(beth.closedBookCompetitions).toBe(false);
      expect(beth.savedThemes).toBe(1);
    });

    it('stores the option in the demo state and keeps the rest of it', async () => {
      const s = await setup();
      await s.admin.setPackagingOption('B');
      const stored = await s.admin.getDemoState();
      expect(stored?.packagingOption).toBe('B');
      expect(stored?.industry).toBe(s.state.industry);
      expect(stored?.persona).toEqual(s.state.persona);
    });

    it('returns to Option A on Reset demo', async () => {
      const s = await setup();
      await s.admin.setPackagingOption('B');
      await reset(s.admin);
      expect(await s.admin.getPackagingOption()).toBe('A');
      expect((await s.admin.getDemoState())?.packagingOption ?? 'A').toBe('A');
    });
  });
}
