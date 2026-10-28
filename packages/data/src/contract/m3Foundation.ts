// M3 chunk 1 contract tests: the sixteen new stores (schema version 4), DemoAdmin.listPersonas, DemoState.clientPersona,
// and account state derived from the subscription (assumption 45). Runs against every adapter. Written before the
// implementation (plan docs/plans/m3.md "Data package", chunk 1).
import { describe, expect, it } from 'vitest';
import type { Client, DemoState, Subscription, UserAccount } from '@sta/domain';
import { addDays, createRng, fixedClock } from '@sta/domain';
import {
  AccountStateError,
  ForbiddenError,
  ValidationError,
  storeNames,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
  type ActorContext,
  type DemoAdmin,
} from '../types';
import { buildWorld, freshId, TODAY } from './world';

export const M3_STORES = [
  'moduleDrafts',
  'moduleVersions',
  'autoAssignRules',
  'reminderLog',
  'themes',
  'invitations',
  'onboarding',
  'invoices',
  'billingProfiles',
  'billingChangeRequests',
  'addOnRequests',
  'moduleFeedback',
  'appFeedback',
  'tickets',
  'ticketMessages',
  'faqVotes',
] as const;

type Personas = {
  userId: string;
  displayName: string;
  side: 'client' | 'staff';
  clientId: string;
  clientName: string;
}[];
type AdminWithPersonas = DemoAdmin & { listPersonas(): Promise<Personas> };

const at = TODAY;
const plusDays = (days: number): string => addDays(new Date(TODAY), days).toISOString();
const nid = (n: number): string => freshId(3000 + n);

