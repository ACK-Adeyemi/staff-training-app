// External evidence flow (M3 chunk 9, "Data D"; plan assumptions 22 and 23). Submissions are created, resubmitted,
// withdrawn and decided only here: the generic put on evidenceSubmissions is refused for every actor. Each write is
// ONE batch with a slim audit event (ids, statuses and the corrected dates; never notes, names or file ids).
// Business rules live in @sta/domain (evidence/flow.ts, permissions/engine.ts); this file only calls them.
import {
  OWNER_KEYS,
  canApproveEvidence,
  expiryFor,
  isAssignmentActive,
  requirementApplies,
  reviewTransition,
  type Evidence,
  type EvidenceSubmission,
  type Notification,
  type Person,
  type Requirement,
  type Role,
  type RoleAssignment,
  type Site,
  type Target,
  type UserAccount,
  type Attachment,
} from '@sta/domain';
import { validate, type RawBackend, type WriteOp } from './backend';
import { canSeeAttachment } from './authoringOps';
import { put } from './ops';
import {
  audit,
  beginCall,
  canAny,
  canReadRecord,
  canReadStore,
  checkAccountState,
  forbid,
  holds,
  type Call,
} from './policy';
import {
  NotFoundError,
  RuleError,
  type ActorContext,
  type EvidenceFlowService,
  type EvidenceReviewInput,
  type StoreOptions,
} from './types';

const NAME_MAX = 100;
const REF_MAX = 60;
const OPEN: readonly EvidenceSubmission['status'][] = ['awaitingCheck', 'needsBetterCopy', 'rejected'];

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const siteTarget = (s: { clientId: string; siteId: string }): Target => ({ clientId: s.clientId, siteIds: [s.siteId] });

type Details = { providerName: string; completedAt: string; expiresAt?: string; certificateRef?: string };

