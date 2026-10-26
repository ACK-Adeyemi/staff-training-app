// The account banner, the what-works list and the staff notice (brief 24.3, 24.4, 24.8; M3 assumption 46).
import { featureAvailability, type Availability, type Feature } from './accountState';
import { daysBetween } from './dates';
import type { EffectivePermission } from './permissions/engine';
import type { AccountState } from './schemas/primitives';

export type AccountBanner = {
  kind: 'trial' | 'pastDue' | 'limited' | 'readOnly' | 'closed' | 'paused';
  showAmounts: boolean;
  fixNow: 'payNow' | 'askBilling';
  nextChange: { state: AccountState; at: Date } | null;
  daysLeft?: number;
};

/** Past due shows to every admin from this dunning day; before it, only to people who can view billing. */
const PAST_DUE_ALL_ADMINS_DAY = 7;

export function accountBanner(input: {
  state: AccountState;
  stateSince: string;
  nextChange: { state: AccountState; at: Date } | null;
  perms: EffectivePermission[];
  now: Date;
}): AccountBanner | null {
  const { state, perms, now, nextChange } = input;
  if (state === 'active' || state === 'deleted') return null;
  const has = (id: string): boolean => perms.some((p) => p.permissionId === id);
  const showAmounts = has('billing.view');
  if (state === 'pastDue' && !showAmounts && daysBetween(new Date(input.stateSince), now) < PAST_DUE_ALL_ADMINS_DAY) {
    return null;
  }
  const banner: AccountBanner = {
    kind: state,
    showAmounts,
    fixNow: has('billing.manage') ? 'payNow' : 'askBilling',
    nextChange,
  };
  if (state === 'trial' && nextChange) banner.daysLeft = daysBetween(now, nextChange.at);
  return banner;
}

const ROWS: Feature[] = [
  'coreCompliance',
  'exports',
  'authoring',
  'liveCompetitions',
  'newCompetitions',
  'battleRoom',
  'usageAddOns',
  'reminders',
  'themesEdit',
  'themesDisplay',
];

export function whatWorks(state: AccountState): { feature: Feature; availability: Availability; key: string }[] {
  return ROWS.map((feature) => {
    const availability = featureAvailability(state, feature);
    return { feature, availability, key: `account.works.${feature}.${availability}` };
  });
}

export function staffAccountNotice(state: AccountState): { key: string } | null {
  return state === 'readOnly' || state === 'paused' ? { key: 'staff.accountNotice.speakToManager' } : null;
}
