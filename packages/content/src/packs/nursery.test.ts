// Chunk 6 (F-5): the nursery pack validates against the domain schema and carries the M0 requirements.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { industryPackSchema, requirementApplies, term, type Person, type Site } from '@sta/domain';
import { nurseryPack } from './nursery';
import { moduleIds } from './moduleIds';

const byName = (name: string) => {
  const found = nurseryPack.requirements.find((r) => r.name === name);
  if (!found) throw new Error(`Requirement not found: ${name}`);
  return found;
};

describe('nursery pack', () => {
  it('validates against industryPackSchema', () => {
    const result = industryPackSchema.safeParse(nurseryPack);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('is a full pack', () => {
    expect(nurseryPack.status).toBe('full');
    expect(nurseryPack.name.toLowerCase()).toContain('nurser');
  });

  it('uses nursery terminology for setting, room and inspector-ready exports', () => {
    expect(term(nurseryPack, 'site')).toBe('setting');
    expect(term(nurseryPack, 'team')).toBe('room');
    expect(term(nurseryPack, 'auditExport')).toBe('Inspector-ready');
  });

  it('has exactly the eight nursery job roles', () => {
    expect(nurseryPack.jobRoles.map((r) => r.name).sort()).toEqual(
      [
        'Nursery Manager',
        'Deputy Manager',
        'Designated Safeguarding Lead',
        'Room Leader',
        'Practitioner',
        'Apprentice',
        'Cook',
        'Bank Practitioner',
      ].sort(),
    );
  });

  it('has exactly the five M0 requirements', () => {
    expect(nurseryPack.requirements.map((r) => r.name).sort()).toEqual(
      [
        'Safeguarding',
        'Paediatric first aid',
        'Food hygiene',
        'What changed in September 2026',
        'New starter induction',
      ].sort(),
    );
  });

  it('has unique requirement ids and unique job role ids', () => {
    const reqIds = nurseryPack.requirements.map((r) => r.id);
    const roleIds = nurseryPack.jobRoles.map((r) => r.id);
    expect(new Set(reqIds).size).toBe(reqIds.length);
    expect(new Set(roleIds).size).toBe(roleIds.length);
  });

  it('tags every requirement and job role with the pack id and no client id', () => {
    for (const item of [...nurseryPack.requirements, ...nurseryPack.jobRoles]) {
      expect(item.packId).toBe(nurseryPack.id);
      expect(item.clientId).toBeUndefined();
    }
  });

  it('renews safeguarding every 24 months and accepts external certificates', () => {
    const r = byName('Safeguarding');
    expect(r.renewEveryMonths).toBe(24);
    expect(r.acceptsExternal).toBe(true);
    expect(r.appliesTo.all).toBe(true);
  });

  it('renews paediatric first aid every 36 months, accepts external and reads expiry from the certificate', () => {
    const r = byName('Paediatric first aid');
    expect(r.renewEveryMonths).toBe(36);
    expect(r.acceptsExternal).toBe(true);
    expect(r.expiryMode).toBe('fromCertificate');
  });

  it('renews food hygiene every 36 months for the Cook role only', () => {
    const r = byName('Food hygiene');
    const cook = nurseryPack.jobRoles.find((j) => j.name === 'Cook');
    expect(r.renewEveryMonths).toBe(36);
    expect(r.acceptsExternal).toBe(true);
    expect(r.appliesTo.all).toBeFalsy();
    expect(r.appliesTo.jobRoleIds).toEqual([cook?.id]);
  });

  it('applies the food hygiene requirement to a cook but not to a practitioner', () => {
    const cook = nurseryPack.jobRoles.find((j) => j.name === 'Cook');
    const practitioner = nurseryPack.jobRoles.find((j) => j.name === 'Practitioner');
    const site = { attributes: {} } as unknown as Site;
    const person = (jobRoleId: string) => ({ status: 'active', jobRoleIds: [jobRoleId] }) as unknown as Person;
    const r = byName('Food hygiene');
    expect(requirementApplies(r, person(cook?.id ?? ''), site)).toBe(true);
    expect(requirementApplies(r, person(practitioner?.id ?? ''), site)).toBe(false);
  });

  it.each(['What changed in September 2026', 'New starter induction'])(
    'has no renewal for %s and applies to everyone',
    (name) => {
      const r = byName(name);
      expect(r.renewEveryMonths).toBeUndefined();
      expect(r.appliesTo.all).toBe(true);
    },
  );

  it('references only stable module id constants, one or more per requirement', () => {
    const known = new Set<string>(Object.values(moduleIds));
    expect(known.size).toBeGreaterThanOrEqual(5);
    for (const r of nurseryPack.requirements) {
      const training = r.evidence.includes('module');
      if (training) expect(r.satisfiedByModuleIds.length).toBeGreaterThan(0);
      for (const id of r.satisfiedByModuleIds) expect(known.has(id)).toBe(true);
    }
  });

  it('has unique module id constants that are valid ids', () => {
    const values = Object.values(moduleIds);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('marks placeholder renewal periods with VERIFY in the source', () => {
    const src = readFileSync(fileURLToPath(new URL('./nursery.ts', import.meta.url)), 'utf8');
    expect(src).toContain('VERIFY');
  });
});
