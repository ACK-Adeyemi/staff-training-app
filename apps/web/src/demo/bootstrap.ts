import { createIndexedDbStore } from '@sta/data';
import type { StoreHandle } from '@sta/data';
import { createRng, offsetClock, startOfLondonDay, systemClock, type Clock, type DemoState } from '@sta/domain';
import { DEFAULT_SEED_VALUE, ensureCurrentSeed, load, reset, seedKeys, type SeedKeys } from '@sta/seed';

export type Booted = {
  handle: StoreHandle;
  keys: SeedKeys;
  state: DemoState;
  /** The store's own clock; follows setOffset. */
  setOffset: (ms: number) => void;
};

/** Opens the IndexedDB store and seeds it on first load. The only place that reads the system clock for "today". */
export async function bootstrap(search: string): Promise<Booted> {
  let offsetMs = 0;
  const storeClock: Clock = { now: () => offsetClock(systemClock, offsetMs).now() };
  const rng = createRng(systemClock.now().getTime());
  const handle = await createIndexedDbStore({ clock: storeClock, rng });
  const { admin } = handle;

  let meta = await admin.getSeedMeta();
  let keys: SeedKeys;
  if (!meta) {
    meta = { seedValue: DEFAULT_SEED_VALUE, today: startOfLondonDay(systemClock.now()).toISOString() };
    keys = await load(admin, meta);
  } else if (new URLSearchParams(search).get('reset') === '1') {
    keys = await reset(admin);
  } else {
    keys = (await ensureCurrentSeed(admin)) ?? seedKeys(meta);
  }

  let state = await admin.getDemoState();
  if (new URLSearchParams(search).get('reset') === '1') {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState(null, '', url);
  }
  if (!state || new URLSearchParams(search).get('reset') === '1') {
    state = {
      clockOffsetMs: 0,
      industry: state?.industry ?? 'nursery',
      persona: { side: 'staff', userId: keys.users['jade'] },
    };
    await admin.setDemoState(state);
  }
  offsetMs = state.clockOffsetMs;
  return {
    handle,
    keys,
    state,
    setOffset: (ms) => {
      offsetMs = ms;
    },
  };
}
