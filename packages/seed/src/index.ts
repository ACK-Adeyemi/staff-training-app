// The seed generator (build pack 7, M0 scope). `load` writes the world into a store, `reset` rebuilds it from the
// stored seed value and today, and `seedKeys` finds well-known ids without a store.
import type { DemoAdmin } from '@sta/data';
import type { SeedMeta } from '@sta/domain';
import { buildWorld, type SeedData, type SeedKeys } from './world';

export type { SeedKeys } from './world';

/** Version of the seeded world. 1 was M0; 2 adds modules, learning data and Little Acorns' policy (M1); 3 adds history, notes, organising data and
 * competitions (M2); 4 adds own modules, feedback, tickets, rules, themes, invoices and sign-in states (M3);
 * 5 adds price changes, profile changes, the link check, Other entries, comms and a recovery request (M4);
 * 6 adds simulated provider telemetry (usage, error groups, health scores). */
export const SEED_VERSION = 6;
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
  'modules',
  'assignments',
  'notifications',
  'attachments',
  'clientLinkOverlays',
  'learningEvents',
  'attempts',
  'notes',
  'categories',
  'moduleGroups',
  'modulePlacements',
  'competitions',
  'standingBoardSettings',
  'moduleVersions',
  'moduleFeedback',
  'appFeedback',
  'tickets',
  'ticketMessages',
  'autoAssignRules',
  'reminderLog',
  'themes',
  'invoices',
  'billingProfiles',
  'onboarding',
  'billingChangeRequests',
  'outbox',
  'priceAdjustments',
  'announcements',
  'releaseNotes',
  'recoveryRequests',
  'dataRequests',
  'incidents',
  'otherEntryGroups',
  'savedReplies',
  'profileChangeRequests',
  'linkCheckResults',
  'usageDaily',
  'errorGroups',
  'healthScores',
];

/** Replaces everything in the store with the seeded world, and stores the seed value and today. */
export async function load(admin: DemoAdmin, options: SeedMeta): Promise<SeedKeys> {
  const { data, keys } = buildWorld(options);
  // This device's own telemetry is real, not demo data: it survives Load, Reset and a seed upgrade.
  const local = ((await admin.dumpAll()) as Record<string, unknown[]>)['localTelemetry'] ?? [];
  await admin.clearAll();
  await admin.bulkPut('localTelemetry', local);
  for (const store of storeOrder) await admin.bulkPut(store, data[store]);
  await admin.setSeedMeta({ seedValue: options.seedValue, today: options.today, seedVersion: SEED_VERSION });
  return keys;
}

/** Rebuilds the world from the stored seed value and today. Clears the clock offset and keeps the chosen industry. */
export async function reset(admin: DemoAdmin): Promise<SeedKeys> {
  const meta = (await admin.getSeedMeta()) ?? { seedValue: DEFAULT_SEED_VALUE, today: DEFAULT_TODAY };
  const state = await admin.getDemoState();
  const keys = await load(admin, meta);
  if (state) {
    const next = { ...state, clockOffsetMs: 0 };
    delete next.packagingOption;
    await admin.setDemoState(next);
  }
  return keys;
}

/**
 * If a stored world is older than SEED_VERSION, rebuilds it from the same seed value and today (Reset semantics).
 * Returns the new keys, or null when nothing is stored or the stored world is already current.
 */
export async function ensureCurrentSeed(admin: DemoAdmin): Promise<SeedKeys | null> {
  const meta = await admin.getSeedMeta();
  if (!meta || (meta.seedVersion ?? 1) >= SEED_VERSION) return null;
  return reset(admin);
}
