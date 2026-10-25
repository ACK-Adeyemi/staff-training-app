// Version 1 schema: one object store per repository, with out-of-line string keys taken from keyOf
// (id; clientId for subscriptions; clientId:addOnId for addOnSubscriptions; key for settings).
// Version 2 adds the learning stores. Later upgrades must be additive: add stores or indexes under a higher version, never remove them.
import type { IDBPDatabase } from 'idb';
import type { StoreName } from '../types';

export const DB_VERSION = 2;

/** Stores whose records carry a clientId get an index on it. */
const V1_STORES: readonly StoreName[] = [
  'clients',
  'sites',
  'teams',
  'people',
  'users',
  'jobRoles',
  'requirements',
  'evidence',
  'evidenceSubmissions',
  'roles',
  'roleAssignments',
  'packages',
  'addOns',
  'subscriptions',
  'addOnSubscriptions',
  'paymentAttempts',
  'audit',
  'outbox',
  'settings',
];
const V2_STORES: readonly StoreName[] = [
  'modules',
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
];

export const clientIndexed: ReadonlySet<StoreName> = new Set<StoreName>([
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
  'sites',
  'teams',
  'people',
  'users',
  'jobRoles',
  'requirements',
  'evidence',
  'evidenceSubmissions',
  'roleAssignments',
  'subscriptions',
  'addOnSubscriptions',
  'paymentAttempts',
  'audit',
  'outbox',
]);

function createStores(db: IDBPDatabase, names: readonly StoreName[]): void {
  for (const name of names) {
    const store = db.createObjectStore(name);
    if (clientIndexed.has(name)) store.createIndex('clientId', 'clientId');
  }
}

export const upgradeToV1 = (db: IDBPDatabase): void => {
  createStores(db, V1_STORES);
};
/** Additive: new object stores only. */
export const upgradeToV2 = (db: IDBPDatabase): void => {
  createStores(db, V2_STORES);
};
