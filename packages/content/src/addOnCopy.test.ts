// M3 chunk 5 (BP-11): add-on card copy. Contract: addOnCopy.ts exports addOnCopy: Record<addOnId, { whatKey; exampleKey }>.
import { describe, expect, it } from 'vitest';
import enGB from './lang/en-GB.json';
import { addOnIds, addOns } from './packages';
import { addOnCopy } from './addOnCopy';

const lookup = (key: string): string | undefined => {
  const v = key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), enGB);
  return typeof v === 'string' ? v : undefined;
};

describe('add-on copy', () => {
  it('has copy for every add-on and nothing else', () => {
    expect(Object.keys(addOnCopy).sort()).toEqual(Object.values(addOnIds).sort());
    for (const a of addOns) expect(addOnCopy[a.id], a.name).toBeDefined();
  });

  it('points at real, non-empty strings that explain and give an example', () => {
    for (const [id, c] of Object.entries(addOnCopy)) {
      expect(lookup(c.whatKey), `${id} what`).toBeTruthy();
      expect(lookup(c.exampleKey), `${id} example`).toBeTruthy();
      expect(lookup(c.whatKey)).not.toBe(lookup(c.exampleKey));
    }
  });

  it('holds no prices (they come from the add-on records)', () => {
    for (const c of Object.values(addOnCopy)) {
      expect(lookup(c.whatKey)).not.toMatch(/[£$€]/);
      expect(lookup(c.exampleKey)).not.toMatch(/[£$€]/);
    }
  });
});
