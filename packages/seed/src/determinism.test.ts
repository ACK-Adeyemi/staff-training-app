// Chunk 8: determinism and reset (BP-4, F-2 for the seed).
import { describe, expect, it } from 'vitest';
import { load, reset, DEFAULT_SEED_VALUE } from './index';
import { freshStore, hashStores, seeded, SEED, TODAY } from './testing';

describe('seed determinism (BP-4)', () => {
  it('gives identical output for the same seed value and today', async () => {
    const a = await seeded();
    const b = await seeded();
    expect(b.dump).toEqual(a.dump);
    expect(b.keys).toEqual(a.keys);
  });

  it('returns the same keys from load and from seedKeys, without a store', async () => {
    const { seedKeys } = await import('./index');
    const { keys } = await seeded();
    expect(seedKeys(SEED)).toEqual(keys);
  });

  it('changes the people store for a different seed value', async () => {
    const a = hashStores((await seeded()).dump);
    const b = hashStores((await seeded({ seedValue: 42, today: TODAY })).dump);
    expect(b['people']).not.toBe(a['people']);
  });

  it('keeps the personas and statuses the same for a different seed value (only ids and filler vary)', async () => {
    const { dump, keys } = await seeded({ seedValue: 42, today: TODAY });
    const jade = dump['people'].find((p) => p.id === keys.personas['jade']);
    expect(jade).toMatchObject({ firstName: 'Jade', lastName: 'Mills' });
    expect(dump['clients']).toHaveLength(13);
  });

  it('moves dates with today but keeps the world shape', async () => {
    const later = '2027-03-01T09:00:00.000Z';
    const { dump } = await seeded({ seedValue: 20261019, today: later });
    expect(dump['clients']).toHaveLength(13);
    const willow = dump['subscriptions'].find((s) => s.state === 'pastDue');
    expect(willow.stateSince.slice(0, 10)).toBe('2027-02-19');
  });
});

describe('reset demo (BP-4)', () => {
  it('restores a known state after the data is changed, and twice in a row gives identical hashes for every store', async () => {
    const { admin, dump } = await seeded();
    const baseline = hashStores(dump);
    // Damage the world: remove everything, then add a stray person.
    await admin.clearAll();
    await admin.bulkPut('clients', []);
    expect((await admin.dumpAll())['people']).toHaveLength(0);

    await reset(admin);
    const first = hashStores(await admin.dumpAll());
    await reset(admin);
    const second = hashStores(await admin.dumpAll());
    expect(Object.keys(first).length).toBeGreaterThan(10);
    for (const store of Object.keys(first)) expect(second[store], store).toBe(first[store]);
    expect(first).toEqual(baseline);
  });

  it('removes records added after the seed', async () => {
    const { admin, dump } = await seeded();
    const stray = { ...dump['people'][0], id: 'Z'.repeat(26) };
    await admin.bulkPut('people', [stray]);
    expect((await admin.dumpAll())['people']).toHaveLength(dump['people'].length + 1);
    await reset(admin);
    expect((await admin.dumpAll())['people'].some((p) => (p as { id: string }).id === stray.id)).toBe(false);
  });

  it('reuses the stored seed value and today', async () => {
    const options = { seedValue: 7, today: '2026-12-07T09:00:00.000Z' };
    const { admin, dump } = await seeded(options);
    const expected = hashStores(dump);
    await reset(admin);
    expect(await admin.getSeedMeta()).toEqual({ ...options, seedVersion: 7 });
    expect(hashStores(await admin.dumpAll())).toEqual(expected);
  });

  it('sets the clock offset to 0 and keeps the chosen industry', async () => {
    const { admin, keys } = await seeded();
    await admin.setDemoState({
      clockOffsetMs: 30 * 86_400_000,
      industry: 'luxuryRetail',
      persona: { side: 'client', userId: keys.users['priya'] },
    });
    await reset(admin);
    const state = await admin.getDemoState();
    expect(state?.clockOffsetMs).toBe(0);
    expect(state?.industry).toBe('luxuryRetail');
  });

  it('falls back to the default seed value when nothing is stored, and then stores it', async () => {
    const { admin } = freshStore();
    expect(await admin.getSeedMeta()).toBeUndefined();
    await reset(admin);
    const meta = await admin.getSeedMeta();
    expect(meta?.seedValue).toBe(DEFAULT_SEED_VALUE);
    expect(DEFAULT_SEED_VALUE).toBe(20261019);
    expect(Number.isNaN(Date.parse(meta!.today))).toBe(false);
    expect((await admin.dumpAll())['clients']).toHaveLength(13);
  });

  it('load replaces whatever was there (no leftovers from an earlier world)', async () => {
    const { admin } = await seeded({ seedValue: 1, today: TODAY });
    await load(admin, SEED);
    const again = hashStores(await admin.dumpAll());
    const clean = hashStores((await seeded()).dump);
    expect(again).toEqual(clean);
  });
});
