// M4 chunk 4b (BP-6): the pure helper that picks which package an account is evaluated on under Option A or B.
// `packageForOption(pkg, packages, option)` is exported from the domain index (the contract the implementer adds).
// Fixtures mirror the shape of packages/content/src/packages.ts (domain cannot import content).
import { describe, expect, it } from 'vitest';
import { entitlements, packageForOption, type Entitlements, type Package } from './index';

const base: Entitlements = {
  ownModules: 3,
  savedThemes: 1,
  admins: 1,
  autoAssignRules: 2,
  liveCompetitions: 1,
  customClientRoles: 0,
  closedBookCompetitions: false,
  multiSite: false,
  logoBranding: false,
  perSiteThemes: false,
  integrations: false,
  responseTargetHours: 48,
  battlesPerMonth: 2,
  maxBattlePlayers: 10,
  crossSiteBattles: false,
};
const bands = (n: number): Package['bands'] => [{ maxStaff: 200, pricePerSite: n }];
const pkg = (n: number, name: string, option: 'A' | 'B', e: Partial<Entitlements>): Package => ({
  id: String(n).padStart(26, '0'),
  name,
  option,
  bands: bands(n),
  entitlements: { ...base, ...e },
});
const essentials = pkg(301, 'Essentials', 'A', {});
const standard = pkg(302, 'Standard', 'A', { savedThemes: 5, customClientRoles: 3, closedBookCompetitions: true });
const group = pkg(303, 'Group', 'A', { savedThemes: 'unlimited', customClientRoles: 'unlimited', multiSite: true });
const core = pkg(304, 'Core', 'B', { savedThemes: 3, customClientRoles: 3, closedBookCompetitions: true });
const packages = [essentials, standard, group, core];

describe('packageForOption', () => {
  it('keeps an Option A package under Option A', () => {
    for (const p of [essentials, standard, group]) {
      expect(packageForOption(p, packages, 'A').id).toBe(p.id);
    }
  });

  it('maps every Option A package to the Option B package under Option B', () => {
    for (const p of [essentials, standard, group]) {
      const used = packageForOption(p, packages, 'B');
      expect(used.id).toBe(core.id);
      expect(used.option).toBe('B');
    }
  });

  it('keeps the Option B package under Option B', () => {
    expect(packageForOption(core, packages, 'B').id).toBe(core.id);
  });

  it('gives different custom role, saved theme and closed-book limits for Essentials under A and under B', () => {
    const underA = entitlements(packageForOption(essentials, packages, 'A'), [], 'active', essentials);
    const underB = entitlements(packageForOption(essentials, packages, 'B'), [], 'active', essentials);
    expect(underA.customClientRoles).toBe(0);
    expect(underA.savedThemes).toBe(1);
    expect(underA.closedBookCompetitions).toBe(false);
    expect(underB.customClientRoles).toBe(3);
    expect(underB.savedThemes).toBe(3);
    expect(underB.closedBookCompetitions).toBe(true);
  });
});
