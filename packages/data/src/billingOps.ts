// Operations for billing, add-ons, add-on requests, account status and the Demo AI (M3 chunk 7, "Data B"). Each write
// authorises, applies the domain rules and then writes in ONE batch. Money is integer pence. The payment is a mock: no
// card number is ever entered or stored. Business rules live in @sta/domain; this file only calls them.
import {
  invoiceLinesFor,
  addDays,
  competitionStatus,
  defaultDunningPolicy,
  demoTwoFactorCode,
  effectivePermissions,
  entitled,
  explainLesson,
  practiceQuestions,
  draftFromPolicy,
  suggestQuestions,
  lessonSchema,
  featureAvailability,
  invoiceTotals,
  nextTransition,
  planChangePreview,
  planPrice,
  stateStartedAt,
  ulid,
  usageCapReached,
  whatWorks,
  type AddOn,
  type AddOnRequest,
  type AddOnSubscription,
  type BillingChangeRequest,
  type BillingProfile,
  type Client,
  type Competition,
  type Invoice,
  type Module,
  type Notification,
  type OutboxMessage,
  type Package,
  type PaymentAttempt,
  type PriceAdjustment,
  type Person,
  type Role,
  type RoleAssignment,
  type Site,
  type Subscription,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { moduleFor } from './ops';
import { killedClientIds } from './providerGlobalAiOps';
import { audit, beginCall, clientEntitlements, forbid, holds, type Call } from './policy';
import {
  AccountStateError,
  NotEntitledError,
  NotFoundError,
  RuleError,
  ValidationError,
  type AccountService,
  type AccountStatus,
  type ActorContext,
  type AddOnListing,
  type AddOnRequestsService,
  type AiService,
  type BillingOverview,
  type BillingService,
  type PlanPreview,
  type StoreOptions,
} from './types';

export type BillingOperations = {
  billing: BillingService;
  addOnOps: {
    list(ctx: ActorContext): Promise<AddOnListing[]>;
    turnOn(ctx: ActorContext, addOnId: string, options?: { trial?: boolean }): Promise<AddOnSubscription>;
    turnOff(ctx: ActorContext, addOnId: string): Promise<AddOnSubscription>;
    setCap(ctx: ActorContext, addOnId: string, capPence: number | null): Promise<AddOnSubscription>;
  };
  addOnRequests: AddOnRequestsService;
  account: AccountService;
  ai: AiService;
  features(ctx: ActorContext): Promise<{ aiAssistant: boolean }>;
};

const TRIAL_DAYS = 14;
const NOTE_MAX = 300;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OWED: Invoice['status'][] = ['due', 'overdue'];

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const pounds = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

/** The step-up code (the demo accepts 123456, as for two-step sign-in). */
function checkStepUp(code: unknown): void {
  const given = text(code).trim();
  if (given === '') throw new RuleError('stepUpRequired');
  if (given !== demoTwoFactorCode) throw new RuleError('wrongCode');
}

const owedBy = (invoices: Invoice[], clientId: string): Invoice[] =>
  invoices.filter((i) => i.clientId === clientId && OWED.includes(i.status));

/** A client-side add-on subscription counts while it is on or in trial and has not ended. */
const isActiveSub = (s: AddOnSubscription, now: Date): boolean =>
  s.status !== 'off' && (s.endsAt === undefined || Date.parse(s.endsAt) > now.getTime());

export function createBillingOperations(backend: RawBackend, options: StoreOptions): BillingOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);

  /** A client-side actor holding `permission` (or any client admin when null). Staff and everyone else are refused. */
  async function clientCall(ctx: ActorContext, permission: string | null): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client') return forbid('permission');
    if (permission !== null && !holds(call, [permission])) return forbid('permission');
    return call;
  }

  async function subscriptionOf(call: Call): Promise<Subscription> {
    const sub = (await call.all<Subscription>('subscriptions')).find((s) => s.clientId === call.clientId);
    if (!sub) throw new NotFoundError();
    return sub;
  }

  async function addOnOf(call: Call, addOnId: string): Promise<AddOn> {
    const addOn = await call.find<AddOn>('addOns', text(addOnId));
    if (!addOn) throw new NotFoundError();
    return addOn;
  }

  const addOnSubOf = async (call: Call, addOnId: string): Promise<AddOnSubscription | undefined> =>
    (await call.all<AddOnSubscription>('addOnSubscriptions')).find(
      (s) => s.clientId === call.clientId && s.addOnId === addOnId,
    );

  /** Usage add-ons need the account to allow them (Past due: within the allowance; Limited and worse: no). */
  function requireUsageAddOns(call: Call): void {
    const state = call.actor.accountState;
    if (state && featureAvailability(state, 'usageAddOns') === 'no') throw new AccountStateError(state, 'usageAddOns');
  }

  async function activeStaffAndSites(call: Call, clientId: string) {
    const staff = (await call.all<Person>('people')).filter((p) => p.clientId === clientId && p.status === 'active');
    const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === clientId && s.status === 'active');
    return { activeStaff: staff.length, activeSites: sites.length };
  }

  async function limitCounts(call: Call, clientId: string) {
    const now = call.actor.now;
    const modules = (await call.all<Module>('modules')).filter(
      (m) => m.owner !== 'provider' && m.owner.clientId === clientId && m.status !== 'archived',
    );
    const themes = (await call.all<{ clientId: string }>('themes')).filter((t) => t.clientId === clientId);
    const admins = (await call.all<UserAccount>('users')).filter(
      (u) => u.side === 'client' && u.clientId === clientId && u.status === 'active',
    );
    const rules = (await call.all<{ clientId: string }>('autoAssignRules')).filter((r) => r.clientId === clientId);
    const live = (await call.all<Competition>('competitions')).filter(
      (c) => c.clientId === clientId && ['live', 'scheduled'].includes(competitionStatus(c, now)),
    );
    const roles = (await call.all<Role>('roles')).filter(
      (r) => r.owner !== 'provider' && r.owner.clientId === clientId && !r.system,
    );
    return {
      ownModules: modules.length,
      savedThemes: themes.length,
      admins: admins.length,
      autoAssignRules: rules.length,
      liveCompetitions: live.length,
      customClientRoles: roles.length,
    };
  }

  async function packageOf(call: Call, packageId: string): Promise<Package> {
    const pkg = await call.find<Package>('packages', text(packageId));
    if (!pkg) throw new NotFoundError();
    return pkg;
  }

  async function preview(call: Call, sub: Subscription, packageId: string): Promise<PlanPreview> {
    const clientId = call.clientId as string;
    const next = await packageOf(call, packageId);
    const current = await packageOf(call, sub.packageId);
    const usage = { ...(await activeStaffAndSites(call, clientId)), counts: await limitCounts(call, clientId) };
    return planChangePreview(current, next, usage) as PlanPreview;
  }

  const profileOf = async (call: Call, clientId: string): Promise<BillingProfile | undefined> =>
    (await call.all<BillingProfile>('billingProfiles')).find((p) => p.clientId === clientId);

  // ------------------------------------------------------------ billing

  const billing: BillingService = {
    async overview(ctx) {
      const call = await clientCall(ctx, 'billing.view');
      const clientId = call.clientId as string;
      const sub = await subscriptionOf(call);
      const pkg = await packageOf(call, sub.packageId);
      const { activeStaff, activeSites } = await activeStaffAndSites(call, clientId);
      const price = planPrice(pkg, activeStaff, activeSites);
      const profile = await profileOf(call, clientId);
      const lines = invoiceLinesFor({
        listPrice: price.total,
        adjustments: (await call.all<PriceAdjustment>('priceAdjustments')).filter((a) =>
          a.clientIds.includes(clientId),
        ),
        at: call.actor.ctx.now,
        label: '',
      });
      const change = lines[1];
      const result: BillingOverview = {
        ...(change?.adjustment ? { adjustment: { ...change.adjustment, amount: change.amount } } : {}),
        yourPrice: lines.reduce((sum, l) => sum + l.amount, 0),
        packageId: sub.packageId,
        planPrice: { perSite: price.perSite, sites: price.sites, total: price.total },
        period: sub.period,
        state: call.actor.accountState ?? sub.state,
        renewalAt: sub.renewalAt,
        ...(sub.pendingPackageId ? { pendingPackageId: sub.pendingPackageId } : {}),
        billingContact: sub.billingContact,
        ...(profile?.paymentMethod ? { paymentMethod: { ...profile.paymentMethod } } : {}),
        ...(profile
          ? {
              profile: {
                billingName: profile.billingName,
                address: profile.address,
                ...(profile.vatNumber ? { vatNumber: profile.vatNumber } : {}),
              },
            }
          : {}),
        usage: await limitCounts(call, clientId),
      };
      return structuredClone(result);
    },

    async invoices(ctx) {
      const call = await clientCall(ctx, 'billing.view');
      return structuredClone(
        (await call.all<Invoice>('invoices'))
          .filter((i) => i.clientId === call.clientId)
          .sort((a, b) => (a.issuedAt === b.issuedAt ? (a.id < b.id ? 1 : -1) : a.issuedAt < b.issuedAt ? 1 : -1)),
      );
    },

    async invoice(ctx, id) {
      const call = await clientCall(ctx, 'billing.view');
      const found = (await call.all<Invoice>('invoices')).find((i) => i.id === id && i.clientId === call.clientId);
      if (!found) throw new NotFoundError();
      return structuredClone(found);
    },

    async priceNotices(ctx) {
      const call = await clientCall(ctx, 'billing.view');
      const now = call.actor.ctx.now;
      return (await call.all<PriceAdjustment>('priceAdjustments'))
        .filter(
          (a) =>
            a.clientIds.includes(call.clientId as string) &&
            (a.status === 'scheduled' || a.status === 'active') &&
            a.effectiveAt !== undefined &&
            (a.endsAt === undefined || a.endsAt > now),
        )
        .sort((a, b) => ((a.effectiveAt as string) < (b.effectiveAt as string) ? -1 : a.id < b.id ? -1 : 1))
        .map((a) =>
          structuredClone({
            id: a.id,
            type: a.type,
            scope: a.scope,
            value: a.value,
            effectiveAt: a.effectiveAt as string,
            ...(a.endsAt ? { endAt: a.endsAt } : {}),
          }),
        );
    },

    async plans(ctx) {
      const call = await clientCall(ctx, 'billing.view');
      return (await call.all<Package>('packages'))
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    },

    async requestDetailsChange(ctx, proposed) {
      const call = await clientCall(ctx, 'billing.manage');
      const clientId = call.clientId as string;
      const allowed = ['billingName', 'address', 'vatNumber'];
      const input: Record<string, unknown> = proposed;
      const extra = Object.keys(input).filter((k) => !allowed.includes(k));
      if (extra.length > 0) throw new ValidationError(extra.map((k) => `${k}: not a field you can change here`));
      const clean: BillingChangeRequest['proposed'] = {};
      const issues: string[] = [];
      const field = (key: 'billingName' | 'address' | 'vatNumber', max: number, required: boolean) => {
        if (input[key] === undefined) return;
        const v = text(input[key]).trim();
        if (typeof input[key] !== 'string' || v.length > max || (required && v.length === 0)) {
          issues.push(`${key}: ${required ? '1' : '0'} to ${String(max)} characters`);
        } else clean[key] = v;
      };
      field('billingName', 120, true);
      field('address', 300, false);
      field('vatNumber', 30, false);
      if (issues.length > 0) throw new ValidationError(issues);
      if (Object.keys(clean).length === 0) throw new ValidationError(['proposed: nothing to change']);
      const request: BillingChangeRequest = {
        id: call.newId(),
        clientId,
        requestedBy: call.actor.user.id,
        proposed: clean,
        status: 'pending',
        createdAt: ctx.now,
      };
      await apply([
        put('billingChangeRequests', request.id, request),
        audit(call, clientId, 'billing.requestDetailsChange', request.id, undefined, {
          fields: Object.keys(clean).sort(),
        }),
      ]);
      return structuredClone(request);
    },

    async updateContact(ctx, email, code) {
      const call = await clientCall(ctx, 'billing.manage');
      const clientId = call.clientId as string;
      checkStepUp(code);
      const address = text(email).trim().toLowerCase();
      if (!EMAIL.test(address) || address.length > 200) throw new ValidationError(['email: not a valid email address']);
      const sub = await subscriptionOf(call);
      const profile = await profileOf(call, clientId);
      const ops: WriteOp[] = [put('subscriptions', clientId, { ...sub, billingContact: address })];
      if (profile) {
        ops.push(
          put('billingProfiles', clientId, {
            ...profile,
            billingContactEmail: address,
            updatedBy: call.actor.user.id,
            updatedAt: ctx.now,
          }),
        );
      }
      ops.push(audit(call, clientId, 'billing.updateContact', clientId, undefined, undefined));
      await apply(ops);
    },

    async previewPlanChange(ctx, packageId) {
      const call = await clientCall(ctx, 'billing.view');
      return structuredClone(await preview(call, await subscriptionOf(call), packageId));
    },

    async changePlan(ctx, packageId, code) {
      const call = await clientCall(ctx, 'billing.manage');
      const clientId = call.clientId as string;
      checkStepUp(code);
      const sub = await subscriptionOf(call);
      const result = await preview(call, sub, packageId);
      if (result.direction === 'same') throw new RuleError('notApplicable');
      const client = call.actor.client as Client;
      const next: Subscription = { ...sub };
      const ops: WriteOp[] = [];
      if (result.applies === 'now') {
        next.packageId = packageId;
        delete next.pendingPackageId;
        ops.push(put('clients', clientId, { ...client, packageId }));
      } else {
        next.pendingPackageId = packageId;
      }
      ops.push(put('subscriptions', clientId, next));
      ops.push(
        audit(
          call,
          clientId,
          'billing.changePlan',
          packageId,
          { packageId: sub.packageId },
          { packageId, applies: result.applies },
        ),
      );
      await apply(ops);
    },

    async payNow(ctx) {
      const call = await clientCall(ctx, 'billing.manage');
      const clientId = call.clientId as string;
      const owed = owedBy(await call.all<Invoice>('invoices'), clientId);
      if (owed.length === 0) throw new RuleError('notApplicable');
      const sub = await subscriptionOf(call);
      const client = call.actor.client as Client;
      const profile = await profileOf(call, clientId);
      const before = call.actor.accountState ?? sub.state;
      const back: Subscription = { ...sub, state: 'active', stateSince: ctx.now };
      delete back.nextStateAt;
      delete back.graceExtendedUntil;
      delete back.timelinePaused;
      const total = owed.reduce((sum, i) => sum + i.total, 0);
      const to = profile?.billingContactEmail ?? sub.billingContact;
      const receipt: OutboxMessage = {
        id: call.newId(),
        channel: 'email',
        to,
        subject: 'Receipt for your payment',
        body: `Thank you. We have received ${pounds(total)} for ${owed.map((i) => i.number).join(', ')}.`,
        at: ctx.now,
        reason: 'billing.receipt',
      };
      const ops: WriteOp[] = [
        put('subscriptions', clientId, back),
        put('clients', clientId, { ...client, accountState: 'active' }),
        ...owed.map((i) => put('invoices', i.id, { ...i, status: 'paid' })),
        ...owed.map((i) => {
          const attempt: PaymentAttempt = {
            id: call.newId(),
            clientId,
            invoiceId: i.id,
            at: ctx.now,
            result: 'success',
          };
          return put('paymentAttempts', attempt.id, attempt);
        }),
        put('outbox', receipt.id, receipt),
        audit(
          call,
          clientId,
          'billing.payNow',
          clientId,
          { state: before },
          { state: 'active', invoices: owed.length },
        ),
      ];
      await apply(ops);
    },
  };

  // ------------------------------------------------------------ add-ons

  const addOnOps: BillingOperations['addOnOps'] = {
    async list(ctx) {
      const call = await clientCall(ctx, 'billing.view');
      const subs = (await call.all<AddOnSubscription>('addOnSubscriptions')).filter(
        (s) => s.clientId === call.clientId,
      );
      const listings = (await call.all<AddOn>('addOns')).map((a): AddOnListing => {
        const sub = subs.find((s) => s.addOnId === a.id);
        const active = sub !== undefined && isActiveSub(sub, call.actor.now);
        return {
          addOnId: a.id,
          name: a.name,
          status: active ? sub.status : 'off',
          ...(active && sub.startedAt ? { startedAt: sub.startedAt } : {}),
          ...(active && sub.endsAt ? { endsAt: sub.endsAt } : {}),
          ...(sub?.usageCapPence !== undefined ? { usageCapPence: sub.usageCapPence } : {}),
          usageThisPeriod: sub?.usageThisPeriod ?? 0,
          pricing: structuredClone(a.pricing),
        };
      });
      return structuredClone(listings.sort((a, b) => (a.addOnId < b.addOnId ? -1 : 1)));
    },

    async turnOn(ctx, addOnId, opts) {
      const call = await clientCall(ctx, 'billing.manageAddOns');
      const clientId = call.clientId as string;
      const addOn = await addOnOf(call, addOnId);
      requireUsageAddOns(call);
      const existing = await addOnSubOf(call, addOn.id);
      const trial = opts?.trial === true;
      const next: AddOnSubscription = {
        clientId,
        addOnId: addOn.id,
        status: trial ? 'trial' : 'on',
        startedAt: ctx.now,
        ...(trial ? { endsAt: addDays(call.actor.now, TRIAL_DAYS).toISOString() } : {}),
        ...(existing?.usageCapPence !== undefined ? { usageCapPence: existing.usageCapPence } : {}),
        usageThisPeriod: existing?.usageThisPeriod ?? 0,
      };
      await apply([
        put('addOnSubscriptions', `${clientId}:${addOn.id}`, next),
        audit(call, clientId, 'addOns.turnOn', addOn.id, undefined, { addOnId: addOn.id, status: next.status }),
      ]);
      return structuredClone(next);
    },

    async turnOff(ctx, addOnId) {
      const call = await clientCall(ctx, 'billing.manageAddOns');
      const clientId = call.clientId as string;
      const addOn = await addOnOf(call, addOnId);
      const existing = await addOnSubOf(call, addOn.id);
      if (!existing || !isActiveSub(existing, call.actor.now)) throw new RuleError('notApplicable');
      const sub = await subscriptionOf(call);
      const next: AddOnSubscription = { ...existing, endsAt: sub.renewalAt };
      await apply([
        put('addOnSubscriptions', `${clientId}:${addOn.id}`, next),
        audit(call, clientId, 'addOns.turnOff', addOn.id, undefined, { addOnId: addOn.id, endsAt: sub.renewalAt }),
      ]);
      return structuredClone(next);
    },

    async setCap(ctx, addOnId, capPence) {
      const call = await clientCall(ctx, 'billing.manageAddOns');
      const clientId = call.clientId as string;
      const addOn = await addOnOf(call, addOnId);
      if (capPence !== null && (typeof capPence !== 'number' || !Number.isInteger(capPence) || capPence < 0)) {
        throw new ValidationError(['capPence: a whole number of pence, 0 or more']);
      }
      const existing = await addOnSubOf(call, addOn.id);
      const base: AddOnSubscription = existing ?? { clientId, addOnId: addOn.id, status: 'off', usageThisPeriod: 0 };
      const next: AddOnSubscription = { ...base };
      if (capPence === null) delete next.usageCapPence;
      else next.usageCapPence = capPence;
      await apply([
        put('addOnSubscriptions', `${clientId}:${addOn.id}`, next),
        audit(call, clientId, 'addOns.setCap', addOn.id, undefined, { addOnId: addOn.id, capPence }),
      ]);
      return structuredClone(next);
    },
  };

  // ------------------------------------------------------------ add-on requests

  /** Active client admins of the client who hold `billing.manageAddOns`. */
  async function approvers(call: Call, clientId: string): Promise<UserAccount[]> {
    const users = (await call.all<UserAccount>('users')).filter(
      (u) => u.side === 'client' && u.clientId === clientId && u.status === 'active',
    );
    const assignments = await call.all<RoleAssignment>('roleAssignments');
    const roles = await call.all<Role>('roles');
    return users.filter((u) =>
      effectivePermissions(
        u.id,
        assignments.filter((a) => a.userId === u.id),
        roles,
        call.actor.now,
      ).some((p) => p.permissionId === 'billing.manageAddOns'),
    );
  }

  const notice = (
    call: Call,
    clientId: string,
    userId: string,
    kind: string,
    params: Notification['params'],
  ): WriteOp => {
    const n: Notification = {
      id: call.newId(),
      clientId,
      userId,
      kind,
      params,
      link: '#/client/billing/add-ons',
      createdAt: call.actor.ctx.now,
    };
    return put('notifications', n.id, n);
  };

  const addOnRequests: AddOnRequestsService = {
    async create(ctx, input) {
      const call = await clientCall(ctx, null);
      const clientId = call.clientId as string;
      const note = input.note === undefined ? undefined : text(input.note).trim();
      if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > NOTE_MAX)) {
        throw new ValidationError([`note: ${String(NOTE_MAX)} characters or fewer`]);
      }
      const addOn = await addOnOf(call, input.addOnId);
      const request: AddOnRequest = {
        id: call.newId(),
        clientId,
        addOnId: addOn.id,
        requestedBy: call.actor.user.id,
        ...(note ? { note } : {}),
        status: 'pending',
        createdAt: ctx.now,
      };
      const ops: WriteOp[] = [put('addOnRequests', request.id, request)];
      for (const holder of await approvers(call, clientId)) {
        if (holder.id === call.actor.user.id) continue;
        ops.push(
          notice(call, clientId, holder.id, 'addOnRequested', {
            addOn: addOn.name,
            person: call.actor.user.displayName,
          }),
        );
        if (holder.email) {
          const mail: OutboxMessage = {
            id: call.newId(),
            channel: 'email',
            to: holder.email,
            subject: `${call.actor.user.displayName} asked for ${addOn.name}`,
            body: `${call.actor.user.displayName} would like ${addOn.name} switched on.${note ? ` They said: ${note}` : ''} Open Add-ons to approve or decline.`,
            at: ctx.now,
            reason: 'addOnRequests.create',
          };
          ops.push(put('outbox', mail.id, mail));
        }
      }
      ops.push(audit(call, clientId, 'addOnRequests.create', request.id, undefined, { addOnId: addOn.id }));
      await apply(ops);
      return structuredClone(request);
    },

    async list(ctx) {
      const call = await clientCall(ctx, null);
      const all = holds(call, ['billing.manageAddOns']);
      return structuredClone(
        (await call.all<AddOnRequest>('addOnRequests'))
          .filter((r) => r.clientId === call.clientId && (all || r.requestedBy === call.actor.user.id))
          .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1)),
      );
    },

    async decide(ctx, requestId, decision) {
      const call = await clientCall(ctx, 'billing.manageAddOns');
      const clientId = call.clientId as string;
      if ((decision as string) !== 'approved' && (decision as string) !== 'declined') {
        throw new ValidationError(['decision: approve or decline']);
      }
      const request = (await call.all<AddOnRequest>('addOnRequests')).find(
        (r) => r.id === requestId && r.clientId === clientId,
      );
      if (!request) throw new NotFoundError();
      if (request.status !== 'pending') throw new ValidationError(['request: already decided']);
      const addOn = await addOnOf(call, request.addOnId);
      const ops: WriteOp[] = [];
      if (decision === 'approved') {
        requireUsageAddOns(call);
        const existing = await addOnSubOf(call, addOn.id);
        const on: AddOnSubscription = {
          clientId,
          addOnId: addOn.id,
          status: 'on',
          startedAt: ctx.now,
          ...(existing?.usageCapPence !== undefined ? { usageCapPence: existing.usageCapPence } : {}),
          usageThisPeriod: existing?.usageThisPeriod ?? 0,
        };
        ops.push(put('addOnSubscriptions', `${clientId}:${addOn.id}`, on));
      }
      const decided: AddOnRequest = { ...request, status: decision, decidedBy: call.actor.user.id, decidedAt: ctx.now };
      ops.push(put('addOnRequests', request.id, decided));
      ops.push(
        notice(call, clientId, request.requestedBy, decision === 'approved' ? 'addOnApproved' : 'addOnDeclined', {
          addOn: addOn.name,
        }),
      );
      ops.push(audit(call, clientId, 'addOnRequests.decide', request.id, { status: 'pending' }, { status: decision }));
      await apply(ops);
      return structuredClone(decided);
    },
  };

  // ------------------------------------------------------------ account status

  const account: AccountService = {
    async status(ctx) {
      const call = await clientCall(ctx, null);
      const clientId = call.clientId as string;
      const sub = await subscriptionOf(call);
      const state = call.actor.accountState ?? sub.state;
      const next = nextTransition(sub, defaultDunningPolicy, call.actor.now);
      const result: AccountStatus = {
        state,
        since: stateStartedAt(sub, defaultDunningPolicy, call.actor.now).toISOString(),
        ...(next ? { nextChange: { state: next.state, at: next.at.toISOString() } } : {}),
        whatWorks: whatWorks(state).map((w) => ({ feature: w.feature, availability: w.availability, key: w.key })),
      };
      if (holds(call, ['billing.view'])) {
        result.amountDuePence = owedBy(await call.all<Invoice>('invoices'), clientId).reduce(
          (sum, i) => sum + i.total,
          0,
        );
      }
      return structuredClone(result);
    },

    async staffNotice(ctx) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'staff') return forbid('permission');
      const state = call.actor.accountState;
      return state === 'readOnly' || state === 'paused' ? { needsAttention: true } : null;
    },
  };

  // ------------------------------------------------------------ features and Demo AI

  async function features(ctx: ActorContext): Promise<{ aiAssistant: boolean }> {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'provider') return forbid('permission');
    if ((await killedClientIds(backend)).includes(call.clientId as string)) return { aiAssistant: false };
    const ents = await clientEntitlements(call, call.clientId as string);
    return { aiAssistant: ents ? entitled(ents, 'aiAssistant') : false };
  }

  /**
   * The checks both Demo AI calls share, in order: provider side, account state, kill switch and entitlement, the
   * module (published), then the usage cap. `find` runs after the module is known. Returns what is needed to count one use.
   */
  async function checkAiEntitled(call: Call) {
    const clientId = call.clientId as string;
    requireUsageAddOns(call);
    if ((await killedClientIds(backend)).includes(clientId)) throw new NotEntitledError('aiAssistant');
    const ents = await clientEntitlements(call, clientId);
    if (!ents || !entitled(ents, 'aiAssistant')) throw new NotEntitledError('aiAssistant');
    return clientId;
  }

  async function beginAi(ctx: ActorContext, moduleId: string) {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'provider') return forbid('permission');
    const clientId = await checkAiEntitled(call);
    const module = await moduleFor(call, text(moduleId));
    if (module.status !== 'published') throw new NotFoundError();
    return { call, clientId, module };
  }

  async function countAiUse(call: Call, clientId: string): Promise<void> {
    const addOn = (await call.all<AddOn>('addOns')).find((a) => a.adds.flags?.includes('aiAssistant'));
    const sub = addOn ? await addOnSubOf(call, addOn.id) : undefined;
    if (!addOn || !sub || !isActiveSub(sub, call.actor.now)) throw new NotEntitledError('aiAssistant');
    if (addOn.pricing.kind === 'usage') {
      const state = call.actor.accountState;
      if (
        state &&
        featureAvailability(state, 'usageAddOns') === 'withinAllowance' &&
        sub.usageThisPeriod + 1 > addOn.pricing.includedUnits
      ) {
        throw new AccountStateError(state, 'usageAddOns');
      }
      if (usageCapReached(sub.usageThisPeriod, addOn.pricing, sub.usageCapPence)) {
        throw new RuleError('usageCapReached');
      }
    }
    await apply([
      put('addOnSubscriptions', `${clientId}:${addOn.id}`, { ...sub, usageThisPeriod: sub.usageThisPeriod + 1 }),
    ]);
  }

  /** Drafting for the module builder: a client actor with modules.manage, then the shared checks. */
  async function beginAiDraft(ctx: ActorContext) {
    const call = await clientCall(ctx, 'modules.manage');
    const clientId = await checkAiEntitled(call);
    return { call, clientId };
  }

  const ai: AiService = {
    async explain(ctx, input) {
      const { call, clientId, module } = await beginAi(ctx, input.moduleId);
      const lesson = module.lessons.find((l) => l.id === input.lessonId);
      if (!lesson) throw new NotFoundError();
      await countAiUse(call, clientId);
      return { label: 'Demo AI', text: explainLesson(lesson) };
    },

    async practice(ctx, input) {
      const { call, clientId, module } = await beginAi(ctx, input.moduleId);
      // Drawn before counting so a refused call uses nothing; drawing only reads the module and the seeded rng.
      const questions = practiceQuestions(module, options.rng, 3);
      await countAiUse(call, clientId);
      return { label: 'Demo AI', questions: structuredClone(questions) };
    },

    async draftFromPolicy(ctx, input) {
      const { call, clientId } = await beginAiDraft(ctx);
      const draft = draftFromPolicy(text(input.text));
      if (!draft.ok) throw new RuleError(draft.reason === 'empty' ? 'policyEmpty' : 'policyTooLong');
      await countAiUse(call, clientId);
      return structuredClone({
        label: 'Demo AI' as const,
        title: draft.title,
        lessons: draft.lessons,
        questions: draft.questions,
      });
    },

    async suggestQuestions(ctx, input) {
      const { call, clientId } = await beginAiDraft(ctx);
      const parsed = lessonSchema.safeParse(input.lesson);
      if (!parsed.success) throw new ValidationError(['lesson: not a valid lesson']);
      const questions = suggestQuestions(parsed.data, options.rng);
      if (questions.length === 0) throw new ValidationError(['lesson: add some lesson text first']);
      await countAiUse(call, clientId);
      return structuredClone({ label: 'Demo AI' as const, questions });
    },
  };

  return { billing, addOnOps, addOnRequests, account, ai, features };
}

