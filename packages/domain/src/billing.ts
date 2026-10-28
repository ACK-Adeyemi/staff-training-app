// Plan price, usage against limits, plan change preview and invoice totals (brief 23.2, 23.4; M3 assumptions 40, 41).
// Money is integer pence.
import type { EntitlementLimitKey } from './entitlements';
import type { Entitlements, Package } from './schemas/commercial';

type Limit = number | 'unlimited';
type Counts = Partial<Record<EntitlementLimitKey, number>>;

const LIMIT_KEYS: EntitlementLimitKey[] = [
  'ownModules',
  'savedThemes',
  'admins',
  'autoAssignRules',
  'liveCompetitions',
  'customClientRoles',
  'battlesPerMonth',
];

export function planPrice(pkg: Package, activeStaff: number, activeSites: number) {
  const bands = [...pkg.bands].sort((a, b) => a.maxStaff - b.maxStaff);
  const band = bands.find((b) => b.maxStaff >= activeStaff) ?? bands.at(-1);
  if (!band) throw new Error('Package has no price bands');
  return {
    perSite: band.pricePerSite,
    sites: activeSites,
    total: band.pricePerSite * activeSites,
    bandMaxStaff: band.maxStaff,
  };
}

export function usageAgainstLimits(ents: Entitlements, counts: Counts) {
  return LIMIT_KEYS.map((key) => {
    const limit: Limit = ents[key];
    const used = counts[key] ?? 0;
    return {
      key,
      used,
      limit,
      remaining: limit === 'unlimited' ? ('unlimited' as const) : Math.max(0, limit - used),
      atLimit: limit !== 'unlimited' && used >= limit,
    };
  });
}

export function planChangePreview(
  current: Package,
  next: Package,
  usage: { activeStaff: number; activeSites: number; counts: Counts },
) {
  const currentPrice = planPrice(current, usage.activeStaff, usage.activeSites).total;
  const newPrice = planPrice(next, usage.activeStaff, usage.activeSites).total;
  const direction = newPrice > currentPrice ? 'upgrade' : newPrice < currentPrice ? 'downgrade' : 'same';
  const becomesReadOnly: { key: EntitlementLimitKey; used: number; limit: number; overBy: number }[] = [];
  for (const key of LIMIT_KEYS) {
    const limit = next.entitlements[key];
    const used = usage.counts[key] ?? 0;
    if (limit !== 'unlimited' && used > limit) becomesReadOnly.push({ key, used, limit, overBy: used - limit });
  }
  return {
    direction,
    applies: direction === 'upgrade' ? ('now' as const) : ('atRenewal' as const),
    currentPrice,
    newPrice,
    newLimits: next.entitlements,
    becomesReadOnly,
  };
}

export function invoiceTotals(lines: { amount: number }[], vatRatePercent = 20) {
  const net = lines.reduce((sum, l) => sum + l.amount, 0);
  const tax = Math.floor((net * vatRatePercent) / 100 + 0.5);
  return { net, tax, total: net + tax };
}
