// Provider price changes (M4 chunk 4a, plan BP-7). Provider side only. Each write authorises, applies the domain
// rules (@sta/domain pricing) and then writes in ONE batch together with its audit event. Money is integer pence.
import {
  cancelAdjustment,
  confirmAdjustment,
  demoTwoFactorCode,
  OWNER_KEYS,
  planPrice,
  previewAdjustment,
  priceAdjustmentSchema,
  priceFor,
  supersede,
  DEFAULT_NOTICE_DAYS,
  effectiveDateFor,
  submitAdjustment,
  type AddOn,
  type AddOnSubscription,
  type Client,
  type OutboxMessage,
  type Package,
  type Person,
  type PriceAdjustment,
  type Role,
  type RoleAssignment,
  type Site,
  type Subscription,
  type UserAccount,
} from '@sta/domain';
import { createT, languages } from '@sta/content';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type PricingDraftInput,
  type PricingService,
  type StoreOptions,
} from './types';

const DRAFT = 'billing.draftPriceChanges';
const CONFIRM = 'billing.confirmPriceChanges';
const READ = ['billing.read', DRAFT, CONFIRM];

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
// Placeholder lowest monthly price (£10.00) that raises the below-floor warning until the real floor is decided.
const PLACEHOLDER_FLOOR_PENCE = 1000;
const say = createT(languages['en-GB'].messages);
const pounds = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