/** DemoAdmin.simulateFailedPayment: the owner's payment fails now, so the account goes Past due from `now`. */
export async function simulateFailedPayment(
  backend: RawBackend,
  options: StoreOptions,
  clientId: string,
  now: string,
): Promise<void> {
  const client = (await backend.get('clients', clientId)) as Client | undefined;
  const sub = (await backend.get('subscriptions', clientId)) as Subscription | undefined;
  if (!client || !sub) throw new NotFoundError();
  if (Number.isNaN(new Date(now).getTime())) throw new ValidationError(['now: not a valid date']);
  const pkg = (await backend.get('packages', sub.packageId)) as Package | undefined;
  const profile = (await backend.get('billingProfiles', clientId)) as BillingProfile | undefined;
  const people = ((await backend.getAll('people')) as Person[]).filter(
    (p) => p.clientId === clientId && p.status === 'active',
  );
  const sites = ((await backend.getAll('sites')) as Site[]).filter(
    (s) => s.clientId === clientId && s.status === 'active',
  );
  const net = pkg ? planPrice(pkg, people.length, sites.length).total : 0;
  const totals = invoiceTotals([{ amount: net }]);
  const newId = () => ulid(options.clock, options.rng);
  const invoice: Invoice = {
    id: newId(),
    number: `INV-${now.slice(0, 10).replaceAll('-', '')}-${clientId.slice(-4)}`,
    clientId,
    issuedAt: now,
    dueAt: now,
    billingNameAtIssue: profile?.billingName ?? client.displayName,
    billingAddressAtIssue: profile?.address ?? '',
    lines: [{ label: 'Plan', amount: net }],
    tax: totals.tax,
    total: totals.total,
    status: 'overdue',
  };
  const attempt: PaymentAttempt = { id: newId(), clientId, invoiceId: invoice.id, at: now, result: 'hardDecline' };
  const mail: OutboxMessage = {
    id: newId(),
    channel: 'email',
    to: sub.billingContact,
    subject: 'Your payment did not go through',
    body: `We could not take ${pounds(invoice.total)} for invoice ${invoice.number}. Please update your payment details or pay now.`,
    at: now,
    reason: 'billing.paymentFailed',
  };
  const failed: Subscription = { ...sub, state: 'pastDue', stateSince: now };
  delete failed.nextStateAt;
  delete failed.graceExtendedUntil;
  delete failed.timelinePaused;
  await backend.apply([
    put('invoices', invoice.id, invoice),
    put('paymentAttempts', attempt.id, attempt),
    put('outbox', mail.id, mail),
    put('subscriptions', clientId, failed),
    put('clients', clientId, { ...client, accountState: 'pastDue' }),
  ]);
}
