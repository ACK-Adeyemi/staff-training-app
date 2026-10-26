// Version 1 schema: one object store per repository, with out-of-line string keys taken from keyOf
// (id; clientId for subscriptions; clientId:addOnId for addOnSubscriptions; key for settings).
// Later upgrades must be additive: add stores or indexes under a higher version, never remove them.
import type { IDBPDatabase } from 'idb';
import { storeNames, type StoreName } from '../types';

export const DB_VERSION = 1;

/** Stores whose records carry a clientId get an index on it. */
export const clientIndexed: ReadonlySet<StoreName> = new Set<StoreName>([
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

export function upgradeToV1(db: IDBPDatabase): void {
  for (const name of storeNames) {
    const store = db.createObjectStore(name);
    if (clientIndexed.has(name)) store.createIndex('clientId', 'clientId');
  }
}
