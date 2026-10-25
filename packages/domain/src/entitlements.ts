// Entitlements: what an account may use, from its package, add-ons and account state.
// Brief 20.2 to 20.6, 24.4, 24.9. The UI calls entitled(); it never checks package names.
import type { AddOn, Entitlements, Package } from './schemas/commercial';
import type { AccountState } from './schemas/primitives';

export type EntitlementLimitKey =
  | 'ownModules'
  | 'savedThemes'
  | 'admins'
  | 'autoAssignRules'
  | 'liveCompetitions'
  | 'customClientRoles'
  | 'battlesPerMonth';

export type EffectiveEntitlements = Entitlements & { flags: string[] };
type Limit = number | 'unlimited';

const FULL_STATES: readonly AccountState[] = ['trial', 'active', 'pastDue'];

const isLimit = (v: unknown): v is Limit => v === 'unlimited' || typeof v === 'number';

const larger = (a: Limit, b: Limit): Limit => {
  if (a === 'unlimited' || b === 'unlimited') return 'unlimited';
  return Math.max(a, b);
};

export function entitlements(
  pkg: Package,
  activeAddOns: AddOn[],
  accountState: AccountState,
  floorPkg: Package,
): EffectiveEntitlements {
  if (!FULL_STATES.includes(accountState)) return { ...floorPkg.entitlements, flags: [] };
  const result: Record<string, unknown> = { ...pkg.entitlements };
  const flags = new Set<string>();
  for (const addOn of activeAddOns) {
    for (const [key, value] of Object.entries(addOn.adds)) {
      if (key === 'flags') {
        for (const f of (value as string[] | undefined) ?? []) flags.add(f);
      } else if (typeof value === 'boolean') {
        result[key] = result[key] === true || value;
      } else if (isLimit(value) && isLimit(result[key])) {
        result[key] = larger(result[key], value);
      }
    }
  }
  return { ...(result as Entitlements), flags: [...flags] };
}

export function entitled(ents: EffectiveEntitlements, feature: string): boolean {
  if (ents.flags.includes(feature)) return true;
  if (feature === 'flags' || !Object.hasOwn(ents, feature)) return false;
  const value = (ents as unknown as Record<string, unknown>)[feature];
  if (typeof value === 'boolean') return value;
  if (value === 'unlimited') return true;
  if (typeof value === 'number') return value > 0;
  return false;
}

export function checkLimit(
  ents: EffectiveEntitlements,
  usage: Partial<Record<EntitlementLimitKey, number>>,
  key: EntitlementLimitKey,
): { allowed: boolean; used: number; limit: number | 'unlimited' } {
  const limit = ents[key];
  const used = usage[key] ?? 0;
  return { allowed: limit === 'unlimited' || used < limit, used, limit };
}
