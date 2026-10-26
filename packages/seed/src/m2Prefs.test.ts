// M2 chunk 1: the seed's BASE_PREFS carries the new preference fields and sound is off by default
// (plan conflict 2; brief 19.3). Persona-specific prefs arrive in the seed chunk.
import { describe, expect, it } from 'vitest';
import { learnerPrefsSchema, type Person } from '@sta/domain';
import { seeded } from './testing';

describe('seeded learner prefs', () => {
  it('parse against the current learnerPrefsSchema for every person', async () => {
    const { dump } = await seeded();
    const people = dump['people'] as Person[];
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      expect(learnerPrefsSchema.safeParse(p.prefs).success, p.firstName).toBe(true);
    }
  });

  it('store the new fields explicitly with their defaults', async () => {
    const { dump } = await seeded();
    for (const p of dump['people'] as Person[]) {
      expect(p.prefs.spacing, p.firstName).toBe('standard');
      expect(p.prefs.readAloud, p.firstName).toBe(true);
      expect(p.prefs.readAloudRate, p.firstName).toBe(1);
    }
  });

  it('have sound off for everyone', async () => {
    const { dump } = await seeded();
    for (const p of dump['people'] as Person[]) expect(p.prefs.sound, p.firstName).toBe(false);
  });
});
