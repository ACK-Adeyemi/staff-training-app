// M4 chunk 1: the twelve new stores are named, and denied to every actor until a later chunk wires their operations
// (plan docs/plans/m4.md chunk 1 and assumption 11; same rule as newStoresPolicy.test.ts for M3).
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock } from '@sta/domain';
import { buildWorld, TODAY } from './contract/world';
import { createMemoryBackend } from './memory/index';
import { createStore } from './store';
import { authorizePut, authorizeRemove, beginCall, canReadStore } from './policy';
import { ForbiddenError, storeNames, type ActorContext, type StoreName } from './types';

export const M4_STORES = [
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
] as const;

async function world() {
  const backend = createMemoryBackend();
  const options = { clock: fixedClock(TODAY), rng: createRng(7) };
  const { admin } = createStore(backend, options);
  const fx = await buildWorld(admin);
  const actors: Record<string, ActorContext> = {
    'client owner': { userId: fx.ids.users.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY },
    'client admin without billing': { userId: fx.ids.users.daniel, side: 'client', clientId: fx.ids.clients.a, now: TODAY },
    'staff member': { userId: fx.ids.users.jade, side: 'staff', clientId: fx.ids.clients.a, now: TODAY },
    'provider owner': { userId: fx.ids.users.provOwner, side: 'provider', now: TODAY },
  };
  return { backend, options, actors, clientId: fx.ids.clients.a };
}

describe('M4 stores exist', () => {
  it.each(M4_STORES)('%s is a store name', (store) => {
    expect(storeNames as readonly string[]).toContain(store);
  });

  it('has no duplicate store names', () => {
    expect(new Set(storeNames).size).toBe(storeNames.length);
  });
});

describe('M4 stores are deny-all for actors', () => {
  it.each(M4_STORES)('%s cannot be read, written or removed by any kind of actor', async (store) => {
    const { backend, options, actors, clientId } = await world();
    for (const [label, ctx] of Object.entries(actors)) {
      const call = await beginCall(backend, options, ctx);
      expect(await canReadStore(call, store as StoreName), `${label} read`).toBe(false);
      const record = { id: 'x', key: 'x', clientId };
      await expect(authorizePut(call, store as StoreName, record, undefined), `${label} put`).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(authorizeRemove(call, store as StoreName, record), `${label} remove`).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });
});
