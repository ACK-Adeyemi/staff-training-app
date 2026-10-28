// M4 chunk 5a contract tests: ownership transfer (plan docs/plans/m4.md chunk 5, security note "Ownership transfer").
// Written before the implementation, so `store.ownership` is described by the local types below.
//   - Time comes from ctx.now (as in the pricing contract); completing needs ctx.now past coolingOffEndsAt.
//   - A wrong code is RuleError('wrongCode'), leaves the transfer unconfirmed and audits 'ownership.confirmFailed'.
//   - Audit actions: ownership.request, .accept, .confirm, .complete, .cancel (provider side has no clientId).
//   - Domain refusals (not the receiver, not accepted yet, too early) are RuleError; other-side or other-client
//     actors get ForbiddenError.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  demoTwoFactorCode,
  fixedClock,
  OWNER_KEYS,
  type AuditEvent,
  type OwnershipTransfer,
  type Role,
  type RoleAssignment,
} from '@sta/domain';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreOptions } from '../types';
import { refusal, ruleOf } from './learning';
import { buildWorld, TODAY } from './world';

export type OwnershipStore = {
  ownership: {
    request(
      ctx: ActorContext,
      input: { side: 'client' | 'provider'; clientId?: string; toUserId: string; demoteFromTo: string },
    ): Promise<OwnershipTransfer>;
    accept(ctx: ActorContext, id: string): Promise<OwnershipTransfer>;
    confirmWithCode(ctx: ActorContext, id: string, code: string): Promise<OwnershipTransfer>;
    complete(ctx: ActorContext, id: string): Promise<OwnershipTransfer>;
    cancel(ctx: ActorContext, id: string): Promise<OwnershipTransfer>;
    list(ctx: ActorContext): Promise<OwnershipTransfer[]>;
  };
};

const LATER = '2026-10-27T09:00:00.000Z'; // TODAY plus 8 days
const JUST_BEFORE = '2026-10-25T09:00:00.000Z'; // TODAY plus 6 days

