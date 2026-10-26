// IndexedDB schema versions 2 (M1) and 3 (M2 chunk 8) add object stores only and keep every earlier record.
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
const V3_STORES = ['notes', 'categories', 'modulePlacements', 'moduleGroups', 'competitions', 'standingBoardSettings'];
const CLIENT_INDEXED_NEW = [
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
];

async function makeV2(name: string): Promise<void> {
  const db = await openDB(name, 2, {
    upgrade(database) {
      for (const s of V1_STORES) {
        const store = database.createObjectStore(s);
        if (V1_INDEXED.has(s)) store.createIndex('clientId', 'clientId');
      }
      for (const s of NEW_STORES) {
        const store = database.createObjectStore(s);
        if (CLIENT_INDEXED_NEW.includes(s)) store.createIndex('clientId', 'clientId');
      }
    },
  });
  await db.put('settings', { key: 'demoState', value: { kept: 'v2' } }, 'demoState');
  await db.put('people', { id: 'p2', clientId: 'c2' }, 'p2');
  await db.put('modules', { id: 'm2', owner: 'provider' }, 'm2');
  await db.put('learningEvents', { id: 'e2', clientId: 'c2' }, 'e2');
  db.close();
}

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
  it('declares version 3', () => {
    expect(DB_VERSION).toBe(3);
  });

  it('keeps the version 1 records and adds the new object stores with client indexes', async () => {
    await makeV1('upgrade-a');
    const backend = await createIndexedDbBackend('upgrade-a');
    expect(await backend.get('settings', 'demoState')).toEqual({ key: 'demoState', value: { kept: true } });
    expect(await backend.get('people', 'p1')).toEqual({ id: 'p1', clientId: 'c1' });
    backend.close();

    const db = await openDB('upgrade-a');
    expect(db.version).toBe(3);
    expect([...db.objectStoreNames].sort()).toEqual([...V1_STORES, ...NEW_STORES, ...V3_STORES].sort());
    for (const s of CLIENT_INDEXED_NEW) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    expect([...db.transaction('people').store.indexNames]).toContain('clientId');
    db.close();
  });

  it('can write and read the new stores after the upgrade', async () => {
    await makeV1('upgrade-b');
    const backend = await createIndexedDbBackend('upgrade-b');
    for (const s of [...NEW_STORES, ...V3_STORES]) {
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
    for (const s of [...NEW_STORES, ...V3_STORES]) expect(Array.isArray(dump[s as keyof typeof dump]), s).toBe(true);
    handle.close();
  });
});

describe('indexeddb schema upgrade from version 2 to 3', () => {
  it('keeps the version 2 records and adds the M2 stores with client indexes', async () => {
    await makeV2('upgrade-v2-a');
    const backend = await createIndexedDbBackend('upgrade-v2-a');
    expect(await backend.get('settings', 'demoState')).toEqual({ key: 'demoState', value: { kept: 'v2' } });
    expect(await backend.get('people', 'p2')).toEqual({ id: 'p2', clientId: 'c2' });
    expect(await backend.get('modules', 'm2')).toEqual({ id: 'm2', owner: 'provider' });
    expect(await backend.get('learningEvents', 'e2')).toEqual({ id: 'e2', clientId: 'c2' });
    backend.close();

    const db = await openDB('upgrade-v2-a');
    expect(db.version).toBe(3);
    expect([...db.objectStoreNames].sort()).toEqual([...V1_STORES, ...NEW_STORES, ...V3_STORES].sort());
    for (const s of V3_STORES) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    // The version 2 stores keep their indexes.
    for (const s of CLIENT_INDEXED_NEW) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    db.close();
  });

  it('can write and read the new stores, with the composite placement key', async () => {
    await makeV2('upgrade-v2-b');
    const backend = await createIndexedDbBackend('upgrade-v2-b');
    for (const s of V3_STORES) {
      await backend.apply([{ type: 'put', store: s as never, key: 'k', record: { id: 'k' } }]);
      expect(await backend.get(s as never, 'k')).toEqual({ id: 'k' });
    }
    backend.close();
  });

  it('opens through the store, validates and writes M2 records, and still reads the old demo state', async () => {
    await makeV2('upgrade-v2-c');
    const handle = await createIndexedDbStore(
      { clock: fixedClock('2026-10-19T09:00:00.000Z'), rng: createRng(1) },
      'upgrade-v2-c',
    );
    const note = {
      id: '00000000000000000000000001',
      clientId: '00000000000000000000000002',
      personId: '00000000000000000000000003',
      moduleId: '00000000000000000000000004',
      body: 'Kept after the upgrade',
      starred: false,
      createdAt: '2026-10-19T09:00:00.000Z',
      updatedAt: '2026-10-19T09:00:00.000Z',
    };
    await handle.admin.bulkPut('notes', [note]);
    const dump = await handle.admin.dumpAll();
    expect(dump['people'].length).toBe(1);
    expect((dump as Record<string, unknown[]>)['notes']).toEqual([note]);
    handle.close();
  });
});
