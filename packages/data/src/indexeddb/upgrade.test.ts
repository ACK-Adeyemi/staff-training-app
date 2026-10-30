// IndexedDB schema versions 2 (M1), 3 (M2 chunk 8) and 4 (M3 chunk 1) add object stores only and keep every earlier record.
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
const V4_STORES = [
  'moduleDrafts',
  'moduleVersions',
  'autoAssignRules',
  'reminderLog',
  'themes',
  'invitations',
  'onboarding',
  'invoices',
  'billingProfiles',
  'billingChangeRequests',
  'addOnRequests',
  'moduleFeedback',
  'appFeedback',
  'tickets',
  'ticketMessages',
  'faqVotes',
];
const ALL_NEW = [...NEW_STORES, ...V3_STORES, ...V4_STORES];
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

/** Added in version 6 (M4 chunk 8c); see upgradeV6.test.ts. */
const V6_STORES = ['usageDaily', 'errorGroups', 'healthScores', 'localTelemetry'];

/** Added in version 5 (M4 chunk 1); see upgradeV5.test.ts. */
const V5_STORES = [
  'priceAdjustments',
  'ownershipTransfers',
  'announcements',
  'releaseNotes',
  'recoveryRequests',
  'dataRequests',
  'incidents',
  'otherEntryGroups',
  'savedReplies',
  'profileChangeRequests',
  'linkCheckResults',
  'moduleNotices',
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
  it('declares version 6', () => {
    expect(DB_VERSION).toBe(6);
  });

  it('keeps the version 1 records and adds the new object stores with client indexes', async () => {
    await makeV1('upgrade-a');
    const backend = await createIndexedDbBackend('upgrade-a');
    expect(await backend.get('settings', 'demoState')).toEqual({ key: 'demoState', value: { kept: true } });
    expect(await backend.get('people', 'p1')).toEqual({ id: 'p1', clientId: 'c1' });
    backend.close();

    const db = await openDB('upgrade-a');
    expect(db.version).toBe(6);
    expect([...db.objectStoreNames].sort()).toEqual([...V1_STORES, ...ALL_NEW, ...V5_STORES, ...V6_STORES].sort());
    for (const s of CLIENT_INDEXED_NEW) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    expect([...db.transaction('people').store.indexNames]).toContain('clientId');
    db.close();
  });

  it('can write and read the new stores after the upgrade', async () => {
    await makeV1('upgrade-b');
    const backend = await createIndexedDbBackend('upgrade-b');
    for (const s of ALL_NEW) {
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
    for (const s of ALL_NEW) expect(Array.isArray(dump[s as keyof typeof dump]), s).toBe(true);
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
    expect(db.version).toBe(6);
    expect([...db.objectStoreNames].sort()).toEqual([...V1_STORES, ...ALL_NEW, ...V5_STORES, ...V6_STORES].sort());
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

async function makeV3(name: string): Promise<void> {
  const db = await openDB(name, 3, {
    upgrade(database) {
      for (const s of V1_STORES) {
        const store = database.createObjectStore(s);
        if (V1_INDEXED.has(s)) store.createIndex('clientId', 'clientId');
      }
      for (const s of [...NEW_STORES, ...V3_STORES]) {
        const store = database.createObjectStore(s);
        store.createIndex('clientId', 'clientId');
      }
    },
  });
  await db.put('settings', { key: 'demoState', value: { kept: 'v3' } }, 'demoState');
  await db.put('people', { id: 'p3', clientId: 'c3' }, 'p3');
  await db.put('notes', { id: 'n3', clientId: 'c3' }, 'n3');
  await db.put('competitions', { id: 'comp3', clientId: 'c3' }, 'comp3');
  db.close();
}

describe('indexeddb schema upgrade from version 3 to 4', () => {
  it('keeps the version 3 records and adds the sixteen M3 stores, each with a clientId index', async () => {
    await makeV3('upgrade-v3-a');
    const backend = await createIndexedDbBackend('upgrade-v3-a');
    expect(await backend.get('settings', 'demoState')).toEqual({ key: 'demoState', value: { kept: 'v3' } });
    expect(await backend.get('people', 'p3')).toEqual({ id: 'p3', clientId: 'c3' });
    expect(await backend.get('notes', 'n3')).toEqual({ id: 'n3', clientId: 'c3' });
    expect(await backend.get('competitions', 'comp3')).toEqual({ id: 'comp3', clientId: 'c3' });
    backend.close();

    const db = await openDB('upgrade-v3-a');
    expect(db.version).toBe(6);
    expect([...db.objectStoreNames].sort()).toEqual([...V1_STORES, ...ALL_NEW, ...V5_STORES, ...V6_STORES].sort());
    expect(V4_STORES).toHaveLength(16);
    for (const s of V4_STORES) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    // Earlier stores keep their indexes.
    for (const s of [...CLIENT_INDEXED_NEW, ...V3_STORES]) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
    }
    db.close();
  });

  it('can write and read every new store after the upgrade', async () => {
    await makeV3('upgrade-v3-b');
    const backend = await createIndexedDbBackend('upgrade-v3-b');
    for (const s of V4_STORES) {
      await backend.apply([{ type: 'put', store: s as never, key: 'k', record: { id: 'k', clientId: 'c3' } }]);
      expect(await backend.get(s as never, 'k')).toEqual({ id: 'k', clientId: 'c3' });
    }
    backend.close();
  });

  it('opens through the store, keeps the old demo state and dumps every new store as an empty list', async () => {
    await makeV3('upgrade-v3-c');
    const handle = await createIndexedDbStore(
      { clock: fixedClock('2026-10-19T09:00:00.000Z'), rng: createRng(1) },
      'upgrade-v3-c',
    );
    const dump = await handle.admin.dumpAll();
    expect(dump['people'].length).toBe(1);
    for (const s of V4_STORES) expect((dump as Record<string, unknown[]>)[s], s).toEqual([]);
    handle.close();
  });

  it('is reachable straight from version 1 in one open', async () => {
    await makeV1('upgrade-v1-to-v4');
    const backend = await createIndexedDbBackend('upgrade-v1-to-v4');
    backend.close();
    const db = await openDB('upgrade-v1-to-v4');
    expect(db.version).toBe(6);
    for (const s of V4_STORES) expect(db.objectStoreNames.contains(s), s).toBe(true);
    db.close();
  });
});
