// M4 chunk 12a contract tests: the provider dunning view (P9) and its two sensitive actions (BP-9, brief 24.7).
// Written before the implementation, so the new service is described by local types (the contract the implementer
// adds to `DataStore` as `dunning: DunningService`). Runs against every adapter.
//
// Conventions the tests assume:
//   - overview(ctx): provider side, needs billing.read. Lists every client whose account state (computed at ctx.now,
//     so a fast-forwarded provider ctx walks the clock) is not 'active': trial, pastDue, limited, readOnly, paused and
//     closed. Rows are sorted by severity (closed, readOnly, limited, pastDue, paused, trial) then by clientName.
//   - amountOutstandingPence of a row is the sum of `total` of that client's invoices with status 'overdue'.
//     DunningOverview.outstandingPence is the sum over the listed rows.
//   - nextState / daysToNextState come from the domain nextTransition at ctx.now (absent when the timeline is paused
//     or nothing follows). daysToNextState is whole London days from ctx.now to nextState.at. daysToDeletion is
//     whole days to the 'deleted' step, present only for closed accounts and trials already past their end.
//   - recoveryRatePercent = round(100 * clients with a success payment attempt later than a failed (soft or hard)
//     attempt / clients with at least one failed attempt), over all clients; null when no client ever failed.
//   - extendGrace(ctx, clientId, days): needs billing.manageDunning (sensitive, requires billing.write). Only valid
//     while the stored state is pastDue or limited (else ValidationError); days is a whole number 1..30 (else
//     ValidationError). Pushes the next state change back by exactly `days` by setting
//     Subscription.graceExtendedUntil to the new change date. Audited as 'dunning.extendGrace' with clientId.
//   - setPaused(ctx, clientId, paused): needs billing.manageDunning. Sets Subscription.timelinePaused (false clears
//     it); while paused the state does not advance. Audited as 'dunning.pause' with clientId.
//   - Client and staff actors are Forbidden for all three methods. An unknown client is NotFoundError.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type AccountState,
  type Client,
  type Invoice,
  type PaymentAttempt,
  type Role,
  type RoleAssignment,
  type Subscription,
  type UserAccount,
} from '@sta/domain';
import { load } from '@sta/seed';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { refusal } from './learning';
import { freshId, SEED_VALUE, TODAY } from './world';

type DunningRow = {
  clientId: string;
  clientName: string;
  state: AccountState;
  amountOutstandingPence: number;
  nextState?: { state: AccountState; at: string };
  daysToNextState?: number;
  daysToDeletion?: number;
  paused?: boolean;
};
type DunningOverview = { rows: DunningRow[]; recoveryRatePercent: number | null; outstandingPence: number };
type DunningStore = {
  dunning: {
    overview(ctx: ActorContext): Promise<DunningOverview>;
    extendGrace(ctx: ActorContext, clientId: string, days: number): Promise<void>;
    setPaused(ctx: ActorContext, clientId: string, paused: boolean): Promise<void>;
  };
  billing: { payNow(ctx: ActorContext): Promise<void> };
  account: {
    status(ctx: ActorContext): Promise<{ state: AccountState; nextChange?: { state: AccountState; at: string } }>;
  };
};
type SimulatingAdmin = DemoAdmin & { simulateFailedPayment(clientId: string, now: string): Promise<void> };

const DAY = 86_400_000;
const plus = (days: number): string => new Date(Date.parse(TODAY) + days * DAY).toISOString();
const SEVERITY: AccountState[] = ['closed', 'readOnly', 'limited', 'pastDue', 'paused', 'trial'];

