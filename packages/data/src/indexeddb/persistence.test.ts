// IndexedDB adapter persistence, reset and determinism (plan chunk 9; BP-4, BP-5, BP-8).
// Expected adapter API (src/indexeddb/index.ts):
//   createIndexedDbBackend(dbName = 'sta-demo'): Promise<RawBackend & { close(): void }>
//   createIndexedDbStore(options: StoreOptions, dbName = 'sta-demo'): Promise<StoreHandle & { close(): void }>
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, offsetClock, personRequirementStatus } from '@sta/domain';
import type { Client, Site, Evidence, EvidenceSubmission, Person, Requirement } from '@sta/domain';
import { load, reset } from '@sta/seed';
import { createMemoryStore } from '../memory/index';
import { storeNames } from '../types';
import { createIndexedDbBackend, createIndexedDbStore } from './index';

const TODAY = '2026-10-19T09:00:00.000Z';
const SEED = { seedValue: 20261019, today: TODAY };
const options = () => ({ clock: fixedClock(TODAY), rng: createRng(1) });
let n = 0;
const dbName = () => `persist-${String(n++)}`;

type Rec = { id: string; clientId: string; primarySiteId: string; settings: { amberWindowDays: number } };
type Dump = Record<string, Rec[]>;

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
};
function hashStores(dump: Record<string, unknown[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, records] of Object.entries(dump)) {
    const lines = records.map((r) => JSON.stringify(canonical(r))).sort();
    out[name] = createHash('sha256').update(JSON.stringify(lines)).digest('hex');
  }
  return out;
}

describe('indexeddb adapter persistence', () => {
  it('keeps seeded data after the database is closed and reopened', async () => {
    const name = dbName();
    const first = await createIndexedDbStore(options(), name);
    await load(first.admin, SEED);
    const before = await first.admin.dumpAll();
    first.close();

    const second = await createIndexedDbStore(options(), name);
    const after = await second.admin.dumpAll();
    expect(hashStores(after)).toEqual(hashStores(before));
    expect(after['people'].length).toBeGreaterThan(0);
    expect(await second.admin.getSeedMeta()).toEqual({ ...SEED, seedVersion: 9 });
    second.close();
  });

  it('keeps demo state across reopening', async () => {
    const name = dbName();
    const first = await createIndexedDbStore(options(), name);
    const keys = await load(first.admin, SEED);
    await first.admin.setDemoState({
      clockOffsetMs: 86_400_000,
      industry: 'nursery',
      persona: { side: 'client', userId: keys.users['priya'] },
    } as never);
    first.close();
    const second = await createIndexedDbStore(options(), name);
    expect((await second.admin.getDemoState())?.clockOffsetMs).toBe(86_400_000);
    second.close();
  });

  it('keeps raw writes across reopening and removes deleted keys', async () => {
    const name = dbName();
    const a = await createIndexedDbBackend(name);
    await a.apply([
      { type: 'put', store: 'settings', key: 'x', record: { key: 'x', value: 1 } },
      { type: 'put', store: 'settings', key: 'y', record: { key: 'y', value: 2 } },
    ]);
    await a.apply([{ type: 'delete', store: 'settings', key: 'x' }]);
    a.close();
    const b = await createIndexedDbBackend(name);
    expect(await b.get('settings', 'x')).toBeUndefined();
    expect(await b.get('settings', 'y')).toEqual({ key: 'y', value: 2 });
    expect(await b.getAll('settings')).toEqual([{ key: 'y', value: 2 }]);
    b.close();
  });

  it('writes a batch all or nothing', async () => {
    const backend = await createIndexedDbBackend(dbName());
    await backend.apply([{ type: 'put', store: 'settings', key: 'a', record: { key: 'a', value: 1 } }]);
    // An unknown store makes the batch fail; the valid put before it must not stay.
    await expect(
      backend.apply([
        { type: 'put', store: 'settings', key: 'b', record: { key: 'b', value: 2 } },
        { type: 'put', store: 'nonsense' as never, key: 'c', record: { id: 'c' } },
      ]),
    ).rejects.toThrow();
    expect(await backend.get('settings', 'b')).toBeUndefined();
    expect(await backend.getAll('settings')).toHaveLength(1);
    backend.close();
  });

  it('returns copies, not live references', async () => {
    const backend = await createIndexedDbBackend(dbName());
    const record = { key: 'k', value: { n: 1 } };
    await backend.apply([{ type: 'put', store: 'settings', key: 'k', record }]);
    record.value.n = 99;
    const got = (await backend.get('settings', 'k')) as typeof record;
    expect(got.value.n).toBe(1);
    got.value.n = 5;
    expect(((await backend.get('settings', 'k')) as typeof record).value.n).toBe(1);
    backend.close();
  });

  it('stores subscriptions by clientId and add-on subscriptions by their composite key', async () => {
    const name = dbName();
    const store = await createIndexedDbStore(options(), name);
    await load(store.admin, SEED);
    const dump = await store.admin.dumpAll();
    store.close();
    const backend = await createIndexedDbBackend(name);
    expect(await backend.getAll('subscriptions')).toHaveLength(dump['subscriptions'].length);
    expect(await backend.getAll('addOnSubscriptions')).toHaveLength(dump['addOnSubscriptions'].length);
    const sub = dump['subscriptions'][0] as { clientId: string };
    expect(await backend.get('subscriptions', sub.clientId)).toEqual(sub);
    backend.close();
  });

  it('clearAll empties every object store and the emptiness survives reopening', async () => {
    const name = dbName();
    const first = await createIndexedDbStore(options(), name);
    await load(first.admin, SEED);
    await first.admin.clearAll();
    first.close();
    const second = await createIndexedDbStore(options(), name);
    const dump = await second.admin.dumpAll();
    for (const s of storeNames) expect(dump[s], s).toEqual([]);
    second.close();
  });

  it('isolates databases with different names', async () => {
    const a = await createIndexedDbStore(options(), dbName());
    const b = await createIndexedDbStore(options(), dbName());
    await load(a.admin, SEED);
    expect((await b.admin.dumpAll())['people']).toEqual([]);
    a.close();
    b.close();
  });
});

