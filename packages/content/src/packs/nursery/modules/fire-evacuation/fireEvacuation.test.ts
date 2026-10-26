// M3 chunk 5 (BP-1, BP-14): the client-owned Fire evacuation sample module. Plan docs/plans/m3.md, Content package.
// Contract: ./index exports buildFireEvacuationModule({ id, clientId, siteId? }): Module (it is not part of nurseryModules).
import { describe, expect, it } from 'vitest';
import { moduleSchema } from '@sta/domain';
import { nurseryModules } from '../index';
import { buildFireEvacuationModule } from './index';

const mod = buildFireEvacuationModule({ id: 'fire-evac-test', clientId: 'client-test' });
const size = (i: number): number => JSON.stringify(mod.lessons[i]?.blocks ?? []).length;

describe('Fire evacuation sample module', () => {
  it('parses with moduleSchema', () => {
    const r = moduleSchema.safeParse(mod);
    expect(r.error?.issues ?? []).toEqual([]);
    expect(r.success).toBe(true);
  });

  it('is owned by the client it is built for, is published and is not optional-flagged', () => {
    expect(mod.owner).toEqual({ clientId: 'client-test' });
    expect(mod.id).toBe('fire-evac-test');
    expect(mod.status).toBe('published');
    expect(mod.title).toMatch(/fire/i);
  });

  it('keeps the site when one is given', () => {
    const m = buildFireEvacuationModule({ id: 'x', clientId: 'c', siteId: 's' });
    expect(m.owner).toEqual({ clientId: 'c', siteId: 's' });
  });

  it('has three lessons', () => {
    expect(mod.lessons).toHaveLength(3);
    expect(mod.lessons.map((l) => l.title.toLowerCase()).join(' | ')).toMatch(/alarm/);
    expect(mod.lessons[1]?.title.toLowerCase()).toMatch(/children|babies|cots/);
    expect(mod.lessons[2]?.title.toLowerCase()).toMatch(/assembly|register|roll/);
  });

  it('has six questions: four multiple choice and two true or false', () => {
    expect(mod.questions).toHaveLength(6);
    expect(mod.questions.filter((q) => q.type === 'mcq')).toHaveLength(4);
    expect(mod.questions.filter((q) => q.type === 'trueFalse')).toHaveLength(2);
  });

  it('makes lesson 2 clearly the longest, so the demo drop-off and Unclear feedback fit', () => {
    expect(size(1)).toBeGreaterThan(size(0));
    expect(size(1)).toBeGreaterThan(size(2));
  });

  it('has lessons with real content', () => {
    for (let i = 0; i < 3; i++) expect(size(i), `lesson ${i + 1}`).toBeGreaterThan(200);
  });

  it('mentions babies and cots in lesson 2 and the register in lesson 3', () => {
    expect(JSON.stringify(mod.lessons[1]?.blocks).toLowerCase()).toMatch(/cot/);
    expect(JSON.stringify(mod.lessons[2]?.blocks).toLowerCase()).toMatch(/register|roll call/);
  });

  it('is not exported in nurseryModules (it is seeded as the client own module)', () => {
    expect(nurseryModules.some((m) => /fire/i.test(m.title))).toBe(false);
    expect(nurseryModules).toHaveLength(5);
  });

  it('makes no EYFS claim beyond paragraph 3.58', () => {
    const text = JSON.stringify(mod);
    const paras = text.match(/\b3\.\d+\b/g) ?? [];
    for (const p of paras) expect(p).toBe('3.58');
  });

  it('uses fictional site details only (no real company or phone numbers)', () => {
    expect(JSON.stringify(mod)).not.toMatch(/\b0\d{9,10}\b|https?:\/\/(?!www\.gov\.uk|www\.legislation\.gov\.uk|www\.hse\.gov\.uk|assets\.publishing\.service\.gov\.uk)/);
  });
});
