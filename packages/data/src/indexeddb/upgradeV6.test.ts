// IndexedDB schema version 6 (M4 chunk 8c) adds the provider telemetry object stores only.
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { clientIndexed } from './schema';
import { createIndexedDbBackend } from './index';

const V6_STORES = ['usageDaily', 'errorGroups', 'healthScores', 'localTelemetry'] as const;

describe('indexeddb schema version 6', () => {
  it('creates the telemetry stores, with client indexes on the two that carry a clientId', async () => {
    const backend = await createIndexedDbBackend('upgrade-v6-a');
    backend.close();
    const db = await openDB('upgrade-v6-a');
    expect(db.version).toBe(6);
    for (const s of V6_STORES) expect(db.objectStoreNames.contains(s), s).toBe(true);
    for (const s of ['usageDaily', 'healthScores'] as const) {
      expect([...db.transaction(s).store.indexNames], s).toContain('clientId');
      expect(clientIndexed.has(s)).toBe(true);
    }
    db.close();
  });
});
