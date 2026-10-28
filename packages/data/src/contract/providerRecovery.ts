// M4 chunk 8b contract tests: account recovery, organisation name changes and billing detail change requests
// (plan docs/plans/m4.md chunk 8, BP-2 and BP-12 data parts). Written before the implementation, so the new services
// are described by local types. All of them are provider side only; every customer actor is Forbidden.
//   - store.recovery (domain recovery.ts over the Clock, 24 hours cooling off):
//       list(ctx) -> RecoveryRequest[]                          needs recovery.start
//       request(ctx, { clientId, subjectUserId, reason, outcome? }) -> RecoveryRequest   recovery.start, requester = ctx.userId
//       approve(ctx, id) / complete(ctx, id)                    need recovery.approve
//       reject(ctx, id)                                         recovery.start
//     Domain refusals (same approver twice, the subject approving, complete too early or before two approvals) surface
//     as RuleError. complete with outcome 'reset2fa' removes the subject's `twoFactor` enrolment. Audit actions
//     'recovery.request' | 'recovery.approve' | 'recovery.complete' | 'recovery.reject' hold ids only, never the reason.
//   - store.profileChanges (ProfileChangeRequest of kind nameChange, domain billingNames.ts reviewNameChange):
//       list(ctx) -> (ProfileChangeRequest & { billingName: string })[]   pending ones only, with the client's billing
//       name beside; needs clients.reviewNameChanges.
//       keepBillingName / updateBillingName / askClient (ctx, id) -> ProfileChangeRequest   need clients.reviewNameChanges
//       revertDisplayName(ctx, id) -> ProfileChangeRequest      needs clients.revertDisplayName; puts the client's
//       displayName back to oldName.
//     Each sets status billingKept | billingUpdated | clientAsked | reverted, reviewerId and reviewedAt (Clock) and audits
//     'billingName.keep' | 'billingName.updateToMatch' | 'billingName.askClient' | 'displayName.revert' with the request id as
//     target. updateBillingName changes only the billing profile; issued invoices are never touched.
//   - store.billingChanges (the existing BillingChangeRequest schema; clients create them with billing.requestDetailsChange):
//       list(ctx) -> BillingChangeRequest[]                     needs clients.editBilling
//       approve(ctx, id) | editThenApprove(ctx, id, proposed) | decline(ctx, id, reason) -> BillingChangeRequest
//     Approving applies the proposal to the billing profile (domain decideBillingChange); declining needs a reason and
//     leaves the profile alone. Audit 'billingChange.approve' | 'billingChange.editApprove' | 'billingChange.decline'.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  type AuditEvent,
  type BillingChangeRequest,
  type BillingProfile,
  type Client,
  type Invoice,
  type ProfileChangeRequest,
  type RecoveryRequest,
  type UserAccount,
} from '@sta/domain';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreOptions } from '../types';
import { refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY } from './world';

