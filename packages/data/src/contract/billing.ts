// M3 chunk 7 contract tests, "Data B: billing and account states" (plan docs/plans/m3.md, assumptions 40 to 47,
// Data package and Contract tests). Proves BP-10, BP-11 and BP-12 in the data layer. Runs against every adapter.
// Written before the implementation, so the new DataStore methods are described by the local types below: they are
// the contract the implementer adds to `DataStore`.
//
// Fixtures: the seed does not hold invoices or billing profiles yet (seed version 4 is chunk 11), so setup() writes
// them through DemoAdmin.bulkPut. Nothing here relies on a seed change.
//
// Conventions the tests assume (the plan leaves them open):
//   - The step-up code is the demo code '123456' (as for two-factor). A blank code gives RuleError('stepUpRequired'),
//     any other code RuleError('wrongCode').
//   - Audit actions (one slim event per write, `clientId` set): billing.requestDetailsChange, billing.updateContact,
//     billing.changePlan, billing.payNow, addOns.turnOn, addOns.turnOff, addOns.setCap, addOnRequests.create,
//     addOnRequests.decide, ai.explain is NOT audited with personal data.
//   - Usage pricing: a call to ai.explain costs `pricePerUnit` once usageThisPeriod has passed `includedUnits`; it is
//     refused with RuleError('usageCapReached') when (usageThisPeriod + 1 - includedUnits) * pricePerUnit would
//     exceed usageCapPence. No cap means no limit.
//   - Notification kinds are not asserted, only who receives one.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type AddOnRequest,
  type AddOnSubscription,
  type AccountState,
  type BillingProfile,
  type Client,
  type Invoice,
  type Module,
  type Notification,
  type OutboxMessage,
  type PaymentAttempt,
  type Role,
  type RoleAssignment,
  type Subscription,
  type UserAccount,
} from '@sta/domain';
import { addOnIds, packageIds } from '@sta/content';
import {
  AccountStateError,
  DataError,
  ForbiddenError,
  NotEntitledError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY, type World } from './world';

// ---------------------------------------------------------------- the API under test

export type PlanPreview = {
  direction: 'upgrade' | 'downgrade' | 'same';
  applies: 'now' | 'atRenewal';
  currentPrice: number;
  newPrice: number;
  newLimits: Record<string, unknown>;
  becomesReadOnly: { key: string; used: number; limit: number; overBy: number }[];
};

export type BillingOverview = {
  packageId: string;
  /** Package band price per site for the active staff count, times active sites (assumption 41). */
  planPrice: { perSite: number; sites: number; total: number };
  period: 'monthly' | 'annual';
  state: AccountState;
  renewalAt: string;
  pendingPackageId?: string;
  billingContact: string;
  paymentMethod?: { brand: string; last4: string; expMonth: number; expYear: number };
};

export type AddOnListing = {
  addOnId: string;
  name: string;
  status: 'off' | 'on' | 'trial';
  startedAt?: string;
  endsAt?: string;
  usageCapPence?: number;
  usageThisPeriod: number;
};

export type AccountStatus = {
  state: AccountState;
  since: string;
  nextChange?: { state: AccountState; at: string };
  whatWorks: { feature: string; availability: string }[];
  /** Overdue or due amount in pence. Present only for actors with billing.view. */
  amountDuePence?: number;
};

export type BillingStore = {
  billing: {
    overview(ctx: ActorContext): Promise<BillingOverview>;
    invoices(ctx: ActorContext): Promise<Invoice[]>;
    invoice(ctx: ActorContext, id: string): Promise<Invoice>;
    requestDetailsChange(
      ctx: ActorContext,
      proposed: { billingName?: string; address?: string; vatNumber?: string },
    ): Promise<unknown>;
    updateContact(ctx: ActorContext, email: string, code: string): Promise<unknown>;
    previewPlanChange(ctx: ActorContext, packageId: string): Promise<PlanPreview>;
    changePlan(ctx: ActorContext, packageId: string, code: string): Promise<unknown>;
    payNow(ctx: ActorContext): Promise<unknown>;
  };
  addOns: {
    list(ctx: ActorContext): Promise<AddOnListing[]>;
    turnOn(ctx: ActorContext, addOnId: string, options?: { trial?: boolean }): Promise<AddOnSubscription>;
    turnOff(ctx: ActorContext, addOnId: string): Promise<AddOnSubscription>;
    /** `null` removes the cap. */
    setCap(ctx: ActorContext, addOnId: string, capPence: number | null): Promise<AddOnSubscription>;
  };
  addOnRequests: {
    create(ctx: ActorContext, input: { addOnId: string; note?: string }): Promise<AddOnRequest>;
    list(ctx: ActorContext): Promise<AddOnRequest[]>;
    decide(ctx: ActorContext, requestId: string, decision: 'approved' | 'declined'): Promise<AddOnRequest>;
  };
  access: {
    features(ctx: ActorContext): Promise<{ aiAssistant: boolean }>;
  };
  account: {
    status(ctx: ActorContext): Promise<AccountStatus>;
    staffNotice(ctx: ActorContext): Promise<{ needsAttention: true } | null>;
  };
  ai: {
    explain(ctx: ActorContext, input: { moduleId: string; lessonId: string }): Promise<{ label: string; text: string }>;
  };
  people: { list(ctx: ActorContext): Promise<unknown[]> };
  categories: { save(ctx: ActorContext, input: { name: string; colour: string; icon: string }): Promise<unknown> };
};

type SimulatingAdmin = DemoAdmin & { simulateFailedPayment(clientId: string, now: string): Promise<void> };

// ---------------------------------------------------------------- helpers

const DAY = 86_400_000;
const CODE = '123456';
const PAYMENT_WORDS = /pay|invoice|bill|price|£|pence|card|subscription|plan/i;
const plus = (ms: number): string => new Date(Date.parse(TODAY) + ms).toISOString();

const client = (userId: string, clientId: string, now = TODAY): ActorContext => ({
  userId,
  side: 'client',
  clientId,
  now,
});
const staff = (userId: string, clientId: string, now = TODAY): ActorContext => ({
  userId,
  side: 'staff',
  clientId,
  now,
});

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(ForbiddenError);
  return (error as ForbiddenError).reason;
}

async function dump<T>(admin: StoreHandle['admin'], store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}

const permissionOnly = async (promise: Promise<unknown>): Promise<void> => {
  expect(await reasonOf(promise)).toBe('permission');
};

