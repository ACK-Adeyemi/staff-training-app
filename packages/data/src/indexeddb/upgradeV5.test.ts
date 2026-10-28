// IndexedDB schema version 5 (M4 chunk 1) adds the provider-story object stores only and keeps every earlier record.
// The older upgrade tests pin version 4 and their store lists; the implementer updates those to 5 when bumping.
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock } from '@sta/domain';
import { DB_VERSION, clientIndexed } from './schema';
import { createIndexedDbBackend, createIndexedDbStore } from './index';

const V4_ALL = [
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
  'modules',
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
  'notes',
  'categories',
  'modulePlacements',
  'moduleGroups',
  'competitions',
  'standingBoardSettings',
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
const V6_STORES = ['usageDaily', 'errorGroups', 'healthScores', 'localTelemetry'];
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
/** Records that are always owned by one client carry a clientId index. */
const V5_CLIENT_INDEXED = ['ownershipTransfers', 'recoveryRequests', 'profileChangeRequests', 'moduleNotices'];

async function makeV4(name: string): Promise<void> {
  const db = await openDB(name, 4, {
    upgrade(database) {
      for (const s of V4_ALL) {
        const store = database.createObjectStore(s);
        if (s === 'people' || s === 'tickets' || s === 'invoices') store.createIndex('clientId', 'clientId');
      }
    },
  });
  await db.put('settings', { key: 'demoState', value: { kept: 'v4' } }, 'demoState');
  await db.put('tickets', { id: 't4', clientId: 'c4' }, 't4');
  db.close();
}

describe('indexeddb schema upgrade from version 4 to 5', () => {
  it('declares version 6', () => {
    expect(DB_VERSION).toBe(6);
  });

  it('keeps the version 4 records and adds the M4 stores, with client indexes where records are client-owned', async () => {
    await makeV4('upgrade-v4-a');
    const backend = await createIndexedDbBackend('upgrade-v4-a');
    expect(await backend.get('settings', 'demoState')).toEqual({ key: 'demoState', value: { kept: 'v4' } });
    expect(await backend.get('tickets', 't4')).toEqual({ id: 't4', clientId: 'c4' });
    backend.close();

    const db = await openDB('upgrade-v4-a');
    expect(db.version).toBe(6);
    expect([...db.objectStoreNames].sort()).toEqual([...V4_ALL, ...V5_STORES, ...V6_STORES].sort());
    for (const s of V5_CLIENT_INDEXED) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
      expect(clientIndexed.has(s as never), `${s} in clientIndexed`).toBe(true);
    }
    db.close();
  });

  it('can write and read every new store after the upgrade', async () => {
    await makeV4('upgrade-v4-b');
    const backend = await createIndexedDbBackend('upgrade-v4-b');
    for (const s of V5_STORES) {
      await backend.apply([{ type: 'put', store: s as never, key: 'k', record: { id: 'k', clientId: 'c' } }]);
      expect(await backend.get(s as never, 'k')).toEqual({ id: 'k', clientId: 'c' });
    }
    backend.close();
  });

  it('opens through the store and dumps an empty array for each new store', async () => {
    await makeV4('upgrade-v4-c');
    const handle = await createIndexedDbStore(
      { clock: fixedClock('2026-10-19T09:00:00.000Z'), rng: createRng(1) },
      'upgrade-v4-c',
    );
    const dump = await handle.admin.dumpAll();
    expect(dump['tickets'].length).toBe(1);
    for (const s of V5_STORES) expect(dump[s as keyof typeof dump], s).toEqual([]);
    handle.close();
  });
});
