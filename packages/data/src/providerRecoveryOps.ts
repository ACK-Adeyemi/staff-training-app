// Account recovery, organisation name changes and billing detail change requests (M4 chunk 8b, plan BP-2 and BP-12).
// Provider side only. Each write is ONE batch with its audit event; time comes from the injected Clock. Audit entries
// hold ids, statuses and field names only: never the recovery reason, names or addresses.
import {
  approveRecovery,
  completeRecovery,
  decideBillingChange,
  rejectRecovery,
  requestRecovery,
  reviewNameChange,
  type BillingChangeRequest,
  type BillingProfile,
  type Client,
  type ProfileChangeRequest,
  type RecoveryRequest,
  type RecoveryResult,
  type UserAccount,
} from '@sta/domain';
import { validate, type RawBackend, type WriteOp } from './backend';
import { put } from './ops';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type BillingChangesService,
  type ProfileChangesService,
  type RecoveryService,
  type StoreOptions,
} from './types';

export type ProviderRecoveryOperations = {
  recovery: RecoveryService;
  profileChanges: ProfileChangesService;
  billingChanges: BillingChangesService;
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const PROPOSED_FIELDS = ['billingName', 'address', 'vatNumber'] as const;

export function createProviderRecoveryOperations(
  backend: RawBackend,
  options: StoreOptions,
): ProviderRecoveryOperations {
  async function providerCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, [permission])) return forbid('permission');
    return call;
  }

  async function load<T extends { id: string }>(
    call: Call,
    store: 'recoveryRequests' | 'profileChangeRequests' | 'billingChangeRequests',
    id: string,
  ) {
    const found = await call.find<T>(store, text(id));
    if (!found) throw new NotFoundError();
    return found;
  }

  // ------------------------------------------------------------ recovery

  async function recoveryStep(
    ctx: ActorContext,
    id: string,
    permission: string,
    action: string,
    fn: (r: RecoveryRequest, call: Call) => RecoveryResult,
    extra?: (r: RecoveryRequest, call: Call) => Promise<WriteOp[]>,
  ): Promise<RecoveryRequest> {
    const call = await providerCall(ctx, permission);
    const before = await load<RecoveryRequest>(call, 'recoveryRequests', id);
    const result = fn(before, call);
    if (!result.ok) throw new RuleError('notApplicable');
    const next = validate('recoveryRequests', result.request) as RecoveryRequest;
    await backend.apply([
      put('recoveryRequests', next),
      ...(extra ? await extra(next, call) : []),
      audit(
        call,
        next.clientId,
        action,
        next.id,
        { status: before.status },
        { status: next.status, approvals: next.approvals.length },
      ),
    ]);
    return structuredClone(next);
  }

  const recovery: RecoveryService = {
    async list(ctx) {
      const call = await providerCall(ctx, 'recovery.start');
      return structuredClone(
        [...(await call.all<RecoveryRequest>('recoveryRequests'))].sort((a, b) => (a.id < b.id ? -1 : 1)),
      );
    },

    async request(ctx, input) {
      const call = await providerCall(ctx, 'recovery.start');
      const raw: Record<string, unknown> = input;
      const reason = text(raw['reason']);
      if (reason === '') throw new ValidationError(['reason: required']);
      if (raw['outcome'] !== undefined && raw['outcome'] !== 'reset2fa' && raw['outcome'] !== 'transferOwner') {
        throw new ValidationError(['outcome: reset2fa or transferOwner']);
      }
      const subject = (await call.all<UserAccount>('users')).find((u) => u.id === text(input.subjectUserId));
      if (!subject || subject.clientId !== text(input.clientId) || subject.side !== 'client') {
        throw new ValidationError(['subjectUserId: choose a person at that client']);
      }
      const made = validate(
        'recoveryRequests',
        requestRecovery(
          {
            id: call.newId(),
            clientId: subject.clientId,
            subjectUserId: subject.id,
            requester: call.actor.user.id,
            reason,
            outcome: input.outcome,
          },
          options.clock,
        ),
      ) as RecoveryRequest;
      await backend.apply([
        put('recoveryRequests', made),
        audit(call, made.clientId, 'recovery.request', made.id, undefined, {
          recoveryId: made.id,
          subjectUserId: made.subjectUserId,
          outcome: made.outcome ?? null,
        }),
      ]);
      return structuredClone(made);
    },

    approve: (ctx, id) =>
      recoveryStep(ctx, id, 'recovery.approve', 'recovery.approve', (r, call) =>
        approveRecovery(r, call.actor.user.id, options.clock),
      ),

    complete: async (ctx, id, outcome) => {
      await providerCall(ctx, 'recovery.approve');
      const given: unknown = outcome;
      if (given !== undefined && given !== 'reset2fa' && given !== 'transferOwner') {
        throw new ValidationError(['outcome: reset2fa or transferOwner']);
      }
      return recoveryStep(
        ctx,
        id,
        'recovery.approve',
        'recovery.complete',
        (r) => completeRecovery(outcome === undefined ? r : { ...r, outcome }, options.clock),
        async (r, call) => {
          if (r.outcome !== 'reset2fa') return [];
          const subject = (await call.all<UserAccount>('users')).find((u) => u.id === r.subjectUserId);
          if (!subject?.twoFactor) return [];
          const rest: UserAccount = { ...subject };
          Reflect.deleteProperty(rest, 'twoFactor');
          return [put('users', rest)];
        },
      );
    },

    reject: (ctx, id) =>
      recoveryStep(ctx, id, 'recovery.start', 'recovery.reject', (r, call) =>
        rejectRecovery(r, call.actor.user.id, options.clock),
      ),
  };

  // ------------------------------------------------------------ organisation name changes

  async function profileFor(call: Call, clientId: string): Promise<BillingProfile | undefined> {
    return (await call.all<BillingProfile>('billingProfiles')).find((p) => p.clientId === clientId);
  }

  async function review(ctx: ActorContext, id: string, decision: 'keep' | 'updateToMatch' | 'askClient') {
    const call = await providerCall(ctx, 'clients.reviewNameChanges');
    const req = await load<ProfileChangeRequest>(call, 'profileChangeRequests', id);
    if (req.status !== 'pendingReview') throw new RuleError('notApplicable');
    const profile = await profileFor(call, req.clientId);
    if (!profile && decision === 'updateToMatch') throw new RuleError('notApplicable');
    const stand: BillingProfile = profile ?? {
      clientId: req.clientId,
      billingName: req.oldName,
      address: '',
      billingContactEmail: 'none',
      updatedBy: call.actor.user.id,
      updatedAt: ctx.now,
    };
    const out = reviewNameChange(req, stand, decision, call.actor.user.id, options.clock);
    const request = validate('profileChangeRequests', out.request) as ProfileChangeRequest;
    await backend.apply([
      put('profileChangeRequests', request),
      ...(decision === 'updateToMatch'
        ? [{ type: 'put', store: 'billingProfiles', key: out.profile.clientId, record: out.profile } as WriteOp]
        : []),
      audit(call, req.clientId, out.audit.action, req.id, { status: req.status }, { status: request.status }),
    ]);
    return structuredClone(request);
  }

  const profileChanges: ProfileChangesService = {
    async list(ctx) {
      const call = await providerCall(ctx, 'clients.reviewNameChanges');
      const profiles = await call.all<BillingProfile>('billingProfiles');
      return structuredClone(
        (await call.all<ProfileChangeRequest>('profileChangeRequests'))
          .filter((r) => r.status === 'pendingReview')
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((r) => ({
            ...r,
            billingName: profiles.find((p) => p.clientId === r.clientId)?.billingName ?? '',
          })),
      );
    },
    keepBillingName: (ctx, id) => review(ctx, id, 'keep'),
    updateBillingName: (ctx, id) => review(ctx, id, 'updateToMatch'),
    askClient: (ctx, id) => review(ctx, id, 'askClient'),

    async revertDisplayName(ctx, id) {
      const call = await providerCall(ctx, 'clients.revertDisplayName');
      const req = await load<ProfileChangeRequest>(call, 'profileChangeRequests', id);
      if (req.status !== 'pendingReview') throw new RuleError('notApplicable');
      const client = (await call.all<Client>('clients')).find((c) => c.id === req.clientId);
      if (!client) throw new NotFoundError();
      const request = validate('profileChangeRequests', {
        ...req,
        status: 'reverted',
        reviewerId: call.actor.user.id,
        reviewedAt: options.clock.now().toISOString(),
      }) as ProfileChangeRequest;
      await backend.apply([
        put('profileChangeRequests', request),
        put('clients', validate('clients', { ...client, displayName: req.oldName }) as Client),
        audit(call, req.clientId, 'displayName.revert', req.id, { status: req.status }, { status: request.status }),
      ]);
      return structuredClone(request);
    },
  };

  // ------------------------------------------------------------ billing detail change requests

  async function decide(
    ctx: ActorContext,
    id: string,
    decision: Parameters<typeof decideBillingChange>[2],
    action: string,
  ): Promise<BillingChangeRequest> {
    const call = await providerCall(ctx, 'clients.editBilling');
    const req = await load<BillingChangeRequest>(call, 'billingChangeRequests', id);
    if (req.status !== 'pending') throw new RuleError('notApplicable');
    const profile = await profileFor(call, req.clientId);
    if (!profile) throw new RuleError('notApplicable');
    const out = decideBillingChange(req, profile, decision, call.actor.user.id, options.clock);
    const request = validate('billingChangeRequests', out.request) as BillingChangeRequest;
    const fields = PROPOSED_FIELDS.filter((f) => request.proposed[f] !== undefined);
    await backend.apply([
      put('billingChangeRequests', request),
      ...(decision.kind === 'decline'
        ? []
        : [{ type: 'put', store: 'billingProfiles', key: req.clientId, record: out.profile } as WriteOp]),
      audit(call, req.clientId, action, req.id, { status: req.status }, { status: request.status, fields }),
    ]);
    return structuredClone(request);
  }

  const billingChanges: BillingChangesService = {
    async list(ctx) {
      const call = await providerCall(ctx, 'clients.editBilling');
      return structuredClone(
        [...(await call.all<BillingChangeRequest>('billingChangeRequests'))].sort((a, b) => (a.id < b.id ? -1 : 1)),
      );
    },
    approve: (ctx, id) => decide(ctx, id, { kind: 'approve' }, 'billingChange.approve'),
    async editThenApprove(ctx, id, proposed) {
      const clean: BillingChangeRequest['proposed'] = {};
      const issues: string[] = [];
      const raw: Record<string, unknown> = proposed;
      for (const k of Object.keys(raw)) {
        if (!(PROPOSED_FIELDS as readonly string[]).includes(k)) issues.push(`${k}: not a field you can change here`);
      }
      for (const f of PROPOSED_FIELDS) {
        if (raw[f] === undefined) continue;
        const v = text(raw[f]);
        if (typeof raw[f] !== 'string' || (f === 'billingName' && v === '')) issues.push(`${f}: not valid`);
        else clean[f] = v;
      }
      // Permission first: a caller without clients.editBilling is Forbidden whatever they send.
      await providerCall(ctx, 'clients.editBilling');
      if (issues.length > 0) throw new ValidationError(issues);
      return decide(ctx, id, { kind: 'editApprove', proposed: clean }, 'billingChange.editApprove');
    },
    async decline(ctx, id, reason) {
      await providerCall(ctx, 'clients.editBilling');
      const why = text(reason);
      if (why === '') throw new ValidationError(['reason: required']);
      return decide(ctx, id, { kind: 'decline', reason: why }, 'billingChange.decline');
    },
  };

  return { recovery, profileChanges, billingChanges };
}
