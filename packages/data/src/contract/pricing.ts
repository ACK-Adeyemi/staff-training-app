// M4 chunk 4a contract tests: provider price-change operations (plan docs/plans/m4.md, BP-7 and its security notes).
// Written before the implementation, so `store.pricing` is described by the local types below: the contract the
// implementer adds to `DataStore`. Runs against every adapter.
//
// Conventions the tests assume:
//   - Step-up code is the demo code '123456': blank gives RuleError('stepUpRequired'), anything else 'wrongCode'.
//   - A failed confirm writes audit 'pricing.confirmFailed'; a good one writes 'pricing.confirm'.
//   - Raj (provider Billing role) holds billing.draftPriceChanges but not billing.confirmPriceChanges; the provider
//     Owner holds both.
//   - effectivePrice(ctx, clientId, listPrice, scope) reads the clock from ctx.now.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, previewAdjustment, type Invoice, type PriceAdjustment } from '@sta/domain';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreName, type StoreOptions } from '../types';
import { refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY } from './world';

export type PricingDraftInput = {
  clientIds: string[];
  scope: PriceAdjustment['scope'];
  type: PriceAdjustment['type'];
  value: number;
  reason: PriceAdjustment['reason'];
  noticeDays?: number;
  endsAt?: string;
  note?: string;
};

export type PricingStore = {
  pricing: {
    draft(ctx: ActorContext, input: PricingDraftInput): Promise<PriceAdjustment>;
    submit(ctx: ActorContext, id: string): Promise<PriceAdjustment>;
    confirm(ctx: ActorContext, id: string, stepUpCode: string): Promise<PriceAdjustment>;
    cancel(ctx: ActorContext, id: string): Promise<PriceAdjustment>;
    list(ctx: ActorContext): Promise<PriceAdjustment[]>;
    /** Read-only: rows for every selected client, as domain previewAdjustment gives them. Writes nothing. */
    preview(
      ctx: ActorContext,
      input: PricingDraftInput,
    ): Promise<{ rows: ReturnType<typeof previewAdjustment>['rows']; warnings: string[] }>;
    effectivePrice(
      ctx: ActorContext,
      clientId: string,
      listPrice: number,
      scope: PriceAdjustment['scope'],
    ): Promise<number>;
  };
};

const DAY = 86_400_000;
const CODE = '123456';
const LIST_PRICE = 5000;
const NEW_PRICE = 4000;
const PLAN = { kind: 'plan' } as const;

