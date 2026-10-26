// BP-12 (pure part): the account banner, the what-works list and the staff notice (brief 24.3, 24.4, 24.8; M3 assumption 46).
//
// API under test (accountBanner.ts):
//   accountBanner({ state, stateSince, nextChange, perms, now }): AccountBanner | null
//       state: AccountState; stateSince: ISO string; nextChange: { state: AccountState; at: Date } | null (from nextTransition);
//       perms: EffectivePermission[] of the viewing client admin
//       AccountBanner = { kind: 'trial' | 'pastDue' | 'limited' | 'readOnly' | 'closed' | 'paused';
//                         showAmounts: boolean;                       // billing.view only
//                         fixNow: 'payNow' | 'askBilling';            // payNow only with billing.manage
//                         nextChange: { state; at } | null; daysLeft?: number }   // daysLeft for trial: whole London days to nextChange.at
//       null for active and deleted; pastDue shows from day 0 (now = stateSince) to people with billing.view and from day 7 to every admin
//   whatWorks(state): { feature: Feature; availability: Availability; key: string }[]
//       one row per brief 24.4 feature, availability from featureAvailability(state, feature), key a non-empty text key
//   staffAccountNotice(state): { key: string } | null
//       staff see nothing except in Read-only (and Paused, which reads as Read-only): "Your organisation's account needs attention..."
import { describe, expect, it } from 'vitest';
import { accountBanner, staffAccountNotice, whatWorks } from './accountBanner';
import { featureAvailability } from './accountState';
import type { Feature } from './accountState';
import { addDays } from './dates';
import type { EffectivePermission } from './permissions/engine';
import type { AccountState } from './schemas/primitives';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const perm = (permissionId: string): EffectivePermission => ({
  permissionId,
  scopes: [{ type: 'client' } as EffectivePermission['scopes'][number]],
  sources: [],
});
const OWNER = [perm('billing.view'), perm('billing.manage'), perm('billing.manageAddOns')];
const VIEWER = [perm('billing.view')];
const SUPERVISOR = [perm('staff.view')];
const next = (state: AccountState, days: number) => ({ state, at: addDays(NOW, days) });

describe('accountBanner', () => {
  it('shows no banner for active and deleted accounts', () => {
    for (const state of ['active', 'deleted'] as const) {
      expect(
        accountBanner({ state, stateSince: NOW.toISOString(), nextChange: null, perms: OWNER, now: NOW }),
      ).toBeNull();
    }
  });

  it('shows the trial banner to every admin with the days left', () => {
    const banner = accountBanner({
      state: 'trial',
      stateSince: addDays(NOW, -4).toISOString(),
      nextChange: next('readOnly', 10),
      perms: SUPERVISOR,
      now: NOW,
    });
    expect(banner?.kind).toBe('trial');
    expect(banner?.daysLeft).toBe(10);
    expect(banner?.showAmounts).toBe(false);
  });

  it('shows Past due on day 0 only to people with billing.view', () => {
    const input = {
      state: 'pastDue' as const,
      stateSince: NOW.toISOString(),
      nextChange: next('limited', 15),
      now: NOW,
    };
    expect(accountBanner({ ...input, perms: VIEWER })?.kind).toBe('pastDue');
    expect(accountBanner({ ...input, perms: OWNER })?.kind).toBe('pastDue');
    expect(accountBanner({ ...input, perms: SUPERVISOR })).toBeNull();
  });

  it('shows Past due to every admin from day 7', () => {
    const input = { state: 'pastDue' as const, nextChange: next('limited', 8), perms: SUPERVISOR };
    expect(accountBanner({ ...input, stateSince: addDays(NOW, -6).toISOString(), now: NOW })).toBeNull();
    expect(accountBanner({ ...input, stateSince: addDays(NOW, -7).toISOString(), now: NOW })?.kind).toBe('pastDue');
  });

  it('shows amounts only to people with billing.view', () => {
    const input = {
      state: 'limited' as const,
      stateSince: addDays(NOW, -3).toISOString(),
      nextChange: next('readOnly', 12),
      now: NOW,
    };
    expect(accountBanner({ ...input, perms: VIEWER })?.showAmounts).toBe(true);
    expect(accountBanner({ ...input, perms: SUPERVISOR })?.showAmounts).toBe(false);
  });

  it('offers Fix now as a payment only to billing.manage holders, others are told to ask', () => {
    const input = {
      state: 'limited' as const,
      stateSince: addDays(NOW, -3).toISOString(),
      nextChange: next('readOnly', 12),
      now: NOW,
    };
    expect(accountBanner({ ...input, perms: OWNER })?.fixNow).toBe('payNow');
    expect(accountBanner({ ...input, perms: VIEWER })?.fixNow).toBe('askBilling');
    expect(accountBanner({ ...input, perms: SUPERVISOR })?.fixNow).toBe('askBilling');
  });

  it('gives one banner kind per state and carries the next change through', () => {
    const cases: [AccountState, 'limited' | 'readOnly' | 'closed' | 'paused'][] = [
      ['limited', 'limited'],
      ['readOnly', 'readOnly'],
      ['closed', 'closed'],
      ['paused', 'paused'],
    ];
    for (const [state, kind] of cases) {
      const nc = next('closed', 20);
      const banner = accountBanner({
        state,
        stateSince: addDays(NOW, -1).toISOString(),
        nextChange: nc,
        perms: SUPERVISOR,
        now: NOW,
      });
      expect(banner?.kind).toBe(kind);
      expect(banner?.nextChange).toEqual(nc);
    }
  });

  it('handles a state with no next change', () => {
    const banner = accountBanner({
      state: 'closed',
      stateSince: NOW.toISOString(),
      nextChange: null,
      perms: OWNER,
      now: NOW,
    });
    expect(banner?.nextChange).toBeNull();
  });
});