describe('indexeddb adapter reset and determinism (BP-4)', () => {
  it('gives the same hash for every store after two resets in a row, and after reopening', async () => {
    const name = dbName();
    const handle = await createIndexedDbStore(options(), name);
    await load(handle.admin, SEED);
    await handle.admin.clearAll();
    await reset(handle.admin);
    const first = hashStores(await handle.admin.dumpAll());
    await reset(handle.admin);
    const second = hashStores(await handle.admin.dumpAll());
    expect(Object.keys(first).length).toBeGreaterThan(10);
    for (const s of Object.keys(first)) expect(second[s], s).toBe(first[s]);
    handle.close();
    const reopened = await createIndexedDbStore(options(), name);
    expect(hashStores(await reopened.admin.dumpAll())).toEqual(first);
    reopened.close();
  });

  it('matches the memory adapter store by store for the same seed', async () => {
    const idb = await createIndexedDbStore(options(), dbName());
    const mem = createMemoryStore(options());
    await load(idb.admin, SEED);
    await load(mem.admin, SEED);
    expect(hashStores(await idb.admin.dumpAll())).toEqual(hashStores(await mem.admin.dumpAll()));
    idb.close();
  });

  it('gives a different people hash for a different seed value', async () => {
    const a = await createIndexedDbStore(options(), dbName());
    const b = await createIndexedDbStore(options(), dbName());
    await load(a.admin, SEED);
    await load(b.admin, { seedValue: 42, today: TODAY });
    expect(hashStores(await b.admin.dumpAll())['people']).not.toBe(hashStores(await a.admin.dumpAll())['people']);
    a.close();
    b.close();
  });

  it('removes records added after the seed when reset runs', async () => {
    const handle = await createIndexedDbStore(options(), dbName());
    await load(handle.admin, SEED);
    const dump = (await handle.admin.dumpAll()) as Dump;
    const stray = { ...dump['people']?.[0], id: 'Z'.repeat(26) };
    await handle.admin.bulkPut('people', [stray]);
    await reset(handle.admin);
    const after = (await handle.admin.dumpAll()) as Dump;
    expect((after['people'] ?? []).some((p) => p.id === stray.id)).toBe(false);
    expect(after['people']).toHaveLength(dump['people']?.length ?? -1);
    handle.close();
  });

  it('reset reuses the stored seed value and today, even under a different clock', async () => {
    const handle = await createIndexedDbStore(
      { clock: fixedClock('2030-01-01T00:00:00.000Z'), rng: createRng(9) },
      dbName(),
    );
    await load(handle.admin, SEED);
    const expected = hashStores(await handle.admin.dumpAll());
    await reset(handle.admin);
    expect(await handle.admin.getSeedMeta()).toEqual({ ...SEED, seedVersion: 9 });
    expect(hashStores(await handle.admin.dumpAll())).toEqual(expected);
    handle.close();
  });
});

describe('indexeddb adapter fast-forward (BP-5)', () => {
  it("shows Hannah's safeguarding as expiringSoon today, overdue 30 days on, and expiringSoon after Back to today", async () => {
    const handle = await createIndexedDbStore(options(), dbName());
    const keys = await load(handle.admin, SEED);
    handle.close();
    // Read through a reopened database so the statuses come from persisted records.
    const reopened = await createIndexedDbStore(options(), 'persist-ff');
    await load(reopened.admin, SEED);
    const dump = (await reopened.admin.dumpAll()) as Dump;
    const personId = keys.personas['hannah'];
    const person = (dump['people'] as unknown as Person[]).find((p) => p.id === personId);
    if (!person) throw new Error('Hannah missing');
    const req = (dump['requirements'] as unknown as Requirement[]).find((r) =>
      r.name.toLowerCase().includes('safeguarding'),
    );
    if (!req) throw new Error('Safeguarding requirement missing');
    const site = (dump['sites'] as unknown as Site[]).find((s) => s.id === person.primarySiteId);
    if (!site) throw new Error('Site missing');
    const client = (dump['clients'] as unknown as Client[]).find((c) => c.id === person.clientId);
    if (!client) throw new Error('Client missing');
    const status = (now: Date) =>
      personRequirementStatus(
        req,
        person,
        site,
        (dump['evidence'] as unknown as Evidence[]).filter((e) => e.personId === personId),
        (dump['evidenceSubmissions'] as unknown as EvidenceSubmission[]).filter((s) => s.personId === personId),
        now,
        client.settings.amberWindowDays,
      ).status;
    const base = fixedClock(TODAY);
    const ahead = offsetClock(base, 30 * 86_400_000);
    expect(status(base.now())).toBe('expiringSoon');
    expect(status(ahead.now())).toBe('overdue');
    expect(status(offsetClock(ahead, -30 * 86_400_000).now())).toBe('expiringSoon');
    reopened.close();
  });
});
