// BP-7 (part): account states and the brief 24.4 matrix, written before the implementation (M0 chunk 5).
//
// API under test (accountState.ts):
//   type Feature = 'coreCompliance' | 'exports' | 'staffOwnRecord' | 'authoring' | 'battleRoom' | 'liveCompetitions'
//     | 'newCompetitions' | 'engagement' | 'usageAddOns' | 'reminders' | 'themesDisplay' | 'themesEdit' | 'multiSite'
//     | 'billing' | 'supportTicketsAdmin' | 'supportTicketsStaff' | 'signInAdmin' | 'signInStaff'
//   type Availability = 'yes' | 'no' | 'viewOnly' | 'exportOnly' | 'withinAllowance' | 'inAppOnly'
//     | 'continueToEnd' | 'frozen' | 'displayOnly'
//   featureAvailability(state: AccountState, feature: Feature): Availability
//   canSignIn(state: AccountState, side: 'staff' | 'client' | 'provider', perms: EffectivePermission[]): boolean
//   accountStateAt(subscription: Subscription, payments: PaymentAttempt[], policy: DunningPolicy, now: Date): AccountState
//   nextTransition(subscription: Subscription, policy: DunningPolicy, now: Date): { state: AccountState; at: Date } | null
//
// Conventions chosen where the plan left them open:
//  - Day numbers are London calendar days: day = daysBetween(stateSince, now). For a subscription whose stored state is
//    'pastDue', stateSince is day 0 of the dunning timeline. pastDue while day <= graceDays (14), limited while
//    day <= limitedUntilDay (30), readOnly while day <= readOnlyUntilDay (60), closed while day <= closedUntilDay (150),
//    deleted after that.
//  - graceExtendedUntil: while now is before it, a pastDue account stays pastDue; after it, the normal day boundaries apply.
//  - timelinePaused: the stored state is returned whatever the date, and nextTransition returns null.
//  - A stored 'trial' returns 'trial' while now < nextStateAt (the trial end). After the end the trial path runs from
//    nextStateAt: readOnly for 14 days, then closed for 30 days, then deleted (brief 24.3).
//  - Stored 'active', 'paused', 'deleted' return themselves. Payments are accepted for future use and not needed here.
//  - Paused is treated as readOnly and Trial as active in the matrix (plan assumption 3). Closed live competitions: 'no'.
//  - canSignIn: provider side is true until deleted; client side is true until deleted, except in closed where it needs
//    'billing.manage' or 'reports.export' among the permissions; staff side is true except in closed and deleted.
import { describe, expect, it } from 'vitest';
import { addDays, startOfLondonDay } from './dates';
import type { EffectivePermission } from './permissions/engine';
import type { AccountState } from './schemas/primitives';
import type { DunningPolicy, Subscription } from './schemas/commercial';
import { idSchema } from './schemas/primitives';
import { accountStateAt, canSignIn, featureAvailability, nextTransition } from './accountState';
import type { Availability, Feature } from './accountState';

