// Account states, the brief 24.4 availability matrix and the dunning timeline. Brief 24.1 to 24.9.
// Pure functions: the caller passes the clock's `now`.
import { addDays, daysBetween, startOfLondonDay } from './dates';
import type { EffectivePermission } from './permissions/engine';
import type { DunningPolicy, PaymentAttempt, Subscription } from './schemas/commercial';
import type { AccountState } from './schemas/primitives';

export type Feature =
  | 'coreCompliance'
  | 'exports'
  | 'staffOwnRecord'
  | 'authoring'
  | 'battleRoom'
  | 'liveCompetitions'
  | 'newCompetitions'
  | 'engagement'
  | 'usageAddOns'
  | 'reminders'
  | 'themesDisplay'
  | 'themesEdit'
  | 'multiSite'
  | 'billing'
  | 'supportTicketsAdmin'
  | 'supportTicketsStaff'
  | 'signInAdmin'
  | 'signInStaff';

export type Availability =
  | 'yes'
  | 'no'
  | 'viewOnly'
  | 'exportOnly'
  | 'withinAllowance'
  | 'inAppOnly'
  | 'continueToEnd'
  | 'frozen'
  | 'displayOnly';

// Columns: active, pastDue, limited, readOnly, closed, deleted. Trial reads as active and paused as readOnly.
type Row = [Availability, Availability, Availability, Availability, Availability, Availability];
const COLUMN: Record<AccountState, number> = {
  active: 0,
  trial: 0,
  pastDue: 1,
  limited: 2,
  readOnly: 3,
  paused: 3,
  closed: 4,
  deleted: 5,
};

const MATRIX: Record<Feature, Row> = {
  coreCompliance: ['yes', 'yes', 'yes', 'viewOnly', 'exportOnly', 'no'],
  exports: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  staffOwnRecord: ['yes', 'yes', 'yes', 'yes', 'no', 'no'],
  authoring: ['yes', 'yes', 'no', 'no', 'no', 'no'],
  battleRoom: ['yes', 'yes', 'no', 'no', 'no', 'no'],
  liveCompetitions: ['yes', 'yes', 'continueToEnd', 'frozen', 'no', 'no'],
  newCompetitions: ['yes', 'yes', 'no', 'no', 'no', 'no'],
  engagement: ['yes', 'yes', 'yes', 'viewOnly', 'no', 'no'],
  usageAddOns: ['yes', 'withinAllowance', 'no', 'no', 'no', 'no'],
  reminders: ['yes', 'yes', 'inAppOnly', 'no', 'no', 'no'],
  themesDisplay: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  themesEdit: ['yes', 'yes', 'no', 'no', 'no', 'no'],
  multiSite: ['yes', 'yes', 'yes', 'viewOnly', 'no', 'no'],
  billing: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  supportTicketsAdmin: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  supportTicketsStaff: ['yes', 'yes', 'yes', 'yes', 'no', 'no'],
  signInAdmin: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  signInStaff: ['yes', 'yes', 'yes', 'yes', 'no', 'no'],
};

export function featureAvailability(state: AccountState, feature: Feature): Availability {
  return MATRIX[feature][COLUMN[state]] as Availability;
}

export function canSignIn(
  state: AccountState,
  side: 'staff' | 'client' | 'provider',
  perms: EffectivePermission[],
): boolean {
  if (side === 'provider') return state !== 'deleted';
  if (state === 'deleted') return false;
  if (state === 'closed') {
    if (side === 'staff') return false;
    return perms.some((p) => p.permissionId === 'billing.manage' || p.permissionId === 'reports.export');
  }
  return true;
}

// Trial path after the trial ends (brief 24.3): read-only 14 days, closed 30 days, then deleted.
const TRIAL_READ_ONLY_DAYS = 14;
const TRIAL_CLOSED_DAYS = 30;

type Stage = 'pastDue' | 'limited' | 'readOnly' | 'closed' | 'deleted';
const ORDER: Stage[] = ['pastDue', 'limited', 'readOnly', 'closed', 'deleted'];

/** First dunning day (day 0 is the first Past due day) on which each stage applies. */
function startDays(policy: DunningPolicy): Record<Stage, number> {
  return {
    pastDue: 0,
    limited: policy.graceDays + 1,
    readOnly: policy.limitedUntilDay + 1,
    closed: policy.readOnlyUntilDay + 1,
    deleted: policy.closedUntilDay + 1,
  };
}

function stageAtDay(day: number, policy: DunningPolicy): Stage {
  const starts = startDays(policy);
  let stage: Stage = 'pastDue';
  for (const s of ORDER) if (day >= starts[s]) stage = s;
  return stage;
}

/**
 * Dunning day of `now`. stateSince is when the stored state began (decisions.md): for Past due that is day 0,
 * for Limited, Read-only and Closed the day is offset by the first day of that state.
 */