export function createPricingOperations(backend: RawBackend, options: StoreOptions): PricingService {
  async function providerCall(ctx: ActorContext, any: readonly string[]): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider') return forbid('permission');
    if (!holds(call, any)) return forbid('permission');
    return call;
  }

  const all = (call: Call) => call.all<PriceAdjustment>('priceAdjustments');

  async function load(call: Call, id: string): Promise<PriceAdjustment> {
    const found = (await all(call)).find((a) => a.id === text(id));
    if (!found) throw new NotFoundError();
    return found;
  }

  /** Runs a domain transition; a state it refuses becomes a business-rule refusal. */
  function transition(fn: () => PriceAdjustment): PriceAdjustment {
    try {
      return fn();
    } catch {
      throw new RuleError('notApplicable');
    }
  }

  function candidate(call: Call, id: string, input: PricingDraftInput): PriceAdjustment {
    const i = (input as Partial<PricingDraftInput> | null) ?? {};
    const raw: Record<string, unknown> = {
      id,
      clientIds: i.clientIds,
      scope: i.scope,
      type: i.type,
      value: i.value,
      reason: i.reason,
      noticeDays: i.noticeDays ?? DEFAULT_NOTICE_DAYS,
      status: 'draft',
      createdBy: call.actor.user.id,
    };
    if (i.endsAt !== undefined) raw['endsAt'] = input.endsAt;
    if (i.note !== undefined) raw['note'] = input.note;
    const parsed = priceAdjustmentSchema.safeParse(raw);
    const firstEffective = effectiveDateFor(
      call.actor.ctx.now,
      typeof raw['noticeDays'] === 'number' ? raw['noticeDays'] : 0,
    );
    if (
      parsed.success &&
      parsed.data.endsAt !== undefined &&
      Date.parse(parsed.data.endsAt) <= Date.parse(firstEffective)
    ) {
      throw new ValidationError(['endsAt: the end date must be after the change starts']);
    }
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
    }
    return parsed.data;
  }

  async function listPriceOf(call: Call, clientId: string, scope: PriceAdjustment['scope']): Promise<number> {
    if (scope.kind === 'addOn') {
      const addOn = await call.find<AddOn>('addOns', scope.addOnId);
      return addOn?.pricing.kind === 'flat' ? addOn.pricing.price : 0;
    }
    const plan = await planListPrice(call, clientId);
    if (scope.kind === 'invoice') {
      // The whole monthly invoice: the plan plus each active flat-price add-on.
      const subs = (await call.all<AddOnSubscription>('addOnSubscriptions')).filter(
        (s) =>
          s.clientId === clientId && s.status !== 'off' && (s.endsAt === undefined || s.endsAt > call.actor.ctx.now),
      );
      let total = plan;
      for (const s of subs) {
        const addOn = await call.find<AddOn>('addOns', s.addOnId);
        if (addOn?.pricing.kind === 'flat') total += addOn.pricing.price;
      }
      return total;
    }
    return plan;
  }

  async function planListPrice(call: Call, clientId: string): Promise<number> {
    const sub = (await call.all<Subscription>('subscriptions')).find((s) => s.clientId === clientId);
    const pkg = sub ? await call.find<Package>('packages', sub.packageId) : undefined;
    if (!pkg) return 0;
    const staff = (await call.all<Person>('people')).filter((p) => p.clientId === clientId && p.status === 'active');
    const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === clientId && s.status === 'active');
    return planPrice(pkg, staff.length, sites.length).total;
  }

  async function previewFor(call: Call, adj: PriceAdjustment) {
    for (const id of adj.clientIds) {
      if (!(await call.find<Client>('clients', id))) throw new ValidationError([`clientIds: unknown client`]);
    }
    const existing = await all(call);
    const rows: ReturnType<typeof previewAdjustment>['rows'] = [];
    const warnings: string[] = [];
    for (const clientId of adj.clientIds) {
      const result = previewAdjustment({
        clients: [{ clientId, listPrice: await listPriceOf(call, clientId, adj.scope) }],
        adjustment: adj,
        at: call.actor.ctx.now,
        existing: existing.filter((e) => e.clientIds.includes(clientId)),
        floorPence: PLACEHOLDER_FLOOR_PENCE,
      });
      rows.push(...result.rows);
      for (const w of result.warnings) if (!warnings.includes(w)) warnings.push(w);
    }
    return { rows, warnings };
  }

  /** One message per client to the billing contact and the Account Owner. */
  async function noticeFor(
    call: Call,
    clientId: string,
    row: { currentPrice: number; newPrice: number; effectiveAt: string },
  ) {
    const sub = (await call.all<Subscription>('subscriptions')).find((s) => s.clientId === clientId);
    const roles = await call.all<Role>('roles');
    const ownerRoles = new Set(roles.filter((r) => r.system && r.systemKey === OWNER_KEYS.client).map((r) => r.id));
    const assignments = (await call.all<RoleAssignment>('roleAssignments')).filter(
      (a) => a.status === 'active' && a.roleIds.some((id) => ownerRoles.has(id)),
    );
    const owners = (await call.all<UserAccount>('users')).filter(
      (u) =>
        u.side === 'client' &&
        u.clientId === clientId &&
        u.status === 'active' &&
        assignments.some((a) => a.userId === u.id),
    );
    const to = [...new Set([sub?.billingContact, ...owners.map((o) => o.email)].filter((e): e is string => !!e))];
    if (to.length === 0) return undefined;
    const mail: OutboxMessage = {
      id: call.newId(),
      channel: 'email',
      to: to.join(', '),
      subject: say('client.priceNotice.emailSubject'),
      body: `${say('client.priceNotice.emailBody', {
        oldPrice: pounds(row.currentPrice),
        newPrice: pounds(row.newPrice),
        date: row.effectiveAt.slice(0, 10),
      })} ${say('client.priceNotice.emailAsk')}`,
      at: call.actor.ctx.now,
      reason: 'pricing.increaseNotice',
    };
    return put('outbox', mail.id, mail);
  }

  return {
    async draft(ctx, input) {
      const call = await providerCall(ctx, [DRAFT]);
      const adj = candidate(call, call.newId(), input);
      for (const id of adj.clientIds) {
        if (!(await call.find<Client>('clients', id))) throw new ValidationError(['clientIds: unknown client']);
      }
      await backend.apply([
        put('priceAdjustments', adj.id, adj),
        audit(call, undefined, 'pricing.draft', adj.id, undefined, { type: adj.type, scope: adj.scope }),
      ]);
      return structuredClone(adj);
    },

    async submit(ctx, id) {
      const call = await providerCall(ctx, [DRAFT]);
      const before = await load(call, id);
      const next = transition(() => submitAdjustment(before));
      await backend.apply([
        put('priceAdjustments', next.id, next),
        audit(call, undefined, 'pricing.submit', next.id, { status: before.status }, { status: next.status }),
      ]);
      return structuredClone(next);
    },

    async confirm(ctx, id, stepUpCode) {
      const call = await providerCall(ctx, [CONFIRM]);
      const before = await load(call, id);
      const given = text(stepUpCode).trim();
      const failure = given === '' ? 'stepUpRequired' : given !== demoTwoFactorCode ? 'wrongCode' : undefined;
      if (failure) {
        await backend.apply([
          audit(call, undefined, 'pricing.confirmFailed', before.id, undefined, { reason: failure }),
        ]);
        throw new RuleError(failure);
      }
      const next = transition(() =>
        confirmAdjustment(before, { confirmerId: call.actor.user.id, confirmedAt: ctx.now }),
      );
      const existing = await all(call);
      // The old change keeps applying until this one starts (no gap during notice); see supersede.
      const { updates, replacedIds } = supersede(existing, next, () => call.newId());
      const ops: WriteOp[] = updates.map((e) => put('priceAdjustments', e.id, e));
      ops.push(put('priceAdjustments', next.id, next));
      // Notices go out for increases only: the change must raise the price over what the client would pay
      // on the same date without it (replaced changes dropped).
      const dropped = new Set(replacedIds);
      const kept = existing.filter((e) => !dropped.has(e.id) && e.id !== before.id);
      const { rows } = await previewFor(call, { ...before, status: 'draft' });
      for (const row of rows) {
        const without = priceFor({
          listPrice: await listPriceOf(call, row.clientId, before.scope),
          scope: before.scope,
          adjustments: kept.filter((e) => e.clientIds.includes(row.clientId)),
          at: row.effectiveAt,
        });
        if (row.newPrice <= without) continue;
        const notice = await noticeFor(call, row.clientId, row);
        if (notice) ops.push(notice);
      }
      ops.push(
        audit(
          call,
          undefined,
          'pricing.confirm',
          next.id,
          { status: before.status },
          { status: next.status, effectiveAt: next.effectiveAt, replaced: replacedIds },
        ),
      );
      await backend.apply(ops);
      return structuredClone(next);
    },

    async cancel(ctx, id) {
      const call = await providerCall(ctx, [DRAFT, CONFIRM]);
      const before = await load(call, id);
      const ownDraft = before.status === 'draft' && before.createdBy === call.actor.user.id && holds(call, [DRAFT]);
      if (!ownDraft && !holds(call, [CONFIRM])) return forbid('permission');
      const next = transition(() => cancelAdjustment(before));
      await backend.apply([
        put('priceAdjustments', next.id, next),
        audit(call, undefined, 'pricing.cancel', next.id, { status: before.status }, { status: next.status }),
      ]);
      return structuredClone(next);
    },

    async list(ctx) {
      const call = await providerCall(ctx, READ);
      return structuredClone((await all(call)).sort((a, b) => (a.id < b.id ? -1 : 1)));
    },

    async preview(ctx, input) {
      const call = await providerCall(ctx, READ);
      return structuredClone(await previewFor(call, candidate(call, call.newId(), input)));
    },

    async effectivePrice(ctx, clientId, listPrice, scope) {
      const call = await providerCall(ctx, READ);
      if (typeof listPrice !== 'number' || !Number.isFinite(listPrice) || listPrice < 0) {
        throw new ValidationError(['listPrice: a number of pence, 0 or more']);
      }
      return priceFor({
        listPrice,
        scope,
        adjustments: (await all(call)).filter((a) => a.clientIds.includes(clientId)),
        at: ctx.now,
      });
    },
  };
}
