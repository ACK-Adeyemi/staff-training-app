// F-2: ulid(clock, rng) is deterministic for a given clock and rng and sorts by time.
import { describe, expect, it } from 'vitest';
import { fixedClock, offsetClock } from './clock';
import { ulid } from './ids';
import { createRng } from './rng';

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = '2026-10-19T09:00:00.000Z';

describe('ulid', () => {
  it('is 26 characters from the Crockford base32 alphabet (no I, L, O or U, upper case)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const id = ulid(fixedClock(TODAY), rng);
      expect(id).toHaveLength(26);
      expect(id).toMatch(CROCKFORD);
    }
  });

  it('is deterministic for the same clock and a fresh rng with the same seed', () => {
    expect(ulid(fixedClock(TODAY), createRng(20261019))).toBe(ulid(fixedClock(TODAY), createRng(20261019)));
  });

  it('gives a different id for a different seed at the same time', () => {
    expect(ulid(fixedClock(TODAY), createRng(1))).not.toBe(ulid(fixedClock(TODAY), createRng(2)));
  });

  it('gives different ids on successive calls from one rng at one instant', () => {
    const rng = createRng(5);
    const clock = fixedClock(TODAY);
    const ids = new Set(Array.from({ length: 500 }, () => ulid(clock, rng)));
    expect(ids.size).toBe(500);
  });

  it('shares the 10-character time prefix at one instant and varies the 16-character random part', () => {
    const rng = createRng(5);
    const clock = fixedClock(TODAY);
    const a = ulid(clock, rng);
    const b = ulid(clock, rng);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
    expect(a.slice(10)).not.toBe(b.slice(10));
  });

  it('encodes the clock time in the first 10 characters (milliseconds since the epoch)', () => {
    expect(ulid(fixedClock('1970-01-01T00:00:00.000Z'), createRng(1)).slice(0, 10)).toBe('0000000000');
    expect(ulid(fixedClock('1970-01-01T00:00:00.001Z'), createRng(1)).slice(0, 10)).toBe('0000000001');
    expect(ulid(fixedClock('1970-01-01T00:00:00.032Z'), createRng(1)).slice(0, 10)).toBe('0000000010');
    // Decode the prefix of a real timestamp back to milliseconds.
    const prefix = ulid(fixedClock(TODAY), createRng(1)).slice(0, 10);
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const decoded = Array.from(prefix).reduce((acc, ch) => acc * 32 + alphabet.indexOf(ch), 0);
    expect(decoded).toBe(new Date(TODAY).getTime());
  });

  it('sorts later clock times after earlier ones, whatever the random part', () => {
    const rng = createRng(77);
    const base = fixedClock(TODAY);
    const times = [0, 1, 999, DAY_MS, 30 * DAY_MS, 400 * DAY_MS];
    const ids = times.map((offset) => ulid(offsetClock(base, offset), rng));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sorts a 1 ms later id after an earlier one even when the random parts would sort the other way', () => {
    // Try many seeds so that at least some random parts of the earlier id are larger.
    for (let seed = 0; seed < 100; seed++) {
      const early = ulid(fixedClock('2026-10-19T09:00:00.000Z'), createRng(seed));
      const late = ulid(fixedClock('2026-10-19T09:00:00.001Z'), createRng(seed + 1000));
      expect(late > early).toBe(true);
    }
  });

  it('draws only from the injected rng (same rng position gives the same random part)', () => {
    const a = createRng(9);
    const b = createRng(9);
    a.next();
    b.next();
    expect(ulid(fixedClock(TODAY), a)).toBe(ulid(fixedClock(TODAY), b));
  });
});
