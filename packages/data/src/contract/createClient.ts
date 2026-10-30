// M4 chunk 6a contract tests: the New client wizard's data op (plan docs/plans/m4.md chunk 6, BP-3).
// Written before the implementation, so `store.providerOps` is described by the local types below.
//   - createClient(ctx, input) needs the provider permission clients.write (a client or staff actor, or a provider
//     user without it such as Support, gets ForbiddenError and nothing is written).
//   - ONE batch writes: the client, its sites, the client's system roles (so the invitation's role exists), a
//     Subscription for the chosen package, a modulePlacement per published module of the chosen pack, an onboarding
//     checklist, an Invitation for the first admin (preset role accountOwner, scope = the new client), ONE Outbox
//     email to that admin and ONE audit event 'client.create' (with the new clientId).
//   - Validation problems are RuleError with rule 'invalidClient' (missing name, no sites, unknown pack or package,
//     bad admin email). Time comes from ctx.now (not the clock) and ids from the seeded RNG.
import { describe, expect, it } from 'vitest';
import { nurseryModules, nurseryPack, packageIds, allPacks } from '@sta/content';
import {
  createRng,
  fixedClock,
  type AuditEvent,
  type Client,
  type Invitation,
  type ModulePlacement,
  type OnboardingChecklist,
  type OutboxMessage,
  type Role,
  type Site,
  type Subscription,
} from '@sta/domain';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreOptions } from '../types';
import { refusal, ruleOf } from './learning';
import { buildWorld, TODAY } from './world';

type CreateClientInput = {
  displayName: string;
  industryPackId: string;
  packageId: string;
  sites: { name: string; countryCode?: string; timezone?: string }[];
  billingContact: string;
  trialDays?: number;
  firstAdmin: { email: string; displayName: string; roleKey: 'accountOwner' };
};
type CreateClientResult = {
  client: Client;
  sites: Site[];
  subscription: Subscription;
  placements: ModulePlacement[];
  checklist: OnboardingChecklist;
  invitation: Invitation;
};
export type ProviderOpsStore = {
  providerOps: { createClient(ctx: ActorContext, input: CreateClientInput): Promise<CreateClientResult> };
};

const NOW = '2026-10-21T10:30:00.000Z'; // differs from the clock (TODAY) so ctx.now use is provable
const STUB_PACK = allPacks.find((p) => p.status === 'stub')!;

