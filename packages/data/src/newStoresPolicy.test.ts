// M3 chunk 1: the sixteen new stores are denied to every actor until a later chunk wires their operations
// (plan "Data package": "Until a chunk wires a store's operations, the policy denies all actor access to it").
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock } from '@sta/domain';
import { buildWorld, TODAY } from './contract/world';
import { M3_STORES } from './contract/m3Foundation';
import { createMemoryBackend } from './memory/index';
import { createStore } from './store';
import { authorizePut, authorizeRemove, beginCall, canReadStore } from './policy';
import { ForbiddenError, type ActorContext, type StoreName } from './types';

async function world() {
  const backend = createMemoryBackend();
  const options = { clock: fixedClock(TODAY), rng: createRng(7) };
  const { admin } = createStore(backend, options);
  const fx = await buildWorld(admin);
  const actors: Record<string, ActorContext> = {
    'client owner': { userId: fx.ids.users.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY },
    'client admin without billing': {
      userId: fx.ids.users.daniel,
      side: 'client',
      clientId: fx.ids.clients.a,
      now: TODAY,
    },
    'staff member': { userId: fx.ids.users.jade, side: 'staff', clientId: fx.ids.clients.a, now: TODAY },
    'provider owner': { userId: fx.ids.users.provOwner, side: 'provider', now: TODAY },
  };
  return { backend, options, actors, clientId: fx.ids.clients.a };
}

describe('new stores are deny-all for actors', () => {
  it.each(M3_STORES)('%s cannot be read, written or removed by any kind of actor', async (store) => {
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