describe('whatWorks', () => {
  const STATES: AccountState[] = ['trial', 'active', 'pastDue', 'limited', 'readOnly', 'closed', 'paused'];

  it('agrees with featureAvailability for every row in every state', () => {
    for (const state of STATES) {
      const rows = whatWorks(state);
      expect(rows.length).toBeGreaterThan(5);
      for (const row of rows) {
        expect(row.availability).toBe(featureAvailability(state, row.feature));
        expect(row.key.length).toBeGreaterThan(0);
      }
    }
  });

  it('lists each feature once and covers the brief 24.4 rows', () => {
    const wanted: Feature[] = [
      'coreCompliance',
      'exports',
      'authoring',
      'liveCompetitions',
      'battleRoom',
      'usageAddOns',
      'reminders',
      'themesEdit',
    ];
    const rows = whatWorks('limited');
    const features = rows.map((r) => r.feature);
    expect(new Set(features).size).toBe(features.length);
    for (const f of wanted) expect(features).toContain(f);
  });

  it('shows exports as working in Read-only and Closed and core compliance as view only then export only', () => {
    const readOnly = whatWorks('readOnly');
    expect(readOnly.find((r) => r.feature === 'exports')?.availability).toBe('yes');
    expect(readOnly.find((r) => r.feature === 'coreCompliance')?.availability).toBe('viewOnly');
    expect(whatWorks('closed').find((r) => r.feature === 'coreCompliance')?.availability).toBe('exportOnly');
  });

  it('gives a different sentence key when the availability differs', () => {
    const live = (s: AccountState) => whatWorks(s).find((r) => r.feature === 'liveCompetitions')!.key;
    expect(live('limited')).not.toBe(live('readOnly'));
    expect(live('active')).not.toBe(live('limited'));
  });
});

describe('staffAccountNotice', () => {
  it('shows staff nothing while the account is healthy, past due or limited', () => {
    for (const state of ['trial', 'active', 'pastDue', 'limited'] as const) {
      expect(staffAccountNotice(state)).toBeNull();
    }
  });

  it('shows the neutral "speak to your manager" notice in Read-only and Paused', () => {
    expect(staffAccountNotice('readOnly')?.key).toBeTruthy();
    expect(staffAccountNotice('paused')?.key).toBe(staffAccountNotice('readOnly')?.key);
  });

  it('never uses payment wording in the notice key', () => {
    const key = staffAccountNotice('readOnly')?.key ?? '';
    expect(key).not.toMatch(/pay|bill|invoice|price|card/i);
  });

  it('shows nothing once staff cannot sign in (Closed, Deleted)', () => {
    expect(staffAccountNotice('closed')).toBeNull();
    expect(staffAccountNotice('deleted')).toBeNull();
  });
});
