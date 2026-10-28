// M3 chunk 11 (assumption 53): the new seed sections draw from their own forked streams, never from the root, so the
// earlier streams (and every earlier record) do not move. `billing` already existed from M0 and stays.
import { describe, expect, it, vi } from 'vitest';

const forks: string[] = [];
const rootDraws: string[] = [];

vi.mock('@sta/domain', async () => {
  const actual = await vi.importActual<typeof import('@sta/domain')>('@sta/domain');
  type R = import('@sta/domain').Rng;
  const wrap = (rng: R, root: boolean): R =>
    new Proxy(rng, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'fork') {
          return (label: string) => {
            if (root) forks.push(label);
            return wrap((value as (l: string) => R).call(target, label), false);
          };
        }
        if (root && typeof value === 'function') {
          return (...args: unknown[]) => {
            rootDraws.push(String(prop));
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return value;
      },
    });
  return { ...actual, createRng: (seed: number) => wrap(actual.createRng(seed), true) };
});

describe('seed RNG streams in version 4', () => {
  it('keeps every earlier stream and adds m3history, feedback and support, with no draws from the root', async () => {
    const { freshStore, SEED } = await import('./testing');
    const { load } = await import('./index');
    forks.length = 0;
    rootDraws.length = 0;
    await load(freshStore().admin, SEED);
    for (const label of [
      'provider',
      'clients',
      'littleAcorns',
      'oakTree',
      'willowLane',
      'evidence',
      'billing',
      'modules',
      'learning',
      'overlays',
      'history',
      'm3history',
      'feedback',
      'support',
    ]) {
      expect(forks, `fork ${label}`).toContain(label);
    }
    expect(new Set(forks).size).toBe(forks.length);
    expect(rootDraws).toEqual([]);
  });
});
