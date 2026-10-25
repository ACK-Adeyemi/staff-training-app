// BP-7 (part): entitlements, written before the implementation (M0 chunk 5). Brief 20.2 to 20.6, 24.4, 24.9.
//
// API under test (entitlements.ts):
//   type EntitlementLimitKey = 'ownModules' | 'savedThemes' | 'admins' | 'autoAssignRules' | 'liveCompetitions'
//     | 'customClientRoles' | 'battlesPerMonth'   (the keys of Entitlements whose value is number | 'unlimited')
//   entitlements(pkg: Package, activeAddOns: AddOn[], accountState: AccountState, floorPkg: Package)
//     : Entitlements & { flags: string[] }
//   entitled(ents: Entitlements & { flags: string[] }, feature: string): boolean
//   checkLimit(ents, usage: Partial<Record<EntitlementLimitKey, number>>, key: EntitlementLimitKey)
//     : { allowed: boolean; used: number; limit: number | 'unlimited' }
//
// Conventions chosen where the plan left them open:
//  - Add-on `adds` merge: a limit in `adds` replaces the package value only when it is larger ('unlimited' is largest);
//    a boolean in `adds` is OR-ed; `adds.flags` are unioned (no duplicates) into `flags`. Several add-ons merge in turn.
//  - Accounts in trial, active and pastDue get package plus add-ons. Limited, readOnly, closed, paused and deleted get
//    floorPkg.entitlements exactly, with flags [] (add-ons off).
//  - entitled(): true for a boolean entitlement that is true, true for a name present in `flags`, true for a limit key
//    whose value is 'unlimited' or above 0, false for anything else, including unknown names.
//  - checkLimit: `allowed` means one more item may be added (used < limit); 'unlimited' is always allowed; a missing
//    usage entry counts as 0.
import { describe, expect, it } from 'vitest';
import type { AccountState } from './schemas/primitives';
import type { AddOn, Entitlements, Package } from './schemas/commercial';
import { idSchema } from './schemas/primitives';
import { checkLimit, entitled, entitlements } from './entitlements';