function dunningDay(sub: Subscription, policy: DunningPolicy, now: Date): number | null {
  const stage = sub.state as Stage;
  if (!ORDER.includes(stage)) return null;
  return startDays(policy)[stage] + daysBetween(new Date(sub.stateSince), now);
}

function trialEnd(sub: Subscription): Date | null {
  return sub.state === 'trial' && sub.nextStateAt ? new Date(sub.nextStateAt) : null;
}

export function accountStateAt(
  subscription: Subscription,
  _payments: PaymentAttempt[],
  policy: DunningPolicy,
  now: Date,
): AccountState {
  if (subscription.timelinePaused) return subscription.state;
  const end = trialEnd(subscription);
  if (subscription.state === 'trial') {
    if (!end || now.getTime() < end.getTime()) return 'trial';
    const d = daysBetween(end, now);
    if (d < TRIAL_READ_ONLY_DAYS) return 'readOnly';
    return d < TRIAL_READ_ONLY_DAYS + TRIAL_CLOSED_DAYS ? 'closed' : 'deleted';
  }
  const day = dunningDay(subscription, policy, now);
  if (day === null) return subscription.state;
  const stage = stageAtDay(day, policy);
  if (
    stage === 'limited' &&
    subscription.state === 'pastDue' &&
    subscription.graceExtendedUntil &&
    now.getTime() < new Date(subscription.graceExtendedUntil).getTime()
  ) {
    return 'pastDue';
  }
  if (
    stage === 'readOnly' &&
    subscription.state === 'limited' &&
    subscription.graceExtendedUntil &&
    now.getTime() < new Date(subscription.graceExtendedUntil).getTime()
  ) {
    return 'limited';
  }
  return stage;
}

export function nextTransition(
  subscription: Subscription,
  policy: DunningPolicy,
  now: Date,
): { state: AccountState; at: Date } | null {
  if (subscription.timelinePaused) return null;
  const end = trialEnd(subscription);
  if (subscription.state === 'trial') {
    if (!end) return null;
    if (now.getTime() < end.getTime()) return { state: 'readOnly', at: end };
    const d = daysBetween(end, now);
    if (d < TRIAL_READ_ONLY_DAYS) {
      return { state: 'closed', at: startOfLondonDay(addDays(end, TRIAL_READ_ONLY_DAYS)) };
    }
    if (d < TRIAL_READ_ONLY_DAYS + TRIAL_CLOSED_DAYS) {
      return { state: 'deleted', at: startOfLondonDay(addDays(end, TRIAL_READ_ONLY_DAYS + TRIAL_CLOSED_DAYS)) };
    }
    return null;
  }
  const day = dunningDay(subscription, policy, now);
  if (day === null) return null;
  const current = accountStateAt(subscription, [], policy, now);
  const stage = stageAtDay(day, policy);
  const next = ORDER[ORDER.indexOf(stage) + 1];
  if (!next) return null;
  const starts = startDays(policy);
  const at = startOfLondonDay(
    addDays(new Date(subscription.stateSince), starts[next] - starts[subscription.state as Stage]),
  );
  if (current === 'pastDue' && stage === 'limited' && subscription.graceExtendedUntil) {
    return { state: 'limited', at: new Date(subscription.graceExtendedUntil) };
  }
  if (next === 'limited' && subscription.graceExtendedUntil) {
    const ext = new Date(subscription.graceExtendedUntil);
    if (ext.getTime() > at.getTime()) return { state: 'limited', at: ext };
  }
  if (
    current === 'limited' &&
    stage === 'readOnly' &&
    subscription.state === 'limited' &&
    subscription.graceExtendedUntil
  ) {
    return { state: 'readOnly', at: new Date(subscription.graceExtendedUntil) };
  }
  if (next === 'readOnly' && subscription.state === 'limited' && subscription.graceExtendedUntil) {
    const ext = new Date(subscription.graceExtendedUntil);
    if (ext.getTime() > at.getTime()) return { state: 'readOnly', at: ext };
  }
  return { state: next, at };
}

/**
 * When the state in force at `now` began. Equal to `stateSince` while the stored state still applies; once the clock
 * has moved the account on (for example Past due to Limited) it is the first day of the new state.
 */
export function stateStartedAt(subscription: Subscription, policy: DunningPolicy, now: Date): Date {
  const since = new Date(subscription.stateSince);
  const current = accountStateAt(subscription, [], policy, now);
  if (current === subscription.state) return since;
  const end = trialEnd(subscription);
  if (subscription.state === 'trial' && end) {
    if (current === 'readOnly') return end;
    if (current === 'closed') return startOfLondonDay(addDays(end, TRIAL_READ_ONLY_DAYS));
    if (current === 'deleted') return startOfLondonDay(addDays(end, TRIAL_READ_ONLY_DAYS + TRIAL_CLOSED_DAYS));
    return since;
  }
  const starts = startDays(policy);
  const from = subscription.state as Stage;
  if (!ORDER.includes(from) || !ORDER.includes(current as Stage)) return since;
  return startOfLondonDay(addDays(since, starts[current as Stage] - starts[from]));
}
