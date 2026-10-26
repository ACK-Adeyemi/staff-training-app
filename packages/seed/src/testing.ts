// Shared helpers for the seed tests. Not part of the package's public API.
import { createHash } from 'node:crypto';
import { createMemoryStore } from '@sta/data';
import type { DemoAdmin, StoreHandle } from '@sta/data';
import { createRng, fixedClock } from '@sta/domain';
import { load, type SeedKeys } from './index';

export const TODAY = '2026-10-19T09:00:00.000Z';
export const SEED = { seedValue: 20261019, today: TODAY } as const;

/** The dumped stores as loosely typed JSON (indexing is unchecked here, see the package tsconfig). */
export type Dump = Record<string, any[]>;

export function freshStore(): StoreHandle {
  return createMemoryStore({ clock: fixedClock(TODAY), rng: createRng(1) });
}

export async function seeded(
  options: { seedValue: number; today: string } = SEED,
): Promise<{ handle: StoreHandle; admin: DemoAdmin; keys: SeedKeys; dump: Dump }> {
  const handle = freshStore();
  const keys = await load(handle.admin, options);
  const dump = (await handle.admin.dumpAll()) as Dump;
  return { handle, admin: handle.admin, keys, dump };
}

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

/** sha256 per store of canonical JSON, records sorted by their canonical form. */
export function hashStores(dump: Record<string, unknown[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, records] of Object.entries(dump)) {
    const lines = records.map((r) => JSON.stringify(canonical(r))).sort();
    out[name] = createHash('sha256').update(JSON.stringify(lines)).digest('hex');
  }
  return out;
}

export const londonParts = (iso: string) => {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...o }).format(d);
  return {
    weekday: f({ weekday: 'long' }),
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d),
    hhmm: f({ hour: '2-digit', minute: '2-digit', hour12: false }),
  };
};
