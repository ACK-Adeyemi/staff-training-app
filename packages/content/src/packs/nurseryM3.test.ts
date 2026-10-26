// M3 chunk 5 (BP-2, BP-5, BP-15): nursery pack additions.
// Contract (packs/nursery.ts): export firstAidRequirementKey (= the Paediatric first aid requirement id) and
// nurseryDefaultRules: { key; name; enabled; trigger; filters: { jobRoleIds? }; action: { moduleId }; dueInDays }[]
// (autoAssignRuleSchema minus id, clientId, siteId). nurseryPack.defaultRules is set to the same list.
import { describe, expect, it } from 'vitest';
import { autoAssignRuleSchema, industryPackSchema } from '@sta/domain';
import { firstAidRequirementKey, nurseryDefaultRules, nurseryPack } from './nursery';
import { moduleIds } from './moduleIds';

const req = (name: string) => {
  const r = nurseryPack.requirements.find((x) => x.name === name);
  if (!r) throw new Error(name);
  return r;
};

describe('nursery pack: first aid key', () => {
  it('names the Paediatric first aid requirement', () => {
    expect(firstAidRequirementKey).toBe(req('Paediatric first aid').id);
  });
});

describe('nursery pack: default auto-assign rules (build pack 7.4)', () => {
  const parse = (r: (typeof nurseryDefaultRules)[number]) =>
    autoAssignRuleSchema.safeParse({ ...r, id: '01HZZZZZZZZZZZZZZZZZZZZZZ3', clientId: '01HZZZZZZZZZZZZZZZZZZZZZZ2' });

  it('has three rules that each pass autoAssignRuleSchema', () => {
    expect(nurseryDefaultRules).toHaveLength(3);
    for (const r of nurseryDefaultRules) expect(parse(r).error?.issues ?? [], r.key).toEqual([]);
    expect(new Set(nurseryDefaultRules.map((r) => r.key)).size).toBe(3);
  });

  it('assigns New starter induction to new Practitioners, due in 14 days', () => {
    const r = nurseryDefaultRules.find((x) => x.trigger.type === 'personAdded');
    expect(r?.action).toEqual({ moduleId: moduleIds.newStarterInduction });
    expect(r?.dueInDays).toBe(14);
    const practitioner = nurseryPack.jobRoles.find((j) => j.name === 'Practitioner');
    expect(r?.filters.jobRoleIds).toEqual([practitioner?.id]);
  });

  it('assigns the safeguarding refresher 60 days before expiry', () => {
    const r = nurseryDefaultRules.find((x) => x.trigger.type === 'requirementExpiring');
    expect(r?.trigger).toEqual({ type: 'requirementExpiring', days: 60, requirementId: req('Safeguarding').id });
    expect(r?.action).toEqual({ moduleId: moduleIds.safeguardingAndWhistleblowing });
  });

  it('assigns What changed in September 2026 to everyone', () => {
    const r = nurseryDefaultRules.find(
      (x) => 'moduleId' in x.action && x.action.moduleId === moduleIds.whatChangedSeptember2026,
    );
    expect(r).toBeDefined();
    expect(r?.filters.jobRoleIds ?? []).toEqual([]);
  });

  it('is mirrored in nurseryPack.defaultRules and the pack still validates', () => {
    expect(nurseryPack.defaultRules).toHaveLength(3);
    expect(industryPackSchema.safeParse(nurseryPack).success).toBe(true);
  });
});

describe('nursery pack: accepted providers and approver checklists', () => {
  it.each(['Paediatric first aid', 'Safeguarding', 'Food hygiene'])('%s has providers and a checklist', (name) => {
    const r = req(name);
    expect(r.acceptsExternal).toBe(true);
    expect(r.acceptedProviders.length).toBeGreaterThanOrEqual(2);
    for (const p of r.acceptedProviders) expect(p.name.trim().length).toBeGreaterThan(3);
    expect(r.approverChecklist.length).toBeGreaterThanOrEqual(3);
    for (const c of r.approverChecklist) expect(c.trim().length).toBeGreaterThan(10);
  });

  it('asks for the date and the name on every checklist', () => {
    for (const name of ['Paediatric first aid', 'Safeguarding', 'Food hygiene']) {
      const joined = req(name).approverChecklist.join(' ').toLowerCase();
      expect(joined, name).toContain('name');
      expect(joined, name).toMatch(/date/);
    }
  });

  it('checks first aid for a paediatric course', () => {
    expect(req('Paediatric first aid').approverChecklist.join(' ').toLowerCase()).toMatch(/paediatric|children|infant/);
  });

  it('leaves requirements that take no external evidence without providers', () => {
    expect(req('What changed in September 2026').acceptedProviders).toEqual([]);
  });
});
