// IndexedDB adapter. Raw storage only; tenancy, permissions and validation live in createStore.
import { openDB, type IDBPDatabase } from 'idb';
import type { RawBackend, WriteOp } from '../backend';
import { createStore } from '../store';
import { storeNames, type StoreHandle, type StoreName, type StoreOptions } from '../types';
import { DB_VERSION, upgradeToV1, upgradeToV2 } from './schema';

const known: ReadonlySet<string> = new Set(storeNames);

export async function createIndexedDbBackend(dbName = 'sta-demo'): Promise<RawBackend & { close(): void }> {
  const db: IDBPDatabase = await openDB(dbName, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) upgradeToV1(database);
      if (oldVersion < 2) upgradeToV2(database);
    },
  });
  const check = (store: string): StoreName => {
    if (!known.has(store)) throw new Error(`Unknown store ${store}`);
    return store as StoreName;
  };
  return {
    // IndexedDB uses the structured clone algorithm, so values go in and come out as copies.
    getAll: async (store) => (await db.getAll(check(store))) as unknown[],
    get: async (store, key) => (await db.get(check(store), key)) as unknown,
    async apply(ops: readonly WriteOp[]) {
      // Validate every store name before opening the transaction, so nothing is written for a bad batch.
      for (const op of ops) check(op.store);
      if (ops.length === 0) return;
      const names = [...new Set(ops.map((op) => op.store))];
      const tx = db.transaction(names, 'readwrite');
      try {
        await Promise.all([
          ...ops.map((op) =>
            op.type === 'put'
              ? tx.objectStore(op.store).put(op.record, op.key)
              : tx.objectStore(op.store).delete(op.key),
          ),
          tx.done,
        ]);
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // Already finished or aborted.
        }
        throw error;
      }
    },
    async clear() {
      const tx = db.transaction([...storeNames], 'readwrite');
      await Promise.all([...storeNames.map((name) => tx.objectStore(name).clear()), tx.done]);
    },
    close: () => {
      db.close();
    },
  };
}

export async function createIndexedDbStore(
  options: StoreOptions,
  dbName = 'sta-demo',
): Promise<StoreHandle & { close(): void }> {
  const backend = await createIndexedDbBackend(dbName);
  return {
    ...createStore(backend, options),
    close: () => {
      backend.close();
    },
  };
}
