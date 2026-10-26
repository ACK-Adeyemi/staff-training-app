// Operations for exports, erase and retention (M3 chunk 10b; plan assumptions 48 to 50). The app zips what an export
// returns. Business rules live in @sta/domain (scheduledDeletions, retentionPolicySchema, formerlyNote, the step-up
// code); this file authorises, gathers the actor's scope and writes in one batch.
import {
  defaultDunningPolicy,
  demoTwoFactorCode,
  nextTransition,
  formerlyNote,
  retentionPolicySchema,
  scheduledDeletions,
  type Assignment,
  type Attachment,
  type Attempt,
  type AutoAssignRule,
  type Client,
  type Competition,
  type Evidence,
  type EvidenceSubmission,
  type LearningEvent,
  type Module,
  type Note,
  type Notification,
  type Person,
  type ReminderLog,
  type Requirement,
  type RoleAssignment,
  type Site,
  type Subscription,
  type Team,
  type Ticket,
  type TicketMessage,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { newPersonPrefs } from './rulesOps';
import { audit, beginCall, canAny, checkAccountState, forbid, holds, type Call } from './policy';
import {
  AccountStateError,
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type ExportBundle,
  type ExportsService,
  type RetentionService,
  type StoreOptions,
  type DataStore,
} from './types';

export type DataRightsOperations = {
  exports: ExportsService;
  retention: RetentionService;
  erase: DataStore['people']['erase'];
};

const REMOVED_TEXT = 'Removed with the person’s record.';
const RETENTION_KEYS = [
  'leaverRecordsMonths',
  'notesAfterLeaveDays',
  'eventDetailMonths',
  'feedbackMonths',
  'ticketMonthsAfterClose',
  'attachmentDaysAfterClose',
  'trialDeleteDays',
] as const;

/** The step-up code (simulated, like the two-step sign-in code). Blank is "needed"; anything else wrong is "wrong". */
function checkStepUp(code: unknown): void {
  const given = typeof code === 'string' ? code.trim() : '';
  if (given === '') throw new RuleError('stepUpRequired');
  if (given !== demoTwoFactorCode) throw new RuleError('wrongCode');
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createDataRightsOperations(backend: RawBackend, options: StoreOptions): DataRightsOperations {
  async function clientCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client' || !holds(call, [permission])) return forbid('permission');
    return call;
  }

  /** Like clientCall, but a Deleted account is refused as `exports` (every other state may export). */
  async function exportCall(ctx: ActorContext): Promise<Call> {
    try {
      return await clientCall(ctx, 'reports.export');
    } catch (error) {
      if (error instanceof AccountStateError && error.state === 'deleted')
        throw new AccountStateError(error.state, 'exports');
      throw error;
    }
  }

  const mine = async <T extends { clientId?: string | undefined }>(
    call: Call,
    store: Parameters<Call['all']>[0],
  ): Promise<T[]> => (await call.all<T>(store)).filter((r) => r.clientId === call.clientId);

  /** Builds the bundle for `people` (already limited to the actor's scope). */
  async function bundle(
    call: Call,
    people: Person[],
    extent: { sites: Site[]; whole: boolean; siteIds: ReadonlySet<string> },
  ): Promise<ExportBundle> {
    const clientId = call.clientId as string;
    const client = call.actor.client as Client;
    const ids = new Set(people.map((p) => p.id));
    const ofPeople = <T extends { personId: string }>(rows: T[]): T[] => rows.filter((r) => ids.has(r.personId));
    const teamIds = new Set(people.flatMap((p) => p.teamIds));
    const siteScoped = <T extends { id: string; siteIds?: string[] | undefined }>(rows: T[]): T[] =>
      extent.whole
        ? rows
        : rows.filter(
            (r) => r.siteIds !== undefined && r.siteIds.length > 0 && r.siteIds.every((s) => extent.siteIds.has(s)),
          );
    const stripped = people.map((p) => {
      const copy: Partial<Person> = { ...p };
      delete copy.prefs;
      return copy as Omit<Person, 'prefs'>;
    });
    return structuredClone({
      exportedAt: call.actor.ctx.now,
      people: stripped.sort(byId),
      evidence: ofPeople(await mine<Evidence>(call, 'evidence')).sort(byId),
      evidenceSubmissions: ofPeople(await mine<EvidenceSubmission>(call, 'evidenceSubmissions')).sort(byId),
      assignments: ofPeople(await mine<Assignment>(call, 'assignments')).sort(byId),
      attempts: ofPeople(await mine<Attempt>(call, 'attempts')).sort(byId),
      sites: extent.sites.sort(byId),
      teams: (await mine<Team>(call, 'teams')).filter((t) => extent.whole || teamIds.has(t.id)).sort(byId),
      requirements: (await call.all<Requirement>('requirements'))
        .filter((r) => r.clientId === undefined || r.clientId === clientId)
        .sort(byId),
      modules: (await call.all<Module>('modules'))
        .filter((m) => m.owner !== 'provider' && m.owner.clientId === clientId)
        .sort(byId),
      rules: extent.whole ? (await mine<AutoAssignRule>(call, 'autoAssignRules')).sort(byId) : [],
      competitions: siteScoped(await mine<Competition>(call, 'competitions')).sort(byId),
      formerlyNote: formerlyNote(client, call.actor.now),
    });
  }

  /** The people and sites the actor may export: the whole client, or only the sites their scope reaches. */
  async function reach(call: Call) {
    const clientId = call.clientId as string;
    const sites = await mine<Site>(call, 'sites');
    const whole = canAny(call, ['reports.export'], { clientId }, 'read');
    const readable = sites.filter(
      (s) => whole || canAny(call, ['reports.export'], { clientId, siteIds: [s.id] }, 'read'),
    );
    const siteIds = new Set(readable.map((s) => s.id));
    if (!whole && siteIds.size === 0) return forbid('permission');
    return { whole, sites: readable, siteIds };
  }

  const exports: ExportsService = {
    async clientData(ctx, code) {
      const call = await exportCall(ctx);
      const extent = await reach(call);
      checkStepUp(code);
      const people = (await mine<Person>(call, 'people')).filter(
        (p) => extent.whole || extent.siteIds.has(p.primarySiteId),
      );
      const result = await bundle(call, people, extent);
      await backend.apply([
        audit(call, call.clientId, 'exports.clientData', `client:${call.clientId as string}`, undefined, {
          people: result.people.length,
          scope: extent.whole ? 'organisation' : 'sites',
        }),
      ]);
      return result;
    },

    async person(ctx, personId, code) {
      const call = await exportCall(ctx);
      const extent = await reach(call);
      const person = (await mine<Person>(call, 'people')).find((p) => p.id === personId);
      if (!person) throw new NotFoundError();
      if (!extent.siteIds.has(person.primarySiteId)) return forbid('outOfScope');
      checkStepUp(code);
      const own = extent.sites.filter((s) => s.id === person.primarySiteId);
      const result = await bundle(call, [person], {
        sites: own,
        whole: false,
        siteIds: new Set([person.primarySiteId]),
      });
      result.rules = [];
      result.competitions = [];
      result.modules = [];
      await backend.apply([
        audit(call, call.clientId, 'exports.person', `person:${personId}`, undefined, { personId }),
      ]);
      return result;
    },
  };

  const erase: DataRightsOperations['erase'] = async (ctx, id, input) => {
    const call = await clientCall(ctx, 'staff.delete');
    const clientId = call.clientId as string;
    const person = (await mine<Person>(call, 'people')).find((p) => p.id === id);
    if (!person) throw new NotFoundError();
    if (
      !canAny(
        call,
        ['staff.delete'],
        { clientId, siteIds: [person.primarySiteId, ...person.additionalSiteIds] },
        'write',
      )
    ) {
      return forbid('outOfScope');
    }
    const mode: string = input.mode;
    if (mode !== 'anonymise' && mode !== 'deleteEverything') {
      throw new ValidationError(['mode: choose anonymise or deleteEverything']);
    }
    checkAccountState(call, false);
    checkStepUp(input.code);
    const typed = typeof input.confirmName === 'string' ? input.confirmName.trim() : '';
    if (typed !== `${person.firstName} ${person.lastName}`) throw new RuleError('invalidName');

    const del = (store: WriteOp['store'], key: string): WriteOp => ({ type: 'delete', store, key });
    const ops: WriteOp[] = [];
    const users = (await mine<UserAccount>(call, 'users')).filter((u) => u.personId === id);
    const userIds = new Set(users.map((u) => u.id));
    const shell: Person = {
      ...person,
      firstName: 'Former staff member',
      lastName: id.slice(-6),
      prefs: newPersonPrefs(),
      status: 'archived',
      leftDate: person.leftDate ?? call.actor.ctx.now,
    };
    delete shell.nickname;
    ops.push({ type: 'put', store: 'people', key: id, record: shell });
    for (const n of (await mine<Note>(call, 'notes')).filter((x) => x.personId === id)) ops.push(del('notes', n.id));
    for (const u of users) ops.push(del('users', u.id));
    for (const a of (await call.all<RoleAssignment>('roleAssignments')).filter((x) => userIds.has(x.userId))) {
      ops.push(del('roleAssignments', a.id));
    }
    for (const n of (await mine<Notification>(call, 'notifications')).filter((x) => userIds.has(x.userId))) {
      ops.push(del('notifications', n.id));
    }
    for (const l of (await mine<ReminderLog>(call, 'reminderLog')).filter((x) => x.personId === id)) {
      ops.push(del('reminderLog', l.key));
    }
    // Free text the person wrote in support tickets goes; the tickets themselves stay for the support record.
    for (const t of (await mine<Ticket>(call, 'tickets')).filter((x) => userIds.has(x.raisedBy))) {
      ops.push({
        type: 'put',
        store: 'tickets',
        key: t.id,
        record: { ...t, title: REMOVED_TEXT, description: REMOVED_TEXT, context: {} },
      });
    }
    const ticketIds = new Set((await mine<Ticket>(call, 'tickets')).map((t) => t.id));
    for (const m of (await call.all<TicketMessage>('ticketMessages')).filter(
      (x) => ticketIds.has(x.ticketId) && userIds.has(x.authorId),
    )) {
      ops.push({ type: 'put', store: 'ticketMessages', key: m.id, record: { ...m, body: REMOVED_TEXT } });
    }
    // Rejected certificate files, and files replaced by a resubmission (no submission or Evidence points at them), go
    // in both modes. Approved files stay with their Evidence under Anonymise.
    {
      const submissions = await mine<EvidenceSubmission>(call, 'evidenceSubmissions');
      const evidenceRows = await mine<Evidence>(call, 'evidence');
      const inUse = new Set<string>();
      for (const sub of submissions) if (sub.status !== 'rejected') inUse.add(sub.fileAttachmentId);
      for (const e of evidenceRows) if (e.attachmentId) inUse.add(e.attachmentId);
      for (const f of (await mine<Attachment>(call, 'attachments')).filter(
        (x) => x.kind === 'file' && x.purpose === 'certificate' && x.personId === id && !inUse.has(x.id),
      )) {
        ops.push(del('attachments', f.id));
      }
    }
    if (input.mode === 'deleteEverything') {
      const own = <T extends { personId: string; id: string }>(rows: T[]) => rows.filter((r) => r.personId === id);
      for (const r of own(await mine<Evidence>(call, 'evidence'))) ops.push(del('evidence', r.id));
      for (const r of own(await mine<Attempt>(call, 'attempts'))) ops.push(del('attempts', r.id));
      for (const r of own(await mine<LearningEvent>(call, 'learningEvents'))) ops.push(del('learningEvents', r.id));
      for (const r of own(await mine<EvidenceSubmission>(call, 'evidenceSubmissions'))) {
        ops.push(del('evidenceSubmissions', r.id));
      }
      for (const f of (await mine<Attachment>(call, 'attachments')).filter(
        (x) => x.kind === 'file' && x.personId === id,
      )) {
        ops.push(del('attachments', f.id));
      }
    }
    ops.push(audit(call, clientId, 'people.erase', `person:${id}`, undefined, { personId: id, mode: input.mode }));
    await backend.apply(ops);
  };

  const retention: RetentionService = {
    async schedule(ctx) {
      const call = await clientCall(ctx, 'settings.view');
      const client = call.actor.client as Client;
      const people = (await mine<Person>(call, 'people')).map((p) => ({
        id: p.id,
        ...(p.leftDate === undefined ? {} : { leftDate: p.leftDate }),
      }));
      const files = (await mine<EvidenceSubmission>(call, 'evidenceSubmissions'))
        .filter((s) => s.status === 'rejected' && s.reviewedAt !== undefined)
        .map((s) => ({ id: s.fileAttachmentId, kind: 'rejected' as const, reviewedAt: s.reviewedAt as string }));
      // A Closed account is deleted when Closed ends (derived from the subscription, so Fast-forward moves it).
      const sub = (await call.all<Subscription>('subscriptions')).find((x) => x.clientId === client.id);
      const next = sub ? nextTransition(sub, defaultDunningPolicy, call.actor.now) : null;
      const accountDeletionAt =
        call.actor.accountState === 'closed' && next?.state === 'deleted' ? next.at.toISOString() : undefined;
      return structuredClone(
        scheduledDeletions({
          now: call.actor.now,
          retention: client.settings.retention,
          people,
          files,
          ...(accountDeletionAt ? { accountDeletionAt } : {}),
        }),
      );
    },

    async update(ctx, patch) {
      const call = await clientCall(ctx, 'settings.manage');
      const client = call.actor.client as Client;
      const given = { ...patch } as Record<string, unknown>;
      const extra = Object.keys(given).filter((k) => !(RETENTION_KEYS as readonly string[]).includes(k));
      if (extra.length > 0) throw new ValidationError(extra.map((k) => `${k}: not a retention setting`));
      const defined = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));
      const parsed = retentionPolicySchema.safeParse({ ...client.settings.retention, ...defined });
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      checkAccountState(call, false);
      await backend.apply([
        {
          type: 'put',
          store: 'clients',
          key: client.id,
          record: { ...client, settings: { ...client.settings, retention: parsed.data } },
        },
        audit(call, client.id, 'retention.update', `client:${client.id}`, client.settings.retention, parsed.data),
      ]);
      return structuredClone(parsed.data);
    },
  };

  return { exports, retention, erase };
}
