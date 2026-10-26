// F-1: levels (plan M2 assumption 5). Thresholds 0, 100, 250, ... 3200, then +800 per level.
import { describe, expect, it } from 'vitest';
import { levelFor } from './levels';

const T = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

describe('levelFor', () => {
  it.each([
    [0, { level: 1, xpIntoLevel: 0, xpForNext: 100 }],
    [99, { level: 1, xpIntoLevel: 99, xpForNext: 100 }],
    [100, { level: 2, xpIntoLevel: 0, xpForNext: 150 }],
    [450, { level: 4, xpIntoLevel: 0, xpForNext: 250 }],
    [3199, { level: 9, xpIntoLevel: 699, xpForNext: 700 }],
    [3200, { level: 10, xpIntoLevel: 0, xpForNext: 800 }],
    [4000, { level: 11, xpIntoLevel: 0, xpForNext: 800 }],
    [4001, { level: 11, xpIntoLevel: 1, xpForNext: 800 }],
  ])('puts %i XP at %o', (xp, expected) => {
    expect(levelFor(xp, T)).toEqual(expected);
  });

  it('keeps adding 800 per level far beyond the table', () => {
    expect(levelFor(3200 + 800 * 5 + 10, T)).toEqual({ level: 15, xpIntoLevel: 10, xpForNext: 800 });
  });

  it('never goes below level 1 for negative input', () => {
    expect(levelFor(-5, T).level).toBe(1);
  });
});
