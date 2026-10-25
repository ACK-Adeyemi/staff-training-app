// M1 chunk 5: IndexedDB schema version 2 adds object stores only and keeps every v1 record (plan Assumption 19).
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock } from '@sta/domain';
import { DB_VERSION } from './schema';
import { createIndexedDbBackend, createIndexedDbStore } from './index';

const V1_STORES = [
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
const V1_INDEXED = new Set([
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
const NEW_STORES = [
  'modules',
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
];
const CLIENT_INDEXED_NEW = [
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
];

async function makeV1(name: string): Promise<void> {
  const db = await openDB(name, 1, {
    upgrade(database) {
      for (const s of V1_STORES) {
        const store = database.createObjectStore(s);
        if (V1_INDEXED.has(s)) store.createIndex('clientId', 'clientId');
      }
    },
  });
  await db.put('settings', { key: 'demoState', value: { kept: true } }, 'demoState');
  await db.put('settings', { key: 'other', value: 2 }, 'other');
  await db.put('people', { id: 'p1', clientId: 'c1' }, 'p1');
  db.close();
}

describe('indexeddb schema upgrade from version 1', () => {
  it('declares version 2', () => {
    expect(DB_VERSION).toBe(2);
  });

  it('keeps the version 1 records and adds the new object stores with client indexes', async () => {
    await makeV1('upgrade-a');
    const backend = await createIndexedDbBackend('upgrade-a');
    expect(await backend.get('settings', 'demoState')).toEqual({ key: 'demoState', value: { kept: true } });
    expect(await backend.get('people', 'p1')).toEqual({ id: 'p1', clientId: 'c1' });
    backend.close();

    const db = await openDB('upgrade-a');
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual([...V1_STORES, ...NEW_STORES].sort());
    for (const s of CLIENT_INDEXED_NEW) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    expect([...db.transaction('people').store.indexNames]).toContain('clientId');
    db.close();
  });

  it('can write and read the new stores after the upgrade', async () => {
    await makeV1('upgrade-b');
    const backend = await createIndexedDbBackend('upgrade-b');
    for (const s of NEW_STORES) {
      await backend.apply([{ type: 'put', store: s as never, key: 'k', record: { id: 'k' } }]);
      expect(await backend.get(s as never, 'k')).toEqual({ id: 'k' });
    }
    backend.close();
  });

  it('opens through the store and still reads the old demo state', async () => {
    await makeV1('upgrade-c');
    const handle = await createIndexedDbStore(
      { clock: fixedClock('2026-10-19T09:00:00.000Z'), rng: createRng(1) },
      'upgrade-c',
    );
    const dump = await handle.admin.dumpAll();
    expect(dump['people'].length).toBe(1);
    for (const s of NEW_STORES) expect(Array.isArray(dump[s as keyof typeof dump]), s).toBe(true);
    handle.close();
  });
});
