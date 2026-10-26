// Chunk 6: packages and add-ons match brief 20.3 (Option A) and 20.4 (Option B).
import { describe, expect, it } from 'vitest';
import { addOnSchema, packageSchema, type Package } from '@sta/domain';
import { addOnIds, addOns, floorPackageId, packageIds, packages } from './packages';
import * as content from './index';

const pkg = (id: string): Package => {
  const found = packages.find((p) => p.id === id);
  if (!found) throw new Error(`Package not found: ${id}`);
  return found;
};
const essentials = () => pkg(packageIds.essentials).entitlements;
const standard = () => pkg(packageIds.standard).entitlements;
const group = () => pkg(packageIds.group).entitlements;
const core = () => pkg(packageIds.core).entitlements;

describe('packages', () => {
  it('parses every package with packageSchema', () => {
    expect(packages).toHaveLength(4);
    for (const p of packages) {
      const result = packageSchema.safeParse(p);
      expect(result.error?.issues ?? []).toEqual([]);
    }
  });

  it('has Essentials, Standard and Group under Option A and Core under Option B', () => {
    expect(pkg(packageIds.essentials).name).toBe('Essentials');
    expect(pkg(packageIds.standard).name).toBe('Standard');
    expect(pkg(packageIds.group).name).toBe('Group');
    expect(pkg(packageIds.core).name).toBe('Core');
    expect(
      packages
        .filter((p) => p.option === 'A')
        .map((p) => p.id)
        .sort(),
    ).toEqual([packageIds.essentials, packageIds.standard, packageIds.group].sort());
    expect(pkg(packageIds.core).option).toBe('B');
  });

  it('has unique package ids', () => {
    expect(new Set(packages.map((p) => p.id)).size).toBe(packages.length);
  });

  it('makes Essentials the floor package', () => {
    expect(floorPackageId).toBe(packageIds.essentials);
    expect(packages.some((p) => p.id === floorPackageId)).toBe(true);
  });

  it('gives Essentials the brief 20.3 limits', () => {
    expect(essentials()).toMatchObject({
      ownModules: 3,
      admins: 1,
      savedThemes: 1,
      autoAssignRules: 2,
      liveCompetitions: 1,
      battlesPerMonth: 2,
      maxBattlePlayers: 10,
      closedBookCompetitions: false,
      multiSite: false,
      logoBranding: false,
      integrations: false,
      crossSiteBattles: false,
    });
  });

  it('gives Standard the brief 20.3 limits', () => {
    expect(standard()).toMatchObject({
      ownModules: 'unlimited',
      liveCompetitions: 'unlimited',
      closedBookCompetitions: true,
      admins: 3,
      savedThemes: 5,
      autoAssignRules: 'unlimited',
      battlesPerMonth: 'unlimited',
      maxBattlePlayers: 30,
      multiSite: false,
      logoBranding: false,
      integrations: false,
      crossSiteBattles: false,
    });
  });

  it('gives Group multi-site, unlimited admins and themes, branding, integrations and 50-player cross-site battles', () => {
    expect(group()).toMatchObject({
      ownModules: 'unlimited',
      liveCompetitions: 'unlimited',
      closedBookCompetitions: true,
      autoAssignRules: 'unlimited',
      battlesPerMonth: 'unlimited',
      multiSite: true,
      admins: 'unlimited',
      savedThemes: 'unlimited',
      logoBranding: true,
      integrations: true,
      maxBattlePlayers: 50,
      crossSiteBattles: true,
    });
  });

  it('gives Option B Core the brief 20.4 limits and leaves multi-site, branding and integrations to add-ons', () => {
    expect(core()).toMatchObject({
      ownModules: 'unlimited',
      liveCompetitions: 'unlimited',
      savedThemes: 3,
      admins: 3,
      autoAssignRules: 'unlimited',
      battlesPerMonth: 'unlimited',
      maxBattlePlayers: 30,
      multiSite: false,
      crossSiteBattles: false,
      logoBranding: false,
      integrations: false,
    });
  });

  it('promises faster support response as the tiers go up (targets, not access)', () => {
    expect(essentials().responseTargetHours).toBeGreaterThan(standard().responseTargetHours);
    expect(standard().responseTargetHours).toBeGreaterThan(group().responseTargetHours);
    expect(group().responseTargetHours).toBeGreaterThan(0);
  });

  it('has three placeholder staff bands per package: up to 15, 16 to 40, 41 or more', () => {
    for (const p of packages) {
      expect(p.bands).toHaveLength(3);
      expect(p.bands[0]?.maxStaff).toBe(15);
      expect(p.bands[1]?.maxStaff).toBe(40);
      expect(p.bands[2]?.maxStaff).toBeGreaterThan(40);
    }
  });

  it('prices bands in whole pence, rising with staff numbers, and Group above Essentials', () => {
    for (const p of packages) {
      const prices = p.bands.map((b) => b.pricePerSite);
      const [p0 = 0, p1 = 0, p2 = 0] = prices;
      for (const price of prices) expect(Number.isInteger(price)).toBe(true);
      expect(p0).toBeGreaterThan(0);
      expect(p1).toBeGreaterThanOrEqual(p0);
      expect(p2).toBeGreaterThanOrEqual(p1);
    }
    expect(pkg(packageIds.group).bands[0]?.pricePerSite ?? 0).toBeGreaterThan(
      pkg(packageIds.essentials).bands[0]?.pricePerSite ?? 0,
    );
  });

  it('is re-exported from the package entry point', () => {
    expect(content.packages).toBe(packages);
    expect(content.addOns).toBe(addOns);
    expect(content.floorPackageId).toBe(floorPackageId);
  });
});

describe('add-ons', () => {
  it('parses every add-on with addOnSchema', () => {
    for (const a of addOns) {
      const result = addOnSchema.safeParse(a);
      expect(result.error?.issues ?? []).toEqual([]);
    }
  });

  it('includes the five brief 20.3 add-ons by id and name', () => {
    const name = (id: string) => addOns.find((a) => a.id === id)?.name.toLowerCase() ?? '';
    expect(name(addOnIds.aiAssistant)).toContain('ai assistant');
    expect(name(addOnIds.translation)).toContain('translation');
    expect(name(addOnIds.reminders)).toMatch(/sms|whatsapp/);
    expect(name(addOnIds.extraContentPack)).toContain('content pack');
    expect(name(addOnIds.onboarding)).toContain('onboarding');
  });

  it('has unique add-on ids with placeholder prices in whole pence', () => {
    expect(new Set(addOns.map((a) => a.id)).size).toBe(addOns.length);
    for (const a of addOns) {
      const price = a.pricing.kind === 'flat' ? a.pricing.price : a.pricing.pricePerUnit;
      expect(Number.isInteger(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
    }
  });

  it('does not reuse a package id for an add-on', () => {
    const pkgIds = new Set(packages.map((p) => p.id));
    for (const a of addOns) expect(pkgIds.has(a.id)).toBe(false);
  });
});