export function runPricingContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx = await buildWorld(handle.admin);
    const store = handle.store as unknown as PricingStore;
    const provider = (key: string, now = TODAY): ActorContext => ({
      userId: fx.keys.users[key]!,
      side: 'provider',
      now,
    });
    const a = fx.ids.clients.a;
    const input: PricingDraftInput = {
      clientIds: [a],
      scope: PLAN,
      type: 'override',
      value: NEW_PRICE,
      reason: 'loyalty',
    };
    const dump = async <T>(s: StoreName): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as Record<string, unknown[]>)[s] as T[];
    const audit = async (action: string) =>
      (await dump<{ action: string }>('audit')).filter((e) => e.action === action);
    const priceAt = (now: string) => store.pricing.effectivePrice(provider('providerOwner', now), a, LIST_PRICE, PLAN);
    const submitted = async () => {
      const draft = await store.pricing.draft(provider('raj'), input);
      return store.pricing.submit(provider('raj'), draft.id);
    };
    return {
      store,
      admin: handle.admin,
      fx,
      a,
      input,
      audit,
      priceAt,
      submitted,
      dump,
      owner: provider('providerOwner'),
      raj: provider('raj'),
      provider,
      priya: { userId: fx.ids.users.priya, side: 'client', clientId: a, now: TODAY } as ActorContext,
      jade: { userId: fx.ids.users.jade, side: 'staff', clientId: a, now: TODAY } as ActorContext,
    };
  }

  describe(`M4 provider price changes: ${name}`, () => {
    it('refuses client and staff actors every pricing operation, and changes nothing', async () => {
      const s = await setup();
      const adj = await s.submitted();
      const before = await s.dump('priceAdjustments');
      for (const ctx of [s.priya, s.jade]) {
        for (const call of [
          () => s.store.pricing.draft(ctx, s.input),
          () => s.store.pricing.submit(ctx, adj.id),
          () => s.store.pricing.confirm(ctx, adj.id, CODE),
          () => s.store.pricing.cancel(ctx, adj.id),
          () => s.store.pricing.list(ctx),
          () => s.store.pricing.effectivePrice(ctx, s.a, LIST_PRICE, PLAN),
        ]) {
          expect(await refusal(call())).toBeInstanceOf(ForbiddenError);
        }
      }
      expect(await s.dump('priceAdjustments')).toEqual(before);
    });

    it('lets a provider with draft permission only draft and submit, and refuses them confirm', async () => {
      const s = await setup();
      const draft = await s.store.pricing.draft(s.raj, s.input);
      expect(draft).toMatchObject({ status: 'draft', noticeDays: 30, createdBy: s.fx.keys.users['raj'] });
      const sent = await s.store.pricing.submit(s.raj, draft.id);
      expect(sent.status).toBe('submitted');
      const error = await refusal(s.store.pricing.confirm(s.raj, draft.id, CODE));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).reason).toBe('permission');
      expect((await s.store.pricing.list(s.owner)).find((x) => x.id === draft.id)!.status).toBe('submitted');
    });

    it('changes no effective price when a change is only drafted or submitted', async () => {
      const s = await setup();
      const draft = await s.store.pricing.draft(s.raj, s.input);
      expect(await s.priceAt(new Date(Date.parse(TODAY) + 90 * DAY).toISOString())).toBe(LIST_PRICE);
      await s.store.pricing.submit(s.raj, draft.id);
      expect(await s.priceAt(new Date(Date.parse(TODAY) + 90 * DAY).toISOString())).toBe(LIST_PRICE);
    });

    it('refuses confirm with a blank or wrong code, keeps the change submitted, and audits each failure', async () => {
      const s = await setup();
      const adj = await s.submitted();
      expect(await ruleOf(s.store.pricing.confirm(s.owner, adj.id, ''))).toBe('stepUpRequired');
      expect(await ruleOf(s.store.pricing.confirm(s.owner, adj.id, '000000'))).toBe('wrongCode');
      const stored = (await s.store.pricing.list(s.owner)).find((x) => x.id === adj.id)!;
      expect(stored.status).toBe('submitted');
      expect(stored.confirmedBy).toBeUndefined();
      expect(stored.effectiveAt).toBeUndefined();
      expect(await s.audit('pricing.confirmFailed')).toHaveLength(2);
      expect(await s.audit('pricing.confirm')).toEqual([]);
    });

    it('schedules a confirmed change 30 days out, and the price changes only once that date passes', async () => {
      const s = await setup();
      const adj = await s.submitted();
      const done = await s.store.pricing.confirm(s.owner, adj.id, CODE);
      const effectiveAt = new Date(Date.parse(TODAY) + 30 * DAY).toISOString();
      expect(done).toMatchObject({ status: 'scheduled', confirmedBy: s.fx.ids.users.provOwner, effectiveAt });
      expect(await s.audit('pricing.confirm')).toHaveLength(1);
      expect(await s.audit('pricing.confirmFailed')).toEqual([]);
      expect(await s.priceAt(TODAY)).toBe(LIST_PRICE);
      expect(await s.priceAt(new Date(Date.parse(effectiveAt) - 1000).toISOString())).toBe(LIST_PRICE);
      expect(await s.priceAt(effectiveAt)).toBe(NEW_PRICE);
      expect(await s.priceAt(new Date(Date.parse(effectiveAt) + DAY).toISOString())).toBe(NEW_PRICE);
    });
  });

  // Part 2: notices, cancel and end date, replacement, issued invoices, preview.
  // Assumption: one Outbox message per targeted client, whose `to` names both the billing contact and the Account Owner.
  describe(`M4 provider price change operations: ${name}`, () => {
    const confirmed = async (s: Awaited<ReturnType<typeof setup>>, patch: Partial<PricingDraftInput> = {}) => {
      const draft = await s.store.pricing.draft(s.raj, { ...s.input, ...patch });
      await s.store.pricing.submit(s.raj, draft.id);
      return s.store.pricing.confirm(s.owner, draft.id, CODE);
    };
    const later = (days: number) => new Date(Date.parse(TODAY) + days * DAY).toISOString();

    it('writes one Outbox notice per client to the billing contact and Account Owner for an increase, and none for a decrease', async () => {
      const s = await setup();
      const b = s.fx.ids.clients.b;
      const before = (await s.admin.listOutbox()).length;
      await confirmed(s, { value: 4000 });
      await confirmed(s, { clientIds: [s.a, b], type: 'percent', value: -10 });
      expect((await s.admin.listOutbox()).length).toBe(before);

      await confirmed(s, { clientIds: [s.a, b], type: 'percent', value: 10 });
      const sent = (await s.admin.listOutbox()).slice(before);
      expect(sent).toHaveLength(2);
      const users = await s.dump<{ id: string; email: string }>('users');
      const subs = await s.dump<{ clientId: string; billingContact: string }>('subscriptions');
      for (const [clientId, ownerId] of [
        [s.a, s.fx.ids.users.priya],
        [b, s.fx.ids.users.beth],
      ] as const) {
        const contact = subs.find((x) => x.clientId === clientId)!.billingContact;
        const owner = users.find((u) => u.id === ownerId)!.email;
        const hits = sent.filter((m) => m.to.includes(contact) && m.to.includes(owner));
        expect(hits).toHaveLength(1);
      }
    });

    it('restores the previous price after the would-be effective date when a scheduled change is cancelled', async () => {
      const s = await setup();
      const adj = await confirmed(s);
      const cancelled = await s.store.pricing.cancel(s.owner, adj.id);
      expect(cancelled.status).toBe('cancelled');
      expect(await s.audit('pricing.cancel')).toHaveLength(1);
      expect(await s.priceAt(later(31))).toBe(LIST_PRICE);
      expect(await s.priceAt(later(90))).toBe(LIST_PRICE);
    });

    it('restores the previous price once the end date passes', async () => {
      const s = await setup();
      await confirmed(s, { endsAt: later(60) });
      expect(await s.priceAt(later(45))).toBe(NEW_PRICE);
      expect(await s.priceAt(later(59))).toBe(NEW_PRICE);
      expect(await s.priceAt(later(60))).toBe(LIST_PRICE);
      expect(await s.priceAt(later(90))).toBe(LIST_PRICE);
    });

    it('replaces an earlier change of the same scope and type for the same client when a second is confirmed', async () => {
      const s = await setup();
      const first = await confirmed(s, { value: 4000 });
      const second = await confirmed(s, { value: 4500 });
      const all = await s.store.pricing.list(s.owner);
      expect(['scheduled', 'active']).not.toContain(all.find((x) => x.id === first.id)!.status);
      expect(all.find((x) => x.id === second.id)!.status).toBe('scheduled');
      expect(await s.priceAt(later(31))).toBe(4500);
      expect(await s.priceAt(later(90))).toBe(4500);
    });

    it('leaves issued invoices byte-for-byte unchanged through draft, confirm and cancel', async () => {
      const s = await setup();
      const invoice: Invoice = {
        id: freshId(4100),
        number: 'INV-P1',
        clientId: s.a,
        issuedAt: TODAY,
        dueAt: later(14),
        billingNameAtIssue: 'Test Nursery Ltd',
        billingAddressAtIssue: '1 Test Street',
        lines: [{ label: 'Plan', amount: LIST_PRICE }],
        tax: 1000,
        total: 6000,
        status: 'due',
      };
      await s.admin.bulkPut('invoices', [invoice]);
      const snapshot = async () => JSON.stringify(await s.dump<Invoice>('invoices'));
      const start = await snapshot();
      const draft = await s.store.pricing.draft(s.raj, s.input);
      expect(await snapshot()).toBe(start);
      await s.store.pricing.submit(s.raj, draft.id);
      await s.store.pricing.confirm(s.owner, draft.id, CODE);
      expect(await snapshot()).toBe(start);
      await s.store.pricing.cancel(s.owner, draft.id);
      expect(await snapshot()).toBe(start);
    });

    it('previews every selected client exactly as the domain does, and writes nothing', async () => {
      const s = await setup();
      const b = s.fx.ids.clients.b;
      const input = { ...s.input, clientIds: [s.a, b], type: 'percent' as const, value: 25 };
      const stores = ['audit', 'priceAdjustments'] as const;
      const before = await Promise.all(stores.map((n) => s.dump(n)));
      const outboxBefore = await s.admin.listOutbox();
      const result = await s.store.pricing.preview(s.owner, input);
      expect(result.rows.map((r) => r.clientId)).toEqual([s.a, b]);
      expect(result.rows.every((r) => r.currentPrice > 0)).toBe(true);
      const expected = previewAdjustment({
        clients: result.rows.map((r) => ({ clientId: r.clientId, listPrice: r.currentPrice })),
        adjustment: {
          id: 'preview',
          clientIds: input.clientIds,
          scope: input.scope,
          type: input.type,
          value: input.value,
          reason: input.reason,
          noticeDays: 30,
          status: 'draft',
          createdBy: s.owner.userId,
        },
        at: TODAY,
      });
      expect(result.rows).toEqual(expected.rows);
      expect(result.warnings).toEqual(expected.warnings);
      expect(await Promise.all(stores.map((n) => s.dump(n)))).toEqual(before);
      expect(await s.admin.listOutbox()).toEqual(outboxBefore);
    });
  });
}
