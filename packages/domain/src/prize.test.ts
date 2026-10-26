// BP-3 (pure part): the prize suggestion walk (plan M2 assumption 18, brief 13.3).
import { describe, expect, it } from 'vitest';
import { nextSuggestion } from './prize';
import { createRng } from './rng';

const list = Array.from({ length: 20 }, (_, i) => `Prize ${i + 1}`);

const walk = (items: readonly string[], n: number, seed = 1) => {
  const rng = createRng(seed);
  let state: ReturnType<typeof nextSuggestion>['state'] | undefined;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextSuggestion(items, state, rng);
    out.push(r.text);
    state = r.state;
  }
  return out;
};

describe('nextSuggestion', () => {
  it('returns text from the list', () => {
    for (const t of walk(list, 25)) expect(list).toContain(t);
  });

  it('never gives the same text twice in a row over 100 presses', () => {
    const out = walk(list, 100);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });

  it('covers all 20 exactly once in every block of 20', () => {
    const out = walk(list, 100);
    for (let b = 0; b < 5; b++) {
      expect([...out.slice(b * 20, b * 20 + 20)].sort()).toEqual([...list].sort());
    }
  });

  it('is shuffled, not the list order', () => {
    expect(walk(list, 20)).not.toEqual(list);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    expect(walk(list, 40, 7)).toEqual(walk(list, 40, 7));
    const firsts = new Set(Array.from({ length: 10 }, (_, s) => walk(list, 1, s)[0]));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('does not change the list it is given', () => {
    const copy = [...list];
    walk(list, 40);
    expect(list).toEqual(copy);
  });

  it('always returns the only item of a list of one', () => {
    expect(walk(['Only prize'], 5)).toEqual(Array(5).fill('Only prize'));
  });

  it('alternates for a list of two', () => {
    const out = walk(['One', 'Two'], 10);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    expect(new Set(out)).toEqual(new Set(['One', 'Two']));
  });

  it('keeps going at the reshuffle boundary without repeating the last text of the old cycle', () => {
    for (let seed = 0; seed < 40; seed++) {
      const out = walk(['A', 'B', 'C'], 30, seed);
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    }
  });

  it('starts from a fresh walk when the state is undefined', () => {
    const r = nextSuggestion(list, undefined, createRng(3));
    expect(list).toContain(r.text);
    expect(r.state).toBeDefined();
  });

  it('refuses an empty list', () => {
    expect(() => nextSuggestion([], undefined, createRng(1))).toThrow();
  });
});
