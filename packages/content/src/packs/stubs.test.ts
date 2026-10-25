// Chunk 6 (F-5): the four stub packs and the luxury retail placeholder exist and are marked as stubs.
import { describe, expect, it } from 'vitest';
import { industryPackSchema } from '@sta/domain';
import { allPacks, luxuryRetailPlaceholder, stubPacks } from './stubs';
import { nurseryPack } from './nursery';
import * as content from '../index';

describe('stub packs', () => {
  it('has exactly four stubs: schools, social care, hospitality and construction', () => {
    expect(stubPacks).toHaveLength(4);
    const names = stubPacks.map((p) => p.name.toLowerCase()).join(' | ');
    for (const word of ['school', 'social care', 'hospitality', 'construction']) {
      expect(names).toContain(word);
    }
  });

  it.each([
    ['stub', () => stubPacks],
    ['luxury placeholder', () => [luxuryRetailPlaceholder]],
  ])('validates every %s against industryPackSchema', (_label, get) => {
    for (const p of get()) {
      const result = industryPackSchema.safeParse(p);
      expect(result.error?.issues ?? []).toEqual([]);
    }
  });

  it('marks every stub and the luxury retail placeholder with status stub', () => {
    for (const p of [...stubPacks, luxuryRetailPlaceholder]) expect(p.status).toBe('stub');
  });

  it('gives stubs a name and terminology only, with no roles or requirements', () => {
    for (const p of [...stubPacks, luxuryRetailPlaceholder]) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(Object.keys(p.terminology).length).toBeGreaterThan(0);
      expect(p.jobRoles).toEqual([]);
      expect(p.requirements).toEqual([]);
    }
  });

  it('names the placeholder as luxury retail', () => {
    expect(luxuryRetailPlaceholder.name.toLowerCase()).toContain('luxury');
  });

  it('lists the nursery pack and all five stubs in allPacks with unique ids', () => {
    expect(allPacks).toHaveLength(6);
    expect(allPacks).toContain(nurseryPack);
    const ids = allPacks.map((p) => p.id);
    expect(new Set(ids).size).toBe(6);
    expect(allPacks.filter((p) => p.status === 'full')).toEqual([nurseryPack]);
  });

  it('re-exports the packs from the package entry point', () => {
    expect(content.nurseryPack).toBe(nurseryPack);
    expect(content.allPacks).toBe(allPacks);
  });
});