export function runCreateClientContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const ops = (handle.store as unknown as ProviderOpsStore).providerOps;
    const u = fx.ids.users;
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: NOW });
    const dump = async <T>(s: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[s] ?? [];
    const input: CreateClientInput = {
      displayName: 'Bluebell Test Nursery',
      industryPackId: nurseryPack.id,
      packageId: packageIds.standard,
      sites: [{ name: 'Bluebell Main' }, { name: 'Bluebell Annexe', countryCode: 'GB', timezone: 'Europe/London' }],
      billingContact: 'accounts@bluebell.example.test',
      trialDays: 14,
      firstAdmin: { email: 'owner@bluebell.example.test', displayName: 'Bea Bluebell', roleKey: 'accountOwner' },
    };
    const counts = async () => {
      const all = (await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>;
      return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length]));
    };
    return {
      ops,
      fx,
      u,
      input,
      dump,
      counts,
      handle,
      owner: provider(u.provOwner),
      support: provider(u.support),
      priya: { userId: u.priya, side: 'client', clientId: fx.ids.clients.a, now: NOW } as ActorContext,
      jade: { userId: u.jade, side: 'staff', clientId: fx.ids.clients.a, now: NOW } as ActorContext,
    };
  }

  describe(`M4 create client: ${name}`, () => {
    it('creates the client with the chosen name, pack and package, created at ctx.now', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      expect(r.client).toMatchObject({
        displayName: 'Bluebell Test Nursery',
        industryPackId: nurseryPack.id,
        packageId: packageIds.standard,
        createdAt: NOW,
      });
      const stored = (await s.dump<Client>('clients')).find((c) => c.id === r.client.id);
      expect(stored).toEqual(r.client);
      expect(['trial', 'active']).toContain(r.client.accountState);
    });

    it('creates every site with the new clientId and the chosen names', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      expect(r.sites.map((x) => x.name)).toEqual(['Bluebell Main', 'Bluebell Annexe']);
      for (const site of r.sites) expect(site).toMatchObject({ clientId: r.client.id, status: 'active' });
      const stored = (await s.dump<Site>('sites')).filter((x) => x.clientId === r.client.id);
      expect(stored.map((x) => x.id).sort()).toEqual(r.sites.map((x) => x.id).sort());
    });

    it('creates a subscription for the chosen package that is a trial of the requested length', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      expect(r.subscription).toMatchObject({
        clientId: r.client.id,
        packageId: packageIds.standard,
        billingContact: 'accounts@bluebell.example.test',
        state: 'trial',
        stateSince: NOW,
      });
      expect(r.subscription.nextStateAt).toBe('2026-11-04T10:30:00.000Z'); // NOW plus 14 days
      const stored = (await s.dump<Subscription>('subscriptions')).filter((x) => x.clientId === r.client.id);
      expect(stored).toHaveLength(1);
    });

    it('gives the new client starter content: a placement for each published module of the pack, available to all', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      const expected = nurseryModules.filter((m) => m.status === 'published').map((m) => m.id);
      expect(expected.length).toBeGreaterThan(0);
      const stored = (await s.dump<ModulePlacement>('modulePlacements')).filter((p) => p.clientId === r.client.id);
      expect(stored.map((p) => p.moduleId).sort()).toEqual([...expected].sort());
      expect(r.placements.map((p) => p.moduleId).sort()).toEqual([...expected].sort());
      for (const p of stored) expect(p.availableToAll).toBe(true);
    });

    it('gives a stub pack no starter content but still creates the client', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, { ...s.input, industryPackId: STUB_PACK.id });
      expect(r.placements).toEqual([]);
      const stored = (await s.dump<ModulePlacement>('modulePlacements')).filter((p) => p.clientId === r.client.id);
      expect(stored).toEqual([]);
      expect(r.client.industryPackId).toBe(STUB_PACK.id);
    });

    it('creates an onboarding checklist for the client, started at ctx.now and not complete', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      expect(r.checklist).toMatchObject({ clientId: r.client.id, startedAt: NOW });
      expect(r.checklist.completedAt).toBeUndefined();
      expect(r.checklist.steps.length).toBeGreaterThan(0);
      for (const step of r.checklist.steps) expect(step.doneAt).toBeUndefined();
      const stored = (await s.dump<OnboardingChecklist>('onboarding')).filter((c) => c.clientId === r.client.id);
      expect(stored).toEqual([r.checklist]);
    });

    it('invites the first admin with the preset Account Owner role, scoped to the new client', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      expect(r.invitation).toMatchObject({
        side: 'client',
        clientId: r.client.id,
        email: 'owner@bluebell.example.test',
        status: 'invited',
        invitedBy: s.u.provOwner,
        scope: { type: 'clients', ids: [r.client.id] },
      });
      expect(Date.parse(r.invitation.expiresAt)).toBeGreaterThan(Date.parse(NOW));
      const role = (await s.dump<Role>('roles')).find((x) => x.id === r.invitation.roleIds[0])!;
      expect(r.invitation.roleIds).toHaveLength(1);
      expect(role).toMatchObject({ owner: { clientId: r.client.id }, system: true, systemKey: 'accountOwner' });
      const stored = (await s.dump<Invitation>('invitations')).filter((i) => i.clientId === r.client.id);
      expect(stored).toEqual([r.invitation]);
    });

    it('writes exactly one Outbox email, the welcome invitation to the first admin, at ctx.now', async () => {
      const s = await setup();
      const before = (await s.handle.admin.listOutbox()).length;
      const r = await s.ops.createClient(s.owner, s.input);
      const sent: OutboxMessage[] = (await s.handle.admin.listOutbox()).slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ channel: 'email', to: 'owner@bluebell.example.test', at: NOW });
      expect(sent[0]!.body).toContain('Bluebell Test Nursery');
      expect(r.invitation.email).toBe(sent[0]!.to);
    });

    it('writes one client.create audit event with the new clientId, the actor and ctx.now', async () => {
      const s = await setup();
      const r = await s.ops.createClient(s.owner, s.input);
      const events = (await s.dump<AuditEvent>('audit')).filter((e) => e.action === 'client.create');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorId: s.u.provOwner,
        actorSide: 'provider',
        clientId: r.client.id,
        at: NOW,
      });
    });

    it('tags every created client-owned record with the new clientId', async () => {
      const s = await setup();
      const before = await s.dump<{ id?: string }>('roles');
      const r = await s.ops.createClient(s.owner, s.input);
      const id = r.client.id;
      const clientOwned = ['sites', 'subscriptions', 'modulePlacements', 'onboarding', 'invitations'];
      for (const store of clientOwned) {
        const rows = (await s.dump<{ clientId?: string }>(store)).filter((x) => x.clientId === id);
        expect(rows.length, store).toBeGreaterThan(0);
      }
      const newRoles = (await s.dump<Role>('roles')).filter((x) => !before.some((b) => b.id === x.id));
      expect(newRoles.length).toBeGreaterThan(0);
      for (const role of newRoles) expect(role.owner).toEqual({ clientId: id });
    });

    it('does not change any other client: only the new client gains records', async () => {
      const s = await setup();
      const a = s.fx.ids.clients.a;
      const before = {
        sites: (await s.dump<Site>('sites')).filter((x) => x.clientId === a).length,
        clients: (await s.dump<Client>('clients')).length,
      };
      await s.ops.createClient(s.owner, s.input);
      expect((await s.dump<Site>('sites')).filter((x) => x.clientId === a)).toHaveLength(before.sites);
      expect(await s.dump<Client>('clients')).toHaveLength(before.clients + 1);
    });

    it('gives the same ids on two runs with the same seeded RNG, and different ids for two clients in one run', async () => {
      const first = await setup();
      const second = await setup();
      const r1 = await first.ops.createClient(first.owner, first.input);
      const r2 = await second.ops.createClient(second.owner, second.input);
      expect(r2.client.id).toBe(r1.client.id);
      expect(r2.sites.map((x) => x.id)).toEqual(r1.sites.map((x) => x.id));
      expect(r2.invitation.id).toBe(r1.invitation.id);
      const r3 = await first.ops.createClient(first.owner, { ...first.input, displayName: 'Bluebell Two' });
      expect(r3.client.id).not.toBe(r1.client.id);
      expect(r3.sites.map((x) => x.id)).not.toEqual(r1.sites.map((x) => x.id));
    });

    it('refuses client and staff actors and a provider user without clients.write, and writes nothing', async () => {
      const s = await setup();
      const before = await s.counts();
      const outbox = (await s.handle.admin.listOutbox()).length;
      for (const ctx of [s.priya, s.jade, s.support]) {
        const error = await refusal(s.ops.createClient(ctx, s.input));
        expect(error).toBeInstanceOf(ForbiddenError);
      }
      expect(await s.counts()).toEqual(before);
      expect((await s.handle.admin.listOutbox()).length).toBe(outbox);
    });

    it('refuses a missing or blank organisation name as a rule error and writes nothing', async () => {
      const s = await setup();
      const before = await s.counts();
      for (const displayName of ['', '   ']) {
        expect(await ruleOf(s.ops.createClient(s.owner, { ...s.input, displayName }))).toBe('invalidClient');
      }
      expect(await s.counts()).toEqual(before);
    });

    it('refuses a client with no sites, or a site with no name', async () => {
      const s = await setup();
      const before = await s.counts();
      expect(await ruleOf(s.ops.createClient(s.owner, { ...s.input, sites: [] }))).toBe('invalidClient');
      expect(await ruleOf(s.ops.createClient(s.owner, { ...s.input, sites: [{ name: ' ' }] }))).toBe('invalidClient');
      expect(await s.counts()).toEqual(before);
    });

    it('refuses an unknown industry pack and an unknown package', async () => {
      const s = await setup();
      const before = await s.counts();
      const unknown = '00000000000000000000999999';
      expect(await ruleOf(s.ops.createClient(s.owner, { ...s.input, industryPackId: unknown }))).toBe('invalidClient');
      expect(await ruleOf(s.ops.createClient(s.owner, { ...s.input, packageId: unknown }))).toBe('invalidClient');
      expect(await s.counts()).toEqual(before);
    });

    it('refuses a first admin without a usable email, with no Outbox entry', async () => {
      const s = await setup();
      const outbox = (await s.handle.admin.listOutbox()).length;
      const bad = { ...s.input, firstAdmin: { ...s.input.firstAdmin, email: 'not-an-email' } };
      expect(await ruleOf(s.ops.createClient(s.owner, bad))).toBe('invalidClient');
      expect((await s.handle.admin.listOutbox()).length).toBe(outbox);
    });
  });
}