export function runBillingContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx: World = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const store = handle.store as unknown as BillingStore;
    const admin = handle.admin as SimulatingAdmin;
    const a = fx.ids.clients.a;
    const b = fx.ids.clients.b;

    // Extra people at Little Acorns: Vera (billing.view only, the seeded "Billing viewer" role) and Max (view plus
    // billing.manageAddOns, but not billing.manage). Rory (role manager) and Daniel have no billing access at all.
    const user = (id: number, clientId: string, displayName: string): UserAccount => ({
      id: freshId(id),
      side: 'client',
      clientId,
      email: `${displayName.toLowerCase()}@example.test`,
      displayName,
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    });
    const vera = user(3001, a, 'Vera');
    const max = user(3002, a, 'Max');
    const wendy = user(3003, b, 'Wendy');
    const maxRole: Role = {
      id: freshId(3010),
      owner: { clientId: a },
      name: 'Add-on approver',
      description: 'Add-on approver',
      colour: '#996633',
      permissionIds: ['billing.view', 'billing.manageAddOns'],
      system: false,
      version: 1,
      updatedBy: fx.ids.users.priya,
      updatedAt: TODAY,
    };
    const wendyRole: Role = {
      ...maxRole,
      id: freshId(3011),
      owner: { clientId: b },
      name: 'Staff viewer',
      description: 'Staff viewer',
      permissionIds: ['staff.view'],
    };
    const assignment = (id: number, userId: string, roleIds: string[], clientId: string): RoleAssignment => ({
      id: freshId(id),
      userId,
      roleIds,
      scope: { type: 'clients', ids: [clientId] },
      grants: [],
      denies: [],
      status: 'active',
    });
    await admin.bulkPut('users', [vera, max, wendy]);
    await admin.bulkPut('roles', [maxRole, wendyRole]);
    await admin.bulkPut('roleAssignments', [
      assignment(3020, vera.id, [fx.ids.roles.billingViewer], a),
      assignment(3021, max.id, [maxRole.id], a),
      assignment(3022, wendy.id, [wendyRole.id], b),
    ]);

    // Fake billing data (seed version 4 will hold the real thing).
    const invoice = (n: number, clientId: string, status: Invoice['status'], daysAgo: number): Invoice => ({
      id: freshId(n),
      number: `INV-${String(n)}`,
      clientId,
      issuedAt: plus(-daysAgo * DAY),
      dueAt: plus((14 - daysAgo) * DAY),
      billingNameAtIssue: 'Test Nursery Ltd',
      billingAddressAtIssue: '1 Test Street',
      lines: [{ label: 'Plan', amount: 5000 }],
      tax: 1000,
      total: 6000,
      status,
    });
    const profile = (clientId: string, contact: string): BillingProfile => ({
      clientId,
      billingName: 'Test Nursery Ltd',
      address: '1 Test Street',
      billingContactEmail: contact,
      paymentMethod: { brand: 'Testcard', last4: '4242', expMonth: 12, expYear: 2030 },
      updatedBy: fx.ids.users.priya,
      updatedAt: TODAY,
    });
    const invA1 = invoice(3100, a, 'paid', 60);
    const invA2 = invoice(3101, a, 'due', 2);
    const invB1 = invoice(3102, b, 'overdue', 10);
    await admin.bulkPut('invoices', [invA1, invA2, invB1]);
    await admin.bulkPut('billingProfiles', [
      profile(a, 'accounts@little-acorns-nursery.test'),
      profile(b, 'accounts@willow-lane-nursery.test'),
    ]);

    // Little Acorns starts with the AI Assistant switched off (the seed holds this row; make sure of it).
    await admin.bulkPut('addOnSubscriptions', [
      { clientId: a, addOnId: addOnIds.aiAssistant, status: 'off', usageThisPeriod: 0 },
    ]);

    const subscriptionOf = async (clientId: string): Promise<Subscription> =>
      (await dump<Subscription>(admin, 'subscriptions')).find((s) => s.clientId === clientId)!;
    const addOnSub = async (clientId: string, addOnId = addOnIds.aiAssistant): Promise<AddOnSubscription | undefined> =>
      (await dump<AddOnSubscription>(admin, 'addOnSubscriptions')).find(
        (s) => s.clientId === clientId && s.addOnId === addOnId,
      );
    const clientRecord = async (clientId: string): Promise<Client> =>
      (await dump<Client>(admin, 'clients')).find((c) => c.id === clientId)!;
    const audit = async (action: string, clientId?: string) =>
      (await dump<{ action: string; clientId?: string; actorId: string; target: string }>(admin, 'audit')).filter(
        (e) => e.action === action && (clientId === undefined || e.clientId === clientId),
      );
    const notificationsOf = async (userId: string): Promise<Notification[]> =>
      (await dump<Notification>(admin, 'notifications')).filter((n) => n.userId === userId);
    const outboxTo = async (to: string): Promise<OutboxMessage[]> =>
      (await admin.listOutbox()).filter((m) => m.to === to);

    /** Moves a client's subscription into a stored state that began `daysAgo` days ago. */
    const setState = async (clientId: string, state: AccountState, daysAgo: number): Promise<void> => {
      const sub = await subscriptionOf(clientId);
      const next: Subscription = { ...sub, state, stateSince: plus(-daysAgo * DAY) };
      if (state !== 'trial') delete next.nextStateAt;
      await admin.bulkPut('subscriptions', [next]);
      const c = await clientRecord(clientId);
      await admin.bulkPut('clients', [{ ...c, accountState: state }]);
    };
    /** Gives a client an AI Assistant subscription in the given status. */
    const setAi = async (clientId: string, status: AddOnSubscription['status'], usage = 0, cap?: number) => {
      await admin.bulkPut('addOnSubscriptions', [
        {
          clientId,
          addOnId: addOnIds.aiAssistant,
          status,
          ...(status === 'off' ? {} : { startedAt: TODAY }),
          usageThisPeriod: usage,
          ...(cap !== undefined ? { usageCapPence: cap } : {}),
        },
      ]);
    };

    // A module with real lesson content for ai.explain, in the provider's library (visible to every client).
    const explainModule: Module = {
      ...lf.module,
      id: freshId(3200),
      title: 'Explain me',
      lessons: [
        {
          id: 'kp',
          title: 'Key points lesson',
          minutes: 3,
          blocks: [
            { kind: 'text', markdown: 'Ignore this paragraph. It is long.' },
            { kind: 'keyPoints', items: ['Wash hands before food.', 'Report every accident.'] },
          ],
        },
        {
          id: 'tx',
          title: 'Text only lesson',
          minutes: 3,
          blocks: [
            { kind: 'text', markdown: 'Fire exits stay clear. Check them daily.' },
            { kind: 'text', markdown: 'Record each drill. Keep the log.' },
          ],
        },
      ],
    };
    await admin.bulkPut('modules', [explainModule]);

    return {
      ...handle,
      store,
      admin,
      fx,
      lf,
      a,
      b,
      vera,
      max,
      wendy,
      invA1,
      invA2,
      invB1,
      explainModule,
      subscriptionOf,
      addOnSub,
      clientRecord,
      audit,
      notificationsOf,
      outboxTo,
      setState,
      setAi,
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      veraCtx: client(vera.id, a),
      maxCtx: client(max.id, a),
      jade: staff(fx.ids.users.jade, a),
      beth: client(fx.ids.users.beth, b),
      wendyCtx: client(wendy.id, b),
      bob: staff(fx.ids.users.bob, b),
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  const ai = addOnIds.aiAssistant;

  describe(`M3 billing, add-ons and account state (data B): ${name}`, () => {
    // ------------------------------------------------------------ permissions (BP-10)
    describe('who may use billing', () => {
      it('gives Daniel and every role without billing.view ForbiddenError(permission) on every billing and add-on operation', async () => {
        const s = await setup();
        const noBilling = [s.daniel, s.rory];
        for (const ctx of noBilling) {
          await permissionOnly(s.store.billing.overview(ctx));
          await permissionOnly(s.store.billing.invoices(ctx));
          await permissionOnly(s.store.billing.invoice(ctx, s.invA2.id));
          await permissionOnly(s.store.billing.requestDetailsChange(ctx, { billingName: 'Other Ltd' }));
          await permissionOnly(s.store.billing.updateContact(ctx, 'new@example.test', CODE));
          await permissionOnly(s.store.billing.previewPlanChange(ctx, packageIds.group));
          await permissionOnly(s.store.billing.changePlan(ctx, packageIds.group, CODE));
          await permissionOnly(s.store.billing.payNow(ctx));
          await permissionOnly(s.store.addOns.list(ctx));
          await permissionOnly(s.store.addOns.turnOn(ctx, ai));
          await permissionOnly(s.store.addOns.turnOff(ctx, ai));
          await permissionOnly(s.store.addOns.setCap(ctx, ai, 500));
        }
        expect(await s.addOnSub(s.a, ai)).toMatchObject({ status: 'off' });
        expect((await s.subscriptionOf(s.a)).packageId).toBe(packageIds.standard);
      });

      it('refuses Daniel the add-on request decision and the full request list', async () => {
        const s = await setup();
        const request = await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        await permissionOnly(s.store.addOnRequests.decide(s.daniel, request.id, 'approved'));
        await permissionOnly(s.store.addOnRequests.decide(s.rory, request.id, 'approved'));
        expect((await dump<AddOnRequest>(s.admin, 'addOnRequests'))[0]!.status).toBe('pending');
      });

      it('refuses staff every billing, add-on and account-status operation', async () => {
        const s = await setup();
        expect(await refusal(s.store.billing.overview(s.jade))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.billing.payNow(s.jade))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.addOns.list(s.jade))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.addOns.turnOn(s.jade, ai))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.account.status(s.jade))).toBeInstanceOf(ForbiddenError);
      });

      it('lets billing.view alone read, and refuses it every change', async () => {
        const s = await setup();
        await expect(s.store.billing.overview(s.veraCtx)).resolves.toBeDefined();
        await expect(s.store.billing.invoices(s.veraCtx)).resolves.toHaveLength(2);
        await expect(s.store.addOns.list(s.veraCtx)).resolves.toBeInstanceOf(Array);
        await permissionOnly(s.store.billing.requestDetailsChange(s.veraCtx, { billingName: 'Other Ltd' }));
        await permissionOnly(s.store.billing.updateContact(s.veraCtx, 'new@example.test', CODE));
        await permissionOnly(s.store.billing.changePlan(s.veraCtx, packageIds.group, CODE));
        await permissionOnly(s.store.billing.payNow(s.veraCtx));
        await permissionOnly(s.store.addOns.turnOn(s.veraCtx, ai));
        await permissionOnly(s.store.addOns.turnOff(s.veraCtx, ai));
        await permissionOnly(s.store.addOns.setCap(s.veraCtx, ai, 500));
      });

      it('lets billing.manageAddOns change add-ons but not the plan or payment', async () => {
        const s = await setup();
        await expect(s.store.addOns.turnOn(s.maxCtx, ai)).resolves.toMatchObject({ status: 'on' });
        await expect(s.store.addOns.setCap(s.maxCtx, ai, 1000)).resolves.toMatchObject({ usageCapPence: 1000 });
        await permissionOnly(s.store.billing.changePlan(s.maxCtx, packageIds.group, CODE));
        await permissionOnly(s.store.billing.payNow(s.maxCtx));
      });

      it('never shows another organisation invoices', async () => {
        const s = await setup();
        expect((await s.store.billing.invoices(s.priya)).map((i) => i.id).sort()).toEqual(
          [s.invA1.id, s.invA2.id].sort(),
        );
        expect(await refusal(s.store.billing.invoice(s.priya, s.invB1.id))).toBeInstanceOf(NotFoundError);
        expect((await s.store.billing.invoice(s.beth, s.invB1.id)).id).toBe(s.invB1.id);
      });
    });

    // ------------------------------------------------------------ overview and plan change
    describe('overview and plan change', () => {
      it('gives the plan card: package band price per site times active sites, monthly, with the mock payment method', async () => {
        const s = await setup();
        const o = await s.store.billing.overview(s.priya);
        expect(o).toMatchObject({
          packageId: packageIds.standard,
          period: 'monthly',
          state: 'active',
          paymentMethod: { brand: 'Testcard', last4: '4242' },
        });
        expect(o.planPrice.sites).toBe(2);
        expect(o.planPrice.total).toBe(o.planPrice.perSite * 2);
        expect(o.planPrice.perSite).toBeGreaterThan(0);
        // No card number is ever held.
        expect(JSON.stringify({ ...o, packageId: undefined })).not.toMatch(/\d{12,}/);
      });

      it('previews an upgrade as immediate and a downgrade as at renewal, with items that become read-only', async () => {
        const s = await setup();
        const up = await s.store.billing.previewPlanChange(s.priya, packageIds.group);
        expect(up).toMatchObject({ direction: 'upgrade', applies: 'now' });
        expect(up.newPrice).toBeGreaterThan(up.currentPrice);
        const down = await s.store.billing.previewPlanChange(s.priya, packageIds.essentials);
        expect(down).toMatchObject({ direction: 'downgrade', applies: 'atRenewal' });
        expect(down.newPrice).toBeLessThan(down.currentPrice);
        expect(down.newLimits).toBeDefined();
        expect(Array.isArray(down.becomesReadOnly)).toBe(true);
        // A preview changes nothing.
        expect((await s.subscriptionOf(s.a)).packageId).toBe(packageIds.standard);
      });

      it('refuses previewing an unknown package', async () => {
        const s = await setup();
        expect(await refusal(s.store.billing.previewPlanChange(s.priya, freshId(3999)))).toBeInstanceOf(NotFoundError);
      });

      it('needs the step-up code to change plan: blank gives stepUpRequired, a wrong code gives wrongCode', async () => {
        const s = await setup();
        expect(await ruleOf(s.store.billing.changePlan(s.priya, packageIds.group, ''))).toBe('stepUpRequired');
        expect(await ruleOf(s.store.billing.changePlan(s.priya, packageIds.group, '000000'))).toBe('wrongCode');
        expect((await s.subscriptionOf(s.a)).packageId).toBe(packageIds.standard);
        expect((await s.clientRecord(s.a)).packageId).toBe(packageIds.standard);
        expect(await s.audit('billing.changePlan')).toEqual([]);
      });

      it('applies an upgrade at once to the subscription and the client, with one audit event', async () => {
        const s = await setup();
        await s.store.billing.changePlan(s.priya, packageIds.group, CODE);
        const sub = await s.subscriptionOf(s.a);
        expect(sub.packageId).toBe(packageIds.group);
        expect(sub.pendingPackageId).toBeUndefined();
        expect((await s.clientRecord(s.a)).packageId).toBe(packageIds.group);
        expect(await s.audit('billing.changePlan', s.a)).toHaveLength(1);
        expect((await s.store.billing.overview(s.priya)).packageId).toBe(packageIds.group);
      });

      it('keeps a downgrade pending until renewal: pendingPackageId set, current package unchanged', async () => {
        const s = await setup();
        await s.store.billing.changePlan(s.priya, packageIds.essentials, CODE);
        const sub = await s.subscriptionOf(s.a);
        expect(sub.packageId).toBe(packageIds.standard);
        expect(sub.pendingPackageId).toBe(packageIds.essentials);
        expect((await s.clientRecord(s.a)).packageId).toBe(packageIds.standard);
        expect((await s.store.billing.overview(s.priya)).pendingPackageId).toBe(packageIds.essentials);
      });

      it('changes the billing contact only with the code, and records it in the subscription, the profile and the audit', async () => {
        const s = await setup();
        expect(await ruleOf(s.store.billing.updateContact(s.priya, 'new@example.test', ''))).toBe('stepUpRequired');
        expect(await ruleOf(s.store.billing.updateContact(s.priya, 'new@example.test', '999999'))).toBe('wrongCode');
        await s.store.billing.updateContact(s.priya, 'new@example.test', CODE);
        expect((await s.subscriptionOf(s.a)).billingContact).toBe('new@example.test');
        const profile = (await dump<BillingProfile>(s.admin, 'billingProfiles')).find((p) => p.clientId === s.a)!;
        expect(profile.billingContactEmail).toBe('new@example.test');
        expect(await s.audit('billing.updateContact', s.a)).toHaveLength(1);
      });

      it('refuses a billing contact that is not an email address', async () => {
        const s = await setup();
        expect(await refusal(s.store.billing.updateContact(s.priya, 'not-an-email', CODE))).toBeInstanceOf(
          ValidationError,
        );
      });

      it('stores a details change as a pending request, leaving the billing profile alone until approved', async () => {
        const s = await setup();
        await s.store.billing.requestDetailsChange(s.priya, { billingName: 'Renamed Nursery Ltd' });
        const requests = await dump<{ clientId: string; requestedBy: string; status: string; proposed: object }>(
          s.admin,
          'billingChangeRequests',
        );
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
          clientId: s.a,
          requestedBy: s.fx.ids.users.priya,
          status: 'pending',
          proposed: { billingName: 'Renamed Nursery Ltd' },
        });
        const profile = (await dump<BillingProfile>(s.admin, 'billingProfiles')).find((p) => p.clientId === s.a)!;
        expect(profile.billingName).toBe('Test Nursery Ltd');
        expect(await s.audit('billing.requestDetailsChange', s.a)).toHaveLength(1);
      });
    });

    // ------------------------------------------------------------ add-ons
    describe('add-ons', () => {
      it('lists the add-ons with Little Acorns AI Assistant switched off', async () => {
        const s = await setup();
        const list = await s.store.addOns.list(s.priya);
        expect(list.find((x) => x.addOnId === ai)).toMatchObject({ status: 'off', usageThisPeriod: 0 });
        expect(list.length).toBeGreaterThan(1);
      });

      it('lets Priya turn on the AI Assistant and flips access.features in the same test, for client and staff', async () => {
        const s = await setup();
        expect(await s.store.access.features(s.priya)).toEqual({ aiAssistant: false });
        expect(await s.store.access.features(s.jade)).toEqual({ aiAssistant: false });
        const result = await s.store.addOns.turnOn(s.priya, ai);
        expect(result).toMatchObject({ clientId: s.a, addOnId: ai, status: 'on', startedAt: TODAY });
        expect(await s.store.access.features(s.priya)).toEqual({ aiAssistant: true });
        expect(await s.store.access.features(s.jade)).toEqual({ aiAssistant: true });
        expect(await s.addOnSub(s.a)).toMatchObject({ status: 'on' });
        expect(await s.audit('addOns.turnOn', s.a)).toHaveLength(1);
      });

      it('never gives access.features prices or other fields', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        expect(Object.keys(await s.store.access.features(s.jade))).toEqual(['aiAssistant']);
      });

      it('keeps the feature off for another organisation', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        expect(await s.store.access.features(s.beth)).toEqual({ aiAssistant: false });
      });

      it('starts a 14 day trial with status trial, and the feature is on', async () => {
        const s = await setup();
        const result = await s.store.addOns.turnOn(s.priya, ai, { trial: true });
        expect(result.status).toBe('trial');
        const days = (Date.parse(result.endsAt!) - Date.parse(TODAY)) / DAY;
        expect(days).toBeGreaterThanOrEqual(13);
        expect(days).toBeLessThanOrEqual(15);
        expect((await s.store.access.features(s.jade)).aiAssistant).toBe(true);
      });

      it('turns off at the renewal date, not at once', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        const result = await s.store.addOns.turnOff(s.priya, ai);
        const renewal = (await s.subscriptionOf(s.a)).renewalAt;
        expect(result.endsAt).toBe(renewal);
        expect(result.status).toBe('on');
        expect((await s.store.access.features(s.jade)).aiAssistant).toBe(true);
        expect(await s.audit('addOns.turnOff', s.a)).toHaveLength(1);
      });

      it('refuses an unknown add-on', async () => {
        const s = await setup();
        expect(await refusal(s.store.addOns.turnOn(s.priya, freshId(3998)))).toBeInstanceOf(NotFoundError);
      });

      it('stores a spending cap in pence, and removes it with null', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        expect((await s.store.addOns.setCap(s.priya, ai, 2500)).usageCapPence).toBe(2500);
        expect((await s.addOnSub(s.a))!.usageCapPence).toBe(2500);
        expect((await s.store.addOns.setCap(s.priya, ai, null)).usageCapPence).toBeUndefined();
        expect(await s.audit('addOns.setCap', s.a)).toHaveLength(2);
      });

      it('refuses a negative or fractional cap', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        expect(await refusal(s.store.addOns.setCap(s.priya, ai, -1))).toBeInstanceOf(ValidationError);
        expect(await refusal(s.store.addOns.setCap(s.priya, ai, 1.5))).toBeInstanceOf(ValidationError);
      });
    });

    // ------------------------------------------------------------ requests
    describe('add-on requests', () => {
      it('lets an admin without billing.manageAddOns send a request with a note', async () => {
        const s = await setup();
        const r = await s.store.addOnRequests.create(s.rory, { addOnId: ai, note: 'Staff keep asking for it' });
        expect(r).toMatchObject({
          clientId: s.a,
          addOnId: ai,
          requestedBy: s.fx.ids.users.rory,
          note: 'Staff keep asking for it',
          status: 'pending',
        });
        expect(await s.audit('addOnRequests.create', s.a)).toHaveLength(1);
        expect(await s.store.access.features(s.jade)).toEqual({ aiAssistant: false });
      });

      it('refuses a note over 300 characters and an unknown add-on, writing nothing', async () => {
        const s = await setup();
        expect(
          await refusal(s.store.addOnRequests.create(s.rory, { addOnId: ai, note: 'x'.repeat(301) })),
        ).toBeInstanceOf(ValidationError);
        expect(await refusal(s.store.addOnRequests.create(s.rory, { addOnId: freshId(3997) }))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await dump(s.admin, 'addOnRequests')).toEqual([]);
      });

      it('refuses staff', async () => {
        const s = await setup();
        expect(await refusal(s.store.addOnRequests.create(s.jade, { addOnId: ai }))).toBeInstanceOf(ForbiddenError);
      });

      it('notifies every holder of billing.manageAddOns and puts an email for each in the Outbox, and nobody else', async () => {
        const s = await setup();
        const before = (await s.admin.listOutbox()).length;
        await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        for (const id of [s.fx.ids.users.priya, s.max.id]) {
          expect(await s.notificationsOf(id), id).toHaveLength(1);
        }
        for (const id of [s.vera.id, s.fx.ids.users.rory, s.fx.ids.users.daniel]) {
          expect(await s.notificationsOf(id), id).toHaveLength(0);
        }
        const priyaUser = (await dump<UserAccount>(s.admin, 'users')).find((u) => u.id === s.fx.ids.users.priya)!;
        expect(await s.outboxTo(priyaUser.email!)).toHaveLength(1);
        expect(await s.outboxTo(s.max.email!)).toHaveLength(1);
        // Tim holds Group Admin until tomorrow (world fixture), so he is a holder too: three emails in all.
        expect(await s.notificationsOf(s.fx.ids.users.tim)).toHaveLength(1);
        expect((await s.admin.listOutbox()).length).toBe(before + 3);
      });

      it('lists only the own requests to a requester and every request to a holder', async () => {
        const s = await setup();
        const mine = await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        const veras = await s.store.addOnRequests.create(s.veraCtx, { addOnId: ai });
        expect((await s.store.addOnRequests.list(s.rory)).map((r) => r.id)).toEqual([mine.id]);
        expect((await s.store.addOnRequests.list(s.veraCtx)).map((r) => r.id)).toEqual([veras.id]);
        expect((await s.store.addOnRequests.list(s.priya)).map((r) => r.id).sort()).toEqual([mine.id, veras.id].sort());
        expect(await s.store.addOnRequests.list(s.beth)).toEqual([]);
      });

      it('approves: turns the add-on on, flips access.features, notifies the requester, and audits', async () => {
        const s = await setup();
        const r = await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        const decided = await s.store.addOnRequests.decide(s.maxCtx, r.id, 'approved');
        expect(decided).toMatchObject({ id: r.id, status: 'approved', decidedBy: s.max.id });
        expect(decided.decidedAt).toBe(TODAY);
        expect(await s.addOnSub(s.a)).toMatchObject({ status: 'on' });
        expect(await s.store.access.features(s.jade)).toEqual({ aiAssistant: true });
        expect(await s.notificationsOf(s.fx.ids.users.rory)).toHaveLength(1);
        expect(await s.audit('addOnRequests.decide', s.a)).toHaveLength(1);
      });

      it('declines: leaves the add-on off, notifies the requester, and audits', async () => {
        const s = await setup();
        const r = await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        const decided = await s.store.addOnRequests.decide(s.priya, r.id, 'declined');
        expect(decided).toMatchObject({ status: 'declined', decidedBy: s.fx.ids.users.priya });
        expect(await s.addOnSub(s.a)).toMatchObject({ status: 'off' });
        expect(await s.store.access.features(s.jade)).toEqual({ aiAssistant: false });
        expect(await s.notificationsOf(s.fx.ids.users.rory)).toHaveLength(1);
        expect(await s.audit('addOnRequests.decide', s.a)).toHaveLength(1);
      });

      it('refuses deciding twice, and deciding another organisation request', async () => {
        const s = await setup();
        const r = await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        expect(await refusal(s.store.addOnRequests.decide(s.beth, r.id, 'approved'))).toBeInstanceOf(NotFoundError);
        await s.store.addOnRequests.decide(s.priya, r.id, 'declined');
        expect(await refusal(s.store.addOnRequests.decide(s.priya, r.id, 'approved'))).toBeInstanceOf(DataError);
        expect((await dump<AddOnRequest>(s.admin, 'addOnRequests'))[0]!.status).toBe('declined');
      });

      it('refuses approving when the account state does not allow add-ons, leaving the request pending', async () => {
        const s = await setup();
        const r = await s.store.addOnRequests.create(s.rory, { addOnId: ai });
        await s.setState(s.a, 'limited', 5);
        expect(await refusal(s.store.addOnRequests.decide(s.priya, r.id, 'approved'))).toBeInstanceOf(
          AccountStateError,
        );
        expect((await dump<AddOnRequest>(s.admin, 'addOnRequests'))[0]!.status).toBe('pending');
      });
    });

    // ------------------------------------------------------------ demo AI
    describe('ai.explain', () => {
      const lessonKp = { lessonId: 'kp' };
      const lessonTx = { lessonId: 'tx' };

      it('needs the aiAssistant entitlement and counts nothing when refused', async () => {
        const s = await setup();
        const error = await refusal(s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp }));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('aiAssistant');
        expect(await s.addOnSub(s.a)).toMatchObject({ usageThisPeriod: 0 });
      });

      it('gives staff no payment wording when it refuses', async () => {
        const s = await setup();
        const error = (await refusal(
          s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp }),
        )) as Error;
        // The message names the feature only; the words price, pay, invoice and billing never reach staff.
        expect(error.message).not.toMatch(/price|pay|invoice|billing|£|pence|cost/i);
      });

      it('builds the answer from the lesson key points, labelled Demo AI, and adds 1 to usage', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        const result = await s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp });
        expect(result.label).toBe('Demo AI');
        expect(result.text).toContain('Wash hands before food.');
        expect(result.text).toContain('Report every accident.');
        expect(result.text).not.toContain('Ignore this paragraph');
        expect(result.text).not.toMatch(PAYMENT_WORDS);
        expect(await s.addOnSub(s.a)).toMatchObject({ usageThisPeriod: 1 });
        await s.store.ai.explain(s.priya, { moduleId: s.explainModule.id, ...lessonKp });
        expect(await s.addOnSub(s.a)).toMatchObject({ usageThisPeriod: 2 });
      });

      it('falls back to the first sentence of each text block when the lesson has no key points', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        const result = await s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonTx });
        expect(result.text).toContain('Fire exits stay clear.');
        expect(result.text).toContain('Record each drill.');
        expect(result.text).not.toContain('Check them daily.');
        expect(result.text).not.toContain('Keep the log.');
      });

      it('works during a trial', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai, { trial: true });
        await expect(s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp })).resolves.toBeDefined();
      });

      it('refuses an unknown module or lesson, counting nothing', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        expect(await refusal(s.store.ai.explain(s.jade, { moduleId: freshId(3996), ...lessonKp }))).toBeInstanceOf(
          NotFoundError,
        );
        expect(
          await refusal(s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, lessonId: 'nope' })),
        ).toBeInstanceOf(NotFoundError);
        expect(await s.addOnSub(s.a)).toMatchObject({ usageThisPeriod: 0 });
      });

      it('stops at the spending cap with usageCapReached, and does not count the refused call', async () => {
        const s = await setup();
        // AI Assistant includes 200 questions then costs 5p each. 200 used, cap of 5p: one more fits, the next does not.
        await s.setAi(s.a, 'on', 200, 5);
        await s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp });
        expect(await s.addOnSub(s.a)).toMatchObject({ usageThisPeriod: 201 });
        expect(await ruleOf(s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp }))).toBe(
          'usageCapReached',
        );
        expect(await s.addOnSub(s.a)).toMatchObject({ usageThisPeriod: 201 });
      });

      it('keeps working inside the included questions with a cap of 0, and carries on without a cap', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on', 0, 0);
        await expect(s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp })).resolves.toBeDefined();
        await s.setAi(s.a, 'on', 500);
        await expect(s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp })).resolves.toBeDefined();
      });

      it('writes no personal data to the audit log', async () => {
        const s = await setup();
        await s.store.addOns.turnOn(s.priya, ai);
        const before = (await dump<unknown>(s.admin, 'audit')).length;
        await s.store.ai.explain(s.jade, { moduleId: s.explainModule.id, ...lessonKp });
        const added = (await dump<unknown>(s.admin, 'audit')).slice(before);
        const text = JSON.stringify(added);
        expect(text).not.toContain('Wash hands');
        expect(text).not.toContain('Jade');
      });
    });

    // ------------------------------------------------------------ pay now and failed payments (BP-11)
    describe('pay now', () => {
      it('takes Willow Lane from Past due to Active, pays the invoice, records a success and a receipt', async () => {
        const s = await setup();
        const attemptsBefore = await dump<PaymentAttempt>(s.admin, 'paymentAttempts');
        expect((await s.store.account.status(s.beth)).state).toBe('pastDue');
        await s.store.billing.payNow(s.beth);

        const sub = await s.subscriptionOf(s.b);
        expect(sub.state).toBe('active');
        expect(sub.stateSince).toBe(TODAY);
        expect((await s.store.account.status(s.beth)).state).toBe('active');
        expect((await s.store.billing.invoice(s.beth, s.invB1.id)).status).toBe('paid');

        const attempts = await dump<PaymentAttempt>(s.admin, 'paymentAttempts');
        const added = attempts.filter((p) => !attemptsBefore.some((q) => q.id === p.id));
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({ clientId: s.b, invoiceId: s.invB1.id, result: 'success', at: TODAY });

        expect(await s.audit('billing.payNow', s.b)).toHaveLength(1);
        const receipts = await s.outboxTo('accounts@willow-lane-nursery.test');
        expect(receipts).toHaveLength(1);
        expect(receipts[0]!.channel).toBe('email');
      });

      it('does not touch another organisation invoices or state', async () => {
        const s = await setup();
        await s.store.billing.payNow(s.beth);
        expect((await s.store.billing.invoice(s.priya, s.invA2.id)).status).toBe('due');
        expect((await s.subscriptionOf(s.a)).state).toBe('active');
      });

      it('works from Limited and Read-only too, and in a Closed account', async () => {
        for (const state of ['limited', 'readOnly', 'closed'] as const) {
          const s = await setup();
          await s.setState(s.b, state, 3);
          await s.store.billing.payNow(s.beth);
          expect((await s.subscriptionOf(s.b)).state, state).toBe('active');
        }
      });

      it('refuses when nothing is owed (RuleError notApplicable) and changes nothing', async () => {
        const s = await setup();
        await s.admin.bulkPut('invoices', [{ ...s.invA2, status: 'paid' }]);
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.billing.payNow(s.priya))).toBe('notApplicable');
        expect(await s.admin.dumpAll()).toEqual(before);
        expect((await s.subscriptionOf(s.a)).state).toBe('active');
      });

      it('lets the staff of a Past due organisation carry on and see no payment notice', async () => {
        const s = await setup();
        await expect(s.store.people.list(s.bob)).resolves.toBeDefined();
        expect(await s.store.account.staffNotice(s.bob)).toBeNull();
      });
    });

    // ------------------------------------------------------------ account status and staff notice
    describe('account.status and staffNotice', () => {
      it('gives an Active organisation no next change and a what-works list', async () => {
        const s = await setup();
        const st = await s.store.account.status(s.priya);
        expect(st.state).toBe('active');
        expect(st.whatWorks.find((w) => w.feature === 'authoring')).toMatchObject({ availability: 'yes' });
        expect(st.nextChange).toBeUndefined();
      });

      it('gives Past due the next change (Limited) and its date, and the overdue amount to billing.view', async () => {
        const s = await setup();
        const st = await s.store.account.status(s.beth);
        const sub = await s.subscriptionOf(s.b);
        expect(st.state).toBe('pastDue');
        expect(st.since).toBe(sub.stateSince);
        expect(st.nextChange?.state).toBe('limited');
        const days = (Date.parse(st.nextChange!.at) - Date.parse(sub.stateSince)) / DAY;
        expect(days).toBeGreaterThanOrEqual(14);
        expect(days).toBeLessThanOrEqual(16);
        expect(st.amountDuePence).toBe(6000);
      });

      it('leaves the amounts out for an admin without billing.view', async () => {
        const s = await setup();
        for (const ctx of [s.wendyCtx]) {
          const st = await s.store.account.status(ctx);
          expect(st.state).toBe('pastDue');
          expect(st).not.toHaveProperty('amountDuePence');
          expect(JSON.stringify(st)).not.toContain('6000');
        }
        const daniel = await s.store.account.status(s.daniel);
        expect(daniel).not.toHaveProperty('amountDuePence');
      });

      it('derives the state from the subscription and the clock, not the stored client state', async () => {
        const s = await setup();
        // The client record still says pastDue after the subscription has been moved on.
        await s.setState(s.b, 'limited', 3);
        const c = await s.clientRecord(s.b);
        await s.admin.bulkPut('clients', [{ ...c, accountState: 'active' }]);
        expect((await s.store.account.status(s.beth)).state).toBe('limited');
        const st = await s.store.account.status(s.beth);
        expect(st.whatWorks.find((w) => w.feature === 'authoring')).toMatchObject({ availability: 'no' });
      });

      it('gives staff of a Read-only organisation the needsAttention notice, with no payment words', async () => {
        const s = await setup();
        const ro = s.fx.ids.stateClients.readOnly;
        const notice = await s.store.account.staffNotice(staff(ro.staff.id, ro.client.id));
        expect(notice).toEqual({ needsAttention: true });
        expect(JSON.stringify(notice)).not.toMatch(PAYMENT_WORDS);
      });

      it('gives staff of an Active organisation no notice, and staff of a Paused one the notice', async () => {
        const s = await setup();
        expect(await s.store.account.staffNotice(s.jade)).toBeNull();
        const paused = s.fx.ids.stateClients.paused;
        expect(await s.store.account.staffNotice(staff(paused.staff.id, paused.client.id))).toEqual({
          needsAttention: true,
        });
      });

      it('refuses staffNotice to client admins', async () => {
        const s = await setup();
        expect(await refusal(s.store.account.staffNotice(s.priya))).toBeInstanceOf(ForbiddenError);
      });
    });

    // ------------------------------------------------------------ state table (BP-12)
    describe('account-state enforcement', () => {
      type Row = { label: string; state: AccountState; owner: (s: S) => ActorContext };
      const owner = (key: 'readOnly' | 'closed' | 'paused' | 'deleted') => (s: S) => {
        const sc = s.fx.ids.stateClients[key];
        return client(sc.owner.id, sc.client.id);
      };
      const rows: Row[] = [
        { label: 'Little Stars (Read-only)', state: 'readOnly', owner: owner('readOnly') },
        { label: 'Meadowview (Closed)', state: 'closed', owner: owner('closed') },
        { label: 'Pebbles (Paused)', state: 'paused', owner: owner('paused') },
      ];

      it.each(rows)('$label: billing and account status stay available, usage add-ons are refused', async (row) => {
        const s = await setup();
        const ctx = row.owner(s);
        expect((await s.store.account.status(ctx)).state).toBe(row.state);
        await expect(s.store.billing.overview(ctx)).resolves.toBeDefined();
        await expect(s.store.billing.invoices(ctx)).resolves.toBeInstanceOf(Array);
        await expect(s.store.addOns.list(ctx)).resolves.toBeInstanceOf(Array);
        const error = await refusal(s.store.addOns.turnOn(ctx, ai));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).feature).toBe('usageAddOns');
      });

      it.each(rows)('$label: ai.explain is refused even with the add-on on', async (row) => {
        const s = await setup();
        const ctx = row.owner(s);
        await s.setAi(ctx.clientId!, 'on');
        const error = await refusal(s.store.ai.explain(ctx, { moduleId: s.explainModule.id, lessonId: 'kp' }));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).feature).toBe('usageAddOns');
      });

      it.each(rows)('$label: authoring writes are refused', async (row) => {
        const s = await setup();
        const error = await refusal(
          s.store.categories.save(row.owner(s), { name: 'Blocked', colour: 'blue', icon: 'book' }),
        );
        expect(error).toBeInstanceOf(AccountStateError);
      });

      it('Sunny Days style Limited organisation: authoring and usage add-ons refused, billing and pay now work', async () => {
        const s = await setup();
        await s.setState(s.a, 'limited', 5);
        expect((await s.store.account.status(s.priya)).state).toBe('limited');
        expect(
          await refusal(s.store.categories.save(s.priya, { name: 'X', colour: 'blue', icon: 'book' })),
        ).toBeInstanceOf(AccountStateError);
        expect(await refusal(s.store.addOns.turnOn(s.priya, ai))).toBeInstanceOf(AccountStateError);
        await expect(s.store.billing.overview(s.priya)).resolves.toBeDefined();
        await s.store.billing.payNow(s.priya);
        expect((await s.store.account.status(s.priya)).state).toBe('active');
        await expect(
          s.store.categories.save(s.priya, { name: 'Allowed again', colour: 'blue', icon: 'book' }),
        ).resolves.toBeDefined();
      });

      it('Willow Lane (Past due): everything still works, usage add-ons only within the allowance', async () => {
        const s = await setup();
        await expect(
          s.store.categories.save(s.beth, { name: 'Allowed', colour: 'blue', icon: 'book' }),
        ).resolves.toBeDefined();
        await expect(s.store.billing.overview(s.beth)).resolves.toBeDefined();
        const st = await s.store.account.status(s.beth);
        expect(st.whatWorks.find((w) => w.feature === 'usageAddOns')).toMatchObject({
          availability: 'withinAllowance',
        });
      });

      it('a Deleted organisation refuses billing and account status to everyone (AccountStateError)', async () => {
        const s = await setup();
        const ctx = owner('deleted')(s);
        const state = async (p: Promise<unknown>) => {
          const e = await refusal(p);
          expect(e).toBeInstanceOf(AccountStateError);
          return (e as AccountStateError).state;
        };
        expect(await state(s.store.billing.overview(ctx))).toBe('deleted');
        expect(await state(s.store.account.status(ctx))).toBe('deleted');
        expect(await state(s.store.addOns.list(ctx))).toBe('deleted');
      });

      it('a Closed organisation keeps billing for the owner but refuses its staff', async () => {
        const s = await setup();
        const sc = s.fx.ids.stateClients.closed;
        expect(await refusal(s.store.account.staffNotice(staff(sc.staff.id, sc.client.id)))).toBeInstanceOf(
          AccountStateError,
        );
        await expect(s.store.billing.overview(owner('closed')(s))).resolves.toBeDefined();
      });
    });

    // ------------------------------------------------------------ simulate failed payment and the clock walk
    describe('simulateFailedPayment and offset clocks', () => {
      it('sets the client Past due from now, with a hard decline, an overdue invoice and an Outbox email', async () => {
        const s = await setup();
        const invoicesBefore = await dump<Invoice>(s.admin, 'invoices');
        const attemptsBefore = await dump<PaymentAttempt>(s.admin, 'paymentAttempts');
        const outboxBefore = (await s.admin.listOutbox()).length;
        await s.admin.simulateFailedPayment(s.a, TODAY);

        const sub = await s.subscriptionOf(s.a);
        expect(sub.state).toBe('pastDue');
        expect(sub.stateSince).toBe(TODAY);
        const attempts = (await dump<PaymentAttempt>(s.admin, 'paymentAttempts')).filter(
          (p) => !attemptsBefore.some((q) => q.id === p.id),
        );
        expect(attempts).toHaveLength(1);
        expect(attempts[0]).toMatchObject({ clientId: s.a, result: 'hardDecline', at: TODAY });
        const newInvoices = (await dump<Invoice>(s.admin, 'invoices')).filter(
          (i) => !invoicesBefore.some((q) => q.id === i.id),
        );
        expect(newInvoices).toHaveLength(1);
        expect(newInvoices[0]).toMatchObject({ clientId: s.a, status: 'overdue' });
        expect(attempts[0]!.invoiceId).toBe(newInvoices[0]!.id);
        expect((await s.admin.listOutbox()).length).toBe(outboxBefore + 1);
        expect((await s.admin.listOutbox()).at(-1)!.to).toBe(sub.billingContact);
        expect((await s.store.account.status(s.priya)).state).toBe('pastDue');
      });

      it('refuses an unknown client and changes nothing', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        await expect(s.admin.simulateFailedPayment(freshId(3995), TODAY)).rejects.toBeInstanceOf(NotFoundError);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('walks Past due, Limited, Read-only and Closed as the clock moves', async () => {
        const s = await setup();
        await s.admin.simulateFailedPayment(s.a, TODAY);
        const at = (days: number) => client(s.fx.ids.users.priya, s.a, plus(days * DAY));
        const stateAt = async (days: number) => (await s.store.account.status(at(days))).state;
        expect(await stateAt(0)).toBe('pastDue');
        expect(await stateAt(10)).toBe('pastDue');
        expect(await stateAt(20)).toBe('limited');
        expect(await stateAt(45)).toBe('readOnly');
        expect(await stateAt(90)).toBe('closed');
      });

      it('enforces each state on the same account as the clock moves', async () => {
        const s = await setup();
        await s.admin.simulateFailedPayment(s.a, TODAY);
        const at = (days: number) => client(s.fx.ids.users.priya, s.a, plus(days * DAY));
        const save = (days: number) =>
          s.store.categories.save(at(days), { name: `Day ${String(days)}`, colour: 'blue', icon: 'book' });
        await expect(save(5)).resolves.toBeDefined();
        expect(await refusal(save(20))).toBeInstanceOf(AccountStateError);
        expect(await refusal(s.store.addOns.turnOn(at(45), ai))).toBeInstanceOf(AccountStateError);
        await expect(s.store.billing.overview(at(90))).resolves.toBeDefined();
      });

      it('returns to Active when the owner pays at any point on the walk', async () => {
        const s = await setup();
        await s.admin.simulateFailedPayment(s.a, TODAY);
        const later = client(s.fx.ids.users.priya, s.a, plus(20 * DAY));
        expect((await s.store.account.status(later)).state).toBe('limited');
        await s.store.billing.payNow(later);
        expect((await s.store.account.status(later)).state).toBe('active');
        const newest = (await dump<Invoice>(s.admin, 'invoices')).filter(
          (i) => i.clientId === s.a && i.status === 'overdue',
        );
        expect(newest).toEqual([]);
        const sub = await s.subscriptionOf(s.a);
        expect(sub.stateSince).toBe(plus(20 * DAY));
      });
    });
  });
}
