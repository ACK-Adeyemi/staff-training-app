// M3 chunk 9 contract tests, "Data D: evidence flow" (plan docs/plans/m3.md, assumptions 22 and 23, Data package
// `evidenceFlow`, Contract tests "Evidence flow"). Proves the data-layer part of BP-15 and F-4. Runs against every adapter.
// Written before the implementation, so the new DataStore methods are described by the local types below: they are
// the contract the implementer adds to `DataStore` (`store.evidenceFlow`).
//
// Conventions the tests assume (the plan leaves them open):
//   - The certificate file is uploaded first with `attachments.upload({ purpose: 'certificate', ... })`; submit and
//     resubmit take its id as `fileAttachmentId`. A file the actor cannot read is refused.
//   - `submit(ctx, { requirementId, personId?, providerName, completedAt, expiresAt?, certificateRef?,
//     fileAttachmentId })`: personId defaults to the actor's own person. Staff may submit for themselves only; a client
//     actor needs evidence.uploadForOthers in scope for someone else. The record gets the person's primary site,
//     `uploadedBy` = ctx.userId, status 'awaitingCheck', createdAt = ctx.now. For `fromRenewalPeriod` requirements the
//     stored expiresAt is completedAt + renewEveryMonths (any entered value is ignored); `fromCertificate` requires it.
//   - `resubmit(ctx, id, { fileAttachmentId, providerName, completedAt, expiresAt?, certificateRef? })` updates the same
//     record from 'needsBetterCopy' or 'rejected' back to 'awaitingCheck' and clears reviewer, reviewedAt, decisionNote
//     and rejectionReason. `withdraw(ctx, id)` works on an open submission by the person or their uploader.
//   - `queue(ctx, filter?)` lists 'awaitingCheck' submissions in the actor's read scope, oldest first.
//     `get(ctx, id)` follows the same visibility as `evidenceSubmissions.get`.
//   - `review(ctx, id, decision)` takes the domain ReviewDecision without `reviewerId` (that is ctx.userId). Approval
//     creates the Evidence (kind 'external', approvedBy, approvedAt = ctx.now) and sets `evidenceId`.
//   - Audit actions: evidence.submitted, evidence.resubmitted, evidence.withdrawn, evidence.approved,
//     evidence.betterCopy, evidence.rejected. The approved event holds `before` and `after` objects with the changed
//     completedAt and expiresAt when the approver corrected them.
//   - Each decision notifies the person's staff user: kind 'evidenceApproved', 'evidenceBetterCopy', 'evidenceRejected'.
//   - New RuleNames: invalidSubmission (bad expiry or details on submit), invalidDecision (note, reason or dates on
//     review), notAwaitingCheck (review of a submission that is not waiting, or resubmit of one that cannot be).
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  createRng,
  fixedClock,
  requirementStatus,
  type AuditEvent,
  type Evidence,
  type EvidenceSubmission,
  type FileAttachment,
  type Notification,
  type Requirement,
  type ReviewDecision,
} from '@sta/domain';
import {
  AccountStateError,
  DataError,
  ForbiddenError,
  NotFoundError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY, type World } from './world';

// ---------------------------------------------------------------- the API under test

export type SubmitInput = {
  requirementId: string;
  personId?: string;
  providerName: string;
  completedAt: string;
  expiresAt?: string;
  certificateRef?: string;
  fileAttachmentId: string;
};
export type ResubmitInput = Omit<SubmitInput, 'requirementId' | 'personId'>;
export type ReviewInput =
  | Omit<Extract<ReviewDecision, { kind: 'approve' }>, 'reviewerId'>
  | Omit<Extract<ReviewDecision, { kind: 'betterCopy' }>, 'reviewerId'>
  | Omit<Extract<ReviewDecision, { kind: 'reject' }>, 'reviewerId'>;