export function createEvidenceOperations(backend: RawBackend, options: StoreOptions): EvidenceFlowService {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);

  /** A client or staff actor of a client. The provider never touches evidence. */
  async function actorCall(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'provider') return forbid('permission');
    return call;
  }

  /** The stored submission in the actor's own client, or NotFound. */
  async function ownClientSubmission(call: Call, id: string): Promise<EvidenceSubmission> {
    const sub = await call.find<EvidenceSubmission>('evidenceSubmissions', id);
    if (!sub || sub.clientId !== call.clientId) throw new NotFoundError();
    return sub;
  }

  /** The person this submission is for, or the person who uploaded it. */
  const isOwner = (call: Call, sub: EvidenceSubmission): boolean =>
    sub.uploadedBy === call.actor.user.id ||
    (call.actor.user.personId !== undefined && sub.personId === call.actor.user.personId);

  /** A submission the actor may see, as evidenceSubmissions.get shows it (NotFound otherwise). */
  async function visibleSubmission(call: Call, id: string): Promise<EvidenceSubmission> {
    const sub = await ownClientSubmission(call, id);
    if (
      !(await canReadStore(call, 'evidenceSubmissions')) ||
      !(await canReadRecord(call, 'evidenceSubmissions', sub))
    ) {
      throw new NotFoundError();
    }
    return sub;
  }

  /** Checks the entered details and the dates; returns the fields to store. Anything wrong is invalidSubmission. */
  function checkDetails(requirement: Requirement, input: Details): Details {
    const providerName = typeof input.providerName === 'string' ? input.providerName.trim() : '';
    if (providerName === '' || providerName.length > NAME_MAX) throw new RuleError('invalidSubmission');
    const ref = typeof input.certificateRef === 'string' ? input.certificateRef.trim() : '';
    if (ref.length > REF_MAX) throw new RuleError('invalidSubmission');
    if (!isIso(input.completedAt)) throw new RuleError('invalidSubmission');
    if (input.expiresAt !== undefined && !isIso(input.expiresAt)) throw new RuleError('invalidSubmission');
    const expiry = expiryFor(requirement, input.completedAt, input.expiresAt);
    if (!expiry.ok) throw new RuleError('invalidSubmission');
    return {
      providerName,
      completedAt: input.completedAt,
      ...(expiry.expiresAt !== undefined ? { expiresAt: expiry.expiresAt } : {}),
      ...(ref !== '' ? { certificateRef: ref } : {}),
    };
  }

  /** The file must be a certificate the actor can read, for the same person. Otherwise it is NotFound. */
  async function checkFile(call: Call, fileId: unknown, personId: string): Promise<void> {
    const file = typeof fileId === 'string' ? await call.find<Attachment>('attachments', fileId) : undefined;
    if (!file || !canSeeAttachment(call, file)) throw new NotFoundError();
    if (file.kind !== 'file' || file.purpose !== 'certificate' || file.personId !== personId) throw new NotFoundError();
  }

  async function requirementFor(call: Call, requirementId: unknown): Promise<Requirement> {
    const requirement =
      typeof requirementId === 'string' ? await call.find<Requirement>('requirements', requirementId) : undefined;
    if (!requirement || (requirement.clientId !== undefined && requirement.clientId !== call.clientId)) {
      throw new NotFoundError();
    }
    return requirement;
  }

  /** The staff user of a person, for the in-app notification. */
  async function staffUserOf(call: Call, personId: string): Promise<UserAccount | undefined> {
    return (await call.all<UserAccount>('users')).find(
      (u) => u.side === 'staff' && u.clientId === call.clientId && u.personId === personId && u.status === 'active',
    );
  }

  async function notifyPerson(call: Call, sub: EvidenceSubmission, kind: string): Promise<WriteOp[]> {
    const user = await staffUserOf(call, sub.personId);
    if (!user) return [];
    const requirement = await call.find<Requirement>('requirements', sub.requirementId);
    const note: Notification = {
      id: call.newId(),
      clientId: sub.clientId,
      userId: user.id,
      kind,
      params: { requirementName: requirement?.name ?? '' },
      createdAt: call.actor.ctx.now,
    };
    return [put('notifications', note)];
  }

  return {
    async submit(ctx, input) {
      const call = await actorCall(ctx);
      const clientId = call.clientId as string;
      const own = call.actor.user.personId;
      const personId = input.personId ?? own;
      if (personId === undefined) throw new RuleError('invalidSubmission');
      const person = (await call.all<Person>('people')).find((p) => p.id === personId && p.clientId === clientId);
      if (!person) throw new NotFoundError();
      const sites = [person.primarySiteId, ...person.additionalSiteIds];
      if (personId !== own) {
        if (call.side !== 'client' || !holds(call, ['evidence.uploadForOthers'])) return forbid('permission');
        if (!canAny(call, ['evidence.uploadForOthers'], { clientId, siteIds: sites }, 'write')) {
          return forbid('outOfScope');
        }
      }
      const requirement = await requirementFor(call, input.requirementId);
      if (!requirement.acceptsExternal) throw new RuleError('notExternal');
      const site = (await call.all<Site>('sites')).find((s) => s.id === person.primarySiteId);
      if (!site || !requirementApplies(requirement, person, site)) throw new RuleError('notApplicable');
      const details = checkDetails(requirement, input);
      await checkFile(call, input.fileAttachmentId, personId);
      checkAccountState(call, false);
      const open = (await call.all<EvidenceSubmission>('evidenceSubmissions')).some(
        (s) => s.personId === personId && s.requirementId === requirement.id && OPEN.includes(s.status),
      );
      if (open) throw new RuleError('openSubmission');

      const sub = validate('evidenceSubmissions', {
        id: call.newId(),
        clientId,
        siteId: person.primarySiteId,
        personId,
        requirementId: requirement.id,
        uploadedBy: call.actor.user.id,
        fileAttachmentId: input.fileAttachmentId,
        ...details,
        status: 'awaitingCheck',
        createdAt: ctx.now,
      }) as EvidenceSubmission;
      await apply([
        put('evidenceSubmissions', sub),
        audit(call, clientId, 'evidence.submitted', `evidenceSubmission:${sub.id}`, undefined, {
          submissionId: sub.id,
          requirementId: sub.requirementId,
          status: 'awaitingCheck',
        }),
      ]);
      return structuredClone(sub);
    },

    async resubmit(ctx, id, input) {
      const call = await actorCall(ctx);
      const sub = await visibleSubmission(call, id);
      if (!isOwner(call, sub)) return forbid('permission');
      if (sub.status !== 'needsBetterCopy' && sub.status !== 'rejected') throw new RuleError('notAwaitingCheck');
      const requirement = await requirementFor(call, sub.requirementId);
      const details = checkDetails(requirement, input);
      await checkFile(call, input.fileAttachmentId, sub.personId);
      checkAccountState(call, false);
      const next = validate('evidenceSubmissions', {
        id: sub.id,
        clientId: sub.clientId,
        siteId: sub.siteId,
        personId: sub.personId,
        requirementId: sub.requirementId,
        uploadedBy: sub.uploadedBy,
        fileAttachmentId: input.fileAttachmentId,
        ...details,
        status: 'awaitingCheck',
        createdAt: sub.createdAt,
      }) as EvidenceSubmission;
      await apply([
        put('evidenceSubmissions', next),
        audit(
          call,
          sub.clientId,
          'evidence.resubmitted',
          `evidenceSubmission:${sub.id}`,
          { submissionId: sub.id, status: sub.status },
          { submissionId: sub.id, status: 'awaitingCheck' },
        ),
      ]);
      return structuredClone(next);
    },

    async withdraw(ctx, id) {
      const call = await actorCall(ctx);
      const sub = await visibleSubmission(call, id);
      if (!isOwner(call, sub)) return forbid('permission');
      if (sub.status !== 'awaitingCheck' && sub.status !== 'needsBetterCopy') throw new RuleError('notAwaitingCheck');
      checkAccountState(call, false);
      const next: EvidenceSubmission = { ...sub, status: 'withdrawn' };
      await apply([
        put('evidenceSubmissions', next),
        audit(
          call,
          sub.clientId,
          'evidence.withdrawn',
          `evidenceSubmission:${sub.id}`,
          { submissionId: sub.id, status: sub.status },
          { submissionId: sub.id, status: 'withdrawn' },
        ),
      ]);
      return structuredClone(next);
    },

    async queue(ctx, filter) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client' || !(await canReadStore(call, 'evidenceSubmissions'))) return forbid('permission');
      const out: EvidenceSubmission[] = [];
      for (const s of await call.all<EvidenceSubmission>('evidenceSubmissions')) {
        if (s.status !== 'awaitingCheck' || s.clientId !== call.clientId) continue;
        if (filter?.siteId !== undefined && s.siteId !== filter.siteId) continue;
        if (filter?.requirementId !== undefined && s.requirementId !== filter.requirementId) continue;
        if (await canReadRecord(call, 'evidenceSubmissions', s)) out.push(s);
      }
      out.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
      return structuredClone(out);
    },

    async get(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      return structuredClone(await visibleSubmission(call, id));
    },

    async review(ctx, id, decision: EvidenceReviewInput) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client') return forbid('permission');
      const sub = await ownClientSubmission(call, id);
      if (!holds(call, ['evidence.approve'])) return forbid('permission');
      if (!canAny(call, ['evidence.approve'], siteTarget(sub), 'write')) return forbid('outOfScope');
      checkAccountState(call, false);
      const { actor } = call;
      const kind = (decision as { kind?: unknown } | null)?.kind;
      if (kind !== 'approve' && kind !== 'betterCopy' && kind !== 'reject') throw new RuleError('invalidDecision');
      const result = reviewTransition(sub, { ...decision, reviewerId: actor.user.id }, new Date(ctx.now));
      if (!result.ok) throw new RuleError(result.error === 'notAwaitingCheck' ? 'notAwaitingCheck' : 'invalidDecision');
      const reviewed = validate('evidenceSubmissions', {
        ...result.submission,
        reviewedAt: ctx.now,
      }) as EvidenceSubmission;

      if (kind !== 'approve') {
        const action = kind === 'betterCopy' ? 'evidence.betterCopy' : 'evidence.rejected';
        await apply([
          put('evidenceSubmissions', reviewed),
          audit(
            call,
            sub.clientId,
            action,
            `evidenceSubmission:${sub.id}`,
            { submissionId: sub.id, status: sub.status },
            {
              submissionId: sub.id,
              status: reviewed.status,
              ...(reviewed.rejectionReason !== undefined ? { reason: reviewed.rejectionReason } : {}),
            },
          ),
          ...(await notifyPerson(call, sub, kind === 'betterCopy' ? 'evidenceBetterCopy' : 'evidenceRejected')),
        ]);
        return structuredClone(reviewed);
      }

      // Approval: the same checks as ever (own upload, about oneself, single-admin rule), then Evidence.
      const assignments = await call.all<RoleAssignment>('roleAssignments');
      const roles = await call.all<Role>('roles');
      const users = await call.all<UserAccount>('users');
      const activeUsers = new Set(
        users
          .filter((u) => u.clientId === sub.clientId && u.side === 'client' && u.status === 'active')
          .map((u) => u.id),
      );
      const activeAdmins = new Set(
        assignments.filter((a) => activeUsers.has(a.userId) && isAssignmentActive(a, actor.now)).map((a) => a.userId),
      );
      const isAccountOwner = assignments.some(
        (a) =>
          a.userId === actor.user.id &&
          isAssignmentActive(a, actor.now) &&
          a.roleIds.some((roleId) => {
            const r = roles.find((x) => x.id === roleId);
            return r?.system === true && r.systemKey === OWNER_KEYS.client;
          }),
      );
      const allowed = canApproveEvidence(
        { userId: actor.user.id, personId: actor.user.personId ?? '', permissions: actor.perms, isAccountOwner },
        { clientId: sub.clientId, siteId: sub.siteId, personId: sub.personId, uploadedBy: sub.uploadedBy },
        {
          adminCount: activeAdmins.size,
          clientSettings: { allowSelfApproval: actor.client?.settings.allowSelfApproval ?? false },
        },
      );
      if (!allowed.allowed) {
        return forbid(allowed.reason === 'noPermission' || !allowed.reason ? 'permission' : allowed.reason);
      }

      const evidenceId = call.newId();
      const approved: EvidenceSubmission = { ...reviewed, evidenceId };
      const evidence: Evidence = {
        id: evidenceId,
        clientId: sub.clientId,
        personId: sub.personId,
        requirementId: sub.requirementId,
        kind: 'external',
        completedAt: approved.completedAt,
        ...(approved.expiresAt !== undefined ? { expiresAt: approved.expiresAt } : {}),
        attachmentId: sub.fileAttachmentId,
        siteIdAtTime: sub.siteId,
        submissionId: sub.id,
        approvedBy: actor.user.id,
        approvedAt: ctx.now,
        ...(allowed.selfApproved ? { selfApproved: true } : {}),
      };
      const { changes } = result;
      await apply([
        put('evidenceSubmissions', approved),
        put('evidence', evidence),
        audit(
          call,
          sub.clientId,
          'evidence.approved',
          `evidenceSubmission:${sub.id}`,
          {
            submissionId: sub.id,
            status: sub.status,
            ...(changes.completedAt ? { completedAt: changes.completedAt.before } : {}),
            ...(changes.expiresAt?.before !== undefined ? { expiresAt: changes.expiresAt.before } : {}),
          },
          {
            submissionId: sub.id,
            status: 'approved',
            evidenceId,
            ...(changes.completedAt ? { completedAt: changes.completedAt.after } : {}),
            ...(changes.expiresAt ? { expiresAt: changes.expiresAt.after } : {}),
          },
          allowed.selfApproved ? 'selfApproved' : undefined,
        ),
        ...(await notifyPerson(call, sub, 'evidenceApproved')),
      ]);
      return structuredClone(approved);
    },
  };
}