export function runOwnershipTransferContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const store = (handle.store as unknown as OwnershipStore).ownership;
    const a = fx.ids.clients.a;
    const u = fx.ids.users;
    const client = (userId: string, clientId = a, now = TODAY): ActorContext => ({
      userId,
      side: 'client',
      clientId,
      now,
    });
    const provider = (userId: string, now = TODAY): ActorContext => ({ userId, side: 'provider', now });
    const raj = fx.keys.users['raj'];
    const dump = async <T>(s: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[s] ?? [];
    const audit = async (action: string) => (await dump<AuditEvent>('audit')).filter((e) => e.action === action);
    const providerOwnerRole = async () =>
      (await dump<Role>('roles')).find((r) => r.owner === 'provider' && r.systemKey === OWNER_KEYS.provider)!.id;
    /** Active users holding an owner system role for one client, or for the provider. */
    const owners = async (clientId?: string): Promise<string[]> => {
      const roles = await dump<Role>('roles');
      const ownerRoles = new Set(
        roles
          .filter((r) =>
            clientId === undefined
              ? r.owner === 'provider' && r.systemKey === OWNER_KEYS.provider
              : r.systemKey === OWNER_KEYS.client && r.owner !== 'provider' && r.owner.clientId === clientId,
          )
          .map((r) => r.id),
      );
      return (await dump<RoleAssignment>('roleAssignments'))
        .filter((x) => x.status === 'active' && x.roleIds.some((id) => ownerRoles.has(id)))
        .map((x) => x.userId);
    };
    const clientInput = {
      side: 'client',
      clientId: a,
      toUserId: u.daniel,
      demoteFromTo: fx.ids.roles.supervisor,
    } as const;
    const priya = client(u.priya);
    const daniel = client(u.daniel);
    const sophie = provider(u.provOwner); // the provider Owner
    const rajCtx = provider(raj);
    const providerInput = () =>
      ({ side: 'provider', toUserId: raj, demoteFromTo: fx.keys.roles['provider.accountManager']! }) as const;
    /** Request, accept and confirm, ready for the cooling-off check. */
    const ready = async (side: 'client' | 'provider') => {
      const [from, to, input] = side === 'client' ? [priya, daniel, clientInput] : [sophie, rajCtx, providerInput()];
      const t = await store.request(from, input);
      await store.accept(to, t.id);
      await store.confirmWithCode(from, t.id, demoTwoFactorCode);
      return { t, from, to };
    };
    return {
      store,
      fx,
      a,
      u,
      client,
      provider,
      priya,
      daniel,
      sophie,
      rajCtx,
      audit,
      owners,
      dump,
      ready,
      clientInput,
      providerInput,
      providerOwnerRole,
    };
  }

  describe(`M4 ownership transfer: ${name}`, () => {
    it('starts a client-side transfer from the Account Owner with a 7 day cooling-off, and audits it', async () => {
      const s = await setup();
      const t = await s.store.request(s.priya, s.clientInput);
      expect(t).toMatchObject({ status: 'pending', fromUserId: s.u.priya, toUserId: s.u.daniel, clientId: s.a });
      expect(t.coolingOffEndsAt).toBe('2026-10-26T09:00:00.000Z');
      expect(await s.store.list(s.priya)).toEqual([t]);
      expect(await s.audit('ownership.request')).toEqual([
        expect.objectContaining({ actorId: s.u.priya, clientId: s.a, at: TODAY }),
      ]);
    });

    it('lets only the receiving person accept, and only once', async () => {
      const s = await setup();
      const t = await s.store.request(s.priya, s.clientInput);
      expect(await ruleOf(s.store.accept(s.priya, t.id))).toBeTruthy();
      expect((await s.store.accept(s.daniel, t.id)).acceptedAt).toBe(TODAY);
      expect(await ruleOf(s.store.accept(s.daniel, t.id))).toBeTruthy();
      expect(await s.audit('ownership.accept')).toHaveLength(1);
    });

    it('needs acceptance first, and the current owner, to confirm with the code', async () => {
      const s = await setup();
      const t = await s.store.request(s.priya, s.clientInput);
      expect(await ruleOf(s.store.confirmWithCode(s.priya, t.id, demoTwoFactorCode))).toBeTruthy();
      await s.store.accept(s.daniel, t.id);
      expect(await ruleOf(s.store.confirmWithCode(s.daniel, t.id, demoTwoFactorCode))).toBeTruthy();
      expect((await s.store.confirmWithCode(s.priya, t.id, demoTwoFactorCode)).twoFactorConfirmedAt).toBe(TODAY);
      expect(await s.audit('ownership.confirm')).toHaveLength(1);
    });

    it('leaves the transfer unconfirmed after a wrong code and audits the failed attempt', async () => {
      const s = await setup();
      const t = await s.store.request(s.priya, s.clientInput);
      await s.store.accept(s.daniel, t.id);
      expect(await ruleOf(s.store.confirmWithCode(s.priya, t.id, '000000'))).toBe('wrongCode');
      expect((await s.store.list(s.priya))[0]?.twoFactorConfirmedAt).toBeUndefined();
      expect(await s.audit('ownership.confirmFailed')).toEqual([
        expect.objectContaining({ actorId: s.u.priya, clientId: s.a, at: TODAY }),
      ]);
      expect(await s.audit('ownership.confirm')).toHaveLength(0);
    });

    it('refuses to complete before the cooling-off ends, even when accepted and confirmed', async () => {
      const s = await setup();
      const { t, from } = await s.ready('client');
      await ruleOf(s.store.complete(from, t.id));
      await ruleOf(s.store.complete({ ...from, now: JUST_BEFORE }, t.id));
      expect(await s.owners(s.a)).toContain(s.u.priya);
      expect(await s.owners(s.a)).not.toContain(s.u.daniel);
    });

    it('swaps the Account Owner and the demoted role once the 7 days have passed, leaving one owner', async () => {
      const s = await setup();
      const { t, from } = await s.ready('client');
      const done = await s.store.complete({ ...from, now: LATER }, t.id);
      expect(done.status).toBe('done');
      expect(await s.owners(s.a)).toEqual([s.u.daniel]);
      const assignments = await s.dump<RoleAssignment>('roleAssignments');
      expect(assignments.find((x) => x.userId === s.u.priya && x.status === 'active')?.roleIds).toEqual([
        s.fx.ids.roles.supervisor,
      ]);
      expect(await s.audit('ownership.complete')).toEqual([
        expect.objectContaining({ actorId: s.u.priya, clientId: s.a, at: LATER }),
      ]);
      // A finished transfer cannot be completed again.
      expect(await ruleOf(s.store.complete({ ...from, now: LATER }, t.id))).toBeTruthy();
    });

    it('moves provider ownership between provider users, with no clientId on the audit', async () => {
      const s = await setup();
      const { t, from } = await s.ready('provider');
      await s.store.complete({ ...from, now: LATER }, t.id);
      expect(await s.owners()).toEqual([s.fx.keys.users['raj']]);
      const [event] = await s.audit('ownership.complete');
      expect(event?.clientId).toBeUndefined();
      expect(event?.actorSide).toBe('provider');
    });

    it('lets either person involved cancel, after which it cannot complete', async () => {
      const s = await setup();
      const { t, from, to } = await s.ready('client');
      expect((await s.store.cancel(to, t.id)).status).toBe('cancelled');
      expect(await ruleOf(s.store.complete({ ...from, now: LATER }, t.id))).toBeTruthy();
      expect(await s.audit('ownership.cancel')).toHaveLength(1);
      expect(await s.owners(s.a)).toEqual([s.u.priya]);
    });

    it('keeps client and provider transfers apart, and other clients out', async () => {
      const s = await setup();
      const ct = await s.store.request(s.priya, s.clientInput);
      const pt = await s.store.request(s.sophie, s.providerInput());
      const ot = s.client(s.u.otOwner, s.fx.ids.clients.ot);
      expect(await refusal(s.store.request(s.priya, s.providerInput()))).toBeInstanceOf(ForbiddenError);
      expect(await refusal(s.store.request(s.sophie, s.clientInput))).toBeInstanceOf(ForbiddenError);
      for (const call of [
        () => s.store.accept(s.rajCtx, ct.id),
        () => s.store.cancel(s.priya, pt.id),
        () => s.store.accept(ot, ct.id),
        () => s.store.cancel(ot, ct.id),
        () => s.store.complete(ot, ct.id),
        () => s.store.request(ot, s.clientInput),
      ]) {
        expect(await refusal(call())).toBeInstanceOf(ForbiddenError);
      }
      expect(await s.store.list(ot)).toEqual([]);
      expect(await s.store.list(s.priya)).toEqual([ct]);
      expect(await s.store.list(s.sophie)).toEqual([pt]);
    });
  });
}