export type EvidenceFlowStore = {
  evidenceSubmissions: {
    get(ctx: ActorContext, id: string): Promise<EvidenceSubmission>;
    list(ctx: ActorContext, filter?: Record<string, unknown>): Promise<EvidenceSubmission[]>;
    put(ctx: ActorContext, record: EvidenceSubmission): Promise<EvidenceSubmission>;
  };
  evidence: {
    list(ctx: ActorContext, filter?: Record<string, unknown>): Promise<Evidence[]>;
  };
  requirements: { get(ctx: ActorContext, id: string): Promise<Requirement> };
  attachments: {
    upload(
      ctx: ActorContext,
      input: { purpose: 'certificate'; title: string; mime: string; data: Uint8Array; personId?: string },
    ): Promise<FileAttachment>;
  };
  evidenceFlow: {
    submit(ctx: ActorContext, input: SubmitInput): Promise<EvidenceSubmission>;
    resubmit(ctx: ActorContext, id: string, input: ResubmitInput): Promise<EvidenceSubmission>;
    withdraw(ctx: ActorContext, id: string): Promise<EvidenceSubmission>;
    queue(ctx: ActorContext, filter?: { siteId?: string; requirementId?: string }): Promise<EvidenceSubmission[]>;
    get(ctx: ActorContext, id: string): Promise<EvidenceSubmission>;
    review(ctx: ActorContext, id: string, decision: ReviewInput): Promise<EvidenceSubmission>;
  };
};

/** Lets the older contract files reach `evidenceFlow` without changing their store type. */
export const flowOf = (store: unknown): EvidenceFlowStore['evidenceFlow'] => (store as EvidenceFlowStore).evidenceFlow;

// ---------------------------------------------------------------- helpers

const DAY = 86_400_000;
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
const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
/** A tiny PDF: the data layer only sniffs the magic bytes. */
const pdf = (): Uint8Array<ArrayBuffer> => new Uint8Array(ascii('%PDF-1.4\n%%EOF\n'));

async function dump<T>(admin: DemoAdmin, store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}
async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(ForbiddenError);
  return (error as ForbiddenError).reason;
}
/** Refused one way or another: the actor may not see it (NotFound) or may not do it (Forbidden). */
async function refusedAsUnseenOrForbidden(promise: Promise<unknown>): Promise<void> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(DataError);
  expect(['forbidden', 'notFound']).toContain((error as DataError).code);
}
const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