export function runDunningContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const keys = await load(handle.admin, { seedValue: SEED_VALUE, today: TODAY });
    const admin = handle.admin as SimulatingAdmin;
    const store = handle.store as unknown as DunningStore;
    const dump = async <T>(st: StoreName): Promise<T[]> =>
      ((await admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    const u = keys.users;
    const provider = (userId: string, days = 0): ActorContext => ({ userId, side: 'provider', now: plus(days) });
    const willow = keys.clients['willowLane'];
    const clientCtx = (days = 0): ActorContext => ({
      userId: u['willowLaneOwner'],
      side: 'client',
      clientId: willow,
      now: plus(days),
    });

    // A provider who can write billing but has not been given billing.manageDunning.
    const billingUser: UserAccount = {
      id: freshId(4001),
      side: 'provider',
      email: 'billing-only@example.test',
      displayName: 'Billing only',
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    };
    const billingRole: Role = {
      id: freshId(4002),
      owner: 'provider',
      name: 'Billing writer',
      description: 'Billing writer',
      colour: '#336699',
      permissionIds: ['billing.read', 'billing.write'],
      system: false,
      version: 1,
      updatedBy: u['providerOwner'],
      updatedAt: TODAY,
    };
    const assignment: RoleAssignment = {
      id: freshId(4003),
      userId: billingUser.id,
      roleIds: [billingRole.id],
      scope: { type: 'all' },
      grants: [],
      denies: [],
      status: 'active',
    };
    await admin.bulkPut('users', [billingUser]);
    await admin.bulkPut('roles', [billingRole]);
    await admin.bulkPut('roleAssignments', [assignment]);

    const subscriptionOf = async (clientId: string): Promise<Subscription> =>
      (await dump<Subscription>('subscriptions')).find((s) => s.clientId === clientId)!;
    const audit = async (action: string, clientId?: string) =>
      (await dump<{ action: string; clientId?: string; actorId: string }>('audit')).filter(
        (e) => e.action === action && (clientId === undefined || e.clientId === clientId),
      );
    const rowOf = (o: DunningOverview, clientId: string): DunningRow | undefined =>
      o.rows.find((r) => r.clientId === clientId);
    const clientName = async (clientId: string): Promise<string> =>
      (await dump<Client>('clients')).find((c) => c.id === clientId)!.displayName;
    /** Recovery rate worked out from the stored attempts, by the rule in the header comment. */
    const expectedRecovery = async (): Promise<number | null> => {
      const attempts = await dump<PaymentAttempt>('paymentAttempts');
      const failed = new Map<string, number>();
      for (const a of attempts) {
        if (a.result === 'success') continue;
        failed.set(a.clientId, Math.min(failed.get(a.clientId) ?? Infinity, Date.parse(a.at)));
      }
      if (failed.size === 0) return null;
      let recovered = 0;
      for (const [clientId, firstFail] of failed) {
        if (attempts.some((a) => a.clientId === clientId && a.result === 'success' && Date.parse(a.at) > firstFail)) {
          recovered += 1;
        }
      }
      return Math.round((100 * recovered) / failed.size);
    };

    return {
      admin,
      store,
      keys,
      dump,
      willow,
      owner: provider(u['providerOwner']),
      ownerAt: (days: number) => provider(u['providerOwner'], days),
      readOnlyProvider: provider(u['tom']),
      support: provider(u['sophie']),
      billingOnly: provider(billingUser.id),
      clientCtx,
      priya: {
        userId: u['priya'],
        side: 'client',
        clientId: keys.clients['littleAcorns'],
        now: TODAY,
      } as ActorContext,
      jade: { userId: u['jade'], side: 'staff', clientId: keys.clients['littleAcorns'], now: TODAY } as ActorContext,
      subscriptionOf,
      audit,
      rowOf,
      clientName,
      expectedRecovery,
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  /** Willow Lane fails a payment now: Past due from TODAY (day 0; Limited from day 15 under the default policy). */
  async function fail(s: S): Promise<void> {
    await s.admin.simulateFailedPayment(s.willow, TODAY);
  }

  describe(`M4 dunning (P9): ${name}`, () => {
    describe('overview rows', () => {
      it('lists every client that is not Active, with the seeded state of each', async () => {
        const s = await setup();
        const o = await s.store.dunning.overview(s.owner);
        const states = Object.fromEntries(o.rows.map((r) => [r.clientName, r.state]));
        expect(states).toEqual({
          'Willow Lane Nursery': 'pastDue',
          'Rosewood Care Home': 'trial',
          'Atelier Vasquine': 'trial',
          'Sunny Days Pre-school': 'limited',
          'Little Stars Day Nursery': 'readOnly',
          'Meadowview Nursery': 'closed',
          'Pebbles Childcare': 'paused',
        });
        expect(o.rows.some((r) => r.state === 'active')).toBe(false);
      });

      it('sorts by state severity, then by name', async () => {
        const s = await setup();
        const o = await s.store.dunning.overview(s.owner);
        const keyOf = (r: DunningRow) => [SEVERITY.indexOf(r.state), r.clientName] as const;
        const sorted = [...o.rows].sort((x, y) => {
          const [a, an] = keyOf(x);
          const [b, bn] = keyOf(y);
          return a - b || an.localeCompare(bn);
        });
        expect(o.rows.map((r) => r.clientId)).toEqual(sorted.map((r) => r.clientId));
        expect(o.rows[0]!.state).toBe('closed');
        // The two trials share a severity, so they are in name order.
        const trials = o.rows.filter((r) => r.state === 'trial').map((r) => r.clientName);
        expect(trials).toEqual(['Atelier Vasquine', 'Rosewood Care Home']);
      });

      it('shows Willow Lane Past due after a failed payment, with an amount owed and days to the next state', async () => {
        const s = await setup();
        await fail(s);
        const row = s.rowOf(await s.store.dunning.overview(s.owner), s.willow)!;
        expect(row.state).toBe('pastDue');
        expect(row.clientName).toBe('Willow Lane Nursery');
        expect(row.amountOutstandingPence).toBeGreaterThan(0);
        expect(row.nextState?.state).toBe('limited');
        expect(row.daysToNextState).toBe(15);
        expect(row.daysToDeletion).toBeUndefined();
      });

      it('gives an amount owed equal to the overdue invoices of that client, and a matching total', async () => {
        const s = await setup();
        await fail(s);
        const o = await s.store.dunning.overview(s.owner);
        const invoices = await s.dump<Invoice>('invoices');
        for (const r of o.rows) {
          const owed = invoices
            .filter((i) => i.clientId === r.clientId && i.status === 'overdue')
            .reduce((sum, i) => sum + i.total, 0);
          expect(r.amountOutstandingPence, r.clientName).toBe(owed);
        }
        expect(o.outstandingPence).toBe(o.rows.reduce((sum, r) => sum + r.amountOutstandingPence, 0));
        expect(o.outstandingPence).toBeGreaterThan(0);
      });

      it('shows days to deletion for a closed account and none for a Past due one', async () => {
        const s = await setup();
        const o = await s.store.dunning.overview(s.owner);
        const meadow = o.rows.find((r) => r.clientName === 'Meadowview Nursery')!;
        expect(meadow.nextState?.state).toBe('deleted');
        expect(meadow.daysToNextState).toBe(40);
        expect(meadow.daysToDeletion).toBe(40);
        const willow = s.rowOf(o, s.willow)!;
        expect(willow.daysToDeletion).toBeUndefined();
      });

      it('shows a paused account with no next state', async () => {
        const s = await setup();
        const o = await s.store.dunning.overview(s.owner);
        const pebbles = o.rows.find((r) => r.clientName === 'Pebbles Childcare')!;
        expect(pebbles.state).toBe('paused');
        expect(pebbles.nextState).toBeUndefined();
        expect(pebbles.daysToNextState).toBeUndefined();
      });

      it('walks Willow Lane through Limited, Read-only and Closed as the provider clock fast-forwards', async () => {
        const s = await setup();
        await fail(s);
        const stateAt = async (days: number) =>
          s.rowOf(await s.store.dunning.overview(s.ownerAt(days)), s.willow)?.state;
        expect(await stateAt(0)).toBe('pastDue');
        expect(await stateAt(10)).toBe('pastDue');
        expect(await stateAt(20)).toBe('limited');
        expect(await stateAt(45)).toBe('readOnly');
        expect(await stateAt(90)).toBe('closed');
      });

      it('agrees with the client app at every step of the walk', async () => {
        const s = await setup();
        await fail(s);
        for (const days of [0, 20, 45, 90]) {
          const row = s.rowOf(await s.store.dunning.overview(s.ownerAt(days)), s.willow)!;
          expect(row.state, `day ${String(days)}`).toBe((await s.store.account.status(s.clientCtx(days))).state);
        }
      });
    });

    describe('paying and the recovery rate', () => {
      it('removes the row and gives a recovery rate once the owner pays', async () => {
        const s = await setup();
        await fail(s);
        expect(s.rowOf(await s.store.dunning.overview(s.owner), s.willow)).toBeDefined();
        await s.store.billing.payNow(s.clientCtx(1));
        const o = await s.store.dunning.overview(s.ownerAt(1));
        expect(s.rowOf(o, s.willow)).toBeUndefined();
        expect(o.recoveryRatePercent).not.toBeNull();
        expect(o.recoveryRatePercent).toBeGreaterThan(0);
        expect(o.recoveryRatePercent).toBe(await s.expectedRecovery());
      });

      it('counts only failures that were followed by a success', async () => {
        const s = await setup();
        await fail(s);
        const before = await s.store.dunning.overview(s.owner);
        expect(before.recoveryRatePercent).toBe(await s.expectedRecovery());
        await s.store.billing.payNow(s.clientCtx(1));
        const after = await s.store.dunning.overview(s.ownerAt(1));
        expect(after.recoveryRatePercent!).toBeGreaterThan(before.recoveryRatePercent ?? 0);
        expect(after.recoveryRatePercent!).toBeLessThanOrEqual(100);
      });
    });

    describe('extend grace', () => {
      it('pushes the next state change back by the days given and records it on the subscription', async () => {
        const s = await setup();
        await fail(s);
        const before = s.rowOf(await s.store.dunning.overview(s.owner), s.willow)!;
        await s.store.dunning.extendGrace(s.owner, s.willow, 5);
        const after = s.rowOf(await s.store.dunning.overview(s.owner), s.willow)!;
        expect(after.state).toBe('pastDue');
        expect(after.nextState?.state).toBe('limited');
        expect(Date.parse(after.nextState!.at) - Date.parse(before.nextState!.at)).toBe(5 * DAY);
        expect(after.daysToNextState).toBe(before.daysToNextState! + 5);
        const sub = await s.subscriptionOf(s.willow);
        expect(sub.graceExtendedUntil).toBe(after.nextState!.at);
      });

      it('keeps the account Past due on a day that would have been Limited', async () => {
        const s = await setup();
        await fail(s);
        expect((await s.store.account.status(s.clientCtx(17))).state).toBe('limited');
        await s.store.dunning.extendGrace(s.owner, s.willow, 5);
        expect((await s.store.account.status(s.clientCtx(17))).state).toBe('pastDue');
        expect(s.rowOf(await s.store.dunning.overview(s.ownerAt(17)), s.willow)?.state).toBe('pastDue');
        expect((await s.store.account.status(s.clientCtx(25))).state).toBe('limited');
      });

      it('also delays the next change of a Limited account', async () => {
        const s = await setup();
        const sunny = s.keys.clients['sunnyDays'];
        const before = s.rowOf(await s.store.dunning.overview(s.owner), sunny)!;
        expect(before.state).toBe('limited');
        await s.store.dunning.extendGrace(s.owner, sunny, 7);
        const after = s.rowOf(await s.store.dunning.overview(s.owner), sunny)!;
        expect(Date.parse(after.nextState!.at) - Date.parse(before.nextState!.at)).toBe(7 * DAY);
      });

      it('writes one audit entry with the actor and client', async () => {
        const s = await setup();
        await fail(s);
        await s.store.dunning.extendGrace(s.owner, s.willow, 3);
        const entries = await s.audit('dunning.extendGrace', s.willow);
        expect(entries).toHaveLength(1);
        expect(entries[0]!.actorId).toBe(s.owner.userId);
      });

      it.each([
        ['an Active client', 'littleAcorns'],
        ['a Read-only client', 'littleStars'],
        ['a Closed client', 'meadowview'],
        ['a Trial client', 'rosewood'],
      ])('refuses %s with ValidationError and changes nothing', async (_label, key) => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.dunning.extendGrace(s.owner, s.keys.clients[key]!, 5))).toBeInstanceOf(
          ValidationError,
        );
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it.each([0, -1, 31, 2.5])('refuses %s days with ValidationError and changes nothing', async (days) => {
        const s = await setup();
        await fail(s);
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.dunning.extendGrace(s.owner, s.willow, days))).toBeInstanceOf(ValidationError);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('accepts the limits of 1 and 30 days', async () => {
        const s = await setup();
        await fail(s);
        await expect(s.store.dunning.extendGrace(s.owner, s.willow, 1)).resolves.toBeUndefined();
        await expect(s.store.dunning.extendGrace(s.owner, s.willow, 30)).resolves.toBeUndefined();
      });

      it('refuses an unknown client with NotFoundError', async () => {
        const s = await setup();
        expect(await refusal(s.store.dunning.extendGrace(s.owner, freshId(4900), 5))).toBeInstanceOf(NotFoundError);
      });
    });

    describe('pause', () => {
      it('stops the state advancing while paused, as the client app sees it', async () => {
        const s = await setup();
        await fail(s);
        await s.store.dunning.setPaused(s.owner, s.willow, true);
        expect((await s.subscriptionOf(s.willow)).timelinePaused).toBe(true);
        const later = await s.store.account.status(s.clientCtx(45));
        expect(later.state).toBe('pastDue');
        expect(later.nextChange).toBeUndefined();
        const row = s.rowOf(await s.store.dunning.overview(s.ownerAt(45)), s.willow)!;
        expect(row.state).toBe('pastDue');
        expect(row.nextState).toBeUndefined();
        expect(row.daysToNextState).toBeUndefined();
        expect(row.paused).toBe(true);
      });

      it('lets the state advance again when un-paused', async () => {
        const s = await setup();
        await fail(s);
        await s.store.dunning.setPaused(s.owner, s.willow, true);
        await s.store.dunning.setPaused(s.owner, s.willow, false);
        expect((await s.subscriptionOf(s.willow)).timelinePaused).toBeFalsy();
        expect(s.rowOf(await s.store.dunning.overview(s.owner), s.willow)!.paused).toBeUndefined();
        expect((await s.store.account.status(s.clientCtx(20))).state).toBe('limited');
      });

      it('writes an audit entry for pausing and for resuming', async () => {
        const s = await setup();
        await fail(s);
        await s.store.dunning.setPaused(s.owner, s.willow, true);
        await s.store.dunning.setPaused(s.owner, s.willow, false);
        const entries = await s.audit('dunning.pause', s.willow);
        expect(entries).toHaveLength(2);
        expect(entries.every((e) => e.actorId === s.owner.userId)).toBe(true);
      });

      it('refuses an unknown client with NotFoundError', async () => {
        const s = await setup();
        expect(await refusal(s.store.dunning.setPaused(s.owner, freshId(4901), true))).toBeInstanceOf(NotFoundError);
      });
    });

    describe('who may use it', () => {
      it('lets a provider with billing.read see the overview but not change anything', async () => {
        const s = await setup();
        await fail(s);
        await expect(s.store.dunning.overview(s.readOnlyProvider)).resolves.toBeDefined();
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.dunning.extendGrace(s.readOnlyProvider, s.willow, 5))).toBeInstanceOf(
          ForbiddenError,
        );
        expect(await refusal(s.store.dunning.setPaused(s.readOnlyProvider, s.willow, true))).toBeInstanceOf(
          ForbiddenError,
        );
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('refuses the changes to a provider with billing.write but not billing.manageDunning', async () => {
        const s = await setup();
        await fail(s);
        await expect(s.store.dunning.overview(s.billingOnly)).resolves.toBeDefined();
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.dunning.extendGrace(s.billingOnly, s.willow, 5))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.dunning.setPaused(s.billingOnly, s.willow, true))).toBeInstanceOf(ForbiddenError);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('refuses all three methods to a provider without billing.read', async () => {
        const s = await setup();
        await fail(s);
        expect(await refusal(s.store.dunning.overview(s.support))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.dunning.extendGrace(s.support, s.willow, 5))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.dunning.setPaused(s.support, s.willow, true))).toBeInstanceOf(ForbiddenError);
      });

      it.each(['priya', 'jade'] as const)(
        'refuses all three methods to the %s actor, even the account owner',
        async (who) => {
          const s = await setup();
          await fail(s);
          const ctx = s[who];
          expect(await refusal(s.store.dunning.overview(ctx))).toBeInstanceOf(ForbiddenError);
          expect(await refusal(s.store.dunning.extendGrace(ctx, s.willow, 5))).toBeInstanceOf(ForbiddenError);
          expect(await refusal(s.store.dunning.setPaused(ctx, s.willow, true))).toBeInstanceOf(ForbiddenError);
        },
      );

      it('refuses the Willow Lane owner for its own account', async () => {
        const s = await setup();
        await fail(s);
        const beth = s.clientCtx();
        expect(await refusal(s.store.dunning.extendGrace(beth, s.willow, 5))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.dunning.setPaused(beth, s.willow, true))).toBeInstanceOf(ForbiddenError);
        expect(await s.audit('dunning.extendGrace')).toHaveLength(0);
        expect(await s.audit('dunning.pause')).toHaveLength(0);
      });

      it('lets the provider owner use the new permission (billing.manageDunning is in the provider catalogue)', async () => {
        const s = await setup();
        await fail(s);
        await expect(s.store.dunning.setPaused(s.owner, s.willow, true)).resolves.toBeUndefined();
        expect(await s.clientName(s.willow)).toBe('Willow Lane Nursery');
      });
    });
  });
}
