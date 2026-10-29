// Provider dunning view and its two sensitive actions (M4 chunk 12a, brief 24.7). Reads need billing.read; extending
// grace and pausing the timeline need billing.manageDunning. The state is always worked out at ctx.now by the domain.
import {
  accountStateAt,
  addDays,
  daysUntil,
  defaultDunningPolicy,
  nextTransition,
  recoveryRatePercent,
  startOfLondonDay,
  type AccountState,
  type Client,
  type Invoice,
  type PaymentAttempt,
  type Subscription,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  ValidationError,
  type ActorContext,
  type DunningOverview,
  type DunningRow,
  type DunningService,
  type StoreOptions,
} from './types';

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });

export type DunningOperations = { dunning: DunningService };

const DAY_MS = 86_400_000;
const MAX_GRACE_DAYS = 30;
/** Trial path after the end date: read-only 14 days, closed 30 days, then deleted (brief 24.3). */
const TRIAL_TO_DELETION_DAYS = 44;
const SEVERITY: AccountState[] = ['closed', 'readOnly', 'limited', 'pastDue', 'paused', 'trial'];

export function createDunningOperations(backend: RawBackend, options: StoreOptions): DunningOperations {
  async function providerCall(ctx: ActorContext, ids: readonly string[]): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, ids)) return forbid('permission');
    return call;
  }

  async function subscriptionOf(call: Call, clientId: string): Promise<{ client: Client; sub: Subscription }> {
    const client = await call.find<Client>('clients', clientId);
    const sub = (await call.all<Subscription>('subscriptions')).find((s) => s.clientId === clientId);
    if (!client || !sub) throw new NotFoundError();
    return { client, sub };
  }

  const dunning: DunningService = {
    async overview(ctx) {
      const call = await providerCall(ctx, ['billing.read']);
      const now = call.actor.now;
      const [clients, subs, invoices, attempts] = await Promise.all([
        call.all<Client>('clients'),
        call.all<Subscription>('subscriptions'),
        call.all<Invoice>('invoices'),
        call.all<PaymentAttempt>('paymentAttempts'),
      ]);
      const subOf = new Map(subs.map((s) => [s.clientId, s]));
      const rows: DunningRow[] = [];
      for (const client of clients) {
        const sub = subOf.get(client.id);
        const state = sub ? accountStateAt(sub, [], defaultDunningPolicy, now) : client.accountState;
        if (state === 'active' || state === 'deleted') continue;
        const next = sub ? nextTransition(sub, defaultDunningPolicy, now) : null;
        const owed = invoices
          .filter((i) => i.clientId === client.id && i.status === 'overdue')
          .reduce((sum, i) => sum + i.total, 0);
        const row: DunningRow = {
          clientId: client.id,
          clientName: client.displayName,
          state,
          amountOutstandingPence: owed,
        };
        if (next) {
          row.nextState = { state: next.state, at: next.at.toISOString() };
          row.daysToNextState = daysUntil(now, next.at);
          if (next.state === 'deleted') row.daysToDeletion = row.daysToNextState;
        }
        if (
          row.daysToDeletion === undefined &&
          sub?.state === 'trial' &&
          sub.nextStateAt &&
          now.getTime() >= Date.parse(sub.nextStateAt) &&
          !sub.timelinePaused
        ) {
          const at = startOfLondonDay(addDays(new Date(sub.nextStateAt), TRIAL_TO_DELETION_DAYS));
          row.daysToDeletion = daysUntil(now, at);
        }
        rows.push(row);
      }
      rows.sort(
        (a, b) =>
          SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state) ||
          a.clientName.localeCompare(b.clientName) ||
          (a.clientId < b.clientId ? -1 : 1),
      );
      const overview: DunningOverview = {
        rows,
        recoveryRatePercent: recoveryRatePercent(attempts),
        outstandingPence: rows.reduce((sum, r) => sum + r.amountOutstandingPence, 0),
      };
      return structuredClone(overview);
    },

    async extendGrace(ctx, clientId, days) {
      const call = await providerCall(ctx, ['billing.manageDunning']);
      if (!Number.isInteger(days) || days < 1 || days > MAX_GRACE_DAYS) {
        throw new ValidationError([`days: a whole number from 1 to ${String(MAX_GRACE_DAYS)}`]);
      }
      const { sub } = await subscriptionOf(call, clientId);
      const now = call.actor.now;
      const current = accountStateAt(sub, [], defaultDunningPolicy, now);
      if ((sub.state !== 'pastDue' && sub.state !== 'limited') || current !== sub.state) {
        throw new ValidationError(['clientId: grace can only be extended while Past due or Limited']);
      }
      const next = nextTransition(sub, defaultDunningPolicy, now);
      if (!next) throw new ValidationError(['clientId: no state change is due']);
      const until = new Date(next.at.getTime() + days * DAY_MS).toISOString();
      const updated: Subscription = { ...sub, graceExtendedUntil: until };
      await backend.apply([
        put('subscriptions', clientId, updated),
        audit(
          call,
          clientId,
          'dunning.extendGrace',
          clientId,
          { graceExtendedUntil: sub.graceExtendedUntil },
          { graceExtendedUntil: until, days },
        ),
      ]);
    },

    async setPaused(ctx, clientId, paused) {
      const call = await providerCall(ctx, ['billing.manageDunning']);
      const { sub } = await subscriptionOf(call, clientId);
      const updated: Subscription = { ...sub };
      if (paused) updated.timelinePaused = true;
      else delete updated.timelinePaused;
      await backend.apply([
        put('subscriptions', clientId, updated),
        audit(call, clientId, 'dunning.pause', clientId, { paused: sub.timelinePaused === true }, { paused }),
      ]);
    },
  };

  return { dunning };
}
