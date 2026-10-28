// BP-11 (pure part): plan price, usage against limits, plan change preview and invoice totals
// (brief 23.2, 23.4; M3 assumptions 40 and 41). Money is integer pence.
//
// API under test (billing.ts):
//   planPrice(pkg: Package, activeStaff: number, activeSites: number): { perSite: number; sites: number; total: number; bandMaxStaff: number }
//       perSite = price of the first band (bands in ascending maxStaff order) whose maxStaff >= activeStaff; total = perSite * sites
//   usageAgainstLimits(ents: Entitlements, counts: Partial<Record<EntitlementLimitKey, number>>):
//       { key: EntitlementLimitKey; used: number; limit: number | 'unlimited'; remaining: number | 'unlimited'; atLimit: boolean }[]
//       one row per limit key in entitlements (ownModules, savedThemes, admins, autoAssignRules, liveCompetitions,
//       customClientRoles, battlesPerMonth); a missing count is 0; remaining never below 0; unlimited is never atLimit
//   planChangePreview(current: Package, next: Package, usage: { activeStaff: number; activeSites: number;
//       counts: Partial<Record<EntitlementLimitKey, number>> }):
//       { direction: 'upgrade' | 'downgrade' | 'same'; applies: 'now' | 'atRenewal'; currentPrice: number; newPrice: number;
//         newLimits: Entitlements; becomesReadOnly: { key: EntitlementLimitKey; used: number; limit: number; overBy: number }[] }
//       direction compares the two totals; upgrades apply now, downgrades (and same) at renewal;
//       becomesReadOnly lists numeric limits the current usage would exceed on the new package
//   invoiceTotals(lines: { amount: number }[], vatRatePercent?: number): { net: number; tax: number; total: number }
//       net = sum of lines; tax = round half up of net * rate / 100 (default 20); total = net + tax
import { describe, expect, it } from 'vitest';
import { invoiceTotals, planChangePreview, planPrice, usageAgainstLimits } from './billing';
import type { Entitlements, Package } from './schemas/commercial';

const ents = (over: Partial<Entitlements> = {}): Entitlements => ({
  ownModules: 3,
  savedThemes: 5,
  admins: 4,
  autoAssignRules: 2,
  liveCompetitions: 1,
  customClientRoles: 1,
  closedBookCompetitions: false,
  multiSite: false,
  logoBranding: false,
  perSiteThemes: false,
  integrations: false,
  responseTargetHours: 48,
  battlesPerMonth: 4,
  maxBattlePlayers: 10,
  crossSiteBattles: false,
  ...over,
});
const pkg = (id: string, bands: Package['bands'], e: Entitlements): Package => ({
  id: `01HZX${id.padStart(21, '0')}`,
  name: id,
  option: 'A',
  bands,
  entitlements: e,
});
const STARTER = pkg(
  '1',
  [
    { maxStaff: 10, pricePerSite: 4900 },
    { maxStaff: 25, pricePerSite: 8900 },
    { maxStaff: 60, pricePerSite: 14900 },
  ],
  ents(),
);
const GROWTH = pkg(
  '2',
  [
    { maxStaff: 10, pricePerSite: 7900 },
    { maxStaff: 25, pricePerSite: 12900 },
    { maxStaff: 60, pricePerSite: 19900 },
  ],
  ents({ ownModules: 10, savedThemes: 'unlimited', admins: 10, autoAssignRules: 10, multiSite: true }),
);

describe('planPrice', () => {
  it('uses the band for the staff count', () => {
    expect(planPrice(STARTER, 8, 1)).toMatchObject({ perSite: 4900, sites: 1, total: 4900, bandMaxStaff: 10 });
    expect(planPrice(STARTER, 18, 1)).toMatchObject({ perSite: 8900, total: 8900, bandMaxStaff: 25 });
  });

  it('puts a band-edge count in that band and the next person in the next band', () => {
    expect(planPrice(STARTER, 10, 1).perSite).toBe(4900);
    expect(planPrice(STARTER, 11, 1).perSite).toBe(8900);
    expect(planPrice(STARTER, 25, 1).perSite).toBe(8900);
    expect(planPrice(STARTER, 26, 1).perSite).toBe(14900);
  });

  it('multiplies by the number of active sites', () => {
    expect(planPrice(STARTER, 18, 3)).toMatchObject({ perSite: 8900, sites: 3, total: 26700 });
  });

  it('is zero staff safe: the smallest band applies', () => {
    expect(planPrice(STARTER, 0, 1).perSite).toBe(4900);
  });

  it('does not depend on the order the bands are listed in', () => {
    const shuffled = { ...STARTER, bands: [...STARTER.bands].reverse() };
    expect(planPrice(shuffled, 18, 1).perSite).toBe(8900);
  });
});