const id = (tag: string): string => {
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const STATES: AccountState[] = ['active', 'trial', 'pastDue', 'limited', 'readOnly', 'closed', 'paused', 'deleted'];

// Literal expected matrix, transcribed from brief 24.4 and plan assumptions 3 to 5. Columns follow STATES.
//                            active    trial     pastDue            limited           readOnly      closed        paused        deleted
const MATRIX: Record<Feature, Availability[]> = {
  coreCompliance: ['yes', 'yes', 'yes', 'yes', 'viewOnly', 'exportOnly', 'viewOnly', 'no'],
  exports: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  staffOwnRecord: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'yes', 'no'],
  authoring: ['yes', 'yes', 'yes', 'no', 'no', 'no', 'no', 'no'],
  battleRoom: ['yes', 'yes', 'yes', 'no', 'no', 'no', 'no', 'no'],
  liveCompetitions: ['yes', 'yes', 'yes', 'continueToEnd', 'frozen', 'no', 'frozen', 'no'],
  newCompetitions: ['yes', 'yes', 'yes', 'no', 'no', 'no', 'no', 'no'],
  engagement: ['yes', 'yes', 'yes', 'yes', 'viewOnly', 'no', 'viewOnly', 'no'],
  usageAddOns: ['yes', 'yes', 'withinAllowance', 'no', 'no', 'no', 'no', 'no'],
  reminders: ['yes', 'yes', 'yes', 'inAppOnly', 'no', 'no', 'no', 'no'],
  themesEdit: ['yes', 'yes', 'yes', 'no', 'no', 'no', 'no', 'no'],
  multiSite: ['yes', 'yes', 'yes', 'yes', 'viewOnly', 'no', 'viewOnly', 'no'],
  billing: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  supportTicketsAdmin: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  supportTicketsStaff: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'yes', 'no'],
  signInAdmin: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  signInStaff: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'yes', 'no'],
  // themesDisplay: see its own test (the brief says "stay as they are"; the exact non-no value is the implementer's).
  themesDisplay: [],
};

const cells = (Object.entries(MATRIX) as [Feature, Availability[]][])
  .filter(([, row]) => row.length > 0)
  .flatMap(([feature, row]) => STATES.map((state, i) => [feature, state, row[i] as Availability] as const));

describe('featureAvailability matrix (brief 24.4)', () => {
  it('the literal table has a value for every state in every row', () => {
    for (const [feature, row] of Object.entries(MATRIX)) {
      if (feature !== 'themesDisplay') expect(row).toHaveLength(STATES.length);
    }
  });

  it.each(cells)('%s in %s is %s', (feature, state, expected) => {
    expect(featureAvailability(state, feature)).toBe(expected);
  });

  it('themes display stays available in every state before Deleted and is gone when Deleted', () => {
    for (const state of STATES.filter((s) => s !== 'deleted')) {
      expect(featureAvailability(state, 'themesDisplay')).not.toBe('no');
    }
    expect(featureAvailability('active', 'themesDisplay')).toBe('yes');
    expect(featureAvailability('pastDue', 'themesDisplay')).toBe('yes');
    expect(featureAvailability('deleted', 'themesDisplay')).toBe('no');
  });

  it('exports are never blocked by an account state before Deleted', () => {
    for (const state of STATES.filter((s) => s !== 'deleted')) {
      expect(featureAvailability(state, 'exports')).toBe('yes');
    }
  });

  it('Trial behaves as Active for every feature and Paused as Read-only', () => {
    for (const feature of Object.keys(MATRIX) as Feature[]) {
      expect(featureAvailability('trial', feature)).toBe(featureAvailability('active', feature));
      expect(featureAvailability('paused', feature)).toBe(featureAvailability('readOnly', feature));
    }
  });
});

const perm = (permissionId: string): EffectivePermission => ({
  permissionId,
  scopes: [{ type: 'all' }],
  sources: [{ roleId: id('ROLE1') }],
});

describe('canSignIn', () => {
  it('lets an admin with billing.manage sign in when Closed', () => {
    expect(canSignIn('closed', 'client', [perm('billing.manage')])).toBe(true);
  });

  it('lets an admin with reports.export sign in when Closed', () => {
    expect(canSignIn('closed', 'client', [perm('reports.export')])).toBe(true);
  });

  it('refuses an admin with neither permission when Closed', () => {
    expect(canSignIn('closed', 'client', [perm('staff.view'), perm('billing.view')])).toBe(false);
    expect(canSignIn('closed', 'client', [])).toBe(false);
  });

  it('refuses staff when Closed, even with those permissions', () => {
    expect(canSignIn('closed', 'staff', [])).toBe(false);
    expect(canSignIn('closed', 'staff', [perm('billing.manage')])).toBe(false);
  });

  it.each(['active', 'trial', 'pastDue', 'limited', 'readOnly', 'paused'] as const)(
    'lets staff and admins with no special permission sign in when %s',
    (state) => {
      expect(canSignIn(state, 'staff', [])).toBe(true);
      expect(canSignIn(state, 'client', [])).toBe(true);
    },
  );

  it('refuses everyone client-side when Deleted', () => {
    expect(canSignIn('deleted', 'staff', [])).toBe(false);
    expect(canSignIn('deleted', 'client', [perm('billing.manage'), perm('reports.export')])).toBe(false);
  });
});

