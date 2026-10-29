// M4 chunk 17c contract tests: the client-side price notice (plan docs/plans/m4.md, BP-7 and its security notes).
// Written before the implementation. Contract: store.billing.priceNotices(ctx) returns the actor's own client's
// price changes that are scheduled or active, as { id, type, scope, value, effectiveAt, endAt? }. It needs
// billing.view (ForbiddenError otherwise). Drafts, submitted, awaiting and cancelled changes never show, and other
// clients' entries never show (a change covering several clients returns only the actor's own entry).
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, type PriceAdjustment } from '@sta/domain';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreOptions } from '../types';
import { refusal } from './learning';
import type { PricingStore } from './pricing';
import { buildWorld, TODAY } from './world';

export type PriceNotice = {
  id: string;
  type: PriceAdjustment['type'];
  scope: PriceAdjustment['scope'];
  value: number;
  effectiveAt: string;
  endAt?: string;
};
type NoticeStore = PricingStore & { billing: { priceNotices(ctx: ActorContext): Promise<PriceNotice[]> } };

const CODE = '123456';

export function runPriceNoticesContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const store = handle.store as unknown as NoticeStore;
    const prov = (key: string): ActorContext => ({ userId: fx.keys.users[key]!, side: 'provider', now: TODAY });
    const client = (userId: string, clientId: string): ActorContext => ({
      userId,
      side: 'client',
      clientId,
      now: TODAY,
    });
    const a = fx.ids.clients.a;
    const b = fx.ids.clients.b;
    const input = {
      clientIds: [a],
      scope: { kind: 'plan' },
      type: 'percent',
      value: 8,
      reason: 'annualReview',
    } as const;
    const submit = async (patch: Partial<typeof input> | { clientIds: string[] } = {}) => {
      const d = await store.pricing.draft(prov('raj'), { ...input, ...patch });
      await store.pricing.submit(prov('raj'), d.id);
      return d;
    };
    const confirm = async (patch: { clientIds?: string[] } = {}) => {
      const d = await submit(patch);
      return store.pricing.confirm(prov('providerOwner'), d.id, CODE);
    };
    return {
      store,
      fx,
      a,
      b,
      input,
      submit,
      confirm,
      owner: prov('providerOwner'),
      raj: prov('raj'),
      priya: client(fx.ids.users.priya, a),
      beth: client(fx.ids.users.beth, b),
      daniel: client(fx.ids.users.daniel, a),
      jade: { userId: fx.ids.users.jade, side: 'staff', clientId: a, now: TODAY } as ActorContext,
    };
  }

  describe(`M4 client price notices: ${name}`, () => {
    it('shows nothing before a change is confirmed, whether drafted or submitted', async () => {
      const s = await setup();
      expect(await s.store.billing.priceNotices(s.priya)).toEqual([]);
      const d = await s.store.pricing.draft(s.raj, s.input);
      expect(await s.store.billing.priceNotices(s.priya)).toEqual([]);
      await s.store.pricing.submit(s.raj, d.id);
      expect(await s.store.billing.priceNotices(s.priya)).toEqual([]);
    });

    it('shows a confirmed change as scheduled with its type, scope, value and effective date', async () => {
      const s = await setup();
      const done = await s.confirm();
      const notices = await s.store.billing.priceNotices(s.priya);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        id: done.id,
        type: 'percent',
        scope: { kind: 'plan' },
        value: 8,
        effectiveAt: done.effectiveAt,
      });
      expect(notices[0]!.effectiveAt).toBe(new Date(Date.parse(TODAY) + 30 * 86_400_000).toISOString());
    });

    it('does not show a cancelled change', async () => {
      const s = await setup();
      const done = await s.confirm();
      await s.store.pricing.cancel(s.owner, done.id);
      expect(await s.store.billing.priceNotices(s.priya)).toEqual([]);
    });

    it('shows an active change once its date has passed', async () => {
      const s = await setup();
      const done = await s.confirm();
      const later = { ...s.priya, now: new Date(Date.parse(done.effectiveAt!) + 86_400_000).toISOString() };
      const notices = await s.store.billing.priceNotices(later);
      expect(notices.map((n) => n.id)).toEqual([done.id]);
    });

    it('returns only the actor own entry for a change that covers several clients', async () => {
      const s = await setup();
      const done = await s.confirm({ clientIds: [s.a, s.b] });
      const mine = await s.store.billing.priceNotices(s.priya);
      expect(mine.map((n) => n.id)).toEqual([done.id]);
      expect(JSON.stringify(mine)).not.toContain(s.b);
      expect(JSON.stringify(mine)).not.toContain('clientIds');
      expect((await s.store.billing.priceNotices(s.beth)).map((n) => n.id)).toEqual([done.id]);
    });

    it('never shows another client a change that does not cover it', async () => {
      const s = await setup();
      await s.confirm({ clientIds: [s.a] });
      expect(await s.store.billing.priceNotices(s.beth)).toEqual([]);
    });

    it('refuses actors without billing.view, and staff and provider actors', async () => {
      const s = await setup();
      await s.confirm();
      for (const ctx of [s.daniel, s.jade, s.owner]) {
        expect(await refusal(s.store.billing.priceNotices(ctx))).toBeInstanceOf(ForbiddenError);
      }
    });
  });
}