const id = (tag: string): string => {
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const base: Entitlements = {
  ownModules: 3,
  savedThemes: 1,
  admins: 1,
  autoAssignRules: 2,
  liveCompetitions: 1,
  customClientRoles: 2,
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

const pkg = (tag: string, option: 'A' | 'B', e: Partial<Entitlements>): Package => ({
  id: id(tag),
  name: tag,
  option,
  bands: [{ maxStaff: 15, pricePerSite: 1000 }],
  entitlements: { ...base, ...e },
});

// Brief 20.3 and 20.4 (placeholder limits).
const essentials = pkg('ESSENTIALS', 'A', {});
const standard = pkg('STANDARD', 'A', {
  ownModules: 'unlimited',
  savedThemes: 5,
  admins: 3,
  autoAssignRules: 'unlimited',
  liveCompetitions: 'unlimited',
  closedBookCompetitions: true,
  battlesPerMonth: 'unlimited',
  maxBattlePlayers: 30,
  responseTargetHours: 24,
});
const group = pkg('GROUP', 'A', {
  ownModules: 'unlimited',
  savedThemes: 'unlimited',
  admins: 'unlimited',
  autoAssignRules: 'unlimited',
  liveCompetitions: 'unlimited',
  closedBookCompetitions: true,
  multiSite: true,
  logoBranding: true,
  integrations: true,
  battlesPerMonth: 'unlimited',
  maxBattlePlayers: 50,
  crossSiteBattles: true,
  responseTargetHours: 4,
});
const core = pkg('CORE', 'B', {
  ownModules: 'unlimited',
  savedThemes: 3,
  admins: 3,
  autoAssignRules: 'unlimited',
  liveCompetitions: 'unlimited',
  closedBookCompetitions: true,
  battlesPerMonth: 'unlimited',
  maxBattlePlayers: 30,
});

const aiAssistant: AddOn = {
  id: id('AIADDON'),
  name: 'AI Assistant',
  pricing: { kind: 'usage', unit: 'question', pricePerUnit: 5, includedUnits: 100 },
  adds: { flags: ['aiAssistant'] },
};
const translation: AddOn = {
  id: id('TRANSLATE'),
  name: 'Translation',
  pricing: { kind: 'flat', price: 1500 },
  adds: { flags: ['translation', 'aiAssistant'] },
};
const brandingPack: AddOn = {
  id: id('BRANDING'),
  name: 'Branding pack',
  pricing: { kind: 'flat', price: 2000 },
  adds: { savedThemes: 'unlimited', logoBranding: true },
};
const extraThemes: AddOn = {
  id: id('EXTRATHEMES'),
  name: 'Extra themes',
  pricing: { kind: 'flat', price: 500 },
  adds: { savedThemes: 4 },
};
const smallerThemes: AddOn = {
  id: id('SMALLTHEMES'),
  name: 'Small themes',
  pricing: { kind: 'flat', price: 500 },
  adds: { savedThemes: 1 },
};

const full = (state: AccountState, p: Package = standard, addOns: AddOn[] = []) =>
  entitlements(p, addOns, state, essentials);

describe('entitlements by package tier', () => {
  it.each([
    ['Essentials', essentials],
    ['Standard', standard],
    ['Group', group],
    ['Core (Option B)', core],
  ] as const)('%s in an active account returns its package limits unchanged', (_name, p) => {
    const result = entitlements(p, [], 'active', essentials);
    const { flags, ...limits } = result;
    expect(limits).toEqual(p.entitlements);
    expect(flags).toEqual([]);
  });

  it('Essentials has finite limits and no multi-site, branding or integrations', () => {
    const e = full('active', essentials);
    expect(e.ownModules).toBe(3);
    expect(e.admins).toBe(1);
    expect(e.savedThemes).toBe(1);
    expect(e.autoAssignRules).toBe(2);
    expect(e.liveCompetitions).toBe(1);
    expect(e.battlesPerMonth).toBe(2);
    expect(e.maxBattlePlayers).toBe(10);
    expect(entitled(e, 'multiSite')).toBe(false);
    expect(entitled(e, 'logoBranding')).toBe(false);
    expect(entitled(e, 'integrations')).toBe(false);
    expect(entitled(e, 'closedBookCompetitions')).toBe(false);
  });

  it('Standard has unlimited own modules and rules, 3 admins, 5 themes and closed-book competitions', () => {
    const e = full('active', standard);
    expect(e.ownModules).toBe('unlimited');
    expect(e.autoAssignRules).toBe('unlimited');
    expect(e.admins).toBe(3);
    expect(e.savedThemes).toBe(5);
    expect(e.maxBattlePlayers).toBe(30);
    expect(entitled(e, 'closedBookCompetitions')).toBe(true);
    expect(entitled(e, 'multiSite')).toBe(false);
  });

  it('Group adds multi-site, logo branding, integrations and cross-site battles', () => {
    const e = full('active', group);
    expect(e.admins).toBe('unlimited');
    expect(e.savedThemes).toBe('unlimited');
    expect(e.maxBattlePlayers).toBe(50);
    for (const feature of ['multiSite', 'logoBranding', 'integrations', 'crossSiteBattles']) {
      expect(entitled(e, feature)).toBe(true);
    }
  });

  it('Core (Option B) has 3 themes and 3 admins and no multi-site until an add-on provides it', () => {
    const e = full('active', core);
    expect(e.savedThemes).toBe(3);
    expect(e.admins).toBe(3);
    expect(entitled(e, 'multiSite')).toBe(false);
    const withMulti = full('active', core, [
      { ...brandingPack, id: id('MULTISITE'), name: 'Multi-site', adds: { multiSite: true, crossSiteBattles: true } },
    ]);
    expect(entitled(withMulti, 'multiSite')).toBe(true);
    expect(entitled(withMulti, 'crossSiteBattles')).toBe(true);
  });

  it('does not mutate the package or the add-ons', () => {
    const before = JSON.stringify([standard, brandingPack]);
    entitlements(standard, [brandingPack], 'active', essentials);
    expect(JSON.stringify([standard, brandingPack])).toBe(before);
  });
});

describe('entitlements with add-ons', () => {
  it('an add-on flag makes entitled() true for that feature and it is false without the add-on', () => {
    expect(entitled(full('active'), 'aiAssistant')).toBe(false);
    const e = full('active', standard, [aiAssistant]);
    expect(e.flags).toEqual(['aiAssistant']);
    expect(entitled(e, 'aiAssistant')).toBe(true);
  });

  it('flags from several add-ons are unioned without duplicates', () => {
    const e = full('active', standard, [aiAssistant, translation]);
    expect([...e.flags].sort()).toEqual(['aiAssistant', 'translation']);
  });

  it('an add-on can raise a limit to unlimited and switch on a boolean', () => {
    const e = full('active', standard, [brandingPack]);
    expect(e.savedThemes).toBe('unlimited');
    expect(entitled(e, 'logoBranding')).toBe(true);
  });

  it('an add-on can raise a numeric limit', () => {
    expect(full('active', essentials, [extraThemes]).savedThemes).toBe(4);
  });

  it('an add-on never lowers a limit the package already gives', () => {
    expect(full('active', standard, [smallerThemes]).savedThemes).toBe(5);
    expect(full('active', group, [extraThemes]).savedThemes).toBe('unlimited');
  });

  it('add-ons leave the other limits alone', () => {
    const e = full('active', essentials, [brandingPack]);
    expect(e.admins).toBe(1);
    expect(e.ownModules).toBe(3);
  });
});

describe('entitlements by account state', () => {
  it.each(['active', 'trial', 'pastDue'] as const)('%s gives the package plus add-ons', (state) => {
    const e = full(state, group, [aiAssistant]);
    expect(e.admins).toBe('unlimited');
    expect(entitled(e, 'multiSite')).toBe(true);
    expect(entitled(e, 'aiAssistant')).toBe(true);
  });

  it.each(['limited', 'readOnly', 'closed', 'paused', 'deleted'] as const)(
    '%s returns the floor entitlements with add-ons off',
    (state) => {
      const e = full(state, group, [aiAssistant, brandingPack]);
      const { flags, ...limits } = e;
      expect(limits).toEqual(essentials.entitlements);
      expect(flags).toEqual([]);
      expect(entitled(e, 'aiAssistant')).toBe(false);
      expect(entitled(e, 'multiSite')).toBe(false);
    },
  );

  it('the floor is whatever floorPkg says, not a hard-coded package', () => {
    const e = entitlements(group, [], 'limited', standard);
    expect(e.savedThemes).toBe(5);
    expect(e.admins).toBe(3);
  });
});

describe('entitled', () => {
  const e = full('active', standard, [aiAssistant]);

  it('is false for an unknown feature', () => {
    expect(entitled(e, 'timeTravel')).toBe(false);
    expect(entitled(e, '')).toBe(false);
  });

  it('is true for a true boolean and false for a false boolean', () => {
    expect(entitled(e, 'closedBookCompetitions')).toBe(true);
    expect(entitled(e, 'integrations')).toBe(false);
  });

  it('treats a limit of unlimited or above zero as available and a limit of zero as not', () => {
    expect(entitled(e, 'ownModules')).toBe(true);
    expect(entitled(e, 'savedThemes')).toBe(true);
    const zero = entitlements(pkg('ZEROMODULES', 'A', { ownModules: 0 }), [], 'active', essentials);
    expect(entitled(zero, 'ownModules')).toBe(false);
  });
});

describe('checkLimit', () => {
  const e = full('active', essentials); // admins: 1, ownModules: 3

  it('allows when used is below the limit', () => {
    expect(checkLimit(e, { ownModules: 2 }, 'ownModules')).toEqual({ allowed: true, used: 2, limit: 3 });
  });

  it('refuses when used is at the limit', () => {
    expect(checkLimit(e, { ownModules: 3 }, 'ownModules')).toEqual({ allowed: false, used: 3, limit: 3 });
  });

  it('refuses when used is above the limit (after a downgrade)', () => {
    expect(checkLimit(e, { ownModules: 5 }, 'ownModules')).toEqual({ allowed: false, used: 5, limit: 3 });
  });

  it('treats missing usage as zero', () => {
    expect(checkLimit(e, {}, 'admins')).toEqual({ allowed: true, used: 0, limit: 1 });
  });

  it('always allows when the limit is unlimited and still reports usage', () => {
    const s = full('active', standard);
    expect(checkLimit(s, { ownModules: 9999 }, 'ownModules')).toEqual({
      allowed: true,
      used: 9999,
      limit: 'unlimited',
    });
  });

  it('refuses everything at a limit of zero', () => {
    const zero = entitlements(pkg('ZEROADMINS', 'A', { admins: 0 }), [], 'active', essentials);
    expect(checkLimit(zero, {}, 'admins').allowed).toBe(false);
  });

  it('uses the lowered limit when the account is Limited', () => {
    const limited = full('limited', group);
    expect(checkLimit(limited, { admins: 1 }, 'admins')).toEqual({ allowed: false, used: 1, limit: 1 });
  });

  it('uses the raised limit when an add-on raises it', () => {
    const withThemes = full('active', essentials, [extraThemes]);
    expect(checkLimit(withThemes, { savedThemes: 3 }, 'savedThemes')).toEqual({
      allowed: true,
      used: 3,
      limit: 4,
    });
  });
});