const policy: DunningPolicy = {
  graceDays: 14,
  limitedUntilDay: 30,
  readOnlyUntilDay: 60,
  closedUntilDay: 150,
  deleteWithinDays: 30,
};
// 12:00 UTC is the same London calendar day in summer and winter, so day counts cannot wobble across the clock change.
const SINCE = '2026-01-05T12:00:00.000Z';
const CLIENT = id('CLIENT1');

const sub = (extra: Partial<Subscription> = {}): Subscription => ({
  clientId: CLIENT,
  packageId: id('PKG1'),
  period: 'monthly',
  renewalAt: '2027-01-05T12:00:00.000Z',
  state: 'pastDue',
  stateSince: SINCE,
  billingContact: 'billing@example.test',
  ...extra,
});
const dayN = (n: number): Date => addDays(new Date(SINCE), n);
const sameLondonDay = (a: Date, b: Date) => startOfLondonDay(a).getTime() === startOfLondonDay(b).getTime();

describe('accountStateAt for a Past due account', () => {
  it.each([
    [0, 'pastDue'],
    [1, 'pastDue'],
    [14, 'pastDue'],
    [15, 'limited'],
    [30, 'limited'],
    [31, 'readOnly'],
    [60, 'readOnly'],
    [61, 'closed'],
    [150, 'closed'],
    [151, 'deleted'],
    [400, 'deleted'],
  ] as const)('on day %i the state is %s', (day, expected) => {
    expect(accountStateAt(sub(), [], policy, dayN(day))).toBe(expected);
  });

  it('time of day within the same London day does not change the state', () => {
    const lateDay14 = new Date(startOfLondonDay(dayN(14)).getTime() + 23 * 3600_000);
    expect(accountStateAt(sub(), [], policy, lateDay14)).toBe('pastDue');
  });

  it('keeps Past due beyond day 14 while the grace extension runs, then follows the normal days', () => {
    const extended = sub({ graceExtendedUntil: dayN(20).toISOString() });
    expect(accountStateAt(extended, [], policy, dayN(16))).toBe('pastDue');
    expect(accountStateAt(extended, [], policy, dayN(19))).toBe('pastDue');
    expect(accountStateAt(extended, [], policy, dayN(21))).toBe('limited');
    expect(accountStateAt(extended, [], policy, dayN(40))).toBe('readOnly');
  });

  it('an expired grace extension that ended before day 14 does not shorten the grace period', () => {
    const early = sub({ graceExtendedUntil: dayN(5).toISOString() });
    expect(accountStateAt(early, [], policy, dayN(10))).toBe('pastDue');
  });

  it('a paused timeline freezes the stored state however long it runs', () => {
    const paused = sub({ timelinePaused: true });
    expect(accountStateAt(paused, [], policy, dayN(0))).toBe('pastDue');
    expect(accountStateAt(paused, [], policy, dayN(100))).toBe('pastDue');
    expect(accountStateAt(paused, [], policy, dayN(400))).toBe('pastDue');
  });

  it('works with a fast-forwarded clock (+30 days moves Past due on day 5 to Read-only)', () => {
    const now = dayN(5);
    expect(accountStateAt(sub(), [], policy, now)).toBe('pastDue');
    expect(accountStateAt(sub(), [], policy, addDays(now, 30))).toBe('readOnly');
  });
});

