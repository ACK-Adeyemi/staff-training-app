// In-memory adapter: a Map per store. Copies in and out, so callers can never change stored state.
import type { RawBackend, WriteOp } from '../backend';
import { createStore } from '../store';
import { storeNames, type StoreHandle, type StoreName, type StoreOptions } from '../types';

export function createMemoryBackend(): RawBackend {
  const maps = new Map<StoreName, Map<string, unknown>>(storeNames.map((name) => [name, new Map()]));
  const table = (store: StoreName): Map<string, unknown> => {
    const map = maps.get(store);
    if (!map) throw new Error(`Unknown store ${store}`);
    return map;
  };
  return {
    getAll: (store) => Promise.resolve([...table(store).values()].map((r) => structuredClone(r))),
    get: (store, key) => {
      const hit = table(store).get(key);
      return Promise.resolve(hit === undefined ? undefined : structuredClone(hit));
    },
    apply: (ops: readonly WriteOp[]) => {
      // Copy first, then commit, so a failure part-way leaves nothing behind.
      const staged = ops.map((op) => (op.type === 'put' ? { ...op, record: structuredClone(op.record) } : op));
      for (const op of staged) {
        if (op.type === 'put') table(op.store).set(op.key, op.record);
        else table(op.store).delete(op.key);
      }
      return Promise.resolve();
    },
    clear: () => {
      for (const map of maps.values()) map.clear();
      return Promise.resolve();
    },
  };
}

export function createMemoryStore(options: StoreOptions): Promise<StoreHandle> {
  return Promise.resolve(createStore(createMemoryBackend(), options));
}