describe('usageAgainstLimits', () => {
  const rows = usageAgainstLimits(ents({ savedThemes: 'unlimited' }), {
    ownModules: 3,
    admins: 1,
    autoAssignRules: 5,
    savedThemes: 40,
  });
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it('has one row for every limit', () => {
    expect(rows.map((r) => r.key).sort()).toEqual(
      [
        'admins',
        'autoAssignRules',
        'battlesPerMonth',
        'customClientRoles',
        'liveCompetitions',
        'ownModules',
        'savedThemes',
      ].sort(),
    );
  });

  it('reports 3 of 3 own modules as at the limit with nothing left', () => {
    expect(row('ownModules')).toEqual({ key: 'ownModules', used: 3, limit: 3, remaining: 0, atLimit: true });
  });

  it('reports remaining headroom below the limit', () => {
    expect(row('admins')).toMatchObject({ used: 1, limit: 4, remaining: 3, atLimit: false });
  });

  it('never shows a negative remaining when over the limit', () => {
    expect(row('autoAssignRules')).toMatchObject({ used: 5, limit: 2, remaining: 0, atLimit: true });
  });

  it('treats unlimited as never at the limit', () => {
    expect(row('savedThemes')).toMatchObject({ used: 40, limit: 'unlimited', remaining: 'unlimited', atLimit: false });
  });

  it('counts a missing usage as zero', () => {
    expect(row('liveCompetitions')).toMatchObject({ used: 0, remaining: 1, atLimit: false });
  });
});

describe('planChangePreview', () => {
  const usage = {
    activeStaff: 18,
    activeSites: 1,
    counts: { ownModules: 3, savedThemes: 4, admins: 2, autoAssignRules: 2 },
  };

  it('is an upgrade that applies now when the new plan costs more', () => {
    const p = planChangePreview(STARTER, GROWTH, usage);
    expect(p).toMatchObject({ direction: 'upgrade', applies: 'now', currentPrice: 8900, newPrice: 12900 });
    expect(p.newLimits.ownModules).toBe(10);
    expect(p.becomesReadOnly).toEqual([]);
  });

  it('is a downgrade that applies at renewal when the new plan costs less', () => {
    const p = planChangePreview(GROWTH, STARTER, usage);
    expect(p).toMatchObject({ direction: 'downgrade', applies: 'atRenewal', currentPrice: 12900, newPrice: 8900 });
  });

  it('lists items that become read-only because usage is above the new limit', () => {
    const p = planChangePreview(GROWTH, STARTER, {
      ...usage,
      counts: { ownModules: 7, savedThemes: 4, admins: 6, autoAssignRules: 2 },
    });
    expect(p.becomesReadOnly).toEqual(
      expect.arrayContaining([
        { key: 'ownModules', used: 7, limit: 3, overBy: 4 },
        { key: 'admins', used: 6, limit: 4, overBy: 2 },
      ]),
    );
    expect(p.becomesReadOnly.map((r) => r.key)).not.toContain('autoAssignRules');
    expect(p.becomesReadOnly.map((r) => r.key)).not.toContain('savedThemes');
  });

  it('never lists an unlimited new limit as a problem', () => {
    const p = planChangePreview(STARTER, GROWTH, { ...usage, counts: { savedThemes: 500 } });
    expect(p.becomesReadOnly).toEqual([]);
  });

  it('prices the new plan for the same staff and sites', () => {
    expect(planChangePreview(STARTER, GROWTH, { ...usage, activeSites: 2 }).newPrice).toBe(25800);
  });

  it('is "same" when the prices match', () => {
    expect(planChangePreview(STARTER, STARTER, usage)).toMatchObject({ direction: 'same', applies: 'atRenewal' });
  });
});

describe('invoiceTotals', () => {
  it('adds 20 per cent VAT by default', () => {
    expect(invoiceTotals([{ amount: 8900 }, { amount: 1000 }])).toEqual({ net: 9900, tax: 1980, total: 11880 });
  });

  it('rounds the tax to a whole penny, half up', () => {
    expect(invoiceTotals([{ amount: 3333 }])).toEqual({ net: 3333, tax: 667, total: 4000 });
    expect(invoiceTotals([{ amount: 1 }, { amount: 2 }])).toEqual({ net: 3, tax: 1, total: 4 });
  });

  it('supports another rate and a zero rate', () => {
    expect(invoiceTotals([{ amount: 10000 }], 5)).toEqual({ net: 10000, tax: 500, total: 10500 });
    expect(invoiceTotals([{ amount: 10000 }], 0)).toEqual({ net: 10000, tax: 0, total: 10000 });
  });

  it('gives zero for no lines', () => {
    expect(invoiceTotals([])).toEqual({ net: 0, tax: 0, total: 0 });
  });

  it('always returns whole pence', () => {
    const t = invoiceTotals([{ amount: 1234 }, { amount: 4321 }, { amount: 77 }], 20);
    expect(Number.isInteger(t.tax) && Number.isInteger(t.total)).toBe(true);
    expect(t.total).toBe(t.net + t.tax);
  });
});