export function runM3FoundationContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx = await buildWorld(handle.admin);
    return { ...handle, fx, options };
  }
  const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
  const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });

  describe(`M3 foundations: ${name}`, () => {
    describe('new stores', () => {
      it('lists the sixteen M3 stores in storeNames', () => {
        for (const s of M3_STORES) expect(storeNames as readonly string[], s).toContain(s);
      });

      it('dumps every new store as an empty list on a fresh store', async () => {
        const { admin } = await setup();
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        for (const s of M3_STORES) expect(dump[s], s).toEqual([]);
      });

      it.each(M3_STORES)('%s: bulkPut refuses an invalid record and writes nothing', async (store) => {
        const { admin } = await setup();
        await expect(admin.bulkPut(store as StoreName, [{}])).rejects.toBeInstanceOf(ValidationError);
        expect(((await admin.dumpAll()) as Record<string, unknown[]>)[store]).toEqual([]);
      });

      it('stores onboarding and billing profiles one per client (key clientId): a second put replaces the first', async () => {
        const { admin, fx } = await setup();
        const clientId = fx.ids.clients.a;
        const onboarding = (doneAt?: string) => ({
          clientId,
          steps: [{ key: 'inviteStaff', ...(doneAt ? { doneAt } : {}) }],
          startedAt: at,
        });
        await admin.bulkPut('onboarding', [onboarding()]);
        await admin.bulkPut('onboarding', [onboarding(at)]);
        const rows = ((await admin.dumpAll()) as Record<string, { steps: { doneAt?: string }[] }[]>)['onboarding']!;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.steps[0]!.doneAt).toBe(at);

        const profile = (billingName: string) => ({
          clientId,
          billingName,
          address: '1 Example Road',
          billingContactEmail: 'accounts@example.test',
          updatedBy: fx.ids.users.priya,
          updatedAt: at,
        });
        await admin.bulkPut('billingProfiles', [profile('First Ltd')]);
        await admin.bulkPut('billingProfiles', [profile('Second Ltd')]);
        const profiles = ((await admin.dumpAll()) as Record<string, { billingName: string }[]>)['billingProfiles']!;
        expect(profiles.map((p) => p.billingName)).toEqual(['Second Ltd']);
      });

      it('stores module versions under moduleId:version and drafts under moduleId', async () => {
        const { admin, fx } = await setup();
        const moduleId = nid(10);
        const module = {
          id: moduleId,
          owner: { clientId: fx.ids.clients.a },
          title: 'Own module',
          description: 'Written by the client.',
          estimatedMinutes: 5,
          language: 'en-GB',
          status: 'published',
          version: 1,
          requirementIds: [],
          roleTags: [],
          lessons: [{ id: 'lesson-1', title: 'One', minutes: 2, blocks: [{ kind: 'text', markdown: 'Hello.' }] }],
          questions: [],
          quiz: {
            mode: 'mcq',
            drawCount: 1,
            shuffleQuestions: false,
            shuffleOptions: false,
            passMark: 80,
            maxRetakes: null,
            feedback: true,
            showSourceRef: true,
            notesInQuiz: 'choice',
            learnMoreFor: 'all',
          },
        };
        await admin.bulkPut('moduleVersions', [
          { key: `${moduleId}:1`, moduleId, version: 1, module, publishedAt: at },
          { key: `${moduleId}:2`, moduleId, version: 2, module: { ...module, version: 2 }, publishedAt: at },
        ]);
        await admin.bulkPut('moduleDrafts', [
          { moduleId, clientId: fx.ids.clients.a, module, updatedBy: fx.ids.users.priya, updatedAt: at },
        ]);
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        expect(dump['moduleVersions']).toHaveLength(2);
        expect(dump['moduleDrafts']).toHaveLength(1);
      });

      it('stores a faq vote under faqId:userId', async () => {
        const { admin, fx } = await setup();
        const faqId = nid(1);
        const vote = (helpful: boolean) => ({
          key: `${faqId}:${fx.ids.users.jade}`,
          faqId,
          userId: fx.ids.users.jade,
          helpful,
        });
        await admin.bulkPut('faqVotes', [vote(true)]);
        await admin.bulkPut('faqVotes', [vote(false)]);
        const rows = ((await admin.dumpAll()) as Record<string, { helpful: boolean }[]>)['faqVotes']!;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.helpful).toBe(false);
      });

      it('clearAll empties the new stores too', async () => {
        const { admin, fx } = await setup();
        await admin.bulkPut('onboarding', [
          { clientId: fx.ids.clients.a, steps: [{ key: 'inviteStaff' }], startedAt: at },
        ]);
        await admin.clearAll();
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        for (const s of M3_STORES) expect(dump[s], s).toEqual([]);
      });

      it('announces writes to the new stores through change notices (names only)', async () => {
        const { admin, fx, ...handle } = await setup();
        const seen: StoreName[][] = [];
        const off = handle.subscribe((stores) => {
          seen.push(stores);
        });
        await admin.bulkPut('onboarding', [
          { clientId: fx.ids.clients.a, steps: [{ key: 'inviteStaff' }], startedAt: at },
        ]);
        off();
        expect(seen.flat()).toContain('onboarding');
      });
    });

    describe('ForbiddenReason twoFactorRequired', () => {
      it('is a valid reason on ForbiddenError', () => {
        const e = new ForbiddenError('twoFactorRequired');
        expect(e.reason).toBe('twoFactorRequired');
        expect(e).toBeInstanceOf(ForbiddenError);
      });
    });

    describe('DemoAdmin.listPersonas', () => {
      const CLIENT_ADMINS = ['Priya', 'Daniel', 'Fiona', 'Tariq', 'Colin', 'Rosa', 'Gemma'];
      const STAFF = ['Jade', 'Mark', 'Maureen', 'Oscar', 'Toby'];

      it('lists the client admins of the three nursery clients and the named staff', async () => {
        const { admin } = await setup();
        const personas = await (admin as AdminWithPersonas).listPersonas();
        for (const first of CLIENT_ADMINS) {
          expect(
            personas.some((p) => p.side === 'client' && p.displayName.startsWith(first)),
            first,
          ).toBe(true);
        }
        for (const first of STAFF) {
          expect(
            personas.some((p) => p.side === 'staff' && p.displayName.startsWith(first)),
            first,
          ).toBe(true);
        }
      });

      it('takes each persona clientId and clientName from the user and client records', async () => {
        const { admin } = await setup();
        const personas = await (admin as AdminWithPersonas).listPersonas();
        const dump = (await admin.dumpAll()) as unknown as { users: UserAccount[]; clients: Client[] };
        expect(personas.length).toBeGreaterThanOrEqual(CLIENT_ADMINS.length + STAFF.length);
        for (const p of personas) {
          const user = dump.users.find((u) => u.id === p.userId);
          expect(user, p.displayName).toBeDefined();
          expect(user!.side).toBe(p.side);
          expect(p.clientId).toBe(user!.clientId);
          expect(p.clientName).toBe(dump.clients.find((c) => c.id === p.clientId)!.displayName);
        }
      });

      it('puts Oscar at Oak Tree and Gemma at Willow Lane, not at Little Acorns', async () => {
        const { admin, fx } = await setup();
        const personas = await (admin as AdminWithPersonas).listPersonas();
        const oscar = personas.find((p) => p.side === 'staff' && p.displayName.startsWith('Oscar'))!;
        const gemma = personas.find((p) => p.side === 'client' && p.displayName.startsWith('Gemma'))!;
        const priya = personas.find((p) => p.side === 'client' && p.displayName.startsWith('Priya'))!;
        expect(oscar.clientId).toBe(fx.ids.clients.ot);
        expect(priya.clientId).toBe(fx.ids.clients.a);
        expect(gemma.clientId).not.toBe(fx.ids.clients.a);
        expect(gemma.clientId).not.toBe(fx.ids.clients.ot);
      });

      it('lists only active client and staff users, each once, and never a provider user or a suspended user', async () => {
        const { admin, fx } = await setup();
        const dump = (await admin.dumpAll()) as unknown as { users: UserAccount[] };
        const priya = dump.users.find((u) => u.id === fx.ids.users.jade)!;
        await admin.bulkPut('users', [{ ...priya, status: 'suspended' }]);
        const personas = await (admin as AdminWithPersonas).listPersonas();
        const ids = personas.map((p) => p.userId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).not.toContain(fx.ids.users.jade);
        expect(ids).not.toContain(fx.ids.users.provOwner);
        for (const p of personas) expect(['client', 'staff']).toContain(p.side);
      });
    });

    describe('DemoState.clientPersona', () => {
      it('is saved and read back through DemoAdmin', async () => {
        const { admin, fx } = await setup();
        const state: DemoState = {
          clockOffsetMs: 0,
          industry: 'nursery',
          persona: { side: 'staff', userId: fx.ids.users.jade },
          clientPersona: { userId: fx.ids.users.gina },
        };
        await admin.setDemoState(state);
        expect((await admin.getDemoState())?.clientPersona).toEqual({ userId: fx.ids.users.gina });
      });

      it('refuses a client persona without a user id', async () => {
        const { admin, fx } = await setup();
        const bad = {
          clockOffsetMs: 0,
          industry: 'nursery',
          persona: { side: 'staff', userId: fx.ids.users.jade },
          clientPersona: {},
        } as unknown as DemoState;
        await expect(admin.setDemoState(bad)).rejects.toBeInstanceOf(ValidationError);
      });
    });

    describe('account state is derived from the subscription (assumption 45)', () => {
      const subscription = (clientId: string, over: Partial<Subscription>): Subscription => ({
        clientId,
        packageId: nid(50),
        period: 'monthly',
        renewalAt: plusDays(20),
        state: 'active',
        stateSince: plusDays(-100),
        billingContact: 'accounts@example.test',
        ...over,
      });

      it('refuses authoring when the stored client says Active but the trial ended 10 days ago (derived Read-only)', async () => {
        const { store, admin, fx } = await setup();
        const sc = fx.ids.stateClients.readOnly;
        await admin.bulkPut('clients', [{ ...sc.client, accountState: 'active' }]);
        await admin.bulkPut('subscriptions', [
          subscription(sc.client.id, { state: 'trial', stateSince: plusDays(-24), nextStateAt: plusDays(-10) }),
        ]);
        const ctx = client(sc.owner.id, sc.client.id);
        const existing = await store.people.get(ctx, sc.staffPerson.id);
        const error = await store.people.put(ctx, { ...existing, id: nid(1) }).then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).state).toBe('readOnly');
      });

      it('lets authoring through when the stored client says Read-only but the subscription is Active', async () => {
        const { store, admin, fx } = await setup();
        const sc = fx.ids.stateClients.readOnly;
        await admin.bulkPut('subscriptions', [subscription(sc.client.id, {})]);
        const ctx = client(sc.owner.id, sc.client.id);
        const existing = await store.people.get(ctx, sc.staffPerson.id);
        const created = await store.people.put(ctx, { ...existing, id: nid(2) });
        expect(created.id).toBe(nid(2));
      });

      it('walks the states when the clock moves: the same client is allowed at day 0 and refused 60 days later', async () => {
        const { store, admin, fx } = await setup();
        const sc = fx.ids.stateClients.paused;
        await admin.bulkPut('clients', [{ ...sc.client, accountState: 'active' }]);
        await admin.bulkPut('subscriptions', [
          subscription(sc.client.id, { state: 'trial', stateSince: plusDays(-10), nextStateAt: plusDays(4) }),
        ]);
        const now = (iso: string): ActorContext => ({ ...client(sc.owner.id, sc.client.id), now: iso });
        const existing = await store.people.get(now(TODAY), sc.staffPerson.id);
        const ok = await store.people.put(now(TODAY), { ...existing, id: nid(3) });
        expect(ok.id).toBe(nid(3));
        const later = plusDays(60);
        const error = await store.people.put(now(later), { ...existing, id: nid(4) }).then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(AccountStateError);
      });

      it('applies the derived state to staff too: a staff member of a client whose trial closed cannot read', async () => {
        const { store, admin, fx } = await setup();
        const sc = fx.ids.stateClients.readOnly;
        await admin.bulkPut('clients', [{ ...sc.client, accountState: 'active' }]);
        await admin.bulkPut('subscriptions', [
          subscription(sc.client.id, { state: 'trial', stateSince: plusDays(-24), nextStateAt: plusDays(-10) }),
        ]);
        // 10 days after the trial end is Read-only (14 days, brief 24.3): staff still read their own record.
        expect((await store.people.list(staff(sc.staff.id, sc.client.id))).map((p) => p.id)).toEqual([
          sc.staffPerson.id,
        ]);
        // 20 days after the trial end is Closed: staff are refused.
        await admin.bulkPut('subscriptions', [
          subscription(sc.client.id, { state: 'trial', stateSince: plusDays(-34), nextStateAt: plusDays(-20) }),
        ]);
        const error = await store.people.list(staff(sc.staff.id, sc.client.id)).then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(AccountStateError);
      });
    });

    describe('users.put keeps security fields (M3 security review)', () => {
      const rejected = async (p: Promise<unknown>): Promise<unknown> =>
        p.then(
          () => undefined,
          (e: unknown) => e,
        );
      async function withTwoFactor() {
        const s = await setup();
        const all = ((await s.admin.dumpAll()) as Record<string, UserAccount[]>)['users']!;
        const tariq = all.find((u) => u.id === s.fx.ids.users.riverMgr)!;
        const daniel = all.find((u) => u.id === s.fx.ids.users.daniel)!;
        await s.admin.bulkPut('users', [
          { ...tariq, twoFactor: { enrolledAt: at, recoveryCodesLeft: 3, recoveryCodeHashes: ['x'] } },
          { ...daniel, twoFactorRequiredSince: at },
        ]);
        return s;
      }
      const stored = async (s: Awaited<ReturnType<typeof setup>>, id: string): Promise<UserAccount> =>
        ((await s.admin.dumpAll()) as Record<string, UserAccount[]>)['users']!.find((u) => u.id === id)!;

      it('a manager cannot clear their own two-step sign-in or edit their own account', async () => {
        const s = await withTwoFactor();
        const tariq = client(s.fx.ids.users.riverMgr, s.fx.ids.clients.ot);
        const before = await stored(s, s.fx.ids.users.riverMgr);
        const copy = { ...before };
        delete copy.twoFactor;
        const error = await rejected(s.store.users.put(tariq, copy));
        expect(error === undefined || error instanceof ForbiddenError).toBe(true);
        expect(await stored(s, s.fx.ids.users.riverMgr)).toEqual(before);
      });

      it("Priya cannot clear Daniel's twoFactorRequiredSince, change his status, email or login", async () => {
        const s = await withTwoFactor();
        const priya = client(s.fx.ids.users.priya, s.fx.ids.clients.a);
        const before = await stored(s, s.fx.ids.users.daniel);
        const patched = {
          ...before,
          status: 'suspended' as const,
          email: 'other@example.test',
          login: { method: 'emailPassword' as const, pinSet: false },
          displayName: 'Daniel Renamed',
        };
        delete (patched as Partial<UserAccount>).twoFactorRequiredSince;
        const error = await rejected(s.store.users.put(priya, patched));
        if (error === undefined) {
          expect(await stored(s, s.fx.ids.users.daniel)).toEqual({ ...before, displayName: 'Daniel Renamed' });
        } else expect(error).toBeInstanceOf(ForbiddenError);
        const now = await stored(s, s.fx.ids.users.daniel);
        expect(now.twoFactorRequiredSince).toBe(at);
        expect(now.status).toBe(before.status);
        expect(now.email).toBe(before.email);
        expect(now.login).toEqual(before.login);
      });

      it("Tariq cannot change Gina's email or status", async () => {
        const s = await withTwoFactor();
        const tariq = client(s.fx.ids.users.riverMgr, s.fx.ids.clients.ot);
        const before = await stored(s, s.fx.ids.users.gina);
        const error = await rejected(
          s.store.users.put(tariq, { ...before, email: 'x@example.test', status: 'suspended' }),
        );
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(await stored(s, s.fx.ids.users.gina)).toEqual(before);
      });

      it('Rory (no team.manageRoles) cannot write an admin account at all', async () => {
        const s = await withTwoFactor();
        const rory = client(s.fx.ids.users.rory, s.fx.ids.clients.ot);
        const before = await stored(s, s.fx.ids.users.gina);
        const error = await rejected(s.store.users.put(rory, { ...before, displayName: 'Changed' }));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect(await stored(s, s.fx.ids.users.gina)).toEqual(before);
      });

      it("another person's two-step internals are not returned on reads", async () => {
        const s = await withTwoFactor();
        const gina = client(s.fx.ids.users.gina, s.fx.ids.clients.ot);
        const seen = await s.store.users.get(gina, s.fx.ids.users.riverMgr);
        expect(seen.twoFactor?.recoveryCodeHashes).toBeUndefined();
        expect(seen.twoFactor?.failedCodes).toBeUndefined();
        expect(seen.twoFactor?.lockedUntil).toBeUndefined();
        expect(seen.twoFactor?.enrolledAt).toBe(at);
        const own = await s.store.users.get(
          client(s.fx.ids.users.riverMgr, s.fx.ids.clients.ot),
          s.fx.ids.users.riverMgr,
        );
        expect(own.twoFactor?.recoveryCodeHashes).toEqual(['x']);
      });
    });
  });
}
