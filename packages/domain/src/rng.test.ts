// F-2: the seeded RNG is deterministic per seed and forks are independent.
import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

const draw = (rng: { next(): number }, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('createRng', () => {
  it('gives the same first 1,000 values for the same seed', () => {
    expect(draw(createRng(20261019), 1000)).toEqual(draw(createRng(20261019), 1000));
  });

  it('gives different values for different seeds', () => {
    expect(draw(createRng(1), 20)).not.toEqual(draw(createRng(2), 20));
  });

  it('keeps next() in [0, 1) and not constant', () => {
    const values = draw(createRng(7), 1000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(990);
  });

  it('spreads values roughly evenly (mean near 0.5)', () => {
    const values = draw(createRng(99), 5000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('int', () => {
  it('stays within the inclusive bounds and reaches both ends', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns the only possible value when min equals max', () => {
    const rng = createRng(3);
    expect(rng.int(5, 5)).toBe(5);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('supports negative ranges and returns integers', () => {
    const rng = createRng(4);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(-3, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
    }
  });
});

describe('pick', () => {
  it('returns an element of the array, deterministically', () => {
    const xs = ['a', 'b', 'c', 'd'];
    const first = createRng(5).pick(xs);
    expect(xs).toContain(first);
    expect(createRng(5).pick(xs)).toBe(first);
  });

  it('eventually picks every element', () => {
    const rng = createRng(6);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rng.pick(['a', 'b', 'c']));
    expect(seen.size).toBe(3);
  });

  it('throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe('shuffle', () => {
  const input = Array.from({ length: 20 }, (_, i) => i);

  it('returns a permutation of the input', () => {
    const out = createRng(8).shuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input and returns a new array', () => {
    const copy = [...input];
    const out = createRng(8).shuffle(input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });

  it('is deterministic per seed and actually reorders', () => {
    expect(createRng(8).shuffle(input)).toEqual(createRng(8).shuffle(input));
    expect(createRng(8).shuffle(input)).not.toEqual(input);
    expect(createRng(9).shuffle(input)).not.toEqual(createRng(8).shuffle(input));
  });

  it('handles empty and single-item arrays', () => {
    expect(createRng(1).shuffle([])).toEqual([]);
    expect(createRng(1).shuffle(['x'])).toEqual(['x']);
  });
});

describe('sample', () => {
  const input = Array.from({ length: 10 }, (_, i) => i);

  it('returns n distinct elements of the input', () => {
    const out = createRng(11).sample(input, 4);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
    for (const v of out) expect(input).toContain(v);
  });

  it('returns everything when n equals the length', () => {
    const out = createRng(11).sample(input, 10);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('returns an empty array for n = 0', () => {
    expect(createRng(11).sample(input, 0)).toEqual([]);
  });

  it('throws when n is greater than the length', () => {
    expect(() => createRng(11).sample(input, 11)).toThrow();
  });

  it('does not mutate the input and is deterministic per seed', () => {
    const copy = [...input];
    const a = createRng(12).sample(input, 5);
    expect(input).toEqual(copy);
    expect(createRng(12).sample(input, 5)).toEqual(a);
  });
});

describe('fork', () => {
  it('gives the same stream for the same label from the same seed', () => {
    expect(draw(createRng(20261019).fork('clients'), 50)).toEqual(draw(createRng(20261019).fork('clients'), 50));
  });

  it('gives different streams for different labels', () => {
    const root = createRng(20261019);
    expect(draw(root.fork('a'), 20)).not.toEqual(draw(root.fork('b'), 20));
  });

  it('gives different streams for the same label under different seeds', () => {
    expect(draw(createRng(1).fork('a'), 20)).not.toEqual(draw(createRng(2).fork('a'), 20));
  });

  it('is unchanged when another fork draws more values', () => {
    const quiet = createRng(42);
    const quietA = draw(quiet.fork('a'), 30);

    const busy = createRng(42);
    const busyB = busy.fork('b');
    draw(busyB, 5000);
    expect(draw(busy.fork('a'), 30)).toEqual(quietA);
  });

  it('is unchanged by the order in which forks are created and drawn', () => {
    const first = createRng(42);
    const a1 = first.fork('a');
    const b1 = first.fork('b');
    const aValues1 = draw(a1, 10);
    const bValues1 = draw(b1, 10);

    const second = createRng(42);
    const b2 = second.fork('b');
    const a2 = second.fork('a');
    const bValues2 = draw(b2, 10);
    const aValues2 = draw(a2, 10);

    expect(aValues2).toEqual(aValues1);
    expect(bValues2).toEqual(bValues1);
  });

  it('does not depend on how many values the parent has already drawn', () => {
    const fresh = createRng(42).fork('a');
    const used = createRng(42);
    draw(used, 123);
    expect(draw(used.fork('a'), 20)).toEqual(draw(fresh, 20));
  });

  it('does not advance the parent stream', () => {
    const withFork = createRng(42);
    withFork.fork('a');
    draw(withFork.fork('b'), 100);
    expect(draw(withFork, 20)).toEqual(draw(createRng(42), 20));
  });

  it('can be forked again and nested forks are deterministic', () => {
    const a = createRng(42).fork('x').fork('y');
    const b = createRng(42).fork('x').fork('y');
    expect(draw(a, 10)).toEqual(draw(b, 10));
    expect(draw(createRng(42).fork('x').fork('y'), 10)).not.toEqual(draw(createRng(42).fork('x').fork('z'), 10));
  });
});
