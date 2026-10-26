// M2 chunk 8: organise writes that touch several records are each ONE atomic batch (plan Design, data package),
// checked on the raw backend so an adapter cannot fake it.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock } from '@sta/domain';
import { createMemoryBackend } from '../memory/index';
import { createStore } from '../store';
import type { RawBackend, WriteOp } from '../backend';
import type { ActorContext, StoreName } from '../types';
import type { EngagementStore } from './engagement';
import { addLearningFixture } from './learning';
import { buildWorld, freshId, TODAY } from './world';

function spied(): { backend: RawBackend; batches: WriteOp[][] } {
  const inner = createMemoryBackend();
  const batches: WriteOp[][] = [];
  return {
    batches,
    backend: {
      ...inner,
      apply: (ops) => {
        if (ops.length > 0) batches.push([...ops]);
        return inner.apply(ops);
      },
    },
  };
}
const storesOf = (batch: WriteOp[] | undefined): string[] => [...new Set((batch ?? []).map((o) => o.store))].sort();

async function setup() {
  const { backend, batches } = spied();
  const handle = createStore(backend, { clock: fixedClock(TODAY), rng: createRng(7) });
  const fx = await buildWorld(handle.admin);
  const lf = await addLearningFixture(handle.admin, fx);
  const a = fx.ids.clients.a;
  const cat = (n: number, order: number) => ({
    id: freshId(80 + n),
    clientId: a,
    name: `Batch ${String(n)}`,
    colour: 'green',
    icon: 'book',
    order,
  });
  const cats = [cat(1, 901), cat(2, 902), cat(3, 903)];
  await handle.admin.bulkPut('categories' as StoreName, cats);
  await handle.admin.bulkPut('modulePlacements' as StoreName, [
    { clientId: a, moduleId: lf.moduleId, categoryId: cats[0]!.id, availableToAll: true },
    { clientId: a, moduleId: lf.retakeId, categoryId: cats[0]!.id, availableToAll: true },
  ]);
  const store = handle.store as unknown as EngagementStore;
  const priya: ActorContext = { userId: fx.ids.users.priya, side: 'client', clientId: a, now: TODAY };
  return { store, lf, batches, priya, cats };
}

describe('organise writes are single atomic batches', () => {
  it('reorder writes every category in one batch', async () => {
    const s = await setup();
    const start = s.batches.length;
    await s.store.categories.reorder(s.priya, [s.cats[2]!.id, s.cats[0]!.id, s.cats[1]!.id]);
    expect(s.batches.length - start).toBe(1);
    expect(storesOf(s.batches[start])).toEqual(['categories']);
    expect(s.batches[start]).toHaveLength(3);
  });

  it('delete with moveTo moves the placements and deletes the category in one batch', async () => {
    const s = await setup();
    const start = s.batches.length;
    await s.store.categories.remove(s.priya, s.cats[0]!.id, { moveTo: s.cats[1]!.id });
    expect(s.batches.length - start).toBe(1);
    expect(storesOf(s.batches[start])).toEqual(['categories', 'modulePlacements']);
    expect(s.batches[start]!.filter((o) => o.type === 'delete')).toHaveLength(1);
  });

  it('merge moves the placements and deletes the old category in one batch', async () => {
    const s = await setup();
    const start = s.batches.length;
    await s.store.categories.merge(s.priya, s.cats[0]!.id, s.cats[1]!.id);
    expect(s.batches.length - start).toBe(1);
    expect(storesOf(s.batches[start])).toEqual(['categories', 'modulePlacements']);
  });

  it('setCategory for several modules is one batch', async () => {
    const s = await setup();
    const start = s.batches.length;
    await s.store.modulePlacements.setCategory(s.priya, {
      moduleIds: [s.lf.moduleId, s.lf.retakeId],
      categoryId: s.cats[2]!.id,
    });
    expect(s.batches.length - start).toBe(1);
    expect(s.batches[start]).toHaveLength(2);
  });
});