export function runEvidenceFlowContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx: World = await buildWorld(handle.admin);
    const admin = handle.admin;
    const store = handle.store as unknown as EvidenceFlowStore;
    const a = fx.ids.clients.a;
    const requirements = await dump<Requirement>(admin, 'requirements');
    const reqNamed = (n: string): Requirement => {
      const r = requirements.find((x) => x.name === n);
      if (!r) throw new Error(`Contract world: no requirement ${n}`);
      return r;
    };
    const people = fx.keys.personas;
    const users = fx.keys.users;
    const actors = {
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      jade: staff(fx.ids.users.jade, a),
      ben: staff(fx.ids.users.ben, a),
      mark: staff(users['mark'], a),
      maureen: staff(users['maureen'], a),
      beth: client(fx.ids.users.beth, fx.ids.clients.b),
      prov: provider(fx.ids.users.provOwner),
    };
    const cert = async (ctx: ActorContext, personId?: string): Promise<string> =>
      (
        await store.attachments.upload(ctx, {
          purpose: 'certificate',
          title: 'Certificate',
          mime: 'application/pdf',
          data: pdf(),
          ...(personId ? { personId } : {}),
        })
      ).id;
    const firstAid = reqNamed('Paediatric first aid');
    const foodHygiene = reqNamed('Food hygiene');
    const safeguarding = reqNamed('Safeguarding');
    const induction = reqNamed('New starter induction');

    /** Mark's own first aid submission (fromCertificate, so the expiry is entered). */
    const markSubmits = async (over: Partial<SubmitInput> = {}): Promise<EvidenceSubmission> =>
      store.evidenceFlow.submit(actors.mark, {
        requirementId: firstAid.id,
        providerName: 'Test First Aid Ltd',
        completedAt: '2026-10-05T09:00:00.000Z',
        expiresAt: '2029-10-05T09:00:00.000Z',
        fileAttachmentId: await cert(actors.mark),
        ...over,
      });
    const notificationsOf = async (userId: string): Promise<Notification[]> =>
      (await dump<Notification>(admin, 'notifications')).filter((n) => n.userId === userId);
    const auditOf = async (action: string): Promise<AuditEvent[]> =>
      (await dump<AuditEvent>(admin, 'audit')).filter((e) => e.action === action);
    return {
      store,
      admin,
      fx,
      actors,
      people,
      users,
      cert,
      markSubmits,
      notificationsOf,
      auditOf,
      firstAid,
      foodHygiene,
      safeguarding,
      induction,
    };
  }
  describe(`M3 evidence flow (data D): ${name}`, () => {
    describe('submit', () => {
      it('lets staff submit their own certificate, which then waits for a check', async () => {
        const s = await setup();
        const sub = await s.markSubmits({ certificateRef: 'FA-123' });
        expect(sub).toMatchObject({
          clientId: s.fx.ids.clients.a,
          siteId: s.fx.ids.sites.main,
          personId: s.people['mark'],
          requirementId: s.firstAid.id,
          uploadedBy: s.users['mark'],
          providerName: 'Test First Aid Ltd',
          certificateRef: 'FA-123',
          status: 'awaitingCheck',
          createdAt: TODAY,
        });
        const priya = s.actors.priya;
        const result = requirementStatus(
          await s.store.requirements.get(priya, s.firstAid.id),
          await s.store.evidence.list(priya, { personId: s.people['mark'], requirementId: s.firstAid.id }),
          await s.store.evidenceSubmissions.list(priya, { personId: s.people['mark'], requirementId: s.firstAid.id }),
          new Date(TODAY),
          60,
        );
        // Mark's seeded first aid certificate is out of date, so the domain rule reports it as overdue with a check
        // waiting (requirementStatus: evidenceWaiting) rather than plain awaitingCheck.
        expect(result.status === 'awaitingCheck' || result.evidenceWaiting === true).toBe(true);
        expect(await s.auditOf('evidence.submitted')).toHaveLength(1);
      });

      it('requires the entered expiry for a requirement that takes it from the certificate', async () => {
        const s = await setup();
        const file = await s.cert(s.actors.mark);
        const base: SubmitInput = {
          requirementId: s.firstAid.id,
          providerName: 'Test First Aid Ltd',
          completedAt: '2026-10-05T09:00:00.000Z',
          fileAttachmentId: file,
        };
        expect(await ruleOf(s.store.evidenceFlow.submit(s.actors.mark, base))).toBe('invalidSubmission');
        expect(
          await ruleOf(s.store.evidenceFlow.submit(s.actors.mark, { ...base, expiresAt: '2026-10-01T09:00:00.000Z' })),
        ).toBe('invalidSubmission');
        expect(await dump(s.admin, 'evidenceSubmissions')).toHaveLength(s.fx.data.evidenceSubmissions.length);
      });

      it('computes the expected expiry from the renewal period when the requirement uses one', async () => {
        const s = await setup();
        const completedAt = '2026-09-01T09:00:00.000Z';
        const sub = await s.store.evidenceFlow.submit(s.actors.maureen, {
          requirementId: s.foodHygiene.id,
          providerName: 'Test Hygiene Ltd',
          completedAt,
          expiresAt: '2099-01-01T00:00:00.000Z',
          fileAttachmentId: await s.cert(s.actors.maureen),
        });
        expect(sub.expiresAt).toBe(addMonths(new Date(completedAt), s.foodHygiene.renewEveryMonths!).toISOString());
      });

      it('allows one open submission per person and requirement, and a new one after a withdrawal', async () => {
        const s = await setup();
        const ben = s.actors.ben;
        const input = async (): Promise<SubmitInput> => ({
          requirementId: s.fx.ids.requirementId,
          providerName: 'Test Safeguarding Ltd',
          completedAt: '2026-10-05T09:00:00.000Z',
          fileAttachmentId: await s.cert(ben),
        });
        // Ben already has a seeded submission waiting for this requirement.
        expect(await ruleOf(s.store.evidenceFlow.submit(ben, await input()))).toBe('openSubmission');
        await s.store.evidenceFlow.withdraw(ben, s.fx.ids.submissions.ben);
        const fresh = await s.store.evidenceFlow.submit(ben, await input());
        expect(fresh.status).toBe('awaitingCheck');
        expect(fresh.id).not.toBe(s.fx.ids.submissions.ben);
      });

      it('refuses a requirement that does not take external evidence', async () => {
        const s = await setup();
        expect(
          await ruleOf(
            s.store.evidenceFlow.submit(s.actors.mark, {
              requirementId: s.induction.id,
              providerName: 'Test Ltd',
              completedAt: '2026-10-05T09:00:00.000Z',
              fileAttachmentId: await s.cert(s.actors.mark),
            }),
          ),
        ).toBe('notExternal');
      });

      it('refuses a requirement that does not apply to the person', async () => {
        const s = await setup();
        // Food hygiene applies to Cooks only; Jade is a Room Leader.
        expect(
          await ruleOf(
            s.store.evidenceFlow.submit(s.actors.jade, {
              requirementId: s.foodHygiene.id,
              providerName: 'Test Hygiene Ltd',
              completedAt: '2026-09-01T09:00:00.000Z',
              fileAttachmentId: await s.cert(s.actors.jade),
            }),
          ),
        ).toBe('notApplicable');
      });

      it('refuses staff submitting for someone else and a file the actor cannot read', async () => {
        const s = await setup();
        const input = (file: string, personId?: string): SubmitInput => ({
          requirementId: s.firstAid.id,
          ...(personId ? { personId } : {}),
          providerName: 'Test First Aid Ltd',
          completedAt: '2026-10-05T09:00:00.000Z',
          expiresAt: '2029-10-05T09:00:00.000Z',
          fileAttachmentId: file,
        });
        const jadeFile = await s.cert(s.actors.jade);
        expect(await reasonOf(s.store.evidenceFlow.submit(s.actors.jade, input(jadeFile, s.people['mark'])))).toBe(
          'permission',
        );
        const markFile = await s.cert(s.actors.mark);
        const error = await refusal(s.store.evidenceFlow.submit(s.actors.jade, input(markFile)));
        expect(error).toBeInstanceOf(DataError);
        expect(await dump(s.admin, 'evidenceSubmissions')).toHaveLength(s.fx.data.evidenceSubmissions.length);
      });

      it('lets an admin with evidence.uploadForOthers submit for a person, and refuses one without it', async () => {
        const s = await setup();
        const input = async (ctx: ActorContext): Promise<SubmitInput> => ({
          requirementId: s.firstAid.id,
          personId: s.people['mark'],
          providerName: 'Test First Aid Ltd',
          completedAt: '2026-10-05T09:00:00.000Z',
          expiresAt: '2029-10-05T09:00:00.000Z',
          fileAttachmentId: await s.cert(ctx, s.people['mark']),
        });
        expect(await reasonOf(s.store.evidenceFlow.submit(s.actors.daniel, await input(s.actors.priya)))).toBe(
          'permission',
        );
        const sub = await s.store.evidenceFlow.submit(s.actors.priya, await input(s.actors.priya));
        expect(sub).toMatchObject({ personId: s.people['mark'], uploadedBy: s.fx.ids.users.priya });
      });

      it('refuses the provider and an admin from another client', async () => {
        const s = await setup();
        const file = await s.cert(s.actors.mark);
        const input: SubmitInput = {
          requirementId: s.firstAid.id,
          personId: s.people['mark'],
          providerName: 'Test First Aid Ltd',
          completedAt: '2026-10-05T09:00:00.000Z',
          expiresAt: '2029-10-05T09:00:00.000Z',
          fileAttachmentId: file,
        };
        expect(await reasonOf(s.store.evidenceFlow.submit(s.actors.prov, input))).toBe('permission');
        await refusedAsUnseenOrForbidden(s.store.evidenceFlow.submit(s.actors.beth, input));
      });
    });

    describe('queue and get', () => {
      it('lists waiting submissions in the actor scope, oldest first', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const daniel = await s.store.evidenceFlow.queue(s.actors.daniel);
        expect(ids(daniel)).toEqual(
          ids([
            { id: s.fx.ids.submissions.ben },
            { id: s.fx.ids.submissions.byDaniel },
            { id: s.fx.ids.submissions.aboutDaniel },
            { id: sub.id },
          ]),
        );
        expect(daniel.every((x) => x.status === 'awaitingCheck')).toBe(true);
        const stamps = daniel.map((x) => x.createdAt);
        expect(stamps).toEqual([...stamps].sort());
        const priya = await s.store.evidenceFlow.queue(s.actors.priya);
        expect(ids(priya)).toContain(s.fx.ids.submissions.otherSite);
        expect(ids(priya)).not.toContain(s.fx.ids.submissions.bob);
      });

      it('leaves out submissions that are no longer waiting', async () => {
        const s = await setup();
        await s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.ben, { kind: 'approve' });
        const queue = await s.store.evidenceFlow.queue(s.actors.daniel);
        expect(ids(queue)).not.toContain(s.fx.ids.submissions.ben);
      });

      it('shows each client only its own queue', async () => {
        const s = await setup();
        const beth = await s.store.evidenceFlow.queue(s.actors.beth);
        expect(ids(beth)).toEqual([s.fx.ids.submissions.bob]);
      });

      it('refuses the queue to staff and the provider', async () => {
        const s = await setup();
        expect(await reasonOf(s.store.evidenceFlow.queue(s.actors.ben))).toBe('permission');
        expect(await reasonOf(s.store.evidenceFlow.queue(s.actors.prov))).toBe('permission');
      });

      it('lets staff read their own submission and nobody else is shown it', async () => {
        const s = await setup();
        const own = await s.store.evidenceFlow.get(s.actors.ben, s.fx.ids.submissions.ben);
        expect(own.id).toBe(s.fx.ids.submissions.ben);
        expect(await refusal(s.store.evidenceFlow.get(s.actors.jade, s.fx.ids.submissions.ben))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await refusal(s.store.evidenceFlow.get(s.actors.daniel, s.fx.ids.submissions.otherSite))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await refusal(s.store.evidenceFlow.get(s.actors.beth, s.fx.ids.submissions.ben))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await refusal(s.store.evidenceFlow.get(s.actors.prov, s.fx.ids.submissions.ben))).toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    describe('review: approve', () => {
      it('creates external Evidence, notifies the person and audits who, when and what', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const approved = await s.store.evidenceFlow.review(s.actors.daniel, sub.id, { kind: 'approve' });
        expect(approved).toMatchObject({
          status: 'approved',
          reviewerId: s.fx.ids.users.daniel,
          reviewedAt: TODAY,
        });
        expect(approved.evidenceId).toBeDefined();
        const created = (await s.store.evidence.list(s.actors.priya, { personId: s.people['mark'] })).find(
          (e) => e.submissionId === sub.id,
        );
        expect(created).toMatchObject({
          id: approved.evidenceId,
          clientId: s.fx.ids.clients.a,
          personId: s.people['mark'],
          requirementId: s.firstAid.id,
          kind: 'external',
          completedAt: sub.completedAt,
          expiresAt: sub.expiresAt,
          approvedBy: s.fx.ids.users.daniel,
          approvedAt: TODAY,
          siteIdAtTime: s.fx.ids.sites.main,
        });
        const events = await s.auditOf('evidence.approved');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actorId: s.fx.ids.users.daniel,
          target: `evidenceSubmission:${sub.id}`,
          at: TODAY,
        });
        const notes = (await s.notificationsOf(s.users['mark'])).filter((n) => n.kind === 'evidenceApproved');
        expect(notes).toHaveLength(1);
      });

      it('turns the requirement current once approved', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        await s.store.evidenceFlow.review(s.actors.daniel, sub.id, { kind: 'approve' });
        const priya = s.actors.priya;
        const status = requirementStatus(
          await s.store.requirements.get(priya, s.firstAid.id),
          await s.store.evidence.list(priya, { personId: s.people['mark'], requirementId: s.firstAid.id }),
          await s.store.evidenceSubmissions.list(priya, { personId: s.people['mark'], requirementId: s.firstAid.id }),
          new Date(TODAY),
          60,
        ).status;
        expect(status).toBe('current');
      });

      it('records the approver corrections to the dates, before and after, in the audit event and the Evidence', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const completedAt = '2026-10-02T09:00:00.000Z';
        const expiresAt = '2029-10-02T09:00:00.000Z';
        const approved = await s.store.evidenceFlow.review(s.actors.daniel, sub.id, {
          kind: 'approve',
          completedAt,
          expiresAt,
        });
        expect(approved).toMatchObject({ completedAt, expiresAt });
        const created = (await s.store.evidence.list(s.actors.priya, { personId: s.people['mark'] })).find(
          (e) => e.submissionId === sub.id,
        );
        expect(created).toMatchObject({ completedAt, expiresAt });
        const event = (await s.auditOf('evidence.approved'))[0]!;
        const before = JSON.stringify(event.before);
        const after = JSON.stringify(event.after);
        expect(before).toContain(sub.completedAt);
        expect(before).toContain(sub.expiresAt!);
        expect(after).toContain(completedAt);
        expect(after).toContain(expiresAt);
      });

      it('refuses an approval whose expiry is before the completion date and writes nothing', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const before = (await s.admin.dumpAll()) as Record<string, unknown[]>;
        expect(
          await ruleOf(
            s.store.evidenceFlow.review(s.actors.daniel, sub.id, {
              kind: 'approve',
              completedAt: '2026-10-02T09:00:00.000Z',
              expiresAt: '2026-10-01T09:00:00.000Z',
            }),
          ),
        ).toBe('invalidDecision');
        const after = (await s.admin.dumpAll()) as Record<string, unknown[]>;
        expect(after['evidence']).toHaveLength(before['evidence']!.length);
        expect(after['audit']).toHaveLength(before['audit']!.length);
      });

      it('takes the time from the actor context, not the real time', async () => {
        const s = await setup();
        const later = new Date(Date.parse(TODAY) + 3 * DAY).toISOString();
        const daniel = client(s.fx.ids.users.daniel, s.fx.ids.clients.a, later);
        await s.store.evidenceFlow.review(daniel, s.fx.ids.submissions.ben, { kind: 'approve' });
        const created = (await s.store.evidence.list(daniel, { personId: s.fx.ids.people.ben })).find(
          (e) => e.submissionId === s.fx.ids.submissions.ben,
        );
        expect(created!.approvedAt).toBe(later);
        expect((await s.auditOf('evidence.approved')).map((e) => e.at)).toEqual([later]);
      });
    });

    describe('review: better copy, reject and resubmit', () => {
      it('needs a note of 1 to 300 characters for Ask for a better copy', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const review = (note: string) =>
          s.store.evidenceFlow.review(s.actors.daniel, sub.id, { kind: 'betterCopy', note });
        expect(await ruleOf(review('   '))).toBe('invalidDecision');
        expect(await ruleOf(review('x'.repeat(301)))).toBe('invalidDecision');
        const done = await review('The photo is cut off at the date.');
        expect(done).toMatchObject({
          status: 'needsBetterCopy',
          decisionNote: 'The photo is cut off at the date.',
          reviewerId: s.fx.ids.users.daniel,
        });
        expect(
          (await s.store.evidence.list(s.actors.priya, { personId: s.people['mark'] })).some(
            (e) => e.submissionId === sub.id,
          ),
        ).toBe(false);
        expect((await s.notificationsOf(s.users['mark'])).filter((n) => n.kind === 'evidenceBetterCopy')).toHaveLength(
          1,
        );
        expect(await s.auditOf('evidence.betterCopy')).toHaveLength(1);
      });

      it('lets the person resubmit the same record, which goes back to waiting with the decision cleared', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        await s.store.evidenceFlow.review(s.actors.daniel, sub.id, { kind: 'betterCopy', note: 'Please retake it.' });
        const newFile = await s.cert(s.actors.mark);
        const again = await s.store.evidenceFlow.resubmit(s.actors.mark, sub.id, {
          fileAttachmentId: newFile,
          providerName: 'Test First Aid Ltd (corrected)',
          completedAt: sub.completedAt,
          expiresAt: sub.expiresAt!,
        });
        expect(again).toMatchObject({
          id: sub.id,
          status: 'awaitingCheck',
          fileAttachmentId: newFile,
          providerName: 'Test First Aid Ltd (corrected)',
        });
        expect(again.reviewerId).toBeUndefined();
        expect(again.decisionNote).toBeUndefined();
        const mine = (await dump<EvidenceSubmission>(s.admin, 'evidenceSubmissions')).filter(
          (x) => x.personId === s.people['mark'] && x.requirementId === s.firstAid.id,
        );
        expect(mine).toHaveLength(1);
        expect(await s.auditOf('evidence.resubmitted')).toHaveLength(1);
      });

      it('needs a reason from the list for Reject, keeps the note and notifies the person', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const review = (decision: ReviewInput) => s.store.evidenceFlow.review(s.actors.daniel, sub.id, decision);
        expect(await ruleOf(review({ kind: 'reject', reason: 'madeUp' as unknown as 'other' }))).toBe(
          'invalidDecision',
        );
        expect(await ruleOf(review({ kind: 'reject', reason: 'other', note: 'x'.repeat(301) }))).toBe(
          'invalidDecision',
        );
        const done = await review({ kind: 'reject', reason: 'nameMismatch', note: 'Name is different.' });
        expect(done).toMatchObject({
          status: 'rejected',
          rejectionReason: 'nameMismatch',
          decisionNote: 'Name is different.',
        });
        expect((await s.notificationsOf(s.users['mark'])).filter((n) => n.kind === 'evidenceRejected')).toHaveLength(1);
        expect(await s.auditOf('evidence.rejected')).toHaveLength(1);
      });

      it('lets the person resubmit after a rejection', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        await s.store.evidenceFlow.review(s.actors.daniel, sub.id, { kind: 'reject', reason: 'unreadable' });
        const again = await s.store.evidenceFlow.resubmit(s.actors.mark, sub.id, {
          fileAttachmentId: await s.cert(s.actors.mark),
          providerName: sub.providerName,
          completedAt: sub.completedAt,
          expiresAt: sub.expiresAt!,
        });
        expect(again.status).toBe('awaitingCheck');
        expect(again.rejectionReason).toBeUndefined();
      });

      it('refuses resubmitting an approved or waiting submission, and someone else resubmitting', async () => {
        const s = await setup();
        const sub = await s.markSubmits();
        const input = async (ctx: ActorContext): Promise<ResubmitInput> => ({
          fileAttachmentId: await s.cert(ctx),
          providerName: sub.providerName,
          completedAt: sub.completedAt,
          expiresAt: sub.expiresAt!,
        });
        expect(await ruleOf(s.store.evidenceFlow.resubmit(s.actors.mark, sub.id, await input(s.actors.mark)))).toBe(
          'notAwaitingCheck',
        );
        await refusedAsUnseenOrForbidden(
          s.store.evidenceFlow.resubmit(s.actors.jade, sub.id, await input(s.actors.jade)),
        );
        await s.store.evidenceFlow.review(s.actors.daniel, sub.id, { kind: 'approve' });
        expect(await ruleOf(s.store.evidenceFlow.resubmit(s.actors.mark, sub.id, await input(s.actors.mark)))).toBe(
          'notAwaitingCheck',
        );
      });
    });

    describe('withdraw', () => {
      it('lets the person withdraw a waiting submission, after which it cannot be reviewed', async () => {
        const s = await setup();
        const withdrawn = await s.store.evidenceFlow.withdraw(s.actors.ben, s.fx.ids.submissions.ben);
        expect(withdrawn.status).toBe('withdrawn');
        expect(await s.auditOf('evidence.withdrawn')).toHaveLength(1);
        expect(
          await ruleOf(s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.ben, { kind: 'approve' })),
        ).toBe('notAwaitingCheck');
      });

      it('refuses withdrawing someone else submission or one that was decided', async () => {
        const s = await setup();
        await refusedAsUnseenOrForbidden(s.store.evidenceFlow.withdraw(s.actors.jade, s.fx.ids.submissions.ben));
        await s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.ben, { kind: 'approve' });
        const error = await refusal(s.store.evidenceFlow.withdraw(s.actors.ben, s.fx.ids.submissions.ben));
        expect(error).toBeInstanceOf(DataError);
        expect((await s.store.evidenceFlow.get(s.actors.ben, s.fx.ids.submissions.ben)).status).toBe('approved');
      });
    });

    describe('review: who may decide', () => {
      it('refuses approving a submission the approver uploaded', async () => {
        const s = await setup();
        expect(
          await reasonOf(
            s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.byDaniel, { kind: 'approve' }),
          ),
        ).toBe('ownUpload');
      });

      it('refuses approving evidence about the approver', async () => {
        const s = await setup();
        expect(
          await reasonOf(
            s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.aboutDaniel, { kind: 'approve' }),
          ),
        ).toBe('aboutSelf');
      });

      it('refuses a decision on a submission outside the approver scope', async () => {
        const s = await setup();
        await refusedAsUnseenOrForbidden(
          s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.otherSite, { kind: 'approve' }),
        );
        const stored = (await dump<EvidenceSubmission>(s.admin, 'evidenceSubmissions')).find(
          (x) => x.id === s.fx.ids.submissions.otherSite,
        );
        expect(stored!.status).toBe('awaitingCheck');
      });

      it('writes neither Evidence nor audit when a decision is refused', async () => {
        const s = await setup();
        await refusal(s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.byDaniel, { kind: 'approve' }));
        const after = (await s.admin.dumpAll()) as Record<string, unknown[]>;
        expect(after['audit']).toHaveLength(0);
        expect(after['evidence']).toHaveLength(s.fx.data.evidence.length);
      });

      it('refuses staff, a role without evidence.approve, the provider and another client', async () => {
        const s = await setup();
        const target = s.fx.ids.submissions.ben;
        expect(await reasonOf(s.store.evidenceFlow.review(s.actors.ben, target, { kind: 'approve' }))).toBe(
          'permission',
        );
        expect(await reasonOf(s.store.evidenceFlow.review(s.actors.rory, target, { kind: 'approve' }))).toBe(
          'permission',
        );
        expect(await reasonOf(s.store.evidenceFlow.review(s.actors.prov, target, { kind: 'approve' }))).toBe(
          'permission',
        );
        await refusedAsUnseenOrForbidden(s.store.evidenceFlow.review(s.actors.beth, target, { kind: 'approve' }));
        expect((await s.store.evidenceFlow.get(s.actors.priya, target)).status).toBe('awaitingCheck');
      });

      it('refuses a decision on a submission that is no longer waiting', async () => {
        const s = await setup();
        await s.store.evidenceFlow.review(s.actors.daniel, s.fx.ids.submissions.ben, { kind: 'approve' });
        expect(
          await ruleOf(
            s.store.evidenceFlow.review(s.actors.priya, s.fx.ids.submissions.ben, { kind: 'reject', reason: 'other' }),
          ),
        ).toBe('notAwaitingCheck');
      });

      it('refuses approval in a Read-only account', async () => {
        const s = await setup();
        const ro = s.fx.ids.stateClients.readOnly;
        const subId = freshId(9100);
        await s.admin.bulkPut('evidenceSubmissions', [
          {
            id: subId,
            clientId: ro.client.id,
            siteId: ro.site.id,
            personId: ro.staffPerson.id,
            requirementId: s.fx.ids.requirementId,
            uploadedBy: ro.staff.id,
            fileAttachmentId: freshId(9101),
            providerName: 'Test Training Ltd',
            completedAt: '2026-10-01T09:00:00.000Z',
            status: 'awaitingCheck',
            createdAt: '2026-10-15T09:00:00.000Z',
          } satisfies EvidenceSubmission,
        ]);
        const owner = client(ro.owner.id, ro.client.id);
        expect(await refusal(s.store.evidenceFlow.review(owner, subId, { kind: 'approve' }))).toBeInstanceOf(
          AccountStateError,
        );
        expect(
          (await dump<EvidenceSubmission>(s.admin, 'evidenceSubmissions')).find((x) => x.id === subId)!.status,
        ).toBe('awaitingCheck');
      });
    });

    describe('the M0 direct put path is internal only', () => {
      it('refuses a direct put by staff, admins and the provider, creating or changing', async () => {
        const s = await setup();
        const existing = await s.store.evidenceSubmissions.get(s.actors.priya, s.fx.ids.submissions.ben);
        const attempts: [string, ActorContext, EvidenceSubmission][] = [
          ['staff change', s.actors.ben, { ...existing, providerName: 'Changed Ltd' }],
          ['staff create', s.actors.ben, { ...existing, id: freshId(9200) }],
          ['staff withdraw', s.actors.ben, { ...existing, status: 'withdrawn' }],
          ['supervisor approve', s.actors.daniel, { ...existing, status: 'approved' }],
          ['owner approve', s.actors.priya, { ...existing, status: 'approved' }],
          ['owner create', s.actors.priya, { ...existing, id: freshId(9201) }],
          ['provider', s.actors.prov, { ...existing, id: freshId(9202) }],
        ];
        for (const [label, ctx, record] of attempts) {
          expect(await reasonOf(s.store.evidenceSubmissions.put(ctx, record)), label).toBe('permission');
        }
        const after = await dump<EvidenceSubmission>(s.admin, 'evidenceSubmissions');
        expect(after).toHaveLength(s.fx.data.evidenceSubmissions.length);
        expect(after.find((x) => x.id === existing.id)).toEqual(existing);
        expect(await dump(s.admin, 'audit')).toHaveLength(0);
      });
    });
  });
}