type Proposed = BillingChangeRequest['proposed'];
type RecoveryStore = {
  recovery: {
    list(ctx: ActorContext): Promise<RecoveryRequest[]>;
    request(
      ctx: ActorContext,
      input: { clientId: string; subjectUserId: string; reason: string; outcome?: 'reset2fa' | 'transferOwner' },
    ): Promise<RecoveryRequest>;
    approve(ctx: ActorContext, id: string): Promise<RecoveryRequest>;
    complete(ctx: ActorContext, id: string): Promise<RecoveryRequest>;
    reject(ctx: ActorContext, id: string): Promise<RecoveryRequest>;
  };
  profileChanges: {
    list(ctx: ActorContext): Promise<(ProfileChangeRequest & { billingName: string })[]>;
    keepBillingName(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
    updateBillingName(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
    askClient(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
    revertDisplayName(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
  };
  billingChanges: {
    list(ctx: ActorContext): Promise<BillingChangeRequest[]>;
    approve(ctx: ActorContext, id: string): Promise<BillingChangeRequest>;
    editThenApprove(ctx: ActorContext, id: string, proposed: Proposed): Promise<BillingChangeRequest>;
    decline(ctx: ActorContext, id: string, reason: string): Promise<BillingChangeRequest>;
  };
  billing: {
    requestDetailsChange(ctx: ActorContext, proposed: Proposed): Promise<BillingChangeRequest>;
  };
};

const DAY = 86_400_000;

export function runProviderRecoveryContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    let offsetMs = 0;
    const clock = { now: () => new Date(Date.parse(TODAY) + offsetMs) };
    const handle = await makeStore({ clock, rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const s = handle.store as unknown as RecoveryStore;
    const u = fx.ids.users;
    const a = fx.ids.clients.a;
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
    // The seeded provider team has one user with recovery.approve (the Owner), so Megan is given the Owner role too.
    const megan = fx.keys.users['megan'];
    await handle.admin.bulkPut('roleAssignments', [
      {
        id: freshId(7001),
        userId: megan,
        roleIds: [fx.keys.roles['provider.owner']],
        scope: { type: 'all' },
        grants: [],
        denies: [],
        status: 'active',
      },
    ]);
    // Priya is the person being recovered, and is enrolled for two-step sign-in.
    const priyaUser = (await dump<UserAccount>('users')).find((x) => x.id === u.priya)!;
    await handle.admin.bulkPut('users', [{ ...priyaUser, twoFactor: { enrolledAt: TODAY, recoveryCodesLeft: 5 } }]);
    const profile: BillingProfile = {
      clientId: a,
      billingName: 'Little Acorns Nursery Ltd',
      address: '1 Test Street',
      billingContactEmail: 'accounts@little-acorns-nursery.test',
      updatedBy: u.priya,
      updatedAt: TODAY,
    };
    await handle.admin.bulkPut('billingProfiles', [profile]);
    const invoice: Invoice = {
      id: freshId(7100),
      number: 'INV-7100',
      clientId: a,
      issuedAt: new Date(Date.parse(TODAY) - 2 * DAY).toISOString(),
      dueAt: new Date(Date.parse(TODAY) + 12 * DAY).toISOString(),
      billingNameAtIssue: profile.billingName,
      billingAddressAtIssue: profile.address,
      lines: [{ label: 'Plan', amount: 5000 }],
      tax: 1000,
      total: 6000,
      status: 'due',
    };
    await handle.admin.bulkPut('invoices', [invoice]);
    return {
      s,
      u,
      a,
      dump,
      handle,
      invoice,
      profile,
      megan,
      advance: (ms: number) => {
        offsetMs += ms;
      },
      priya: { userId: u.priya, side: 'client', clientId: a, now: TODAY } as ActorContext,
      jade: { userId: u.jade, side: 'staff', clientId: a, now: TODAY } as ActorContext,
      support: provider(u.support),
      owner: provider(u.provOwner),
      meganCtx: provider(megan),
      raj: provider(fx.keys.users['raj']),
      tom: provider(u.tom),
    };
  }
  type T = Awaited<ReturnType<typeof setup>>;
  const audits = async (t: T, action: string) => (await t.dump<AuditEvent>('audit')).filter((e) => e.action === action);
  const newRecovery = (t: T, outcome: 'reset2fa' | 'transferOwner' = 'reset2fa') =>
    t.s.recovery.request(t.support, {
      clientId: t.a,
      subjectUserId: t.u.priya,
      reason: 'Lost phone, identity checked by phone',
      outcome,
    });
  const approved = async (t: T) => {
    const r = await newRecovery(t);
    await t.s.recovery.approve(t.owner, r.id);
    await t.s.recovery.approve(t.meganCtx, r.id);
    return r;
  };
  const putName = async (t: T, n: number, over: Partial<ProfileChangeRequest> = {}) => {
    const req: ProfileChangeRequest = {
      id: freshId(n),
      clientId: t.a,
      kind: 'nameChange',
      oldName: 'Little Acorns Nursery',
      newName: 'Little Acorns Early Years',
      requestedBy: t.u.priya,
      status: 'pendingReview',
      createdAt: TODAY,
      ...over,
    };
    await t.handle.admin.bulkPut('profileChangeRequests', [req]);
    return req;
  };

  describe(`M4 provider recovery and profile changes: ${name}`, () => {
    // ------------------------------------------------------------------ A) recovery
    it('opens a recovery request with the requester, the 24 hour cooling off and no approvals', async () => {
      const t = await setup();
      const r = await newRecovery(t);
      expect(r).toMatchObject({
        clientId: t.a,
        subjectUserId: t.u.priya,
        requester: t.u.support,
        approvals: [],
        status: 'open',
        outcome: 'reset2fa',
        coolingOffEndsAt: new Date(Date.parse(TODAY) + DAY).toISOString(),
      });
      expect((await t.s.recovery.list(t.support)).map((x) => x.id)).toContain(r.id);
    });

    it('needs two different approvers: the same approver twice is refused with a rule error', async () => {
      const t = await setup();
      const r = await newRecovery(t);
      expect((await t.s.recovery.approve(t.owner, r.id)).status).toBe('open');
      await ruleOf(t.s.recovery.approve(t.owner, r.id));
      expect((await t.dump<RecoveryRequest>('recoveryRequests'))[0]!.approvals).toEqual([t.u.provOwner]);
      expect(await t.s.recovery.approve(t.meganCtx, r.id)).toMatchObject({ status: 'approved' });
    });

    it('does not let the person being recovered approve their own request', async () => {
      const t = await setup();
      const own: RecoveryRequest = {
        id: freshId(7200),
        clientId: t.a,
        subjectUserId: t.megan,
        requester: t.u.support,
        reason: 'Locked out',
        checks: [],
        approvals: [],
        coolingOffEndsAt: new Date(Date.parse(TODAY) + DAY).toISOString(),
        status: 'open',
      };
      await t.handle.admin.bulkPut('recoveryRequests', [own]);
      await ruleOf(t.s.recovery.approve(t.meganCtx, own.id));
      expect((await t.dump<RecoveryRequest>('recoveryRequests'))[0]!.approvals).toEqual([]);
    });

    it('refuses to complete before two approvals and before the cooling off ends', async () => {
      const t = await setup();
      const r = await newRecovery(t);
      await t.s.recovery.approve(t.owner, r.id);
      await ruleOf(t.s.recovery.complete(t.owner, r.id));
      await t.s.recovery.approve(t.meganCtx, r.id);
      await ruleOf(t.s.recovery.complete(t.owner, r.id));
      t.advance(DAY - 1000);
      await ruleOf(t.s.recovery.complete(t.owner, r.id));
      const stored = (await t.dump<UserAccount>('users')).find((x) => x.id === t.u.priya)!;
      expect(stored.twoFactor).toBeDefined();
    });

    it('completes after the cooling off, marks it done and clears the subject two-step enrolment', async () => {
      const t = await setup();
      const r = await approved(t);
      t.advance(DAY + 1000);
      expect(await t.s.recovery.complete(t.owner, r.id)).toMatchObject({ id: r.id, status: 'done' });
      const stored = (await t.dump<UserAccount>('users')).find((x) => x.id === t.u.priya)!;
      expect(stored.twoFactor).toBeUndefined();
      const others = (await t.dump<UserAccount>('users')).find((x) => x.id === t.megan)!;
      expect(others.twoFactor).toBeDefined();
    });

    it('rejects an open request, which then cannot be approved or completed', async () => {
      const t = await setup();
      const r = await newRecovery(t);
      expect((await t.s.recovery.reject(t.support, r.id)).status).toBe('rejected');
      await ruleOf(t.s.recovery.approve(t.owner, r.id));
      await ruleOf(t.s.recovery.complete(t.owner, r.id));
    });

    it('audits every recovery step with ids only and never the reason', async () => {
      const t = await setup();
      const r = await approved(t);
      t.advance(DAY + 1000);
      await t.s.recovery.complete(t.owner, r.id);
      const other = await newRecovery(t);
      await t.s.recovery.reject(t.support, other.id);
      const counts = {
        request: (await audits(t, 'recovery.request')).length,
        approve: (await audits(t, 'recovery.approve')).length,
        complete: (await audits(t, 'recovery.complete')).length,
        reject: (await audits(t, 'recovery.reject')).length,
      };
      expect(counts).toEqual({ request: 2, approve: 2, complete: 1, reject: 1 });
      const all = (await t.dump<AuditEvent>('audit')).filter((e) => e.action.startsWith('recovery.'));
      for (const e of all) {
        expect(e).toMatchObject({ actorSide: 'provider', clientId: t.a });
        expect(JSON.stringify(e)).not.toContain('Lost phone');
      }
      expect((await audits(t, 'recovery.approve')).map((e) => e.actorId).sort()).toEqual(
        [t.u.provOwner, t.megan].sort(),
      );
    });

    it('denies recovery to customer actors, to a user without recovery.start, and approval without recovery.approve', async () => {
      const t = await setup();
      const r = await newRecovery(t);
      for (const actor of [t.priya, t.jade, t.tom, t.raj]) {
        expect(await refusal(t.s.recovery.list(actor))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(newRecovery({ ...t, support: actor }))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.recovery.reject(actor, r.id))).toBeInstanceOf(ForbiddenError);
      }
      // Support may start a recovery but not approve or complete one.
      expect(await refusal(t.s.recovery.approve(t.support, r.id))).toBeInstanceOf(ForbiddenError);
      expect(await refusal(t.s.recovery.complete(t.support, r.id))).toBeInstanceOf(ForbiddenError);
      expect(await t.dump<RecoveryRequest>('recoveryRequests')).toHaveLength(1);
      expect(await audits(t, 'recovery.approve')).toHaveLength(0);
    });

    // ------------------------------------------------------------------ B) profile changes
    it('lists pending name changes with the billing name beside them and leaves out reviewed ones', async () => {
      const t = await setup();
      const pending = await putName(t, 7300);
      const done = await putName(t, 7301, { status: 'billingKept', reviewerId: t.u.provOwner, reviewedAt: TODAY });
      const list = await t.s.profileChanges.list(t.owner);
      expect(list.map((x) => x.id)).toContain(pending.id);
      expect(list.map((x) => x.id)).not.toContain(done.id);
      expect(list.find((x) => x.id === pending.id)).toMatchObject({
        oldName: 'Little Acorns Nursery',
        newName: 'Little Acorns Early Years',
        billingName: 'Little Acorns Nursery Ltd',
      });
    });

    it('keeps the billing name: status, reviewer and time recorded, profile and invoices unchanged', async () => {
      const t = await setup();
      const req = await putName(t, 7302);
      t.advance(3_600_000);
      const done = await t.s.profileChanges.keepBillingName(t.owner, req.id);
      expect(done).toMatchObject({
        status: 'billingKept',
        reviewerId: t.u.provOwner,
        reviewedAt: new Date(Date.parse(TODAY) + 3_600_000).toISOString(),
      });
      expect((await t.dump<BillingProfile>('billingProfiles'))[0]).toEqual(t.profile);
      expect((await audits(t, 'billingName.keep'))[0]).toMatchObject({ actorId: t.u.provOwner, clientId: t.a });
      await ruleOf(t.s.profileChanges.keepBillingName(t.owner, req.id));
    });

    it('updates the billing name to match without touching invoices already issued', async () => {
      const t = await setup();
      const req = await putName(t, 7303);
      const before = JSON.stringify(await t.dump<Invoice>('invoices'));
      const done = await t.s.profileChanges.updateBillingName(t.owner, req.id);
      expect(done).toMatchObject({ status: 'billingUpdated', reviewerId: t.u.provOwner, reviewedAt: TODAY });
      const profile = (await t.dump<BillingProfile>('billingProfiles'))[0]!;
      expect(profile).toMatchObject({ billingName: 'Little Acorns Early Years', updatedBy: t.u.provOwner });
      expect(JSON.stringify(await t.dump<Invoice>('invoices'))).toBe(before);
      expect((await t.dump<Invoice>('invoices'))[0]!.billingNameAtIssue).toBe('Little Acorns Nursery Ltd');
      expect(await audits(t, 'billingName.updateToMatch')).toHaveLength(1);
    });

    it('asks the client, leaving the billing name alone', async () => {
      const t = await setup();
      const req = await putName(t, 7304);
      expect(await t.s.profileChanges.askClient(t.owner, req.id)).toMatchObject({
        status: 'clientAsked',
        reviewerId: t.u.provOwner,
        reviewedAt: TODAY,
      });
      expect((await t.dump<BillingProfile>('billingProfiles'))[0]).toEqual(t.profile);
      expect(await audits(t, 'billingName.askClient')).toHaveLength(1);
    });

    it('reverts a display name to the old name for a user with clients.revertDisplayName only', async () => {
      const t = await setup();
      const client = (await t.dump<Client>('clients')).find((c) => c.id === t.a)!;
      await t.handle.admin.bulkPut('clients', [{ ...client, displayName: 'Little Acorns Early Years' }]);
      const req = await putName(t, 7305);
      // The Owner holds it; Megan (content editor role plus Owner role) is not used here, Raj has no reviewing right.
      expect(await refusal(t.s.profileChanges.revertDisplayName(t.raj, req.id))).toBeInstanceOf(ForbiddenError);
      expect((await t.dump<Client>('clients')).find((c) => c.id === t.a)!.displayName).toBe(
        'Little Acorns Early Years',
      );
      expect(await t.s.profileChanges.revertDisplayName(t.owner, req.id)).toMatchObject({
        status: 'reverted',
        reviewerId: t.u.provOwner,
        reviewedAt: TODAY,
      });
      expect((await t.dump<Client>('clients')).find((c) => c.id === t.a)!.displayName).toBe('Little Acorns Nursery');
      expect(await audits(t, 'displayName.revert')).toHaveLength(1);
    });

    it('denies profile changes to customer actors and to provider users without the permission', async () => {
      const t = await setup();
      const req = await putName(t, 7306);
      for (const actor of [t.priya, t.jade, t.raj, t.tom]) {
        expect(await refusal(t.s.profileChanges.list(actor))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.profileChanges.keepBillingName(actor, req.id))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.profileChanges.updateBillingName(actor, req.id))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.profileChanges.askClient(actor, req.id))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.profileChanges.revertDisplayName(actor, req.id))).toBeInstanceOf(ForbiddenError);
      }
      expect((await t.dump<ProfileChangeRequest>('profileChangeRequests'))[0]!.status).toBe('pendingReview');
      expect((await t.dump<AuditEvent>('audit')).filter((e) => /^(billingName|displayName)\./.test(e.action))).toEqual(
        [],
      );
    });

    // ------------------------------------------------------------------ C) billing detail change requests
    it('lists a client billing detail request and approves it into the billing profile', async () => {
      const t = await setup();
      const asked = await t.s.billing.requestDetailsChange(t.priya, { address: '9 New Road' });
      expect((await t.s.billingChanges.list(t.raj)).map((x) => x.id)).toContain(asked.id);
      expect((await t.dump<BillingProfile>('billingProfiles'))[0]!.address).toBe('1 Test Street');
      const done = await t.s.billingChanges.approve(t.raj, asked.id);
      expect(done.status).toBe('approved');
      expect(done.reviewerId).toBe(t.raj.userId);
      expect((await t.dump<BillingProfile>('billingProfiles'))[0]).toMatchObject({
        address: '9 New Road',
        billingName: 'Little Acorns Nursery Ltd',
        updatedBy: t.raj.userId,
      });
      expect((await t.dump<Invoice>('invoices'))[0]!.billingAddressAtIssue).toBe('1 Test Street');
      expect((await audits(t, 'billingChange.approve'))[0]).toMatchObject({ actorId: t.raj.userId, clientId: t.a });
      await ruleOf(t.s.billingChanges.approve(t.raj, asked.id));
    });

    it('edits then approves, applying the edited values and not the requested ones', async () => {
      const t = await setup();
      const asked = await t.s.billing.requestDetailsChange(t.priya, { address: '9 New Rd', vatNumber: 'GB000000000' });
      const done = await t.s.billingChanges.editThenApprove(t.raj, asked.id, { address: '9 New Road, Town' });
      expect(done).toMatchObject({ status: 'approved', proposed: { address: '9 New Road, Town' } });
      const profile = (await t.dump<BillingProfile>('billingProfiles'))[0]!;
      expect(profile.address).toBe('9 New Road, Town');
      expect(profile.vatNumber).toBeUndefined();
      expect(await audits(t, 'billingChange.editApprove')).toHaveLength(1);
    });

    it('declines with a reason, leaves the profile alone and refuses an empty reason', async () => {
      const t = await setup();
      const asked = await t.s.billing.requestDetailsChange(t.priya, { billingName: 'Somebody Else Ltd' });
      await refusal(t.s.billingChanges.decline(t.raj, asked.id, '   '));
      expect((await t.dump<BillingChangeRequest>('billingChangeRequests'))[0]!.status).toBe('pending');
      const done = await t.s.billingChanges.decline(t.raj, asked.id, 'Name does not match company records');
      expect(done).toMatchObject({ status: 'declined', reason: 'Name does not match company records' });
      expect((await t.dump<BillingProfile>('billingProfiles'))[0]).toEqual(t.profile);
      expect(await audits(t, 'billingChange.decline')).toHaveLength(1);
    });

    it('denies billing change decisions to customer actors and users without clients.editBilling', async () => {
      const t = await setup();
      const asked = await t.s.billing.requestDetailsChange(t.priya, { address: '9 New Road' });
      for (const actor of [t.priya, t.jade, t.support, t.tom]) {
        expect(await refusal(t.s.billingChanges.list(actor))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.billingChanges.approve(actor, asked.id))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.billingChanges.editThenApprove(actor, asked.id, {}))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.billingChanges.decline(actor, asked.id, 'No'))).toBeInstanceOf(ForbiddenError);
      }
      expect((await t.dump<BillingChangeRequest>('billingChangeRequests'))[0]!.status).toBe('pending');
      expect((await t.dump<BillingProfile>('billingProfiles'))[0]).toEqual(t.profile);
    });
  });
}