describe('accountStateAt for other stored states', () => {
  it.each(['active', 'paused'] as const)('%s returns itself however much time passes', (state) => {
    expect(accountStateAt(sub({ state }), [], policy, dayN(0))).toBe(state);
    expect(accountStateAt(sub({ state }), [], policy, dayN(500))).toBe(state);
  });

  it('a running trial returns trial until its end date', () => {
    const trial = sub({ state: 'trial', nextStateAt: dayN(30).toISOString() });
    expect(accountStateAt(trial, [], policy, dayN(1))).toBe('trial');
    expect(accountStateAt(trial, [], policy, dayN(29))).toBe('trial');
  });

  it('an ended trial is Read-only for 14 days, then Closed for 30 days, then Deleted', () => {
    const trial = sub({ state: 'trial', nextStateAt: dayN(30).toISOString() });
    expect(accountStateAt(trial, [], policy, dayN(31))).toBe('readOnly');
    expect(accountStateAt(trial, [], policy, dayN(37))).toBe('readOnly');
    expect(accountStateAt(trial, [], policy, dayN(30 + 20))).toBe('closed');
    expect(accountStateAt(trial, [], policy, dayN(30 + 40))).toBe('closed');
    expect(accountStateAt(trial, [], policy, dayN(30 + 50))).toBe('deleted');
    expect(accountStateAt(trial, [], policy, dayN(30 + 200))).toBe('deleted');
  });
});

describe('nextTransition', () => {
  it.each([
    [3, 'limited', 15],
    [14, 'limited', 15],
    [15, 'readOnly', 31],
    [20, 'readOnly', 31],
    [31, 'closed', 61],
    [40, 'closed', 61],
    [61, 'deleted', 151],
    [100, 'deleted', 151],
  ] as const)('on day %i the next state is %s starting on day %i', (day, state, startDay) => {
    const next = nextTransition(sub(), policy, dayN(day));
    expect(next?.state).toBe(state);
    expect(next && sameLondonDay(next.at, dayN(startDay))).toBe(true);
  });

  it('is null once Deleted', () => {
    expect(nextTransition(sub(), policy, dayN(200))).toBeNull();
  });

  it('is null for Active and Paused accounts', () => {
    expect(nextTransition(sub({ state: 'active' }), policy, dayN(3))).toBeNull();
    expect(nextTransition(sub({ state: 'paused' }), policy, dayN(3))).toBeNull();
  });

  it('is null while the timeline is paused', () => {
    expect(nextTransition(sub({ timelinePaused: true }), policy, dayN(3))).toBeNull();
  });

  it('moves the first transition to the end of a grace extension', () => {
    const extended = sub({ graceExtendedUntil: dayN(20).toISOString() });
    const next = nextTransition(extended, policy, dayN(3));
    expect(next?.state).toBe('limited');
    expect(next && next.at.getTime() >= dayN(20).getTime()).toBe(true);
  });

  it('a running trial next moves to Read-only at its end date', () => {
    const trial = sub({ state: 'trial', nextStateAt: dayN(30).toISOString() });
    const next = nextTransition(trial, policy, dayN(10));
    expect(next?.state).toBe('readOnly');
    expect(next?.at.getTime()).toBe(dayN(30).getTime());
  });

  it('an ended trial moves on to Closed then Deleted', () => {
    const trial = sub({ state: 'trial', nextStateAt: dayN(30).toISOString() });
    const toClosed = nextTransition(trial, policy, dayN(35));
    expect(toClosed?.state).toBe('closed');
    expect(toClosed && sameLondonDay(toClosed.at, dayN(30 + 14))).toBe(true);
    const toDeleted = nextTransition(trial, policy, dayN(30 + 20));
    expect(toDeleted?.state).toBe('deleted');
    expect(toDeleted && sameLondonDay(toDeleted.at, dayN(30 + 44))).toBe(true);
    expect(nextTransition(trial, policy, dayN(30 + 100))).toBeNull();
  });
});
