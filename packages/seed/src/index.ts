// The seed generator (build pack 7, M0 scope). `load` writes the world into a store, `reset` rebuilds it from the
// stored seed value and today, and `seedKeys` finds well-known ids without a store.
import type { DemoAdmin } from '@sta/data';
import type { SeedMeta } from '@sta/domain';
import { buildWorld, type SeedData, type SeedKeys } from './world';

export type { SeedKeys } from './world';

export const DEFAULT_SEED_VALUE = 20261019;
/** Used only when nothing is stored and the caller gave no date. The web app passes the real first-load date. */
export const DEFAULT_TODAY = '2026-10-19T09:00:00.000Z';

/** Well-known ids by stable key. Same deterministic generation as `load`, so no store is needed. */
export function seedKeys(options: SeedMeta): SeedKeys {
  return buildWorld(options).keys;
}

const storeOrder: (keyof SeedData)[] = [
  'packages',
  'addOns',
  'jobRoles',
  'requirements',
  'clients',
  'sites',
  'teams',
  'people',
  'users',
  'roles',
  'roleAssignments',
  'evidence',
  'evidenceSubmissions',
  'subscriptions',
  'addOnSubscriptions',
  'paymentAttempts',
];

/** Replaces everything in the store with the seeded world, and stores the seed value and today. */
export async function load(admin: DemoAdmin, options: SeedMeta): Promise<SeedKeys> {
  const { data, keys } = buildWorld(options);
  await admin.clearAll();
  for (const store of storeOrder) await admin.bulkPut(store, data[store]);
  await admin.setSeedMeta({ seedValue: options.seedValue, today: options.today });
  return keys;
}

/** Rebuilds the world from the stored seed value and today. Clears the clock offset and keeps the chosen industry. */
export async function reset(admin: DemoAdmin): Promise<SeedKeys> {
  const meta = (await admin.getSeedMeta()) ?? { seedValue: DEFAULT_SEED_VALUE, today: DEFAULT_TODAY };
  const state = await admin.getDemoState();
  const keys = await load(admin, meta);
  if (state) await admin.setDemoState({ ...state, clockOffsetMs: 0 });
  return keys;
}
